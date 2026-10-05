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
