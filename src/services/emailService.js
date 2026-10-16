import { config } from '../config/environment.js';
import { getOrderConfirmationHtml, getStatusUpdateHtml } from './emailTemplateService.js';

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

/**
 * Envoie un email transactionnel via l'API REST v3 de Brevo.
 * @param {Object} payload 
 */
export const sendBrevoEmail = async ({ toEmail, toName, subject, htmlContent }) => {
  const apiKey = config.brevo?.apiKey;

  if (!apiKey) {
    console.warn('[Brevo] Clé API Brevo non configurée (BREVO_API_KEY). Email ignoré.');
    return { success: false, reason: 'NO_API_KEY' };
  }

  if (!toEmail) {
    console.warn('[Brevo] Aucun email de destination fourni. Envoi annulé.');
    return { success: false, reason: 'NO_RECIPIENT' };
  }

  try {
    const payload = {
      sender: {
        name: config.brevo.senderName || 'Vicky-Shop',
        email: config.brevo.senderEmail || 'contact@vickyshop.ci',
      },
      to: [
        {
          email: toEmail,
          name: toName || 'Client Vicky-Shop',
        },
      ],
      subject,
      htmlContent,
    };

    const response = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[Brevo] Erreur API Brevo :', response.status, errorData);
      return { success: false, status: response.status, error: errorData };
    }

    const data = await response.json().catch(() => ({}));
    return { success: true, messageId: data.messageId };
  } catch (err) {
    console.error('[Brevo] Erreur réseau lors de l\'envoi de l\'email :', err.message);
    return { success: false, error: err.message };
  }
};

export const sendOrderConfirmationEmail = async (order) => {
  if (!order || !order.customerEmail) {
    return { success: false, reason: 'NO_CUSTOMER_EMAIL' };
  }

  const subject = `Confirmation de votre commande #${order.orderNumber} - Vicky-Shop`;
  const htmlContent = getOrderConfirmationHtml(order);

  return sendBrevoEmail({
    toEmail: order.customerEmail,
    toName: order.customerName,
    subject,
    htmlContent,
  });
};

export const sendOrderStatusUpdateEmail = async (order, newStatus) => {
  if (!order || !order.customerEmail) {
    return { success: false, reason: 'NO_CUSTOMER_EMAIL' };
  }

  const subject = `Mise à jour : Votre commande #${order.orderNumber} est ${newStatus === 'en_livraison' ? 'en cours de livraison' : newStatus} - Vicky-Shop`;
  const htmlContent = getStatusUpdateHtml(order, newStatus);

  return sendBrevoEmail({
    toEmail: order.customerEmail,
    toName: order.customerName,
    subject,
    htmlContent,
  });
};

/**
 * Envoie un email officiel et sécurisé de réinitialisation de mot de passe.
 * @param {Object} params
 * @param {string} params.toEmail
 * @param {string} params.toName
 * @param {string} params.resetUrl
 */
export const sendPasswordResetEmail = async ({ toEmail, toName, resetUrl }) => {
  if (!toEmail) {
    return { success: false, reason: 'NO_EMAIL' };
  }

  const subject = 'Réinitialisation de votre mot de passe - Vicky-Shop';
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <title>Réinitialisation de mot de passe - Vicky-Shop</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; padding: 30px 15px;">
        <tr>
          <td align="center">
            <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 580px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.06);">
              <tr>
                <td style="background: linear-gradient(135deg, #ff6b00 0%, #ea580c 100%); padding: 32px 24px; text-align: center;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">Vicky-Shop</h1>
                  <p style="margin: 6px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">Sécurité de votre compte</p>
                </td>
              </tr>
              <tr>
                <td style="padding: 32px 28px;">
                  <h2 style="margin: 0 0 16px 0; font-size: 20px; color: #0f172a; font-weight: 700;">Bonjour ${toName || 'cher client'},</h2>
                  <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #475569;">
                    Nous avons reçu une demande de réinitialisation du mot de passe pour votre compte <strong>Vicky-Shop</strong>.
                  </p>
                  <p style="margin: 0 0 28px 0; font-size: 15px; line-height: 1.6; color: #475569;">
                    Cliquez sur le bouton ci-dessous pour choisir votre nouveau mot de passe en toute sécurité :
                  </p>
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${resetUrl}" style="background: linear-gradient(135deg, #ff6b00 0%, #ea580c 100%); color: #ffffff; padding: 14px 32px; font-size: 15px; font-weight: 700; text-decoration: none; border-radius: 10px; display: inline-block; box-shadow: 0 4px 14px rgba(255, 107, 0, 0.4);">
                      Réinitialiser mon mot de passe
                    </a>
                  </div>
                  <div style="background-color: #f1f5f9; border-left: 4px solid #ff6b00; padding: 14px 16px; border-radius: 6px; margin: 24px 0;">
                    <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #334155;">
                      ⏱️ <strong>Délai de validité :</strong> Ce lien est actif pendant <strong>15 minutes</strong> et ne peut être utilisé qu'une seule fois.
                    </p>
                  </div>
                  <p style="margin: 24px 0 0 0; font-size: 13px; line-height: 1.5; color: #64748b;">
                    Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet e-mail. Votre mot de passe actuel reste inchangé et votre compte est en sécurité.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8;">
                  © ${new Date().getFullYear()} Vicky-Shop Côte d'Ivoire. Tous droits réservés.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  return sendBrevoEmail({
    toEmail,
    toName,
    subject,
    htmlContent,
  });
};
