#!/usr/bin/env node
/*
 Phase 0 Migration - Orchestration bootstrap (safe, idempotent)
 - Adds supporting indexes (IF NOT EXISTS)
 - Backfills routed_provider, provider_v2, status_v2
 - Links checkout_sessions.payment_transaction_id when possible

 Run:
   node local-scripts/migrate_orchestration_phase0.js
*/
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function exec(sql) {
  try {
    await prisma.$executeRawUnsafe(sql);
    return { ok: true };
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

async function addIndexes() {
  section('Adding indexes (IF NOT EXISTS)');
  const stmts = [
    // payment_transactions
    "CREATE INDEX IF NOT EXISTS idx_payment_transactions_customer_id ON payment_transactions(customer_id)",
    "CREATE INDEX IF NOT EXISTS idx_payment_transactions_customer_provider_id ON payment_transactions(customer_provider_id)",
    "CREATE INDEX IF NOT EXISTS idx_payment_transactions_customer_payment_method_id ON payment_transactions(customer_payment_method_id)",
    "CREATE INDEX IF NOT EXISTS idx_payment_transactions_customer_subscription_id ON payment_transactions(customer_subscription_id)",
    "CREATE INDEX IF NOT EXISTS idx_payment_transactions_provider_v2 ON payment_transactions(provider_v2)",
    "CREATE INDEX IF NOT EXISTS idx_payment_transactions_status_v2 ON payment_transactions(status_v2)",
    // checkout_sessions
    "CREATE INDEX IF NOT EXISTS idx_checkout_sessions_payment_transaction_id ON checkout_sessions(payment_transaction_id)"
  ];
  for (const s of stmts) {
    const r = await exec(s);
    console.log((r.ok ? 'OK' : 'ERR') + ' - ' + s);
    if (!r.ok) console.log('   ' + r.error);
  }
}

async function backfillRoutedProvider() {
  section('Backfill routed_provider from provider (where null)');
  const r = await exec(`
    UPDATE payment_transactions
       SET routed_provider = provider
     WHERE routed_provider IS NULL
       AND provider IS NOT NULL;
  `);
  console.log(r.ok ? 'OK' : 'ERR', r.error || '');
}

async function backfillProviderEnum() {
  section('Backfill provider_v2 enum from provider string');
  const r = await exec(`
    UPDATE payment_transactions
       SET provider_v2 = CASE
         WHEN LOWER(provider) IN ('pagarme','pagar.me') THEN 'PAGARME'
         WHEN LOWER(provider) IN ('krxpay') THEN 'KRXPAY'
         WHEN LOWER(provider) IN ('stripe') THEN 'STRIPE'
         WHEN LOWER(provider) IN ('openfinance','open_finance','open_banking','ob') THEN 'OPENFINANCE'
         WHEN LOWER(provider) IN ('appmax') THEN 'APPMAX'
         WHEN LOWER(provider) IN ('adyen') THEN 'ADYEN'
         WHEN LOWER(provider) IN ('paypal') THEN 'PAYPAL'
         WHEN LOWER(provider) IN ('mercadopago','mp') THEN 'MERCADOPAGO'
         WHEN LOWER(provider) IN ('pagarme_v5','pagarmev5') THEN 'PAGARME'
         ELSE provider_v2
       END
     WHERE provider IS NOT NULL AND provider_v2 IS NULL;
  `);
  console.log(r.ok ? 'OK' : 'ERR', r.error || '');
}

async function backfillStatusEnum() {
  section('Backfill status_v2 enum from status string');
  const r = await exec(`
    UPDATE payment_transactions
       SET status_v2 = CASE
         WHEN LOWER(status) IN ('processing','pending','waiting_payment','authorized') THEN 'PROCESSING'
         WHEN LOWER(status) IN ('paid','pago','succeeded','completed') THEN 'SUCCEEDED'
         WHEN LOWER(status) IN ('failed','refused','rejected','declined') THEN 'FAILED'
         WHEN LOWER(status) IN ('canceled','cancelled','voided') THEN 'CANCELED'
         WHEN LOWER(status) IN ('expired','timeout') THEN 'EXPIRED'
         WHEN LOWER(status) IN ('refunding','pending_refund') THEN 'REFUNDING'
         WHEN LOWER(status) IN ('refunded','refund') THEN 'REFUNDED'
         WHEN LOWER(status) IN ('partially_refunded') THEN 'PARTIALLY_REFUNDED'
         WHEN LOWER(status) IN ('chargeback','disputed') THEN 'CHARGEBACK'
         WHEN LOWER(status) IN ('requires_action') THEN 'REQUIRES_ACTION'
         ELSE status_v2
       END
     WHERE status IS NOT NULL AND status_v2 IS NULL;
  `);
  console.log(r.ok ? 'OK' : 'ERR', r.error || '');
}

async function linkSessionsToTransactions() {
  section('Link checkout_sessions.payment_transaction_id by orderId/pixOrderId');
  const r1 = await exec(`
    UPDATE checkout_sessions cs
       SET payment_transaction_id = pt.id
      FROM payment_transactions pt
     WHERE cs.order_id = pt.provider_order_id
       AND cs.payment_transaction_id IS NULL
       AND pt.provider_order_id IS NOT NULL;
  `);
  console.log('By order_id:', r1.ok ? 'OK' : 'ERR', r1.error || '');
  const r2 = await exec(`
    UPDATE checkout_sessions cs
       SET payment_transaction_id = pt.id
      FROM payment_transactions pt
     WHERE cs.pix_order_id = pt.provider_order_id
       AND cs.payment_transaction_id IS NULL
       AND pt.provider_order_id IS NOT NULL;
  `);
  console.log('By pix_order_id:', r2.ok ? 'OK' : 'ERR', r2.error || '');
}

async function summary() {
  section('Summary after Phase 0');
  const rows = await q(`
    SELECT 
      COUNT(*) FILTER (WHERE customer_id IS NOT NULL) AS with_customer,
      COUNT(*) FILTER (WHERE provider_v2 IS NOT NULL) AS with_provider_v2,
      COUNT(*) FILTER (WHERE status_v2 IS NOT NULL) AS with_status_v2,
      COUNT(*) AS total
    FROM payment_transactions
    WHERE created_at > NOW() - INTERVAL '90 days';
  `);
  console.table(rows);
}

(async function run() {
  try {
    await addIndexes();
    await backfillRoutedProvider();
    await backfillProviderEnum();
    await backfillStatusEnum();
    await linkSessionsToTransactions();
    await summary();
  } catch (e) {
    console.error('Migration failed:', e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
