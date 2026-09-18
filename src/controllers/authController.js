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

    // Vérification de l'existence de l'email
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        status: 'error',
        message: 'Un compte avec cette adresse email existe déjà.',
      });
    }

    // Création de l'utilisateur
    const newUser = await User.create({
      name,
      email,
      phone,
      password,
      address: address || '',
      city: city || 'Abidjan',
    });

    // Génération du token
    const token = generateToken(newUser._id);

    // Réponse sécurisée (sans renvoyer le mot de passe)
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

    // Recherche de l'utilisateur avec son mot de passe
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
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
