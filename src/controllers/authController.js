import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { config } from '../config/environment.js';
import { ROLES, normalizeRole, isSellerRole, isAdminRole } from '../utils/roleUtils.js';
import { securityLog } from '../utils/securityLogger.js';

const generateToken = (id) => {
  return jwt.sign({ id }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
};

const formatUserResponse = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  address: user.address || '',
  city: user.city || 'Abidjan',
  role: normalizeRole(user.role),
  shopName: user.shopName || '',
  shopDescription: user.shopDescription || '',
  shopPhone: user.shopPhone || '',
  shopAddress: user.shopAddress || '',
  isSellerActive: user.isSellerActive !== false,
  twoFactorEnabled: !!user.twoFactorEnabled,
  createdAt: user.createdAt,
});

export const register = async (req, res, next) => {
  try {
    const { name, email, phone, password, address, city, role = ROLES.CLIENT, shopName, shopDescription, shopPhone, shopAddress } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress;

    if (!name || !email || !phone || !password) {
      return res.status(400).json({ status: 'error', message: 'Nom, email, téléphone et mot de passe sont obligatoires.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ status: 'error', message: 'Le mot de passe doit comporter au moins 8 caractères.' });
    }

    const requestedRole = normalizeRole(role, ROLES.CLIENT);
    if (requestedRole === ROLES.ADMIN) {
      securityLog.accessDenied({ userId: null, role: 'tentative_admin', route: '/auth/register', method: 'POST', ip: clientIp, reason: 'Tentative d\'inscription directe en Admin' });
      return res.status(403).json({ status: 'error', message: 'Impossible de s\'inscrire en tant qu\'administrateur par cette voie.' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(400).json({ status: 'error', message: 'Un compte avec cette adresse email existe déjà.' });
    }

    const isSeller = isSellerRole(requestedRole);
    const newUser = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      password,
      address: address ? address.trim() : '',
      city: city ? city.trim() : 'Abidjan',
      role: requestedRole,
      shopName: isSeller ? (shopName?.trim() || `${name.trim()} Boutique`) : '',
      shopDescription: isSeller && shopDescription ? shopDescription.trim() : '',
      shopPhone: isSeller ? (shopPhone?.trim() || phone.trim()) : '',
      shopAddress: isSeller ? (shopAddress?.trim() || (address ? address.trim() : '')) : '',
      isSellerActive: true,
    });

    const token = generateToken(newUser._id);
    securityLog.authSuccess({ userId: newUser._id, email: newUser.email, role: newUser.role, ip: clientIp });

    res.status(201).json({
      status: 'success',
      message: isSeller ? 'Compte vendeur créé avec succès !' : 'Compte client créé avec succès !',
      token,
      data: { user: formatUserResponse(newUser) },
    });
  } catch (error) { next(error); }
};

export const registerAdmin = async (req, res, next) => {
  try {
    const { name, email, phone, password, adminSecretKey } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress;

    if (!config.admin.secretKey || config.admin.secretKey.length < 16) {
      return res.status(500).json({ status: 'error', message: 'La configuration serveur d\'inscription admin est indisponible.' });
    }

    if (!adminSecretKey || adminSecretKey.trim() !== config.admin.secretKey.trim()) {
      securityLog.authFailure({ email, reason: 'Clé secrète admin erronée', ip: clientIp });
      return res.status(403).json({ status: 'error', message: 'Clé secrète d\'administration invalide.' });
    }

    if (!name || !email || !password || password.length < 10) {
      return res.status(400).json({ status: 'error', message: 'Tous les champs sont requis (mot de passe 10 caractères min pour admin).' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(400).json({ status: 'error', message: 'Un compte avec cette adresse email existe déjà.' });
    }

    const newAdmin = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone ? phone.trim() : '',
      password,
      role: ROLES.ADMIN,
    });

    const token = generateToken(newAdmin._id);
    securityLog.adminAction({ action: 'CREATION_COMPTE_ADMIN', targetResource: 'User', userId: newAdmin._id, ip: clientIp });

    res.status(201).json({
      status: 'success',
      message: 'Compte administrateur sécurisé créé avec succès.',
      token,
      data: { user: formatUserResponse(newAdmin) },
    });
  } catch (error) { next(error); }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress;

    if (!email || !password) {
      return res.status(400).json({ status: 'error', message: 'Veuillez fournir votre email et votre mot de passe.' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() })
      .select('+password +failedLoginAttempts +lockUntil');

    if (!user) {
      securityLog.authFailure({ email, reason: 'Utilisateur inexistant', ip: clientIp });
      return res.status(401).json({ status: 'error', message: 'Email ou mot de passe incorrect.' });
    }

    if (user.isLocked()) {
      const minutesRemaining = Math.ceil((user.lockUntil - Date.now()) / (60 * 1000));
      securityLog.authFailure({ email, reason: 'Compte temporairement verrouillé', ip: clientIp });
      return res.status(423).json({
        status: 'error',
        message: `Compte temporairement verrouillé pour raisons de sécurité. Veuillez réessayer dans ${minutesRemaining} minute(s).`,
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= 5) {
        user.lockUntil = new Date(Date.now() + 15 * 60 * 1000); // Verrouillage 15 minutes
      }
      await user.save({ validateBeforeSave: false });

      securityLog.authFailure({ email, reason: 'Mot de passe erroné', ip: clientIp });
      return res.status(401).json({ status: 'error', message: 'Email ou mot de passe incorrect.' });
    }

    // Réinitialisation des tentatives échouées après connexion réussie
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save({ validateBeforeSave: false });

    if (isSellerRole(user.role) && user.isSellerActive === false) {
      return res.status(403).json({ status: 'error', message: 'Votre compte vendeur a été temporairement suspendu.' });
    }

    const token = generateToken(user._id);
    securityLog.authSuccess({ userId: user._id, email: user.email, role: user.role, ip: clientIp });

    res.status(200).json({
      status: 'success',
      message: 'Connexion réussie.',
      token,
      data: { user: formatUserResponse(user) },
    });
  } catch (error) { next(error); }
};

export const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ status: 'error', message: 'Utilisateur introuvable.' });
    res.status(200).json({ status: 'success', data: { user: formatUserResponse(user) } });
  } catch (error) { next(error); }
};

