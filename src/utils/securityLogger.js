/**
 * Utilitaire de journalisation d'événements de sécurité et d'audit pour Vicky-Shop.
 * Garantit qu'aucun mot de passe, jeton complet ou information bancaire n'est jamais consigné.
 */

const formatTimestamp = () => new Date().toISOString();

const sanitizeData = (data = {}) => {
  const sanitized = { ...data };
  const sensitiveKeys = ['password', 'currentPassword', 'newPassword', 'token', 'adminSecretKey', 'secret', 'cvv', 'creditCard'];

  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.includes(key)) {
      sanitized[key] = '[PROTÉGÉ]';
    }
  }
  return sanitized;
};

export const securityLog = {
  authSuccess: ({ userId, email, role, ip }) => {
    console.log(
      `[SÉCURITÉ][AUTH_SUCCÈS] ${formatTimestamp()} | Utilisateur: ${userId} (${email}) | Rôle: ${role} | IP: ${ip || 'Inconnue'}`
    );
  },

  authFailure: ({ email, reason, ip }) => {
    console.warn(
      `[SÉCURITÉ][AUTH_ÉCHEC] ${formatTimestamp()} | Email: ${email || 'Non fourni'} | Raison: ${reason} | IP: ${ip || 'Inconnue'}`
    );
  },

  accessDenied: ({ userId, role, route, method, ip, reason }) => {
    console.warn(
      `[SÉCURITÉ][ACCÈS_REFUSÉ] ${formatTimestamp()} | Utilisateur: ${userId || 'Non authentifié'} | Rôle: ${role || 'Aucun'} | Route: ${method} ${route} | Raison: ${reason || 'Permissions insuffisantes'} | IP: ${ip || 'Inconnue'}`
    );
  },

  roleChanged: ({ targetUserId, previousRole, newRole, changedByUserId, ip }) => {
    console.warn(
      `[SÉCURITÉ][MODIFICATION_RÔLE] ${formatTimestamp()} | Cible: ${targetUserId} | Ancien: ${previousRole} -> Nouveau: ${newRole} | Exécuté par: ${changedByUserId} | IP: ${ip || 'Inconnue'}`
    );
  },

  orderStatusChanged: ({ orderNumber, previousStatus, newStatus, changedByUserId, ip }) => {
    console.log(
      `[SÉCURITÉ][COMMANDE_STATUT] ${formatTimestamp()} | Commande: #${orderNumber} | Statut: ${previousStatus} -> ${newStatus} | Opérateur: ${changedByUserId} | IP: ${ip || 'Inconnue'}`
    );
  },

  adminAction: ({ action, targetResource, userId, details = {}, ip }) => {
    console.log(
      `[SÉCURITÉ][ACTION_ADMIN] ${formatTimestamp()} | Action: ${action} | Ressource: ${targetResource} | Admin: ${userId} | Détails: ${JSON.stringify(sanitizeData(details))} | IP: ${ip || 'Inconnue'}`
    );
  },
};
