#!/usr/bin/env node
/*
  Lista um snapshot das tabelas de pagamentos criadas via SQL:
    - payment_customers
    - payment_methods
    - payment_transactions

  Uso:
    node scripts/debug/list_payments_snapshot.js
    DOCTOR_SLUG=bella-vida node scripts/debug/list_payments_snapshot.js
*/

const { prisma } = require('../../dist/lib/prisma.js');

async function main() {
  const doctorSlug = process.env.DOCTOR_SLUG || null;

  let doctorId = null;
  if (doctorSlug) {
    const doc = await prisma.user.findFirst({ where: { doctor_slug: doctorSlug }, select: { id: true } });
    doctorId = doc?.id || null;
  }

  console.log('[snapshot] Doctor slug:', doctorSlug, 'Doctor ID:', doctorId);

  // payment_customers
  let pcs = [];
  if (doctorId) {
    pcs = await prisma.$queryRawUnsafe(
      `SELECT id, provider, provider_customer_id, doctor_id, patient_profile_id, clinic_id, created_at
         FROM payment_customers
        WHERE doctor_id = $1
        ORDER BY created_at DESC
        LIMIT 20`,
      doctorId
    );
  } else {
    pcs = await prisma.$queryRawUnsafe(
      `SELECT id, provider, provider_customer_id, doctor_id, patient_profile_id, clinic_id, created_at
         FROM payment_customers
        ORDER BY created_at DESC
        LIMIT 20`
    );
  }
  console.log('\n[payment_customers] last 20:');
  for (const r of pcs) console.log('  -', r);

  // payment_methods
  let pms = [];
  if (doctorId) {
    pms = await prisma.$queryRawUnsafe(
      `SELECT pm.id, pm.payment_customer_id, pm.provider_card_id, pm.brand, pm.last4, pm.exp_month, pm.exp_year, pm.is_default, pm.status, pm.created_at
         FROM payment_methods pm
        WHERE pm.payment_customer_id IN (SELECT id FROM payment_customers WHERE doctor_id = $1)
        ORDER BY pm.created_at DESC
        LIMIT 20`,
      doctorId
    );
  } else {
    pms = await prisma.$queryRawUnsafe(
      `SELECT pm.id, pm.payment_customer_id, pm.provider_card_id, pm.brand, pm.last4, pm.exp_month, pm.exp_year, pm.is_default, pm.status, pm.created_at
         FROM payment_methods pm
        ORDER BY pm.created_at DESC
        LIMIT 20`
    );
  }
  console.log('\n[payment_methods] last 20:');
  for (const r of pms) console.log('  -', r);

  // payment_transactions
  let pts = [];
  if (doctorId) {
    pts = await prisma.$queryRawUnsafe(
      `SELECT id, provider, provider_order_id, provider_charge_id, doctor_id, patient_profile_id, clinic_id, product_id, amount_cents, currency, installments, payment_method_type, status, created_at
         FROM payment_transactions
        WHERE doctor_id = $1
        ORDER BY created_at DESC
        LIMIT 20`,
      doctorId
    );
  } else {
    pts = await prisma.$queryRawUnsafe(
      `SELECT id, provider, provider_order_id, provider_charge_id, doctor_id, patient_profile_id, clinic_id, product_id, amount_cents, currency, installments, payment_method_type, status, created_at
         FROM payment_transactions
        ORDER BY created_at DESC
        LIMIT 20`
    );
  }
  console.log('\n[payment_transactions] last 20:');
  for (const r of pts) console.log('  -', r);
}

main()
  .catch((e) => { console.error('[snapshot] Error:', e); process.exit(1); })
  .finally(async () => { try { await prisma.$disconnect(); } catch {} });
