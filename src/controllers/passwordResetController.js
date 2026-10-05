import { User } from '../models/User.js';
import { hashToken } from '../utils/cryptoUtils.js';
import { sendBrevoEmail } from '../services/emailService.js';
import { securityLog } from '../utils/securityLogger.js';
import jwt from 'jsonwebtoken';
import { config } from '../config/environment.js';

const generateToken = (id) => {
  return jwt.sign({ id }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
};

/**
 * Demande de réinitialisation de mot de passe.
 * Retourne toujours un message générique pour empêcher l'énumération d'adresses email.
 */
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Veuillez renseigner une adresse email valide.',
      });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (user) {
      const resetToken = user.createPasswordResetToken();
      await user.save({ validateBeforeSave: false });

      const resetUrl = `${config.cors.allowedOrigins[0] || 'http://localhost:5173'}/reinitialisation-mot-de-passe?token=${resetToken}`;

      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h2 style="color: #111827; text-align: center;">Réinitialisation de votre mot de passe</h2>
          <p style="color: #4b5563; font-size: 14px;">Bonjour ${user.name},</p>
          <p style="color: #4b5563; font-size: 14px;">Vous avez demandé la réinitialisation de votre mot de passe pour votre compte Vicky-Shop.</p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${resetUrl}" style="background-color: #dfb743; color: #111827; padding: 12px 24px; font-weight: bold; text-decoration: none; border-radius: 6px; display: inline-block;">Réinitialiser mon mot de passe</a>
          </div>
          <p style="color: #6b7280; font-size: 12px;">Ce lien est valable pendant <strong>15 minutes</strong> et ne peut être utilisé qu'une seule fois.</p>
          <p style="color: #6b7280; font-size: 12px;">Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email en toute sécurité.</p>
        </div>
      `;

      sendBrevoEmail({
        toEmail: user.email,
        toName: user.name,
        subject: 'Réinitialisation de votre mot de passe Vicky-Shop',
        htmlContent: emailHtml,
      }).catch((err) => console.error('[Email Reset Error]', err));

      securityLog.adminAction({
        action: 'DEMANDE_RESET_MDP',
        targetResource: 'User',
        userId: user._id,
        details: { email: user.email },
        ip: clientIp,
      });
    }

    // Réponse générique constante pour prévenir l'énumération d'emails
    res.status(200).json({
      status: 'success',
      message: 'Si un compte correspond à cette adresse email, un lien de réinitialisation sécurisé y a été envoyé.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Réinitialisation effective du mot de passe avec validation du jeton temporaire.
 */
export const resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Jeton de réinitialisation invalide ou manquant.',
      });
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({
        status: 'error',
        message: 'Le nouveau mot de passe doit comporter au moins 8 caractères.',
      });
    }

    const hashedToken = hashToken(token);

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
        message: 'Le jeton de réinitialisation est invalide ou a expiré.',
      });
    }

    user.password = newPassword;
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    const authToken = generateToken(user._id);

    securityLog.authSuccess({
      userId: user._id,
      email: user.email,
      role: user.role,
      ip: clientIp,
    });

    res.status(200).json({
      status: 'success',
      message: 'Votre mot de passe a été réinitialisé avec succès.',
      token: authToken,
    });
  } catch (error) {
    next(error);
  }
};
