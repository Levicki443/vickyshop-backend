import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { config } from '../config/environment.js';
import { ROLES, normalizeRole, isSellerRole } from '../utils/roleUtils.js';

/**
 * Génère un jeton JWT signé pour un utilisateur.
 */
const generateToken = (id) => {
  return jwt.sign({ id }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
};

/**
 * Formate proprement l'objet utilisateur pour la réponse API (Whitelisting & Normalisation).
 */
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
  createdAt: user.createdAt,
});

/**
 * Inscription d'un nouvel utilisateur (Client ou Vendeur Marketplace).
 */
export const register = async (req, res, next) => {
  try {
    const {
      name,
      email,
      phone,
      password,
      address,
      city,
      role = ROLES.CLIENT,
      shopName,
      shopDescription,
      shopPhone,
      shopAddress,
    } = req.body;

    if (!name || !email || !phone || !password) {
      return res.status(400).json({
        status: 'error',
        message: "Le nom, l'email, le téléphone et le mot de passe sont obligatoires.",
      });
    }

    const assignedRole = normalizeRole(role, ROLES.CLIENT);
    const isSeller = isSellerRole(assignedRole);

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(400).json({
        status: 'error',
        message: 'Un compte avec cette adresse email existe déjà.',
      });
    }

    if (phone.replace(/\D/g, '').length < 10) {
      return res.status(400).json({
        status: 'error',
        message: 'Le numéro de téléphone doit comporter au moins 10 chiffres.',
      });
    }

    const resolvedShopName = isSeller
      ? (shopName && shopName.trim() ? shopName.trim() : `${name.trim()} Boutique`)
      : '';

    const newUser = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      password,
      address: address ? address.trim() : '',
      city: city ? city.trim() : 'Abidjan',
      role: assignedRole,
      shopName: resolvedShopName,
      shopDescription: isSeller && shopDescription ? shopDescription.trim() : '',
      shopPhone: isSeller ? (shopPhone ? shopPhone.trim() : phone.trim()) : '',
      shopAddress: isSeller ? (shopAddress ? shopAddress.trim() : (address ? address.trim() : '')) : '',
      isSellerActive: true,
    });

    const token = generateToken(newUser._id);

    res.status(201).json({
      status: 'success',
      message: isSeller ? 'Compte vendeur créé avec succès !' : 'Compte client créé avec succès !',
      token,
      data: {
        user: formatUserResponse(newUser),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Inscription sécurisée d'un Administrateur avec validation de la clé secrète.
 */
export const registerAdmin = async (req, res, next) => {
  try {
    const { name, email, phone, password, adminSecretKey } = req.body;

    if (!adminSecretKey || adminSecretKey.trim() !== config.admin.secretKey.trim()) {
      return res.status(403).json({
        status: 'error',
        message: "Clé secrète d'administration invalide ou non fournie.",
      });
    }

    if (!name || !email || !password) {
      return res.status(400).json({
        status: 'error',
        message: "Le nom, l'email et le mot de passe sont obligatoires.",
      });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(400).json({
        status: 'error',
        message: 'Un compte avec cette adresse email existe déjà.',
      });
    }

    const newAdmin = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone ? phone.trim() : '',
      password,
      role: ROLES.ADMIN,
    });

    const token = generateToken(newAdmin._id);

    res.status(201).json({
      status: 'success',
      message: 'Compte administrateur créé avec succès.',
      token,
      data: {
        user: formatUserResponse(newAdmin),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Connexion d'un utilisateur existant (Client, Vendeur ou Admin).
 */
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Veuillez fournir votre email et votre mot de passe.',
      });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        status: 'error',
        message: 'Email ou mot de passe incorrect.',
      });
    }

    if (isSellerRole(user.role) && user.isSellerActive === false) {
      return res.status(403).json({
        status: 'error',
        message: 'Votre compte vendeur est suspendu. Veuillez contacter le support.',
      });
    }

    const token = generateToken(user._id);

    res.status(200).json({
      status: 'success',
      message: 'Connexion réussie.',
      token,
      data: {
        user: formatUserResponse(user),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Récupère le profil de l'utilisateur connecté via son jeton.
 */
export const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'Utilisateur introuvable.',
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        user: formatUserResponse(user),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Met à jour les informations personnelles et de boutique de l'utilisateur.
 */
export const updateProfile = async (req, res, next) => {
  try {
    const { name, phone, address, city, role, shopName, shopDescription, shopPhone, shopAddress } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'Utilisateur introuvable.',
      });
    }

    if (name) user.name = name.trim();
    if (phone !== undefined) {
      const pureDigits = typeof phone === 'string' ? phone.replace(/\D/g, '') : '';
      if (pureDigits.length < 10) {
        return res.status(400).json({
          status: 'error',
          message: 'Le numéro de téléphone doit comporter au moins 10 chiffres.',
        });
      }
      user.phone = phone.trim();
    }
    if (address !== undefined) user.address = address.trim();
    if (city !== undefined) user.city = city.trim();

    // Activation ou mise à niveau Vendeur
    if (role && isSellerRole(role)) {
      user.role = ROLES.VENDEUR;
      user.isSellerActive = true;
    }

    if (isSellerRole(user.role) || (role && isSellerRole(role))) {
      if (shopName !== undefined) user.shopName = shopName.trim();
      if (shopDescription !== undefined) user.shopDescription = shopDescription.trim();
      if (shopPhone !== undefined) user.shopPhone = shopPhone.trim();
      if (shopAddress !== undefined) user.shopAddress = shopAddress.trim();
    }

    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Profil mis à jour avec succès.',
      data: {
        user: formatUserResponse(user),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Permet à un utilisateur connecté de passer au rôle Vendeur Pro.
 */
export const upgradeUserToSeller = async (req, res, next) => {
  try {
    const { shopName, shopPhone, shopAddress, shopDescription } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'Utilisateur introuvable.',
      });
    }

    user.role = ROLES.VENDEUR;
    user.shopName = shopName ? shopName.trim() : `${user.name} Boutique`;
    user.shopPhone = shopPhone ? shopPhone.trim() : user.phone;
    user.shopAddress = shopAddress ? shopAddress.trim() : (user.address || '');
    if (shopDescription) user.shopDescription = shopDescription.trim();
    user.isSellerActive = true;

    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Félicitations ! Votre compte est désormais un compte Vendeur Marketplace.',
      data: {
        user: formatUserResponse(user),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Met à jour le mot de passe de l'utilisateur connecté.
 */
export const updatePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        status: 'error',
        message: 'Veuillez renseigner votre mot de passe actuel et le nouveau mot de passe.',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        status: 'error',
        message: 'Le nouveau mot de passe doit comporter au moins 6 caractères.',
      });
    }

    const user = await User.findById(req.user.id).select('+password');
    if (!user || !(await user.comparePassword(currentPassword))) {
      return res.status(401).json({
        status: 'error',
        message: 'Le mot de passe actuel est incorrect.',
      });
    }

    user.password = newPassword;
    await user.save();

    const token = generateToken(user._id);

    res.status(200).json({
      status: 'success',
      message: 'Mot de passe mis à jour avec succès.',
      token,
      data: {
        user: formatUserResponse(user),
      },
    });
  } catch (error) {
    next(error);
  }
};

