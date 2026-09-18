import mongoose from 'mongoose';
import { Product } from '../models/Product.js';
import { config } from '../config/environment.js';

/**
 * Catalogue initial complet des produits Vicky-Shop.
 * Données réelles extraites de l'inventaire de la boutique.
 */
const initialProducts = [
  {
    title: 'iPhone 15 Pro Max',
    description: 'Smartphone haut de gamme Apple avec puce A17 Pro, écran OLED Super Retina XDR 120Hz et triple capteur photo 48MP.',
    price: 650000,
    originalPrice: 750000,
    category: 'hightech',
    image: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?q=80&w=800',
    badge: 'Populaire',
    rating: 4.9,
    reviewsCount: 124,
    inStock: true,
    stockQuantity: 15,
  },
  {
    title: 'Smart Watch Ultra Pro',
    description: 'Montre intelligente avec suivi cardiaque, notifications WhatsApp, GPS intégré, étanchéité IP68 et autonomie 7 jours.',
    price: 25000,
    originalPrice: 35000,
    category: 'accessoires',
    image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=800',
    badge: 'Promo',
    rating: 4.7,
    reviewsCount: 89,
    inStock: true,
    stockQuantity: 40,
  },
  {
    title: 'Casque Audio Wireless Pro',
    description: 'Casque audio sans fil circum-aural avec réduction active de bruit (ANC), basses ultra profondes et 40h d\'autonomie.',
    price: 15000,
    originalPrice: 22000,
    category: 'hightech',
    image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=800',
    badge: 'Nouveau',
    rating: 4.8,
    reviewsCount: 67,
    inStock: true,
    stockQuantity: 25,
  },
  {
    title: 'Nike Air Edition Sport',
    description: 'Baskets de running et streetwear légères et dynamiques avec amorti Air Max pour un confort inégalé.',
    price: 45000,
    originalPrice: 60000,
    category: 'accessoires',
    image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=800',
    badge: 'Populaire',
    rating: 5.0,
    reviewsCount: 210,
    inStock: true,
    stockQuantity: 30,
  },
  {
    title: 'MacBook Pro 16" Intel i9 32GB',
    description: 'Puissant MacBook Pro 16 pouces, Intel Core i9, 32 Go RAM, 1 To SSD, Écran Retina True Tone haute résolution.',
    price: 1200000,
    originalPrice: 1350000,
    category: 'hightech',
    image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?q=80&w=800',
    badge: 'Nouveau',
    rating: 5.0,
    reviewsCount: 45,
    inStock: true,
    stockQuantity: 8,
  },
  {
    title: 'Sac à Main Fashion Cuir',
    description: 'Sac à main élégant pour femme en cuir texturé résistant avec finition dorée et bandoulière amovible.',
    price: 25000,
    originalPrice: 32000,
    category: 'accessoires',
    image: 'https://images.unsplash.com/photo-1585386959984-a4155224a1ad?q=80&w=800',
    badge: 'Promo',
    rating: 4.6,
    reviewsCount: 38,
    inStock: true,
    stockQuantity: 20,
  },
  {
    title: 'Casquette Trucker Unisexe',
    description: 'Casquette de baseball en maille respirante pour homme et femme, style décontracté et sangle ajustable.',
    price: 8500,
    originalPrice: 12000,
    category: 'chapeaux',
    image: 'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?q=80&w=800',
    badge: 'Nouveau',
    rating: 4.9,
    reviewsCount: 52,
    inStock: true,
    stockQuantity: 50,
  },
  {
    title: 'Pull Hoodie Streetwear Confort',
    description: 'Sweat à capuche oversize en coton premium molletonné, coupe moderne avec poche kangourou ultra chaude.',
    price: 18000,
    originalPrice: 25000,
    category: 'chapeaux',
    image: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?q=80&w=800',
    badge: 'Populaire',
    rating: 4.9,
    reviewsCount: 115,
    inStock: true,
    stockQuantity: 35,
  },
  {
    title: 'Veste Zippée Balaclava Y2K',
    description: 'Veste zippée coupe Y2K avec cagoule intégrée ultra stylée, matière résistante et chaude pour un look urbain unique.',
    price: 28000,
    originalPrice: 38000,
    category: 'chapeaux',
    image: 'https://images.unsplash.com/photo-1548883354-7622d03aca27?q=80&w=800',
    badge: 'Nouveau',
    rating: 4.8,
    reviewsCount: 41,
    inStock: true,
    stockQuantity: 18,
  },
  {
    title: 'Sweatshirt Roomy Timeless',
    description: 'Sweatshirt oversize unisexe ultra doux, confort premium et matière respirante parfaite pour toutes saisons.',
    price: 20000,
    originalPrice: 28000,
    category: 'chapeaux',
    image: 'https://images.unsplash.com/photo-1578587018452-892bacefd3f2?q=80&w=800',
    badge: 'Promo',
    rating: 4.7,
    reviewsCount: 63,
    inStock: true,
    stockQuantity: 22,
  },
  {
    title: 'Ensemble Colorblock Moderne',
    description: 'Ensemble chemise et short à blocs de couleurs dynamiques. Matière légère, respirante et idéale pour les sorties estivales.',
    price: 26000,
    originalPrice: 35000,
    category: 'vetements',
    image: 'https://images.unsplash.com/photo-1593030761757-71fae45fa0e7?q=80&w=800',
    badge: 'Populaire',
    rating: 4.9,
    reviewsCount: 77,
    inStock: true,
    stockQuantity: 16,
  },
  {
    title: 'Ensemble Chemise Texturée Été',
    description: 'Ensemble texturé raffiné pour homme. Chemise manches courtes et short coordonné, parfait pour un style élégant et décontracté.',
    price: 29000,
    originalPrice: 40000,
    category: 'vetements',
    image: 'https://images.unsplash.com/photo-1617137984095-74e4e5e3613f?q=80&w=800',
    badge: 'Nouveau',
    rating: 5.0,
    reviewsCount: 92,
    inStock: true,
    stockQuantity: 14,
  },
  {
    title: 'Complet Imprimé Géo',
    description: 'Chemise à motifs géométriques et bermuda à cordon ajustable pour un look chic et tendance.',
    price: 27000,
    originalPrice: 36000,
    category: 'vetements',
    image: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?q=80&w=800',
    badge: 'Promo',
    rating: 4.8,
    reviewsCount: 54,
    inStock: true,
    stockQuantity: 20,
  },
  {
    title: 'Tenue Tendance SHEIN Élégance',
    description: 'Tenue chic et moderne, coupe cintrée et tissu de qualité supérieure pour toutes vos occasions.',
    price: 22000,
    originalPrice: 30000,
    category: 'vetements',
    image: 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?q=80&w=800',
    badge: 'Populaire',
    rating: 4.9,
    reviewsCount: 130,
    inStock: true,
    stockQuantity: 28,
  },
  {
    title: 'Ensemble Casual Urban Chic',
    description: 'Ensemble deux pièces confort et style urbain tendance pour homme moderne.',
    price: 24000,
    originalPrice: 30000,
    category: 'vetements',
    image: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=800',
    badge: 'Promo',
    rating: 4.7,
    reviewsCount: 49,
    inStock: true,
    stockQuantity: 25,
  },
];

/**
 * Exécute l'insertion des données de démonstration dans MongoDB.
 */
const seedDatabase = async () => {
  try {
    console.log('[Seeder] Connexion à MongoDB...');
    await mongoose.connect(config.database.uri);
    console.log('[Seeder] Connecté à MongoDB avec succès.');

    console.log('[Seeder] Nettoyage des anciens produits...');
    await Product.deleteMany({});

    console.log(`[Seeder] Insertion de ${initialProducts.length} produits...`);
    const createdProducts = await Product.insertMany(initialProducts);

    console.log(`[Seeder] ${createdProducts.length} produits insérés avec succès dans la base MongoDB !`);
    await mongoose.connection.close();
    console.log('[Seeder] Déconnexion propre de MongoDB terminée.');
    process.exit(0);
  } catch (error) {
    console.error('[Seeder] Erreur lors du peuplement de la base :', error.message);
    process.exit(1);
  }
};

seedDatabase();
