#!/usr/bin/env node
/*
  Testa o fluxo de cartão no checkout e valida a persistência em:
    - payment_customers (Pagar.me customer por doctor+profile)
    - payment_methods (cartão salvo tokenizado)
    - payment_transactions (ordem/charge)

  Uso:
    BASE_URL=http://localhost:3000 DOCTOR_SLUG=bella-vida node scripts/debug/test_card_persistence.js
*/

const { prisma } = require('../../dist/lib/prisma.js');

async function ensureFetch() {
  if (typeof fetch !== 'function') {
    const mod = await import('node-fetch');
    // eslint-disable-next-line no-global-assign
    fetch = mod.default;
  }
}

async function main() {
  await ensureFetch();
  const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
  const doctorSlug = process.env.DOCTOR_SLUG || 'bella-vida';

  console.log('[card-test] Base URL:', BASE_URL);
  console.log('[card-test] Doctor slug:', doctorSlug);

  // Resolve clinic/doctor
  let clinic = await prisma.clinic.findFirst({ where: { slug: doctorSlug }, select: { id: true, ownerId: true } }).catch(() => null);
  let fallbackDoctor = await prisma.user.findFirst({ where: { doctor_slug: doctorSlug }, select: { id: true } }).catch(() => null);
  let effectiveDoctorId = clinic?.ownerId || fallbackDoctor?.id || null;

  // Pick a product by clinic/doctor or any active
  let product = await prisma.products.findFirst({
    where: { isActive: true, OR: [ { doctorId: effectiveDoctorId || undefined }, { clinicId: clinic?.id || undefined } ] },
    select: { id: true, name: true, price: true }
  }).catch(() => null);
  if (!product) {
    product = await prisma.products.findFirst({ where: { isActive: true }, select: { id: true, name: true, price: true } });
  }
  if (!product) throw new Error('No active product');
  console.log('[card-test] Product:', product.id, product.name);

  // Compose buyer and card
  const email = `card.test+${Date.now()}@example.com`;
  const buyer = {
    name: 'CARD Test Buyer',
    email,
    phone: '+55 11 99999-0001',
    document: '11111111111',
  };
  const payload = {
    productId: product.id,
    slug: doctorSlug,
    buyer,
    amountCents: Math.max(1000, Number(product.price) * 100),
    payment: {
      method: 'card',
      installments: 1,
      card: {
        holder_name: 'CARD TEST',
        number: '4111111111111111',
        exp_month: 12,
        exp_year: 2030,
        cvv: '123',
      }
    },
  };

  // Pre-counts
  const beforeTx = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS c FROM payment_transactions`);
  const beforePc = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS c FROM payment_customers`);
  const beforePm = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS c FROM payment_methods`);
  console.log('[card-test] counts before:', { tx: beforeTx?.[0]?.c, pc: beforePc?.[0]?.c, pm: beforePm?.[0]?.c });

  // Call checkout/create
  const url = `${BASE_URL}/api/checkout/create`;
  console.log('[card-test] POST', url);
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const text = await res.text();
  let data = {}; try { data = JSON.parse(text); } catch {}
  console.log('[card-test] Response status:', res.status);
  console.log('[card-test] Response body:', text);
  if (!res.ok) throw new Error('Checkout failed');

  const orderId = data?.order?.id || data?.orderId || data?.id || null;
  console.log('[card-test] Order ID:', orderId);

  // Wait a bit and query
  await new Promise(r => setTimeout(r, 800));

  // Check user/profile
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  let profile = null;
  if (user?.id && effectiveDoctorId) {
    profile = await prisma.patientProfile.findUnique({ where: { doctorId_userId: { doctorId: effectiveDoctorId, userId: user.id } }, select: { id: true } });
  }
  console.log('[card-test] user:', user?.id || null, 'profile:', profile?.id || null);

  // Transactions
  const tx = await prisma.$queryRawUnsafe(
    `SELECT id, provider_order_id, status, payment_method_type, amount_cents FROM payment_transactions WHERE provider = 'pagarme' AND provider_order_id = $1 LIMIT 1`,
    orderId
  );
  console.log('[card-test] tx by order:', tx?.[0] || null);

  // Payment customer/methods
  let pc = [];
  let pm = [];
  if (profile?.id && effectiveDoctorId) {
    pc = await prisma.$queryRawUnsafe(
      `SELECT id, provider, provider_customer_id, doctor_id, patient_profile_id, created_at
         FROM payment_customers
        WHERE doctor_id = $1 AND patient_profile_id = $2
        ORDER BY created_at DESC LIMIT 3`,
      effectiveDoctorId, profile.id
    );
    if (pc?.[0]?.id) {
      pm = await prisma.$queryRawUnsafe(
        `SELECT id, payment_customer_id, provider_card_id, brand, last4, exp_month, exp_year, is_default, status
           FROM payment_methods
          WHERE payment_customer_id = $1
          ORDER BY created_at DESC LIMIT 5`,
        pc[0].id
      );
    }
  }
  console.log('[card-test] payment_customers:', pc);
  console.log('[card-test] payment_methods:', pm);

  // Post-counts
  const afterTx = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS c FROM payment_transactions`);
  const afterPc = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS c FROM payment_customers`);
  const afterPm = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS c FROM payment_methods`);
  console.log('[card-test] counts after:', { tx: afterTx?.[0]?.c, pc: afterPc?.[0]?.c, pm: afterPm?.[0]?.c });

  console.log('[card-test] Done.');
}

main()
  .catch((e) => { console.error('[card-test] Error:', e); process.exit(1); })
  .finally(async () => { try { await prisma.$disconnect(); } catch {} });
