/**
 * Service de réponse déterministe et experte pour Vicky IA (Fallback).
 * Fournit des réponses fiables, professionnelles et précises basées sur les données réelles
 * de Vicky-Shop même en cas d'indisponibilité ou absence de clé du modèle Gemini.
 * Strictement <= 325 lignes.
 */

export const getFallbackResponse = (userMessage, dynamicContext = null, userRole = 'client') => {
  const clean = (userMessage || '').trim();
  const lower = clean.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const products = Array.isArray(dynamicContext?.products) ? dynamicContext.products : [];
  const orders = Array.isArray(dynamicContext?.orders) ? dynamicContext.orders : [];
  const intentType = dynamicContext?.intent?.type;

  // Détection si la demande est formulée en anglais
  const isEnglish = /\b(what is|how to|shoes|dress|shirt|delivery|shipping|price|how much|buy|order|track|seller|sell|store|cart|return|refund|cheap|money)\b/i.test(clean);

  if (isEnglish) {
    if (/\b(delivery|shipping|cost|fee)\b/i.test(clean)) {
      return "Delivery at Vicky-Shop is **2,000 FCFA** anywhere in Abidjan (24h-48h). Free delivery for orders over **50,000 FCFA**! Payment is made exclusively in **cash on delivery** after you inspect your parcel.";
    }
    if (/\b(payment|pay|cash)\b/i.test(clean)) {
      return "On Vicky-Shop, we use **Cash on Delivery**. You pay zero upfront online. You receive your package, check your items, and pay in cash directly to our delivery courier.";
    }
    if (/\b(track|status)\b/i.test(clean)) {
      return "To track your order, please provide your order reference number (e.g., **CMD-XXXXXX**) or check your 'My Orders' section in your account profile.\n\n[ACTION:AUTH_MODAL]";
    }
    if (/\b(sell|seller)\b/i.test(clean)) {
      return "Interested in selling on Vicky-Shop? Join our marketplace as a certified seller! Click the button below to open your Seller Dashboard and add your products:\n\n[ACTION:SELLER_DASHBOARD]";
    }
    return "Hello! I am Vicky AI, the official shopping assistant for Vicky-Shop in Abidjan, Côte d'Ivoire. We offer trendy fashion, clothes, shoes, and accessories with Cash on Delivery. How can I help you today?";
  }

  // 1. Réclamation / Litige / Problème
  if (intentType === 'SUPPORT_COMPLAINT' || /\b(drap|litige|probleme|reclamation|plainte|arnaque)\b/.test(lower)) {
    return 'Je comprends tout à fait votre situation et nous prenons votre préoccupation très au sérieux.\n\n' +
      'Pour résoudre cela dans les plus brefs délais :\n' +
      '• Munissez-vous de votre numéro de commande (ex: **CMD-XXXXXX**).\n' +
      '• Notre équipe du service client examine votre dossier sans délai.\n' +
      '• Cliquez sur le bouton ci-dessous pour ouvrir directement la discussion avec notre responsable support sur WhatsApp :\n\n' +
      '[ACTION:WHATSAPP_SUPPORT]';
  }

  // 2. Présentation générale de Vicky-Shop & Fonctionnement
  if (intentType === 'PLATFORM_ABOUT' || /\b(c['’]est quoi (?:vicky|vickyshop)|qui etes vous|presentation|fonctionne vicky|pourquoi vicky|avantages de vicky|difference client vendeur)\b/.test(lower)) {
    return '✨ **Bienvenue sur Vicky-Shop !**\n\n' +
      'Vicky-Shop est la marketplace de mode et d\'habillement de référence à Abidjan :\n\n' +
      '🌟 **Nos points forts** :\n' +
      '• **Zéro risque en ligne** : Paiement en **espèces à la livraison** après contrôle physique de votre colis.\n' +
      '• **Livraison express** : 24h à 48h ouvrées sur toutes les communes d\'Abidjan (2 000 FCFA, et **gratuite dès 50 000 FCFA**).\n' +
      '• **Garantie satisfaction** : Échange de taille possible sous **48 heures ouvrées**.\n\n' +
      '👤 **Deux types de comptes** :\n' +
      '• **Compte Client** : Pour faire son shopping, enregistrer ses adresses et suivre ses colis.\n' +
      '• **Compte Vendeur** : Pour les créateurs et commerçants souhaitant publier leurs articles et gérer leur propre boutique en ligne.\n\n' +
      'Avez-vous besoin d\'aide pour trouver un article particulier ?';
  }

  // 3. Avis clients & Achats vérifiés
  if (intentType === 'REVIEW_GUIDE' || /\b(avis|noter|etoile|commentaire|avis verifie)\b/.test(lower)) {
    return '⭐ **Les avis clients sur Vicky-Shop** :\n\n' +
      '• **Consulter les avis** : Chaque fiche produit affiche sa note moyenne (de 1 à 5 étoiles) et les retours d\'expérience.\n' +
      '• **Publier un avis** : Cliquez sur « Laisser un avis » sur la fiche d\'un produit ou depuis votre historique de commande.\n' +
      '• **Badge « Achat Vérifié »** : Ce badge est automatiquement accordé aux clients ayant commandé et validé la réception du produit, garantissant une authenticité totale des avis.\n\n' +
      'Souhaitez-vous voir nos produits les mieux notés ?';
  }

  // 4. Gestion Espace Vendeur
  if (intentType === 'SELLER_GUIDE' || /\b(vendre|vendeur|boutique|djandjou|fournisseur)\b/.test(lower) || (userRole === 'vendeur' && lower.includes('produit'))) {
    return 'Pour vendre et ajouter un article sur Vicky-Shop, voici les étapes à suivre :\n\n' +
      '1️⃣ **Connexion Vendeur** : Connectez-vous avec votre compte vendeur.\n' +
      '2️⃣ **Accédez à l\'Espace Vendeur** : Cliquez sur « Espace Vendeur » ou utilisez le bouton ci-dessous.\n' +
      '3️⃣ **Ajouter un produit** : Dans l\'onglet « Produits », cliquez sur le bouton **« + Ajouter un produit »**.\n' +
      '4️⃣ **Renseignez la fiche** : Titre clair, catégorie, prix en FCFA, stock disponible, description et photos nettes.\n' +
      '5️⃣ **Publication & Partage** : Cliquez sur « Enregistrer ». Votre produit est immédiatement visible en boutique avec un lien de partage pour WhatsApp, TikTok et Facebook !\n\n' +
      '[ACTION:SELLER_DASHBOARD]';
  }

  // 5. Modalités de paiement
  if (intentType === 'PAYMENT_INFO' || /\b(paiement|payer|especes|cash|argent|regler|orange money|wave|moov|mtn)\b/.test(lower)) {
    return 'Sur Vicky-Shop, le mode de règlement est le **Paiement en espèces à la livraison (Cash on Delivery)** :\n\n' +
      '• Vous ne payez **rien à l\'avance** sur le site.\n' +
      '• Le livreur vous remet votre colis à l\'adresse convenue.\n' +
      '• Vous ouvrez et inspectez votre colis.\n' +
      '• Vous réglez directement le montant exact en espèces (Francs CFA) au livreur.\n\n' +
      'C\'est la garantie d\'un achat 100 % sécurisé et sans mauvaise surprise !';
  }

  // 6. Passer commande / Comment acheter
  if (intentType === 'ORDER_GUIDE' || (/\b(comment|passer|faire|effectuer|valider)\b/.test(lower) && /\b(commande|commander|achat|acheter)\b/.test(lower))) {
    return 'Passer commande sur Vicky-Shop est très simple, rapide et 100 % sécurisé :\n\n' +
      '1️⃣ **Sélectionnez vos articles** : Parcourez notre catalogue et choisissez vos coups de cœur (taille, couleur, quantité).\n' +
      '2️⃣ **Ajoutez au panier** : Cliquez sur « Ajouter au panier », puis ouvrez votre panier pour vérifier vos articles.\n' +
      '3️⃣ **Validez votre livraison** : Renseignez vos coordonnées (nom, numéro de téléphone joignable et commune à Abidjan). **Aucune carte bancaire n\'est demandée !**\n' +
      '4️⃣ **Paiement à la livraison** : Notre livreur vous contacte sous 24h à 48h ouvrées. Vous vérifiez votre colis avant de régler en **espèces (Cash on Delivery)**.\n\n' +
      'Avez-vous besoin d\'aide pour trouver un article particulier ?';
  }

  // 7. Suivi de commande personnalisé & Explication des statuts
  if (intentType === 'ORDER_TRACKING' || orders.length > 0 || /\b(CMD-[A-Z0-9]+)\b/i.test(clean)) {
    if (orders.length > 0) {
      const orderList = orders.map((o) => {
        let statusExplan = '';
        if (o.status === 'en_attente') statusExplan = 'Reçue, en cours de confirmation logistique.';
        else if (o.status === 'confirmee') statusExplan = 'Validée, en cours de transmission à l\'entrepôt.';
        else if (o.status === 'en_preparation') statusExplan = 'Articles en cours d\'emballage soigné.';
        else if (o.status === 'expediee' || o.status === 'en_livraison') statusExplan = 'Pris en charge par le coursier, livraison sous 24h.';
        else if (o.status === 'livree') statusExplan = 'Colis remis en main propre et réglé.';
        else statusExplan = 'Statut mis à jour.';

        return `• **Commande N° ${o.orderNumber}**\n  - Statut : **${o.status}** (${statusExplan})\n  - Montant : **${o.totalAmount?.toLocaleString('fr-FR')} FCFA**\n[ACTION:TRACK_ORDER:${o.orderNumber}]`;
      }).join('\n\n');

      return `Voici les informations vérifiées sur vos commandes récentes :\n\n${orderList}\n\nCliquez sur le bouton ci-dessus pour ouvrir le suivi détaillé en direct.`;
    }

    return 'Pour suivre votre commande en direct :\n' +
      '• Si vous êtes connecté, consultez votre rubrique « Mes Commandes ».\n' +
      '• Ou envoyez-moi directement votre numéro de commande (ex: **CMD-123456**).\n\n' +
      'Nos livreurs assurent la livraison en 24h à 48h ouvrées sur tout Abidjan avec règlement en espèces à la livraison.';
  }

  // 8. Frais & Délais de livraison
  if (intentType === 'DELIVERY_INFO' || /\b(livraison|frais|delai|combien la livraison|expedition|abidjan|yopougon|cocody|marcory)\b/.test(lower)) {
    return 'Voici notre politique de livraison claire et transparente sur Vicky-Shop :\n\n' +
      '🚚 **Tarif standard à Abidjan** : **2 000 FCFA** seulement sur toutes les communes (Cocody, Yopougon, Marcory, Plateau, Koumassi, Treichville, Port-Bouët, Adjamé, Abobo...).\n' +
      '🎁 **Livraison GRATUITE** : Offerte automatiquement dès **50 000 FCFA** d\'achats dans votre panier !\n' +
      '⏱️ **Délais** : 24h à 48h ouvrées à Abidjan (et 48h à 72h vers l\'intérieur du pays).\n' +
      '📦 **Paiement** : Exclusivement en espèces au livreur après contrôle de votre colis.';
  }

  // 9. Échanges et retours sous 48h
  if (intentType === 'EXCHANGE_RETURN' || /\b(echange|echanger|taille|pointure|retour|retourner|essayage|remboursement)\b/.test(lower)) {
    return 'Chez Vicky-Shop, votre satisfaction est garantie :\n\n' +
      '✨ **Contrôle à la livraison** : Vous inspectez immédiatement le produit dès la remise par le livreur.\n' +
      '🔄 **Échange sous 48h** : Si la taille d\'un vêtement ou d\'une chaussure ne convient pas, nous réalisons un échange sous **48 heures ouvrées** (l\'article doit rester neuf dans son emballage avec ses étiquettes).\n' +
      '💬 Pour demander un échange rapide, contactez notre équipe sur WhatsApp :\n\n' +
      '[ACTION:WHATSAPP_SUPPORT]';
  }

  // 10. Recommandations personnalisées & Clarification
  if (intentType === 'RECOMMENDATION_SEEK' || /\b(conseille|recommande|idee|cadeau|choisir|selectionne)\b/.test(lower)) {
    if (products.length > 0) {
      const list = products.map((p) =>
        `• **${p.title}** (${p.category}) — **${p.price?.toLocaleString('fr-FR')} FCFA**\n[ACTION:VIEW_PRODUCT:${p.slug || p._id}]`
      ).join('\n\n');
      return `Avec plaisir ! Voici une sélection d'articles très appréciés actuellement sur Vicky-Shop :\n\n${list}\n\nPour affiner ma recommandation, quel est votre budget approximatif en FCFA et pour quelle occasion recherchez-vous cet article ?`;
    }

    return 'Avec grand plaisir ! Pour vous proposer les meilleures recommandations adaptées à votre goût :\n\n' +
      '1. Quel est votre **budget maximum en FCFA** ?\n' +
      '2. S\'agit-il d\'une tenue pour une **occasion spéciale** (soirée, mariage, sortie) ou pour le quotidien ?\n' +
      '3. Recherchez-vous plutôt une robe, un ensemble, des chaussures ou des accessoires ?';
  }

  // 11. Articles réels trouvés dans le catalogue
  if (products.length > 0) {
    const list = products.map((p) =>
      `• **${p.title}** (${p.category}) — **${p.price?.toLocaleString('fr-FR')} FCFA**${p.inStock ? ` (${p.stockQuantity} en stock)` : ' (En rupture)'}\n[ACTION:VIEW_PRODUCT:${p.slug || p._id}]`
    ).join('\n\n');
    return `Voici des articles disponibles actuellement dans la boutique :\n\n${list}\n\nVous pouvez cliquer sur une fiche pour l'examiner ou l'ajouter directement à votre panier !`;
  }

  // 12. Création de compte / Connexion
  if (intentType === 'ACCOUNT_INFO' || /\b(creer un compte|inscription|inscrire|connexion|se connecter)\b/.test(lower)) {
    return 'Pour créer un compte ou vous connecter sur Vicky-Shop :\n\n' +
      '• Cliquez sur le bouton « Connexion » en haut de page.\n' +
      '• Vous pouvez choisir entre un profil **Client** (pour commander et suivre vos achats) ou **Vendeur** (pour publier votre propre catalogue).\n\n' +
      '[ACTION:AUTH_MODAL]';
  }

  // 13. Salutation & Accueil général
  return 'Bonjour ! Je suis Vicky IA, votre conseillère officielle Vicky-Shop.\n\n' +
    'Je suis à votre entière disposition 24h/24 pour vous guider :\n' +
    '• Trouver des articles tendance selon vos goûts et votre budget en FCFA\n' +
    '• Vous guider pour passer commande avec paiement en espèces à la livraison\n' +
    '• Suivre vos commandes existantes en temps réel\n' +
    '• Vous accompagner pour vendre sur votre espace vendeur\n\n' +
    'Comment puis-je vous aider aujourd\'hui ?';
};

export default getFallbackResponse;
