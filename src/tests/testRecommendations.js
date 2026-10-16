import assert from 'assert';
import { initialProducts } from '../seeders/productCatalogData.js';
import { computeSimilarProducts, detectProductFamily } from '../../../vickyshop-frontend/src/utils/recommendationEngine.js';

console.log('🧪 DÉBUT DU PROTOCOLE DE VALIDATION DE LA RECOMMANDATION');

// Attribution d'identifiants simulés réalistes
const catalog = initialProducts.map((p, idx) => ({
  ...p,
  _id: `prod_${idx + 1}`,
  id: `prod_${idx + 1}`,
}));

// 1. Test : Un téléphone affiche principalement d'autres téléphones
const iphone = catalog.find((p) => p.title.includes('iPhone 15 Pro Max'));
assert(iphone, 'iPhone 15 Pro Max doit être présent dans le catalogue');
const phoneRecs = computeSimilarProducts(iphone, catalog, 4);

console.log(`\n1. Recommandations pour "${iphone.title}" (${phoneRecs.length} résultats) :`);
phoneRecs.forEach((r) => console.log(`   - ${r.title} [Famille: ${detectProductFamily(r)}]`));

assert(phoneRecs.length > 0, 'Au moins un téléphone similaire doit être retourné');
phoneRecs.forEach((r) => {
  assert.strictEqual(detectProductFamily(r), 'smartphones', `Le produit "${r.title}" doit être un smartphone`);
  assert.notStrictEqual(r._id, iphone._id, 'Le produit consulté ne doit pas être inclus');
});
console.log('   ✅ Test 1 validé : 100% smartphones pertinents.');

// 2. Test : Une paire de chaussures affiche d'autres chaussures
const nikeAir = catalog.find((p) => p.title.includes('Nike Air Edition Sport'));
assert(nikeAir, 'Nike Air doit être présent dans le catalogue');
const shoeRecs = computeSimilarProducts(nikeAir, catalog, 4);

console.log(`\n2. Recommandations pour "${nikeAir.title}" (${shoeRecs.length} résultats) :`);
shoeRecs.forEach((r) => console.log(`   - ${r.title} [Famille: ${detectProductFamily(r)}]`));

assert(shoeRecs.length > 0, 'Au moins une paire de chaussures doit être retournée');
shoeRecs.forEach((r) => {
  assert.strictEqual(detectProductFamily(r), 'chaussures', `Le produit "${r.title}" doit être une chaussure`);
  assert.notStrictEqual(r._id, nikeAir._id, 'Le produit consulté ne doit pas être inclus');
});
console.log('   ✅ Test 2 validé : 100% chaussures pertinentes.');

// 3. Test : Un vêtement affiche des vêtements du même type (Pull / Sweat)
const hoodie = catalog.find((p) => p.title.includes('Pull Hoodie'));
assert(hoodie, 'Pull Hoodie doit être présent dans le catalogue');
const hoodieRecs = computeSimilarProducts(hoodie, catalog, 4);

console.log(`\n3. Recommandations pour "${hoodie.title}" (${hoodieRecs.length} résultats) :`);
hoodieRecs.forEach((r) => console.log(`   - ${r.title} [Famille: ${detectProductFamily(r)}]`));

assert(hoodieRecs.length > 0, 'Au moins un sweat/pull doit être retourné');
hoodieRecs.forEach((r) => {
  assert.strictEqual(detectProductFamily(r), 'sweats_pulls', `Le produit "${r.title}" doit être un sweat/pull`);
  assert.notStrictEqual(r._id, hoodie._id, 'Le produit consulté ne doit pas être inclus');
});
console.log('   ✅ Test 3 validé : 100% vêtements du même type.');

// 4. Test : Exclusion de l'article lui-même et absence de doublons
catalog.forEach((item) => {
  const recs = computeSimilarProducts(item, catalog, 4);
  const ids = recs.map((r) => r._id);
  assert(!ids.includes(item._id), `L'article ${item.title} apparaît dans ses propres recommandations`);
  assert.strictEqual(new Set(ids).size, ids.length, `Des doublons ont été détectés pour ${item.title}`);
});
console.log('\n4. ✅ Test 4 validé : Aucune auto-recommandation et zéro doublon sur tout le catalogue.');

// 5. Test : Traitement des produits indisponibles / archivés / stock = 0
const outOfStockCatalog = catalog.map((p) => ({
  ...p,
  inStock: p.title.includes('Samsung') ? false : p.inStock,
  stockQuantity: p.title.includes('Google') ? 0 : p.stockQuantity,
  isArchived: p.title.includes('iPhone 14') ? true : false,
}));
const filteredPhoneRecs = computeSimilarProducts(iphone, outOfStockCatalog, 4);
const filteredTitles = filteredPhoneRecs.map((r) => r.title);
assert(!filteredTitles.some((t) => t.includes('Samsung')), 'Un produit hors stock ne doit pas être recommandé');
assert(!filteredTitles.some((t) => t.includes('Google')), 'Un produit à quantité zéro ne doit pas être recommandé');
assert(!filteredTitles.some((t) => t.includes('iPhone 14')), 'Un produit archivé ne doit pas être recommandé');
console.log('5. ✅ Test 5 validé : Produits hors stock, quantité 0 et archivés rigoureusement exclus.');

// 6. Test : Absence de produit similaire (produit unique sans correspondance)
const uniqueProduct = {
  _id: 'prod_ovni',
  title: 'Drone Spatial Sous-Marin 8K',
  category: 'innovations',
  subCategory: 'drones',
  description: 'Appareil d exploration sous-marine haute profondeur télécommandé.',
  price: 5000000,
  inStock: true,
  stockQuantity: 1,
};
const emptyRecs = computeSimilarProducts(uniqueProduct, catalog, 4);
assert.strictEqual(emptyRecs.length, 0, 'Un article orphelin ne doit générer aucun faux positif');
console.log('6. ✅ Test 6 validé : Retourne proprement un tableau vide sans polluer avec des articles hors sujet.');

console.log('\n======================================================');
console.log('🎉 TOUS LES 6 TESTS UNITAIRES CRITIQUES ONT RÉUSSI (100% CONFORME) !');
console.log('======================================================\n');
