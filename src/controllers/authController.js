import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { config } from '../config/environment.js';

/**
 * Génère un jeton JWT signé pour un utilisateur.
 */
const generateToken = (id) => {
  return jwt.sign({ id }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
};

/**
 * Inscription d'un nouvel utilisateur (Client).
 */
export const register = async (req, res, next) => {
  try {
    const { name, email, phone, password, address, city } = req.body;

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        status: 'error',
        message: 'Un compte avec cette adresse email existe déjà.',
      });
    }

    if (!phone || typeof phone !== 'string' || phone.replace(/\D/g, '').length < 10) {
      return res.status(400).json({
        status: 'error',
        message: 'Le numéro de téléphone doit comporter au moins 10 chiffres.',
      });
    }

    const newUser = await User.create({
      name,
      email,
      phone,
      password,
      address: address || '',
      city: city || 'Abidjan',
    });

    const token = generateToken(newUser._id);

    res.status(201).json({
      status: 'success',
      message: 'Compte client créé avec succès.',
      token,
      data: {
        user: {
          id: newUser._id,
          name: newUser.name,
          email: newUser.email,
          phone: newUser.phone,
          address: newUser.address,
          city: newUser.city,
          role: newUser.role,
        },
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
        message: 'Clé secrète d\'administration invalide ou non fournie.',
      });
    }

    if (!name || !email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Le nom, l\'email et le mot de passe sont obligatoires.',
      });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        status: 'error',
        message: 'Un compte avec cette adresse email existe déjà.',
      });
    }

    const newAdmin = await User.create({
      name,
      email,
      phone: phone || '',
      password,
      role: 'admin',
    });

    const token = generateToken(newAdmin._id);

    res.status(201).json({
      status: 'success',
      message: 'Compte administrateur créé avec succès.',
      token,
      data: {
        user: {
          id: newAdmin._id,
          name: newAdmin.name,
          email: newAdmin.email,
          phone: newAdmin.phone,
          role: newAdmin.role,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Connexion d'un utilisateur existant.
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

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        status: 'error',
        message: 'Email ou mot de passe incorrect.',
      });
    }

    const token = generateToken(user._id);

    res.status(200).json({
      status: 'success',
      message: 'Connexion réussie.',
      token,
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          address: user.address,
          city: user.city,
          role: user.role,
        },
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
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          address: user.address,
          city: user.city,
          role: user.role,
          createdAt: user.createdAt,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Met à jour les informations personnelles du client connecté.
 */
export const updateProfile = async (req, res, next) => {
  try {
    const { name, phone, address, city } = req.body;
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

    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Profil mis à jour avec succès.',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          address: user.address,
          city: user.city,
          role: user.role,
          createdAt: user.createdAt,
        },
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
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'Utilisateur introuvable.',
      });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
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
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          address: user.address,
          city: user.city,
          role: user.role,
          createdAt: user.createdAt,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
