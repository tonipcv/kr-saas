#!/usr/bin/env node
/*
 Backfill Phase 1 - Unified Customers and Links (idempotent)
 - Create unified customers from payment_customers (map clinic->merchant)
 - Link payment_transactions.customer_id via clinic/email
 - Create CustomerProvider for rows with customer_id+merchant_id+provider_v2

 Run:
   node local-scripts/backfill_customers_phase1.js
*/
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function exec(sql) {
  try {
    const res = await prisma.$executeRawUnsafe(sql);
    return { ok: true, res };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

async function q(sql, ...params) {
  try {
    const rows = await prisma.$queryRawUnsafe(sql, ...params);
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    return [{ error: e?.message || String(e) }];
  }
}

function section(title) {
  console.log(`\n${title}\n${'-'.repeat(title.length)}`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function createCustomersFromPaymentCustomers() {
  section('Create unified customers from payment_customers');
  // Preflight: how many candidates
  const preview = await q(`
    SELECT COUNT(*)::int AS candidates
    FROM payment_customers pc
    JOIN clinics c ON c.id = pc.clinic_id
    JOIN merchants m ON m.clinic_id = c.id
    WHERE pc.email IS NOT NULL AND pc.email <> ''
      AND NOT EXISTS (
        SELECT 1 FROM customers cu 
        WHERE cu.merchant_id = m.id AND cu.email = pc.email
      );
  `);
  console.log('Candidates:', JSON.stringify(preview[0] || {}));

  const sql = `
    INSERT INTO customers (id, merchant_id, name, email, phone, document, address, metadata, created_at, updated_at)
    SELECT 
      pc.id,
      m.id AS merchant_id,
      pc.full_name AS name,
      pc.email,
      NULL::text AS phone,
      pc.document,
      NULL::jsonb AS address,
      jsonb_build_object('source','backfill_payment_customers') AS metadata,
      pc.created_at,
      pc.updated_at
    FROM payment_customers pc
    JOIN clinics c ON c.id = pc.clinic_id
    JOIN merchants m ON m.clinic_id = c.id
    WHERE pc.email IS NOT NULL AND pc.email <> ''
      AND NOT EXISTS (
        SELECT 1 FROM customers cu 
        WHERE cu.merchant_id = m.id AND cu.email = pc.email
      );
  `;
  // Retry bulk insert up to 3 times (transient network issues)
  let attempt = 0; let lastErr = '';
  while (attempt < 3) {
    const r = await exec(sql);
    if (r.ok) { console.log('OK', `rows=${r.res}`); return; }
    lastErr = r.error || '';
    console.log('ERR', lastErr, `attempt=${attempt+1}`);
    attempt++;
    await sleep(500 * attempt);
  }
  // Fallback: per-row create (slower, but resilient)
  console.log('Falling back to per-row creation...');
  const rows = await q(`
    SELECT 
      pc.id as id,
      m.id  as merchant_id,
      pc.full_name AS name,
      pc.email AS email,
      NULL AS phone,
      pc.document AS document,
      pc.created_at AS created_at,
      pc.updated_at AS updated_at
    FROM payment_customers pc
    JOIN clinics c ON c.id = pc.clinic_id
    JOIN merchants m ON m.clinic_id = c.id
    WHERE pc.email IS NOT NULL AND pc.email <> ''
      AND NOT EXISTS (
        SELECT 1 FROM customers cu 
        WHERE cu.merchant_id = m.id AND cu.email = pc.email
      );
  `);
  let ok = 0, err = 0;
  for (const r of rows) {
    try {
      await prisma.customer.create({
        data: {
          id: String(r.id),
          merchantId: String(r.merchant_id),
          name: r.name ? String(r.name) : null,
          email: r.email ? String(r.email) : null,
          phone: r.phone ? String(r.phone) : null,
          document: r.document ? String(r.document) : null,
          address: null,
          metadata: { source: 'backfill_payment_customers' },
          createdAt: r.created_at ? new Date(r.created_at) : undefined,
          updatedAt: r.updated_at ? new Date(r.updated_at) : undefined,
        },
      });
      ok++;
    } catch (e) { err++; }
  }
  console.log(`Per-row result: ok=${ok}, err=${err}`);
}

async function linkTransactionsToCustomersByEmailClinic() {
  section('Link payment_transactions.customer_id via clinic/email');
  const sql = `
    UPDATE payment_transactions pt
       SET customer_id = cu.id
      FROM customers cu
      JOIN merchants m ON m.id = cu.merchant_id
      JOIN clinics c ON c.id = m.clinic_id
     WHERE pt.customer_id IS NULL
       AND pt.clinic_id = c.id
       AND cu.email IS NOT NULL AND cu.email <> ''
       AND (
         -- try to extract email from raw_payload when present
         (pt.raw_payload->>'customer_email') = cu.email OR
         (pt.raw_payload->'customer'->>'email') = cu.email OR
         (pt.raw_payload->>'email') = cu.email OR
         EXISTS (
           SELECT 1
           FROM jsonb_each_text(pt.raw_payload) as kv(k,v)
           WHERE kv.v = cu.email
         )
       );
  `;
  const r = await exec(sql);
  console.log(r.ok ? 'OK' : 'ERR', r.error || `rows=${r.res}`);
}

async function createCustomerProvidersForLinked() {
  section('Create CustomerProvider for linked transactions');
  const sql = `
    INSERT INTO customer_providers (
      id, customer_id, provider, account_id, provider_customer_id, metadata, created_at, updated_at
    )
    SELECT DISTINCT ON (cu.id, pt.merchant_id, pt.provider_v2)
      gen_random_uuid(),
      cu.id, 
      pt.provider_v2, 
      pt.merchant_id, 
      NULL, 
      jsonb_build_object('source','backfill_customer_provider'),
      NOW(), NOW()
    FROM payment_transactions pt
    JOIN customers cu ON cu.id = pt.customer_id
    WHERE pt.customer_id IS NOT NULL
      AND pt.merchant_id IS NOT NULL
      AND pt.provider_v2 IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM customer_providers cp
        WHERE cp.customer_id = cu.id 
          AND cp.provider = pt.provider_v2
          AND cp.account_id = pt.merchant_id
      );
  `;
  const r = await exec(sql);
  console.log(r.ok ? 'OK' : 'ERR', r.error || `rows=${r.res}`);
}

async function summary() {
  section('Summary after Backfill Phase 1');
  const rows = await q(`
    SELECT 
      COUNT(*) FILTER (WHERE customer_id IS NOT NULL) AS tx_with_customer,
      COUNT(*) AS tx_total
    FROM payment_transactions
    WHERE created_at > NOW() - INTERVAL '90 days';
  `);
  console.table(rows);
}

(async function run() {
  try {
    await createCustomersFromPaymentCustomers();
    await linkTransactionsToCustomersByEmailClinic();
    await createCustomerProvidersForLinked();
    await summary();
  } catch (e) {
    console.error('Backfill phase1 failed:', e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
