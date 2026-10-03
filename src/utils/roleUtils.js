/**
 * Utilitaires de gestion, de normalisation et de vérification des Rôles Utilisateurs.
 * Assure la cohérence stricte RBAC (Role-Based Access Control) entre Backend, Frontend et BDD.
 */

export const ROLES = Object.freeze({
  CLIENT: 'client',
  VENDEUR: 'vendeur',
  ADMIN: 'admin',
});

export const ALL_ROLES = Object.freeze([ROLES.CLIENT, ROLES.VENDEUR, ROLES.ADMIN]);

/**
 * Normalise toute variante de rôle (ex: seller, SELLER, Vendeur, customer, etc.)
 * vers la convention canonique officielle ('client' | 'vendeur' | 'admin').
 *
 * @param {string} rawRole - Rôle brut envoyé ou stocké
 * @param {string} defaultRole - Rôle par défaut si non reconnu (défaut: 'client')
 * @returns {string} Le rôle canonique normalisé
 */
export const normalizeRole = (rawRole, defaultRole = ROLES.CLIENT) => {
  if (!rawRole || typeof rawRole !== 'string') {
    return defaultRole;
  }

  const cleaned = rawRole.trim().toLowerCase();

  switch (cleaned) {
    case 'vendeur':
    case 'vendeurs':
    case 'seller':
    case 'sellers':
    case 'merchant':
    case 'marchand':
      return ROLES.VENDEUR;

    case 'admin':
    case 'administrator':
    case 'administrateur':
      return ROLES.ADMIN;

    case 'client':
    case 'clients':
    case 'customer':
    case 'customers':
    case 'user':
    case 'acheteur':
      return ROLES.CLIENT;

    default:
      return defaultRole;
  }
};

/**
 * Vérifie si le rôle correspond à un Vendeur (canonique ou alias).
 * @param {string} role
 * @returns {boolean}
 */
export const isSellerRole = (role) => {
  return normalizeRole(role, null) === ROLES.VENDEUR;
};

/**
 * Vérifie si le rôle correspond à un Client (canonique ou alias).
 * @param {string} role
 * @returns {boolean}
 */
export const isClientRole = (role) => {
  return normalizeRole(role, null) === ROLES.CLIENT;
};

/**
 * Vérifie si le rôle correspond à un Administrateur (canonique ou alias).
 * @param {string} role
 * @returns {boolean}
 */
export const isAdminRole = (role) => {
  return normalizeRole(role, null) === ROLES.ADMIN;
};

/**
 * Normalise et migre silencieusement les anciens rôles ('customer', 'seller')
 * vers les rôles officiels ('client', 'vendeur') dans la base de données.
 *
 * @param {import('mongoose').Model} UserModel - Modèle Mongoose User
 */
export const migrateLegacyRoles = async (UserModel) => {
  try {
    const customerUpdate = await UserModel.updateMany(
      { role: { $in: ['customer', 'Customer', 'CUSTOMER'] } },
      { $set: { role: ROLES.CLIENT } }
    );

    const sellerUpdate = await UserModel.updateMany(
      { role: { $in: ['seller', 'Seller', 'SELLER'] } },
      { $set: { role: ROLES.VENDEUR } }
    );

    const totalMigrated = (customerUpdate.modifiedCount || 0) + (sellerUpdate.modifiedCount || 0);
    if (totalMigrated > 0) {
      console.log(`[RBAC Migration] ${totalMigrated} utilisateur(s) migré(s) vers la nomenclature canonique.`);
    }
  } catch (error) {
    console.warn('[RBAC Migration] Avertissement lors de la normalisation des rôles :', error.message);
  }
};
