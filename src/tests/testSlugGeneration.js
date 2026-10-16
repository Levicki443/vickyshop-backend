import { createSlug, generateUniqueProductSlug } from '../utils/slugUtils.js';

/**
 * Suite de tests unitaires pour le système de génération et de résolution de collisions de slugs.
 */
const runTests = async () => {
  console.log('🧪 [Test Slugs] Démarrage des vérifications...');
  let passed = 0;
  let failed = 0;

  const assert = (condition, message) => {
    if (condition) {
      console.log(`  ✅ SUCCÈS : ${message}`);
      passed += 1;
    } else {
      console.error(`  ❌ ÉCHEC : ${message}`);
      failed += 1;
    }
  };

  // Test 1 : Élimination des accents français
  const slug1 = createSlug('Montre Connectée Sport Pro');
  assert(slug1 === 'montre-connectee-sport-pro', `Accents français ("Montre Connectée Sport Pro" -> "${slug1}")`);

  // Test 2 : Caractères spéciaux, apostrophes et ponctuation
  const slug2 = createSlug("Robe d'Été Fleurie & Élégante (Édition Limitée !)");
  assert(slug2 === 'robe-d-ete-fleurie-elegante-edition-limitee', `Ponctuation & caractères spéciaux ("${slug2}")`);

  // Test 3 : Emojis et espaces superflus
  const slug3 = createSlug('   🔥 Super Casque Bluetooth 5.0 ✨   ');
  assert(slug3 === 'super-casque-bluetooth-5-0', `Nettoyage des emojis et espaces ("${slug3}")`);

  // Test 4 : Noms très longs tronqués proprement
  const longName = 'Costume Trois Pièces Veste Pantalon Gilet Très Haute Qualité Luxe Pour Soirées Mondaines Célébrations Et Mariages Prestiges';
  const slug4 = createSlug(longName, 60);
  assert(slug4.length <= 60 && !slug4.endsWith('-'), `Troncature propre à 60 caractères ("${slug4}")`);

  // Test 5 : Mock de collision en base de données
  const mockExistingSlugs = new Set(['montre-connectee-sport-pro', 'montre-connectee-sport-pro-2']);
  const mockProductModel = {
    exists: async ({ slug }) => mockExistingSlugs.has(slug),
  };

  const resolvedSlug = await generateUniqueProductSlug('Montre Connectée Sport Pro', mockProductModel, 'prod-123');
  assert(resolvedSlug === 'montre-connectee-sport-pro-3', `Résolution des collisions ("${resolvedSlug}" au lieu d'écraser)`);

  console.log(`\n📊 Bilan des tests : ${passed} passés, ${failed} échoués.`);
  if (failed > 0) {
    process.exit(1);
  }
};

runTests();
