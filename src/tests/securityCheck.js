import http from 'http';
import app from '../app.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { User } from '../models/User.js';
import { Product } from '../models/Product.js';
import { Order } from '../models/Order.js';
import { ROLES } from '../utils/roleUtils.js';
import jwt from 'jsonwebtoken';
import { config } from '../config/environment.js';

let server;
let baseUrl;

const request = async (path, options = {}) => {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
};

const createTestToken = (userId) => {
  return jwt.sign({ id: userId }, config.jwt.secret, { expiresIn: '1h' });
};

export const runSecurityTests = async () => {
  console.log('\n======================================================');
  console.log('🔒 LANCEMENT DE LA SUITE DE TESTS DE SÉCURITÉ VICKY-SHOP');
  console.log('======================================================\n');

  try {
    const conn = await connectDatabase();
    if (!conn) {
      console.warn('⚠️ Base de données MongoDB locale non détectée. Démarrez MongoDB pour lancer les tests.');
      return;
    }
  } catch (dbErr) {
    console.warn(`⚠️ Impossible de se connecter à MongoDB (${dbErr.message}).`);
    return;
  }

  server = http.createServer(app);
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  let passed = 0;
  let failed = 0;

  const assertTest = (name, condition, details = '') => {
    if (condition) {
      console.log(`  ✅ [SUCCÈS] ${name}`);
      passed++;
    } else {
      console.error(`  ❌ [ÉCHEC]  ${name} - ${details}`);
      failed++;
    }
  };

  try {
    await User.deleteMany({ email: /@security-test\.ci$/ });
    await Product.deleteMany({ reference: 'SEC-TEST-001' });

    const clientUser = await User.create({
      name: 'Client Test Sécurité',
      email: 'client@security-test.ci',
      phone: '0102030405',
      password: 'StrongPassword2026!',
      role: ROLES.CLIENT,
    });

    const sellerUser1 = await User.create({
      name: 'Vendeur Un Sécurité',
      email: 'seller1@security-test.ci',
      phone: '0102030406',
      password: 'StrongPassword2026!',
      role: ROLES.VENDEUR,
      shopName: 'Boutique Alpha',
    });

    const sellerUser2 = await User.create({
      name: 'Vendeur Deux Sécurité',
      email: 'seller2@security-test.ci',
      phone: '0102030407',
      password: 'StrongPassword2026!',
      role: ROLES.VENDEUR,
      shopName: 'Boutique Beta',
    });

    const adminUser = await User.create({
      name: 'Admin Test Sécurité',
      email: 'admin@security-test.ci',
      phone: '0102030408',
      password: 'StrongPassword2026!',
      role: ROLES.ADMIN,
    });

    const clientToken = createTestToken(clientUser._id);
    const seller1Token = createTestToken(sellerUser1._id);
    const seller2Token = createTestToken(sellerUser2._id);
    const adminToken = createTestToken(adminUser._id);

    const testProduct = await Product.create({
      title: 'Robe de Soirée Sécurisée',
      price: 15000,
      category: 'robes',
      image: 'https://res.cloudinary.com/test/image.jpg',
      stockQuantity: 10,
      reference: 'SEC-TEST-001',
      seller: sellerUser1._id,
      sellerName: 'Boutique Alpha',
    });

    // 1. Accès non connecté
    const res1 = await request('/api/orders/my-orders');
    assertTest('1. Utilisateur non connecté bloqué sur route privée (401)', res1.status === 401);

    // 2. Client sur Espace Admin
    const res2 = await request('/api/admin/kpis', { headers: { Authorization: `Bearer ${clientToken}` } });
    assertTest('2. Client bloqué sur l\'espace Admin (403)', res2.status === 403);

    // 3. Client sur Espace Vendeur
    const res3 = await request('/api/seller/stats', { headers: { Authorization: `Bearer ${clientToken}` } });
    assertTest('3. Client bloqué sur l\'espace Vendeur (403)', res3.status === 403);

    // 4. Vendeur sur Espace Admin
    const res4 = await request('/api/admin/kpis', { headers: { Authorization: `Bearer ${seller1Token}` } });
    assertTest('4. Vendeur bloqué sur l\'espace Admin (403)', res4.status === 403);

    // 5. IDOR Multi-Vendeurs
    const res5 = await request(`/api/products/${testProduct._id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${seller2Token}` },
      body: JSON.stringify({ price: 1000 }),
    });
    assertTest('5. Protection IDOR : Vendeur 2 bloqué sur le produit du Vendeur 1 (403)', res5.status === 403);

    // 6. Élévation de rôle
    const res6 = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'Hacker', email: 'hacker@security-test.ci', phone: '0102030499', password: 'Password123!', role: 'admin' }),
    });
    assertTest('6. Tentative d\'auto-attribution du rôle Admin rejetée (403)', res6.status === 403);

    // 7. Intégrité des prix
    const res8 = await request('/api/orders', {
      method: 'POST',
      headers: { Authorization: `Bearer ${clientToken}` },
      body: JSON.stringify({
        customerName: 'Client Test',
        customerPhone: '0102030405',
        deliveryAddress: 'Rue des Jardins, Cocody',
        items: [{ productId: testProduct._id.toString(), title: 'Robe', quantity: 2, price: 100 }],
        discount: 99999,
      }),
    });
    const createdOrder = res8.data?.data?.order;
    assertTest('7. Intégrité des prix & remises certifiée par le serveur (30000 FCFA)', Boolean(createdOrder?.subtotal === 30000 && createdOrder?.discount === 0));

    // 8. Protection PII
    if (createdOrder) {
      const res9 = await request(`/api/orders/${createdOrder.orderNumber}`);
      assertTest('8. Protection PII : Suivi public sans fuite de coordonnées', Boolean(res9.data?.data?.order && !res9.data.data.order.customerPhone));
    }

    // 9. Injection NoSQL Bloquée
    const resNoSql = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@security-test.ci', password: { $gt: '' } }),
    });
    assertTest('9. Injection NoSQL {$gt: ""} neutralisée par le middleware sanitizer (400/401)', resNoSql.status === 400 || resNoSql.status === 401);

    // 10. Assainissement XSS Stored
    const resXss = await request('/api/admin/products', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        title: '<script>alert("XSS")</script>Robe Élegante',
        description: '<img src=x onerror=alert(1)>Belle robe',
        price: 25000,
        category: 'robes',
        image: 'https://res.cloudinary.com/test/image.jpg',
      }),
    });
    const cleanProd = resXss.data?.data?.product;
    assertTest('10. Assainissement XSS : Balises scripts et gestionnaires onerror neutralisés', Boolean(cleanProd && !cleanProd.title.includes('<script>') && !cleanProd.description.includes('onerror')));

    // 11. Machine à états des commandes
    if (createdOrder) {
      await Order.findByIdAndUpdate(createdOrder._id, { orderStatus: 'livree' });
      const resState = await request(`/api/admin/orders/${createdOrder._id}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ orderStatus: 'annulee' }),
      });
      assertTest('11. Machine à états : Rejet d\'annulation sur commande déjà livrée (400)', resState.status === 400);
    }

    // 12. Réinitialisation mot de passe avec faux token
    const res10 = await request('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token: 'fake_invalid_token_123', newPassword: 'NewStrongPassword2026!' }),
    });
    assertTest('12. Réinitialisation avec jeton invalide rejetée (400)', res10.status === 400);

  } catch (err) {
    console.error('[Erreur Tests]', err);
  } finally {
    await User.deleteMany({ email: /@security-test\.ci$/ });
    await Product.deleteMany({ reference: 'SEC-TEST-001' });
    await Order.deleteMany({ customerEmail: 'client@security-test.ci' });

    if (server) await new Promise((resolve) => server.close(resolve));
    await disconnectDatabase();

    console.log('\n======================================================');
    console.log(`📊 BILAN DU CONTRÔLE DE SÉCURITÉ : ${passed} RÉUSSIS / ${failed} ÉCHECS`);
    console.log('======================================================\n');
  }
};

if (process.argv[1]?.endsWith('securityCheck.js')) {
  runSecurityTests().then(() => process.exit(0)).catch(() => process.exit(1));
}
