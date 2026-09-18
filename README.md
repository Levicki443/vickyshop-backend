# 🛒 Vicky-Shop Backend API

API RESTful moderne, modulaire et hautement sécurisée pour la plateforme e-commerce **Vicky-Shop**.

---

## 🛡️ Standards de Sécurité & Architecture

- **Architecture SOLID** : Séparation stricte des responsabilités (Contrôleurs, Services, Modèles, Middlewares).
- **Protection HTTP** : En-têtes sécurisés avec `Helmet`.
- **Politique CORS** : Restriction des accès aux domaines autorisés uniquement.
- **Protection Anti-DDoS** : Limitation de débit de requêtes (`express-rate-limit`).
- **Gestion des Erreurs** : Gestionnaire d'erreurs centralisé sans fuite de trace mémoire (*stack trace*) en production.
- **Arrêt Gracieux (Graceful Shutdown)** : Fermeture propre des sockets et de la connexion à la base de données lors des signaux système.

---

## ⚙️ Prérequis

- **Node.js** : Version 18.0.0 ou supérieure
- **MongoDB** : Serveur local ou instance MongoDB Atlas

---

## 🚀 Installation & Démarrage

1. **Cloner le dépôt et naviguer dans le dossier :**
   ```bash
   cd vickyshop-backend
   ```

2. **Installer les dépendances :**
   ```bash
   npm install
   ```

3. **Configurer les variables d'environnement :**
   Copiez le fichier `.env.example` en `.env` et adaptez les valeurs :
   ```bash
   cp .env.example .env
   ```

4. **Lancer le serveur en mode développement :**
   ```bash
   npm run dev
   ```

5. **Lancer le serveur en mode production :**
   ```bash
   npm start
   ```

---

## 📡 Points d'Accès Principaux (Endpoints)

| Méthode | Route | Description | Statut |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Vérification de l'état de santé du serveur | Opérationnel |

---

## 📂 Structure du Projet

```text
vickyshop-backend/
├── src/
│   ├── config/          # Configurations (Base de données, environnement)
│   ├── controllers/     # Logique des contrôleurs
│   ├── middlewares/     # Middlewares de sécurité et validation
│   ├── models/          # Modèles Mongoose
│   ├── routes/          # Définition des routes de l'API
│   ├── services/        # Logique métier découplée
│   ├── app.js           # Configuration de l'application Express
│   └── server.js        # Point d'entrée et démarrage du serveur
├── .env.example         # Modèle des variables d'environnement
├── .gitignore           # Fichiers exclus du versionnement
├── package.json         # Dépendances et scripts
└── README.md            # Documentation du backend
```
