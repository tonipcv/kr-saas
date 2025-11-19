#!/usr/bin/env node
/*
 Backfill Phase 2 - Customers from Checkout Sessions (idempotent)
 - Upsert customers using checkout_sessions (email + clinic -> merchant)
 - Link payment_transactions.customer_id using checkout_sessions.payment_transaction_id and/or email
 - Create customer_providers for linked transactions

 Run:
   node local-scripts/backfill_customers_from_sessions.js
*/
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function q(sql, ...params) {
  try {
    const rows = await prisma.$queryRawUnsafe(sql, ...params);
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    console.error('Query error:', e?.message || String(e));
    return [];
  }
}
async function exec(sql) {
  try {
    const res = await prisma.$executeRawUnsafe(sql);
    return { ok: true, res };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}
function section(t){ console.log(`\n${t}\n${'-'.repeat(t.length)}`); }

async function upsertCustomersFromSessions() {
  section('Upsert customers from checkout_sessions (by clinic->merchant)');
  // Insert customers for sessions with email and resolvable merchant
  const sql = `
    INSERT INTO customers (id, merchant_id, name, email, phone, document, address, metadata, created_at, updated_at)
    SELECT 
      gen_random_uuid()::text AS id,
      m.id AS merchant_id,
      NULL::text AS name,
      cs.email AS email,
      cs.phone AS phone,
      cs.document AS document,
      NULL::jsonb AS address,
      jsonb_build_object('source','backfill_sessions') AS metadata,
      NOW(), NOW()
    FROM checkout_sessions cs
    JOIN merchants m ON m.clinic_id = cs.clinic_id
    WHERE cs.email IS NOT NULL AND cs.email <> ''
      AND cs.email ~* '^[^@]+@[^@]+\.[^@]+$'
      AND NOT EXISTS (
        SELECT 1 FROM customers cu
        WHERE cu.merchant_id = m.id AND cu.email = cs.email
      );
  `;
  const r = await exec(sql);
  console.log(r.ok ? `OK rows=${r.res}` : `ERR ${r.error}`);
}

async function linkTransactionsBySessionId() {
  section('Link transactions by checkout_sessions.payment_transaction_id');
  const sql = `
    UPDATE payment_transactions pt
       SET customer_id = cu.id
      FROM checkout_sessions cs
      JOIN merchants m ON m.clinic_id = cs.clinic_id
      JOIN customers cu ON cu.merchant_id = m.id AND cu.email = cs.email
     WHERE pt.id = cs.payment_transaction_id
       AND pt.customer_id IS NULL
       AND cs.email IS NOT NULL AND cs.email <> '';
  `;
  const r = await exec(sql);
  console.log(r.ok ? `OK rows=${r.res}` : `ERR ${r.error}`);
}

async function linkTransactionsByClinicEmail() {
  section('Link transactions by clinic_id + email (fallback)');
  const sql = `
    UPDATE payment_transactions pt
       SET customer_id = cu.id
      FROM customers cu
      JOIN merchants m ON m.id = cu.merchant_id
      JOIN checkout_sessions cs ON cs.clinic_id = m.clinic_id AND cs.email = cu.email
     WHERE pt.customer_id IS NULL
       AND pt.clinic_id = cs.clinic_id
       AND cs.email IS NOT NULL AND cs.email <> '';
  `;
  const r = await exec(sql);
  console.log(r.ok ? `OK rows=${r.res}` : `ERR ${r.error}`);
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
      jsonb_build_object('source','backfill_sessions'),
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
  console.log(r.ok ? `OK rows=${r.res}` : `ERR ${r.error}`);
}

async function summary() {
  section('Summary after Backfill from Sessions');
  const rows = await q(`
    SELECT 
      COUNT(*) FILTER (WHERE customer_id IS NOT NULL) AS tx_with_customer,
      COUNT(*) AS tx_total
    FROM payment_transactions
    WHERE created_at > NOW() - INTERVAL '90 days';
  `);
  console.table(rows);
}

(async function run(){
  try {
    await upsertCustomersFromSessions();
    await linkTransactionsBySessionId();
    await linkTransactionsByClinicEmail();
    await createCustomerProvidersForLinked();
    await summary();
  } catch (e) {
    console.error('Backfill from sessions failed:', e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
