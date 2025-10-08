#!/usr/bin/env node
/*
  Testa o fluxo de PIX no checkout e valida a persistência em payment_transactions.
  Uso:
    BASE_URL=http://localhost:3000 node scripts/debug/test_pix_persistence.js

  Observações:
  - Requer que o servidor Next esteja rodando nesse BASE_URL.
  - Utiliza o slug de doutor 'bella-vida' (padrão) para localizar um produto.
  - Cria um buyer com email único (timestamp) para não conflitar com dados existentes.
*/

const { prisma } = require('../../dist/lib/prisma.js');
const crypto = require('crypto');

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

  console.log('[test] Base URL:', BASE_URL);
  console.log('[test] Doctor slug:', doctorSlug);

  // 1) Resolve clinic and effective doctorId used by API (clinic.ownerId fallback)
  let clinic = await prisma.clinic.findFirst({ where: { slug: doctorSlug }, select: { id: true, ownerId: true } });
  let fallbackDoctor = await prisma.user.findFirst({ where: { doctor_slug: doctorSlug }, select: { id: true } });
  let effectiveDoctorId = clinic?.ownerId || fallbackDoctor?.id || null;
  if (!clinic) {
    console.warn(`[test] Clinic not found for slug: ${doctorSlug}. Will attempt fallback by doctor slug or product.`);
  }

  // 2) Pick a product (prefer by clinic or doctor)
  let product = await prisma.products.findFirst({
    where: { isActive: true, OR: [ { doctorId: effectiveDoctorId || undefined }, { clinicId: clinic?.id || undefined } ] },
    select: { id: true, name: true, price: true }
  });
  if (!product) {
    product = await prisma.products.findFirst({ where: { isActive: true }, select: { id: true, name: true, price: true, clinicId: true, doctorId: true } });
  }
  if (!product) {
    // Print available clinics and doctor slugs for guidance
    const clinics = await prisma.clinic.findMany({ select: { id: true, slug: true }, take: 10 });
    const docs = await prisma.user.findMany({ where: { doctor_slug: { not: null } }, select: { id: true, doctor_slug: true }, take: 10 });
    console.error('[test] No active product found. Available clinics:', clinics);
    console.error('[test] Available doctor slugs:', docs);
    throw new Error('No active product found to test PIX.');
  }
  // Derive clinic/doctor from product if needed
  if (!clinic && product.clinicId) {
    clinic = await prisma.clinic.findUnique({ where: { id: product.clinicId }, select: { id: true, ownerId: true, slug: true } });
  }
  if (!effectiveDoctorId) {
    effectiveDoctorId = clinic?.ownerId || product.doctorId || fallbackDoctor?.id || null;
  }
  if (!effectiveDoctorId) {
    throw new Error('Could not resolve effective doctorId from clinic/product/doctor_slug');
  }
  console.log('[test] Clinic ID:', clinic?.id || null, 'Clinic slug:', clinic?.slug || null, 'Effective doctorId:', effectiveDoctorId);
  console.log('[test] Product:', product.id, product.name);

  // 3) Compose buyer and payload
  const email = `pix.test+${Date.now()}@example.com`;
  const buyer = {
    name: 'PIX Test Buyer',
    email,
    phone: '+55 11 99999-0000',
    document: '11111111111',
  };
  const payload = {
    productId: product.id,
    slug: doctorSlug,
    buyer,
    amountCents: Math.max(1000, Number(product.price) * 100),
    payment: {
      method: 'pix',
      pix: { expires_in: 300 },
    },
  };

  // Pre-count transactions
  const beforeCount = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS c FROM payment_transactions`
  );
  console.log('[test] payment_transactions before:', beforeCount?.[0]?.c);

  // 4) Call checkout/create
  const url = `${BASE_URL}/api/checkout/create`;
  console.log('[test] POST', url);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let data = {};
  try { data = JSON.parse(text); } catch {}
  console.log('[test] Response status:', res.status);
  console.log('[test] Response body:', text);
  if (!res.ok) throw new Error('Checkout failed');

  // Extract order id best-effort
  const orderId = data?.order?.id || data?.orderId || data?.id || null;
  console.log('[test] Order ID:', orderId);

  // 5) Query DB: find transaction row
  // Wait a moment for the API to insert
  await new Promise(r => setTimeout(r, 500));

  // Ensure User and PatientProfile exist
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  console.log('[test] Buyer user id:', user?.id || null);
  let profile = null;
  if (user?.id) {
    profile = await prisma.patientProfile.findUnique({ where: { doctorId_userId: { doctorId: effectiveDoctorId, userId: user.id } }, select: { id: true } });
  }
  console.log('[test] PatientProfile id:', profile?.id || null);

  // Query by order id
  if (orderId) {
    const exact = await prisma.$queryRawUnsafe(
      `SELECT id, provider_order_id, status, payment_method_type, amount_cents, created_at
         FROM payment_transactions
        WHERE provider = 'pagarme' AND provider_order_id = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      orderId
    );
    console.log('[test] Exact by order id:', exact?.[0] || null);
  }

  // Query last 5 by effective doctor
  const recentByDoctor = await prisma.$queryRawUnsafe(
    `SELECT id, provider_order_id, status, payment_method_type, amount_cents, created_at
       FROM payment_transactions
      WHERE provider = 'pagarme' AND doctor_id = $1
      ORDER BY created_at DESC
      LIMIT 5`,
    effectiveDoctorId
  );
  console.log('[test] Recent by doctor (last 5):', recentByDoctor);

  // Query last 5 overall
  const txRows = await prisma.$queryRawUnsafe(
    `SELECT id, provider_order_id, status, payment_method_type, amount_cents, created_at
       FROM payment_transactions
      ORDER BY created_at DESC
      LIMIT 5`
  );
  console.log('[test] Recent overall (last 5):');
  for (const row of txRows) console.log('  -', row);

  const afterCount = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS c FROM payment_transactions`
  );
  console.log('[test] payment_transactions after:', afterCount?.[0]?.c);

  console.log('[test] Done.');
}

main()
  .catch((e) => { console.error('[test] Error:', e); process.exit(1); })
  .finally(async () => { try { await prisma.$disconnect(); } catch {} });
