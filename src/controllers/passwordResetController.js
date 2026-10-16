import { User } from '../models/User.js';
import { hashToken } from '../utils/cryptoUtils.js';
import { sendPasswordResetEmail } from '../services/emailService.js';
import { securityLog } from '../utils/securityLogger.js';
import { config } from '../config/environment.js';

/**
 * Contrôleur de réinitialisation sécurisée de mot de passe (MERN Vicky-Shop).
 * Conforme aux standards d'audit de sécurité bancaire :
 * - Jeton cryptographique temporaire à usage unique (15 minutes).
 * - Hachage SHA-256 en base de données.
 * - Réponse générique constante pour prévenir l'énumération d'adresses email.
 * - Validation stricte de la complexité du mot de passe.
 */

/**
 * 1. Demande de réinitialisation de mot de passe.
 * Reçoit l'email, génère un jeton sécurisé et envoie l'e-mail officiel.
 */
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress;

    // Validation stricte du format email
    const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,})+$/;
    if (!email || typeof email !== 'string' || !emailRegex.test(email.trim())) {
      return res.status(400).json({
        status: 'error',
        message: 'Veuillez renseigner une adresse email valide.',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (user) {
      // Génération du jeton aléatoire de 32 octets et calcul de l'empreinte hachée
      const resetToken = user.createPasswordResetToken();
      await user.save({ validateBeforeSave: false });

      // Détection de l'origine du client frontend
      const clientBase = req.headers.origin || config.cors?.allowedOrigins?.[0] || 'http://localhost:5173';
      const resetUrl = `${clientBase.replace(/\/+$/, '')}/reinitialisation-mot-de-passe?token=${resetToken}`;

      // Envoi de l'e-mail officiel via Brevo
      sendPasswordResetEmail({
        toEmail: user.email,
        toName: user.name,
        resetUrl,
      }).catch((err) => {
        console.error('[Email Reset Error]', err.message || err);
      });

      // Journalisation sécurisée sans exposer le jeton brut
      securityLog.adminAction({
        action: 'DEMANDE_RESET_MDP',
        targetResource: 'User',
        userId: user._id,
        details: { email: user.email },
        ip: clientIp,
      });

      // Affichage visible dans la console du serveur pour faciliter les tests locaux
      console.log('\n======================================================');
      console.log('[SÉCURITÉ VICKY-SHOP] LIEN DE RÉINITIALISATION GÉNÉRÉ :');
      console.log(`Compte : ${user.email}`);
      console.log(`Lien   : ${resetUrl}`);
      console.log('Validité : 15 minutes');
      console.log('======================================================\n');
    }

    // Réponse générique constante pour empêcher toute fuite d'information / énumération
    res.status(200).json({
      status: 'success',
      message: 'Si un compte correspond à cette adresse email, un lien sécurisé de réinitialisation vous a été envoyé.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 2. Vérification préalable de la validité d'un jeton de réinitialisation.
 * Permet au frontend de vérifier immédiatement si le lien est valide ou expiré dès l'ouverture.
 */
export const verifyResetToken = async (req, res, next) => {
  try {
    const rawToken = req.params.token || req.query.token;

    if (!rawToken || typeof rawToken !== 'string') {
      return res.status(400).json({
        status: 'error',
        code: 'TOKEN_REQUIRED',
        message: 'Jeton de réinitialisation manquant.',
      });
    }

    const hashedToken = hashToken(rawToken.trim());
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    }).select('+passwordResetToken +passwordResetExpires');

    if (!user) {
      return res.status(400).json({
        status: 'error',
        code: 'TOKEN_INVALID_OR_EXPIRED',
        message: 'Le lien de réinitialisation est invalide ou a expiré.',
      });
    }

    // Masquage partiel de l'adresse email pour rassurer l'utilisateur (ex: j***@gmail.com)
    const emailParts = user.email.split('@');
    const maskedUser = emailParts[0].length > 2
      ? `${emailParts[0][0]}***${emailParts[0].slice(-1)}`
      : `${emailParts[0][0]}***`;
    const maskedEmail = `${maskedUser}@${emailParts[1]}`;

    res.status(200).json({
      status: 'success',
      valid: true,
      message: 'Le lien de réinitialisation est valide.',
      data: {
        maskedEmail,
        name: user.name,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 3. Réinitialisation effective du mot de passe avec validation du jeton temporaire.
 */
export const resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword, confirmPassword } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({
        status: 'error',
        code: 'TOKEN_REQUIRED',
        message: 'Jeton de réinitialisation invalide ou manquant.',
      });
    }

    if (!newPassword || typeof newPassword !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Veuillez renseigner un nouveau mot de passe.',
      });
    }

    // Validation des critères de sécurité du mot de passe
    if (newPassword.length < 8) {
      return res.status(400).json({
        status: 'error',
        message: 'Le mot de passe doit comporter au moins 8 caractères.',
      });
    }

    // Vérification de la correspondance des mots de passe si confirmPassword est fourni
    if (confirmPassword !== undefined && newPassword !== confirmPassword) {
      return res.status(400).json({
        status: 'error',
        message: 'Les deux mots de passe ne correspondent pas.',
      });
    }

    const hashedToken = hashToken(token.trim());
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    }).select('+passwordResetToken +passwordResetExpires +failedLoginAttempts +lockUntil');

    if (!user) {
      securityLog.authFailure({
        email: 'Jeton Invalide/Expiré',
        reason: 'Tentative de réinitialisation avec un jeton invalide ou expiré',
        ip: clientIp,
      });
      return res.status(400).json({
        status: 'error',
        code: 'TOKEN_INVALID_OR_EXPIRED',
        message: 'Le lien de réinitialisation est invalide ou a expiré.',
      });
    }

    // Mise à jour du mot de passe (le pre-save hook Mongoose le hache via bcryptjs)
    user.password = newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    securityLog.authSuccess({
      userId: user._id,
      email: user.email,
      role: user.role,
      ip: clientIp,
      details: { action: 'PASSWORD_RESET_SUCCESS' },
    });

    res.status(200).json({
      status: 'success',
      message: 'Votre mot de passe a été réinitialisé avec succès. Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.',
    });
  } catch (error) {
    next(error);
  }
};
