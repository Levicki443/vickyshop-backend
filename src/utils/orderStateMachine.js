/**
 * Machine à états finis (Finite State Machine) pour le cycle de vie des Commandes Vicky-Shop.
 * Garantit l'intégrité de la logique métier et empêche les transitions d'états frauduleuses ou contradictoires.
 */

export const ORDER_STATUSES = Object.freeze({
  RECUE: 'recue',
  CONFIRMEE: 'confirmee',
  EN_PREPARATION: 'en_preparation',
  EXPEDIEE: 'expediee',
  EN_LIVRAISON: 'en_livraison',
  LIVREE: 'livree',
  ANNULEE: 'annulee',
  REFUSEE: 'refusee',
  RETOURNEE: 'retournee',
});

// Ordre linéaire de progression du cycle standard
export const ORDER_STATUS_HIERARCHY = Object.freeze([
  ORDER_STATUSES.RECUE,
  ORDER_STATUSES.CONFIRMEE,
  ORDER_STATUSES.EN_PREPARATION,
  ORDER_STATUSES.EXPEDIEE,
  ORDER_STATUSES.EN_LIVRAISON,
  ORDER_STATUSES.LIVREE,
]);

// Matrice des transitions d'états valides
const ALLOWED_TRANSITIONS = {
  [ORDER_STATUSES.RECUE]: [
    ORDER_STATUSES.CONFIRMEE,
    ORDER_STATUSES.EN_PREPARATION,
    ORDER_STATUSES.ANNULEE,
    ORDER_STATUSES.REFUSEE,
  ],
  [ORDER_STATUSES.CONFIRMEE]: [
    ORDER_STATUSES.EN_PREPARATION,
    ORDER_STATUSES.EXPEDIEE,
    ORDER_STATUSES.ANNULEE,
    ORDER_STATUSES.REFUSEE,
  ],
  [ORDER_STATUSES.EN_PREPARATION]: [
    ORDER_STATUSES.EXPEDIEE,
    ORDER_STATUSES.EN_LIVRAISON,
    ORDER_STATUSES.ANNULEE,
    ORDER_STATUSES.REFUSEE,
  ],
  [ORDER_STATUSES.EXPEDIEE]: [
    ORDER_STATUSES.EN_LIVRAISON,
    ORDER_STATUSES.LIVREE,
    ORDER_STATUSES.ANNULEE,
    ORDER_STATUSES.RETOURNEE,
  ],
  [ORDER_STATUSES.EN_LIVRAISON]: [
    ORDER_STATUSES.LIVREE,
    ORDER_STATUSES.REFUSEE,
    ORDER_STATUSES.RETOURNEE,
    ORDER_STATUSES.ANNULEE,
  ],
  [ORDER_STATUSES.LIVREE]: [
    ORDER_STATUSES.RETOURNEE,
  ],
  [ORDER_STATUSES.ANNULEE]: [],
  [ORDER_STATUSES.REFUSEE]: [],
  [ORDER_STATUSES.RETOURNEE]: [],
};

/**
 * Vérifie si une transition de statut est autorisée selon les règles métier.
 * @param {string} currentStatus 
 * @param {string} targetStatus 
 * @returns {boolean}
 */
export const isValidStateTransition = (currentStatus, targetStatus) => {
  if (currentStatus === targetStatus) return true;
  const allowed = ALLOWED_TRANSITIONS[currentStatus];
  return Array.isArray(allowed) && allowed.includes(targetStatus);
};

/**
 * Détermine si la transition actuelle doit déclencher une réintégration du stock produit.
 * @param {string} currentStatus 
 * @param {string} targetStatus 
 * @returns {boolean}
 */
export const shouldRestoreStockOnTransition = (currentStatus, targetStatus) => {
  const isTargetCancel = targetStatus === ORDER_STATUSES.ANNULEE || targetStatus === ORDER_STATUSES.REFUSEE;
  const isCurrentCancel = currentStatus === ORDER_STATUSES.ANNULEE || currentStatus === ORDER_STATUSES.REFUSEE;
  return isTargetCancel && !isCurrentCancel;
};

/**
 * Calcule intelligemment le statut global d'une commande multi-vendeurs à partir du statut de ses articles.
 * @param {Array} items 
 * @returns {string}
 */
export const computeGlobalOrderStatusFromItems = (items) => {
  if (!items || items.length === 0) return ORDER_STATUSES.RECUE;

  const validItemStatuses = items
    .map((i) => i.status)
    .filter((s) => s && s !== 'annulee' && s !== 'refusee');

  if (validItemStatuses.length === 0) {
    // Tous les articles sont annulés ou refusés
    return ORDER_STATUSES.ANNULEE;
  }

  // Si tous les articles valides sont livrés
  if (validItemStatuses.every((s) => s === 'livree')) {
    return ORDER_STATUSES.LIVREE;
  }

  // Si au moins un article est en livraison
  if (validItemStatuses.some((s) => s === 'en_livraison')) {
    return ORDER_STATUSES.EN_LIVRAISON;
  }

  // Si au moins un article est expédié
  if (validItemStatuses.some((s) => s === 'expediee')) {
    return ORDER_STATUSES.EXPEDIEE;
  }

  // Si au moins un article est en préparation
  if (validItemStatuses.some((s) => s === 'en_preparation')) {
    return ORDER_STATUSES.EN_PREPARATION;
  }

  // Si tous sont confirmés
  if (validItemStatuses.every((s) => s === 'confirmee')) {
    return ORDER_STATUSES.CONFIRMEE;
  }

  return ORDER_STATUSES.RECUE;
};

/**
 * Libellé en français pour l'affichage utilisateur.
 * @param {string} status 
 * @returns {string}
 */
export const getStatusLabelFr = (status) => {
  switch (status) {
    case ORDER_STATUSES.RECUE:
    case 'en_attente':
      return 'Commande reçue';
    case ORDER_STATUSES.CONFIRMEE:
      return 'Commande confirmée';
    case ORDER_STATUSES.EN_PREPARATION:
      return 'En préparation';
    case ORDER_STATUSES.EXPEDIEE:
      return 'Expédiée';
    case ORDER_STATUSES.EN_LIVRAISON:
      return 'En cours de livraison';
    case ORDER_STATUSES.LIVREE:
      return 'Livrée avec succès';
    case ORDER_STATUSES.ANNULEE:
      return 'Commande annulée';
    case ORDER_STATUSES.REFUSEE:
      return 'Commande refusée';
    case ORDER_STATUSES.RETOURNEE:
      return 'Commande retournée';
    default:
      return status || 'Statut inconnu';
  }
};
