import mongoose from 'mongoose';
import { Review } from '../models/Review.js';
import { Product } from '../models/Product.js';
import { config } from '../config/environment.js';

/**
 * Données initiales des Témoignages & Avis Clients Vicky-Shop.
 * Textes authentiques, chaleureux et représentatifs de l'expérience client à Abidjan.
 */
const seedReviewsData = [
  {
    customerName: 'Aminata Koné',
    customerAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
    rating: 5,
    comment: 'Service impeccable ! J\'ai commandé ma montre connectée le matin à Cocody et je l\'ai reçue l\'après-midi même. Le livreur était très courtois et j\'ai pu vérifier le colis avant de payer en espèces. Je recommande les yeux fermés !',
    productTitle: 'Smart Watch Ultra Pro',
    orderNumber: 'VK-20260915-AM01',
    isVerifiedPurchase: true,
    status: 'approved',
    isActive: true,
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // il y a 3 jours
  },
  {
    customerName: 'Jean-Marc Digbeu',
    customerAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
    rating: 5,
    comment: 'Qualité 100% originale pour mon iPhone. Prix très compétitif par rapport aux boutiques en ville et le suivi par WhatsApp est super rassurant. Bravo à toute l\'équipe Vicky-Shop pour le professionnalisme.',
    productTitle: 'iPhone 15 Pro Max',
    orderNumber: 'VK-20260912-JM02',
    isVerifiedPurchase: true,
    status: 'approved',
    isActive: true,
    createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000), // il y a 6 jours
  },
  {
    customerName: 'Fatoumata Sylla',
    customerAvatar: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=200&auto=format&fit=crop&q=80',
    rating: 5,
    comment: 'Les baskets sont magnifiques, taille parfaite et très confortables pour mes séances de sport. La possibilité de payer à la livraison donne une totale confiance. C\'est déjà ma 3ème commande sur le site !',
    productTitle: 'Nike Air Edition Sport',
    orderNumber: 'VK-20260908-FS03',
    isVerifiedPurchase: true,
    status: 'approved',
    isActive: true,
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // il y a 10 jours
  },
  {
    customerName: 'Kouassi Fabrice',
    customerAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&auto=format&fit=crop&q=80',
    rating: 4,
    comment: 'Très bon casque audio, la réduction de bruit est impressionnante pour le prix. Livraison un tout petit peu en retard à Yopougon à cause des embouteillages mais le service client m\'a prévenu par SMS. Très satisfait.',
    productTitle: 'Casque Audio Wireless Pro',
    orderNumber: 'VK-20260905-KF04',
    isVerifiedPurchase: true,
    status: 'approved',
    isActive: true,
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), // il y a 14 jours
  },
  {
    customerName: 'Marie-Claire Bamba',
    customerAvatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200&auto=format&fit=crop&q=80',
    rating: 5,
    comment: 'Une boutique en ligne moderne, intuitive et ultra fiable. J\'avais une question sur les pointures et le support m\'a répondu en 2 minutes sur WhatsApp. Produit conforme à la photo.',
    productTitle: 'Ensemble Veste & Pantalon Chic',
    orderNumber: 'VK-20260901-MC05',
    isVerifiedPurchase: true,
    status: 'approved',
    isActive: true,
    createdAt: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000), // il y a 18 jours
  },
  {
    customerName: 'Armand Yao',
    customerAvatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=200&auto=format&fit=crop&q=80',
    rating: 5,
    comment: 'Simple, rapide et sans mauvaise surprise. Les réductions lors des ventes flash sont bien réelles. Je recommande vivement Vicky-Shop à tous mes collègues de bureau !',
    productTitle: 'Pull Col Roulé Premium & Chapeau',
    orderNumber: 'VK-20260828-AY06',
    isVerifiedPurchase: true,
    status: 'approved',
    isActive: true,
    createdAt: new Date(Date.now() - 22 * 24 * 60 * 60 * 1000), // il y a 22 jours
  },
];

/**
 * Fonction d'amorçage automatique des avis en base
 */
export const seedReviews = async () => {
  try {
    const count = await Review.countDocuments();
    if (count === 0) {
      console.log('🔄 Initialisation des avis et témoignages clients initiaux...');

      // Récupérer quelques produits pour lier les identifiants réels
      const products = await Product.find().limit(10);
      const productMap = new Map();
      products.forEach((p) => productMap.set(p.title, p));

      const preparedReviews = seedReviewsData.map((rev) => {
        const prod = productMap.get(rev.productTitle);
        return {
          ...rev,
          productId: prod ? prod._id : null,
          productImage: prod?.image || '',
        };
      });

      await Review.insertMany(preparedReviews);
      console.log(`✅ ${preparedReviews.length} témoignages clients enregistrés avec succès.`);
    } else {
      console.log(`ℹ️ Base d'avis déjà initialisée (${count} témoignages existants).`);
    }
  } catch (error) {
    console.error('❌ Erreur lors du seeder des avis:', error);
  }
};

// Exécution directe en standalone si appelé depuis la ligne de commande
if (process.argv[1]?.endsWith('reviewSeeder.js')) {
  mongoose
    .connect(config.database.uri)
    .then(async () => {
      console.log('📦 Connecté à MongoDB pour le seeder d\'avis...');
      await seedReviews();
      await mongoose.disconnect();
      console.log('🏁 Seeder terminé avec succès.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Échec connexion MongoDB:', err);
      process.exit(1);
    });
}