export const updateProfile = async (req, res, next) => {
  try {
    const { name, phone, address, city, shopName, shopDescription, shopPhone, shopAddress } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ status: 'error', message: 'Utilisateur introuvable.' });

    // Whitelisting strict : AUCUNE modification de rôle n'est permise via updateProfile
    if (name && typeof name === 'string') user.name = name.trim();
    if (phone && typeof phone === 'string') {
      if (phone.replace(/\D/g, '').length < 10) {
        return res.status(400).json({ status: 'error', message: 'Le numéro de téléphone doit comporter au moins 10 chiffres.' });
      }
      user.phone = phone.trim();
    }
    if (address !== undefined && typeof address === 'string') user.address = address.trim();
    if (city !== undefined && typeof city === 'string') user.city = city.trim();

    if (isSellerRole(user.role)) {
      if (shopName !== undefined && typeof shopName === 'string') user.shopName = shopName.trim();
      if (shopDescription !== undefined && typeof shopDescription === 'string') user.shopDescription = shopDescription.trim();
      if (shopPhone !== undefined && typeof shopPhone === 'string') user.shopPhone = shopPhone.trim();
      if (shopAddress !== undefined && typeof shopAddress === 'string') user.shopAddress = shopAddress.trim();
    }

    await user.save();
    res.status(200).json({ status: 'success', message: 'Profil mis à jour avec succès.', data: { user: formatUserResponse(user) } });
  } catch (error) { next(error); }
};

export const upgradeUserToSeller = async (req, res, next) => {
  try {
    const { shopName, shopPhone, shopAddress, shopDescription } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ status: 'error', message: 'Utilisateur introuvable.' });

    if (isAdminRole(user.role)) {
      return res.status(400).json({ status: 'error', message: 'Le compte administrateur ne peut pas être converti en vendeur standard.' });
    }

    const previousRole = user.role;
    user.role = ROLES.VENDEUR;
    user.shopName = shopName && typeof shopName === 'string' ? shopName.trim() : `${user.name} Boutique`;
    user.shopPhone = shopPhone && typeof shopPhone === 'string' ? shopPhone.trim() : user.phone;
    user.shopAddress = shopAddress && typeof shopAddress === 'string' ? shopAddress.trim() : (user.address || '');
    if (shopDescription && typeof shopDescription === 'string') user.shopDescription = shopDescription.trim();
    user.isSellerActive = true;

    await user.save();
    securityLog.roleChanged({ targetUserId: user._id, previousRole, newRole: ROLES.VENDEUR, changedByUserId: user._id, ip: req.ip });

    res.status(200).json({
      status: 'success',
      message: 'Félicitations ! Votre compte est désormais un compte Vendeur Marketplace.',
      data: { user: formatUserResponse(user) },
    });
  } catch (error) { next(error); }
};

export const updatePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ status: 'error', message: 'Veuillez renseigner votre mot de passe actuel et le nouveau mot de passe.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ status: 'error', message: 'Le nouveau mot de passe doit comporter au moins 8 caractères.' });
    }

    const user = await User.findById(req.user.id).select('+password');
    if (!user || !(await user.comparePassword(currentPassword))) {
      return res.status(401).json({ status: 'error', message: 'Le mot de passe actuel est incorrect.' });
    }

    user.password = newPassword;
    await user.save();

    const token = generateToken(user._id);
    securityLog.adminAction({ action: 'MODIFICATION_MOT_DE_PASSE', targetResource: 'User', userId: user._id, ip: req.ip });

    res.status(200).json({
      status: 'success',
      message: 'Mot de passe mis à jour avec succès.',
      token,
      data: { user: formatUserResponse(user) },
    });
  } catch (error) { next(error); }
};
