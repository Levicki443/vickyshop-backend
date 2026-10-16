import assert from 'assert';
import { initialProducts } from '../seeders/productCatalogData.js';
import { computeSimilarProducts, detectProductFamily } from '../../../vickyshop-frontend/src/utils/recommendationEngine.js';

console.log('🧪 TEST DU CATALOGUE AUTHENTIQUE BACKOFFICE (17 ARTICLES)');

const catalog = initialProducts.map((p, idx) => ({
  ...p,
  _id: `prod_${idx + 1}`,
  id: `prod_${idx + 1}`,
}));

// 1. Test : Un smartphone affiche d'autres smartphones réels
const iphone11 = catalog.find((p) => p.title.includes('Iphone 11 simple'));
assert(iphone11, 'Iphone 11 doit être présent');
const phoneRecs = computeSimilarProducts(iphone11, catalog, 4);

console.log(`\n1. Recommandations pour "${iphone11.title}" (${phoneRecs.length} résultats) :`);
phoneRecs.forEach((r) => console.log(`   - ${r.title} [Famille: ${detectProductFamily(r)}]`));

assert(phoneRecs.length > 0, 'Au moins un smartphone doit être recommandé');
phoneRecs.forEach((r) => {
  assert.strictEqual(detectProductFamily(r), 'smartphones', `"${r.title}" doit être un smartphone`);
  assert.notStrictEqual(r._id, iphone11._id, 'Exclusion de l\'article lui-même');
});
console.log('   ✅ Test 1 validé : Recommande d\'autres téléphones réels (Iphone 17, Iphone 12 pro, Samsung S24).');

// 2. Test : Un vêtement (Pull) affiche d'autres vêtements réels
const pullNoir = catalog.find((p) => p.title.includes('PULL NOIR'));
assert(pullNoir, 'PULL NOIR doit être présent');
const pullRecs = computeSimilarProducts(pullNoir, catalog, 4);

console.log(`\n2. Recommandations pour "${pullNoir.title}" (${pullRecs.length} résultats) :`);
pullRecs.forEach((r) => console.log(`   - ${r.title} [Famille: ${detectProductFamily(r)}]`));

assert(pullRecs.length > 0, 'Au moins un pull doit être recommandé');
pullRecs.forEach((r) => {
  assert.strictEqual(detectProductFamily(r), 'sweats_pulls', `"${r.title}" doit être un sweat/pull`);
  assert.notStrictEqual(r._id, pullNoir._id, 'Exclusion de l\'article lui-même');
});
console.log('   ✅ Test 2 validé : Recommande d\'autres pulls réels (Pull pour homme).');

// 3. Test : Casque Audio recommande d'autres articles audio réels
const casqueJBL = catalog.find((p) => p.title.includes('Casque Bluetooth Sans Fil JBL'));
assert(casqueJBL, 'Casque JBL doit être présent');
const audioRecs = computeSimilarProducts(casqueJBL, catalog, 4);

console.log(`\n3. Recommandations pour "${casqueJBL.title}" (${audioRecs.length} résultats) :`);
audioRecs.forEach((r) => console.log(`   - ${r.title} [Famille: ${detectProductFamily(r)}]`));

assert(audioRecs.length > 0, 'Au moins un appareil audio doit être recommandé');
audioRecs.forEach((r) => {
  assert.strictEqual(detectProductFamily(r), 'audio', `"${r.title}" doit être un appareil audio`);
  assert.notStrictEqual(r._id, casqueJBL._id, 'Exclusion de l\'article lui-même');
});
console.log('   ✅ Test 3 validé : Recommande les écouteurs sans fil réels.');

// 4. Test : Exclusion de l'article lui-même et 0 doublon
catalog.forEach((item) => {
  const recs = computeSimilarProducts(item, catalog, 4);
  const ids = recs.map((r) => r._id);
  assert(!ids.includes(item._id), `L'article ${item.title} apparaît dans ses propres recommandations`);
  assert.strictEqual(new Set(ids).size, ids.length, `Doublons détectés pour ${item.title}`);
});
console.log('\n4. ✅ Test 4 validé : Zéro auto-recommandation et zéro doublon sur les 17 articles.');

console.log('\n======================================================');
console.log('🎉 TOUS LES TESTS SUR LE CATALOGUE AUTHENTIQUE ONT RÉUSSI !');
console.log('======================================================\n');
