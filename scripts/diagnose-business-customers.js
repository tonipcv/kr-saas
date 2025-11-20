#!/usr/bin/env node
/*
  Diagnose Business Customers data visibility for /business/clients
  - Resolves clinic -> merchant
  - Counts customers for merchant
  - Samples customers with providers and tx counts
  - Checks payment_transactions linkage (customer_id present vs null)

  Usage:
    node scripts/diagnose-business-customers.js --clinicId <ID>
    node scripts/diagnose-business-customers.js --clinicSlug <slug>
*/

const dotenv = require('dotenv');
dotenv.config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const k = args[i];
    const v = args[i + 1];
    if (!v) continue;
    if (k === '--clinicId') out.clinicId = v;
    if (k === '--clinicSlug') out.clinicSlug = v;
  }
  return out;
}

async function main() {
  const { clinicId, clinicSlug } = parseArgs();
  if (!clinicId && !clinicSlug) {
    console.log('Provide --clinicId <ID> or --clinicSlug <slug>');
    // Show a few clinics to help pick one
    const clinics = await prisma.clinic.findMany({ select: { id: true, name: true, slug: true }, take: 10, orderBy: { createdAt: 'desc' } });
    console.table(clinics);
    process.exit(1);
  }

  // Resolve clinic
  const clinic = clinicId
    ? await prisma.clinic.findUnique({ where: { id: String(clinicId) }, select: { id: true, name: true, slug: true } })
    : await prisma.clinic.findFirst({ where: { slug: String(clinicSlug) }, select: { id: true, name: true, slug: true } });
  if (!clinic) {
    console.log('Clinic not found.');
    process.exit(1);
  }
  console.log('[clinic]', clinic);

  // Resolve merchant
  const merchant = await prisma.merchant.findFirst({ where: { clinicId: clinic.id }, select: { id: true } });
  if (!merchant) {
    console.log('No merchant for clinic.');
    process.exit(0);
  }
  console.log('[merchant]', merchant);

  // Count customers
  const customerCount = await prisma.$queryRawUnsafe(`SELECT COUNT(1)::int AS n FROM customers WHERE merchant_id = $1`, String(merchant.id));
  console.log('[customers.count]', customerCount?.[0]?.n || 0);

  // Sample customers with providers + tx counts
  const sample = await prisma.$queryRawUnsafe(
    `SELECT 
       c.id,
       c.name,
       c.email,
       c.phone,
       c.document,
       c.created_at,
       c.updated_at,
       COALESCE((
         SELECT json_agg(json_build_object('provider', cp.provider, 'accountId', cp.account_id, 'providerCustomerId', cp.provider_customer_id) ORDER BY cp.provider)
         FROM customer_providers cp WHERE cp.customer_id = c.id
       ), '[]'::json) as providers,
       (SELECT COUNT(1) FROM payment_transactions pt WHERE pt.customer_id = c.id) as tx_total,
       (SELECT COUNT(1) FROM payment_transactions pt WHERE pt.customer_id = c.id AND pt.status IN ('paid','refunded')) as tx_paid
     FROM customers c
     WHERE c.merchant_id = $1
     ORDER BY c.updated_at DESC
     LIMIT 10`,
    String(merchant.id)
  );
  console.log('[customers.sample]\n');
  console.table(sample);

  // TX linkage: how many tx linked to a customer vs null
  const txStats = await prisma.$queryRawUnsafe(
    `SELECT 
       COUNT(1)::int AS total,
       SUM(CASE WHEN customer_id IS NULL THEN 1 ELSE 0 END)::int AS no_customer,
       SUM(CASE WHEN customer_id IS NOT NULL THEN 1 ELSE 0 END)::int AS with_customer
     FROM payment_transactions
     WHERE merchant_id = $1`,
    String(merchant.id)
  );
  console.log('[tx.linkage]', txStats?.[0] || {});

  // Recent transactions to inspect missing links
  const txRecent = await prisma.$queryRawUnsafe(
    `SELECT id, provider, provider_order_id, status, customer_id, product_id, amount_cents, created_at
     FROM payment_transactions
     WHERE merchant_id = $1
     ORDER BY created_at DESC
     LIMIT 10`,
    String(merchant.id)
  );
  console.log('[tx.recent]\n');
  console.table(txRecent);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('diagnose error:', e);
  await prisma.$disconnect();
  process.exit(1);
});
