import { config } from '../config/environment.js';

/**
 * Service d'envoi d'emails transactionnels propulsé par l'API REST v3 de Brevo (Sendinblue).
 * Utilise le fetch natif Node.js sans dépendances externes lourdes.
 */

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

/**
 * Formate un nombre en Francs CFA.
 */
const formatPrice = (amount) => {
  if (typeof amount !== 'number') return '0 FCFA';
  return `${amount.toLocaleString('fr-FR')} FCFA`;
};

/**
 * Envoie un email transactionnel via l'API REST de Brevo.
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
    console.log(`[Brevo] Email envoyé avec succès à ${toEmail} (MessageId: ${data.messageId || 'OK'})`);
    return { success: true, messageId: data.messageId };
  } catch (err) {
    console.error('[Brevo] Erreur réseau lors de l\'envoi de l\'email :', err.message);
    return { success: false, error: err.message };
  }
};

/**
 * Génère le gabarit HTML pour la confirmation de commande immédiate.
 */
const getOrderConfirmationHtml = (order) => {
  const itemsHtml = (order.items || [])
    .map(
      (item) => `
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f0f0f0;">
          <strong style="color: #1a1a1a; font-size: 14px;">${item.title}</strong>
          ${item.size ? `<span style="color: #777; font-size: 12px; display: block;">Taille: ${item.size}</span>` : ''}
          ${item.color ? `<span style="color: #777; font-size: 12px; display: block;">Couleur: ${item.color}</span>` : ''}
        </td>
        <td style="padding: 12px 8px; border-bottom: 1px solid #f0f0f0; text-align: center; color: #555; font-size: 14px;">
          x${item.quantity}
        </td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f0f0f0; text-align: right; font-weight: 600; color: #1a1a1a; font-size: 14px;">
          ${formatPrice(item.price * item.quantity)}
        </td>
      </tr>
    `
    )
    .join('');

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Confirmation de Commande</title>
  </head>
  <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f7f9fa; margin: 0; padding: 20px; color: #2d3748;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06);">
      
      <!-- HEADER AVEC BRANDING VICKY-SHOP -->
      <tr>
        <td style="background: linear-gradient(135deg, #111827 0%, #1f2937 100%); padding: 32px 24px; text-align: center;">
          <h1 style="color: #dfb743; margin: 0; font-size: 26px; letter-spacing: 2px; text-transform: uppercase; font-weight: 800;">VICKY-SHOP</h1>
          <p style="color: #e5e7eb; margin: 6px 0 0 0; font-size: 13px; letter-spacing: 1px;">MODE & ÉLÉGANCE À ABIDJAN</p>
        </td>
      </tr>

      <!-- BANNIÈRE SUCCÈS -->
      <tr>
        <td style="padding: 30px 24px 10px 24px; text-align: center;">
          <div style="display: inline-block; width: 56px; height: 56px; background-color: #ecfdf5; border-radius: 50%; line-height: 56px; font-size: 28px; color: #10b981; margin-bottom: 12px;">✓</div>
          <h2 style="margin: 0 0 8px 0; color: #111827; font-size: 22px;">Merci pour votre commande !</h2>
          <p style="margin: 0; color: #6b7280; font-size: 14px;">Votre commande a été bien enregistrée et est en cours de traitement par notre équipe.</p>
          <div style="margin-top: 16px; display: inline-block; background-color: #f3f4f6; border: 1px dashed #d1d5db; border-radius: 8px; padding: 8px 18px; font-weight: 700; color: #1f2937; font-size: 15px;">
            RÉFÉRENCE : ${order.orderNumber}
          </div>
        </td>
      </tr>

      <!-- RÉCAPITULATIF DES ARTICLES -->
      <tr>
        <td style="padding: 20px 24px;">
          <h3 style="margin: 0 0 12px 0; color: #111827; font-size: 16px; border-bottom: 2px solid #dfb743; padding-bottom: 6px;">Articles commandés</h3>
          <table width="100%" border="0" cellspacing="0" cellpadding="0">
            <thead>
              <tr style="color: #6b7280; font-size: 12px; text-transform: uppercase;">
                <th align="left" style="padding-bottom: 8px;">Article</th>
                <th align="center" style="padding-bottom: 8px;">Qté</th>
                <th align="right" style="padding-bottom: 8px;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <!-- TOTAUX -->
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 16px; font-size: 14px;">
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Sous-total :</td>
              <td align="right" style="padding: 4px 0; color: #111827;">${formatPrice(order.subtotal)}</td>
            </tr>
            ${order.discount > 0 ? `
            <tr>
              <td style="padding: 4px 0; color: #10b981;">Remise promo :</td>
              <td align="right" style="padding: 4px 0; color: #10b981;">-${formatPrice(order.discount)}</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Frais de livraison :</td>
              <td align="right" style="padding: 4px 0; color: #111827;">${order.shippingCost === 0 ? '<strong style="color:#10b981;">GRATUIT</strong>' : formatPrice(order.shippingCost)}</td>
            </tr>
            <tr style="border-top: 2px solid #111827;">
              <td style="padding: 12px 0; font-size: 16px; font-weight: 800; color: #111827;">Total à régler :</td>
              <td align="right" style="padding: 12px 0; font-size: 18px; font-weight: 800; color: #dfb743;">${formatPrice(order.total)}</td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- INFOS LIVRAISON & PAIEMENT -->
      <tr>
        <td style="padding: 0 24px 24px 24px;">
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f9fafb; border-radius: 8px; padding: 16px;">
            <tr>
              <td style="padding: 4px 0;">
                <strong style="color: #374151; font-size: 13px;">📍 Adresse de livraison :</strong>
                <p style="margin: 2px 0 10px 0; color: #1f2937; font-size: 14px;">${order.deliveryAddress}, ${order.city || 'Abidjan'}</p>
                
                <strong style="color: #374151; font-size: 13px;">📞 Contact destinataire :</strong>
                <p style="margin: 2px 0 10px 0; color: #1f2937; font-size: 14px;">${order.customerName} (${order.customerPhone})</p>

                <strong style="color: #374151; font-size: 13px;">💵 Mode de règlement :</strong>
                <p style="margin: 2px 0 0 0; color: #1f2937; font-size: 14px; font-weight: 600;">
                  Paiement Cash à la livraison (${formatPrice(order.total)})
                </p>
                <p style="margin: 6px 0 0 0; color: #92400e; font-size: 12px; background: #fef3c7; padding: 6px 10px; border-radius: 6px;">
                  💡 Merci de préparer la somme exacte en espèces pour notre livreur lors de la réception de votre colis.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- FOOTER & ASSISTANCE -->
      <tr>
        <td style="background-color: #f3f4f6; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb;">
          <p style="margin: 0 0 6px 0;">Une question sur votre commande ? Contactez-nous directement sur WhatsApp ou par téléphone.</p>
          <p style="margin: 0; font-weight: 600; color: #111827;">Vicky-Shop • Abidjan, Côte d'Ivoire</p>
        </td>
      </tr>

    </table>
  </body>
  </html>
  `;
};

/**
 * Envoie l'email de confirmation de commande au client.
 * @param {Object} order 
 */
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

/**
 * Génère le gabarit pour la mise à jour de statut de commande.
 */
const getStatusUpdateHtml = (order, newStatus) => {
  let statusText = 'Mise à jour de votre commande';
  let messageDetail = 'Le statut de votre commande a évolué.';
  let badgeColor = '#3b82f6';

  switch (newStatus) {
    case 'en_preparation':
      statusText = 'Commande confirmée & En préparation';
      messageDetail = 'Votre commande a été confirmée par notre équipe. Nous préparons soigneusement vos articles pour l\'expédition.';
      badgeColor = '#f59e0b';
      break;
    case 'en_livraison':
      statusText = 'Commande en cours de livraison 🚚';
      messageDetail = 'Bonne nouvelle ! Votre colis est confié à notre livreur et est en route vers votre adresse. Le livreur vous contactera par téléphone dès son arrivée.';
      badgeColor = '#3b82f6';
      break;
    case 'livree':
      statusText = 'Commande livrée avec succès 🎉';
      messageDetail = 'Votre colis a été remis à destination. Nous vous remercions pour votre confiance et espérons vous revoir très bientôt sur Vicky-Shop !';
      badgeColor = '#10b981';
      break;
    case 'annulee':
      statusText = 'Commande annulée';
      messageDetail = 'Votre commande a été marquée comme annulée. Si vous avez des questions ou souhaitez renouveler votre achat, notre service client est à votre disposition.';
      badgeColor = '#ef4444';
      break;
    default:
      statusText = `Statut : ${newStatus}`;
      break;
  }

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  </head>
  <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f7f9fa; margin: 0; padding: 20px; color: #2d3748;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06);">
      <tr>
        <td style="background: linear-gradient(135deg, #111827 0%, #1f2937 100%); padding: 28px 24px; text-align: center;">
          <h1 style="color: #dfb743; margin: 0; font-size: 24px; letter-spacing: 2px; text-transform: uppercase;">VICKY-SHOP</h1>
        </td>
      </tr>

      <tr>
        <td style="padding: 30px 24px; text-align: center;">
          <span style="display: inline-block; background-color: ${badgeColor}20; color: ${badgeColor}; border: 1px solid ${badgeColor}; padding: 6px 16px; border-radius: 20px; font-weight: 700; font-size: 13px; text-transform: uppercase; margin-bottom: 12px;">
            ${statusText}
          </span>
          <h2 style="margin: 0 0 10px 0; color: #111827; font-size: 20px;">Bonjour ${order.customerName || 'Cher Client'},</h2>
          <p style="margin: 0 0 16px 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
            ${messageDetail}
          </p>
          <div style="background-color: #f9fafb; border-radius: 8px; padding: 14px; text-align: left; margin: 20px 0;">
            <div style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">Numéro de commande : <strong>#${order.orderNumber}</strong></div>
            <div style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">Adresse de livraison : <strong>${order.deliveryAddress}, ${order.city || 'Abidjan'}</strong></div>
            <div style="font-size: 13px; color: #6b7280;">Montant total : <strong>${formatPrice(order.total)}</strong></div>
          </div>
        </td>
      </tr>

      <tr>
        <td style="background-color: #f3f4f6; padding: 18px; text-align: center; font-size: 12px; color: #6b7280;">
          <p style="margin: 0;">Vicky-Shop • Service Client Abidjan</p>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;
};

/**
 * Envoie un email d'information au client lors du changement de statut de sa commande.
 * @param {Object} order 
 * @param {string} newStatus 
 */
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
