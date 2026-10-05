/**
 * Machine à états finis (Finite State Machine) pour le cycle de vie des Commandes Vicky-Shop.
 * Garantit l'intégrité de la logique métier et empêche les transitions d'états frauduleuses ou contradictoires.
 */

export const ORDER_STATUSES = Object.freeze({
  RECUE: 'recue',
  CONFIRMEE: 'confirmee',
  EN_PREPARATION: 'en_preparation',
  EN_LIVRAISON: 'en_livraison',
  LIVREE: 'livree',
  ANNULEE: 'annulee',
  REFUSEE: 'refusee',
});

// Matrice des transitions d'états valides
const ALLOWED_TRANSITIONS = {
  [ORDER_STATUSES.RECUE]: [
    ORDER_STATUSES.CONFIRMEE,
    ORDER_STATUSES.EN_PREPARATION,
    ORDER_STATUSES.EN_LIVRAISON,
    ORDER_STATUSES.ANNULEE,
    ORDER_STATUSES.REFUSEE,
  ],
  [ORDER_STATUSES.CONFIRMEE]: [
    ORDER_STATUSES.EN_PREPARATION,
    ORDER_STATUSES.EN_LIVRAISON,
    ORDER_STATUSES.ANNULEE,
    ORDER_STATUSES.REFUSEE,
  ],
  [ORDER_STATUSES.EN_PREPARATION]: [
    ORDER_STATUSES.EN_LIVRAISON,
    ORDER_STATUSES.LIVREE,
    ORDER_STATUSES.ANNULEE,
  ],
  [ORDER_STATUSES.EN_LIVRAISON]: [
    ORDER_STATUSES.LIVREE,
    ORDER_STATUSES.ANNULEE,
    ORDER_STATUSES.REFUSEE,
  ],
  [ORDER_STATUSES.LIVREE]: [], // État final immuable (Livraison terminée)
  [ORDER_STATUSES.ANNULEE]: [], // État final (Commande annulée)
  [ORDER_STATUSES.REFUSEE]: [], // État final (Colis refusé)
};

/**
 * Vérifie si une transition de statut est autorisée selon les règles métier.
 * @param {string} currentStatus 
 * @param {string} targetStatus 
 * @returns {boolean}
 */
export const isValidStateTransition = (currentStatus, targetStatus) => {
  if (currentStatus === targetStatus) return true; // Pas de changement
  const allowed = ALLOWED_TRANSITIONS[currentStatus];
  return Array.isArray(allowed) && allowed.includes(targetStatus);
};

/**
 * Détermine si la transition actuelle doit déclencher une réintégration du stock produit.
 * Évite les réintégrations multiples en vérifiant que le statut initial n'était pas déjà annulé/refusé.
 * @param {string} currentStatus 
 * @param {string} targetStatus 
 * @returns {boolean}
 */
export const shouldRestoreStockOnTransition = (currentStatus, targetStatus) => {
  const isTargetCancel = targetStatus === ORDER_STATUSES.ANNULEE || targetStatus === ORDER_STATUSES.REFUSEE;
  const isCurrentCancel = currentStatus === ORDER_STATUSES.ANNULEE || currentStatus === ORDER_STATUSES.REFUSEE;
  return isTargetCancel && !isCurrentCancel;
};
