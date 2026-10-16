import mongoose from 'mongoose';
import { Product } from '../models/Product.js';
import { config } from '../config/environment.js';
import { initialProducts } from './productCatalogData.js';

export { initialProducts };

/**
 * Amorçage automatique et synchronisation non destructive du catalogue.
 * Enrichit les articles existants avec leur taxonomie et insère les compagnons manquants.
 */
export const seedInitialProducts = async () => {
  try {
    const count = await Product.countDocuments();
    if (count === 0) {
      console.log(`[Seeder] Base de produits vide. Insertion de ${initialProducts.length} articles...`);
      const created = await Product.insertMany(initialProducts);
      console.log(`[Seeder] ✅ ${created.length} articles insérés avec succès dans MongoDB.`);
      return created;
    }

    let updatedCount = 0;
    let insertedCount = 0;

    for (const item of initialProducts) {
      const existing = await Product.findOne({ title: item.title });
      if (existing) {
        let changed = false;
        if (!existing.subCategory && item.subCategory) {
          existing.subCategory = item.subCategory;
          changed = true;
        }
        if ((!existing.brand || existing.brand === 'Générique') && item.brand) {
          existing.brand = item.brand;
          changed = true;
        }
        if (changed) {
          await existing.save();
          updatedCount++;
        }
      } else {
        await Product.create(item);
        insertedCount++;
      }
    }

    if (updatedCount > 0 || insertedCount > 0) {
      console.log(`[Seeder] Catalogue synchronisé : ${updatedCount} enrichis, ${insertedCount} nouveaux insérés.`);
    }

    return [];
  } catch (error) {
    console.error('[Seeder] Erreur lors de l\'auto-seeder des produits :', error.message);
    return [];
  }
};

/**
 * Exécute l'insertion forcée complète des données de démonstration dans MongoDB (CLI).
 */
const seedDatabase = async () => {
  try {
    console.log('[Seeder] Connexion à MongoDB...');
    await mongoose.connect(config.database.uri);
    console.log('[Seeder] Connecté à MongoDB avec succès.');

    console.log('[Seeder] Nettoyage des anciens produits...');
    await Product.deleteMany({});

    console.log(`[Seeder] Insertion de ${initialProducts.length} produits enrichis...`);
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

// Exécution uniquement si appelé directement via la CLI
if (process.argv[1]?.endsWith('seedProducts.js')) {
  seedDatabase();
}
