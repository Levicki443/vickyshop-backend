import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { Product } from '../models/Product.js';
import { generateUniqueProductSlug } from './slugUtils.js';

/**
 * Script de migration rétrocompatible pour générer et fixer les slugs
 * de tous les produits du catalogue existants sans altérer les IDs ni les relations.
 */
export const migrateProductSlugs = async () => {
  try {
    console.log('[Migration Slugs] Démarrage de la synchronisation des slugs produits...');
    await connectDatabase();

    // Recherche des produits n'ayant pas encore de slug défini ou ayant un slug vide
    const productsWithoutSlug = await Product.find({
      $or: [{ slug: { $exists: false } }, { slug: null }, { slug: '' }],
    });

    console.log(`[Migration Slugs] ${productsWithoutSlug.length} produit(s) à mettre à jour.`);

    let updatedCount = 0;
    for (const prod of productsWithoutSlug) {
      const generatedSlug = await generateUniqueProductSlug(prod.title, Product, prod._id);
      prod.slug = generatedSlug;
      await prod.save();
      updatedCount += 1;
      console.log(`[Migration Slugs] [${updatedCount}/${productsWithoutSlug.length}] "${prod.title}" -> "${generatedSlug}"`);
    }

    console.log(`[Migration Slugs] Terminé avec succès ! ${updatedCount} produit(s) mis à jour avec des slugs permanents.`);
  } catch (error) {
    console.error('[Migration Slugs] Erreur lors de la migration :', error.message);
  } finally {
    await disconnectDatabase();
  }
};

// Exécution directe si appelé via ligne de commande
if (process.argv[1]?.endsWith('migrateProductSlugs.js')) {
  migrateProductSlugs().then(() => process.exit(0));
}
