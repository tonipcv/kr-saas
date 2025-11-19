#!/usr/bin/env node
/*
 Backfill: CustomerProvider and CustomerPaymentMethod (idempotent)
 - Providers covered: PAGARME, APPMAX (best-effort)
 - Source: payment_transactions.raw_payload
 - Links transactions to created payment methods when possible

 Run:
   node local-scripts/backfill_providers_and_methods.js
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
    console.error('Query error:', e?.message || String(e));
    return [];
  }
}
function section(t) { console.log(`\n${t}\n${'-'.repeat(t.length)}`); }

async function createCustomerProviders() {
  section('Create CustomerProviders from payment_transactions');
  // Diagnostics
  const diag = await q(`
    SELECT provider_v2, 
           COUNT(*) FILTER (WHERE customer_id IS NOT NULL) AS with_customer,
           COUNT(*) FILTER (WHERE customer_id IS NOT NULL AND merchant_id IS NOT NULL) AS with_customer_and_merchant,
           COUNT(*) FILTER (WHERE customer_id IS NOT NULL AND merchant_id IS NULL AND clinic_id IS NOT NULL) AS need_infer_merchant
    FROM payment_transactions
    WHERE provider_v2 IN ('PAGARME','APPMAX')
    GROUP BY provider_v2;
  `);
  console.log('Candidates:', diag);

  // Generic extraction for provider_customer_id and account_id (infer via clinic when missing)
  const sql = `
    INSERT INTO customer_providers (
      id, customer_id, provider, account_id, provider_customer_id, metadata, created_at, updated_at
    )
    SELECT DISTINCT ON (pt.customer_id, COALESCE(pt.merchant_id, m.id), pt.provider_v2)
      gen_random_uuid(),
      pt.customer_id,
      pt.provider_v2,
      COALESCE(pt.merchant_id, m.id) AS account_id,
      COALESCE(
        (pt.raw_payload->>'customer_id'),
        (pt.raw_payload->'customer'->>'id'),
        NULL
      ) AS provider_customer_id,
      jsonb_build_object('source','backfill_providers_and_methods'),
      NOW(), NOW()
    FROM payment_transactions pt
    LEFT JOIN merchants m ON m.clinic_id = pt.clinic_id
    WHERE pt.customer_id IS NOT NULL
      AND pt.provider_v2 IN ('PAGARME','APPMAX')
      AND NOT EXISTS (
        SELECT 1 FROM customer_providers cp
        WHERE cp.customer_id = pt.customer_id
          AND cp.provider = pt.provider_v2
          AND cp.account_id IS NOT DISTINCT FROM COALESCE(pt.merchant_id, m.id)
      );
  `;
  const r = await exec(sql);
  console.log(r.ok ? `OK rows=${r.res}` : `ERR ${r.error}`);
}

async function createPaymentMethodsFromPagarme() {
  section('Create CustomerPaymentMethods from Pagarme payload');
  // Extract card info from current_charge.last_transaction.card
  const sql = `
    INSERT INTO customer_payment_methods (
      id, customer_id, customer_provider_id, provider, account_id,
      provider_payment_method_id, brand, last4, exp_month, exp_year,
      is_default, status, metadata, created_at, updated_at
    )
    SELECT DISTINCT ON (cp.customer_id, cp.provider, cp.account_id, card_id)
      gen_random_uuid(),
      cp.customer_id,
      cp.id AS customer_provider_id,
      'PAGARME'::"PaymentProvider",
      cp.account_id,
      card_id,
      card_brand,
      card_last4,
      card_exp_month,
      card_exp_year,
      TRUE,
      'active',
      jsonb_build_object('source','backfill_pagarme_card'),
      NOW(), NOW()
    FROM (
      SELECT 
        pt.customer_id,
        COALESCE(pt.merchant_id, m.id) AS account_id,
        -- card candidates
        (pt.raw_payload->'current_charge'->'last_transaction'->'card'->>'id') AS card_id,
        UPPER(COALESCE(
          (pt.raw_payload->'current_charge'->'last_transaction'->'card'->>'brand'),
          (pt.raw_payload->'card'->>'brand'),
          (pt.raw_payload->'payment_method'->>'brand')
        )) AS card_brand,
        COALESCE(
          (pt.raw_payload->'current_charge'->'last_transaction'->'card'->>'last_four_digits'),
          (pt.raw_payload->'card'->>'last_four_digits'),
          (pt.raw_payload->'payment_method'->>'last4')
        ) AS card_last4,
        COALESCE(
          NULLIF((pt.raw_payload->'current_charge'->'last_transaction'->'card'->>'exp_month'),''),
          (pt.raw_payload->'card'->>'exp_month'),
          (pt.raw_payload->'payment_method'->>'exp_month')
        )::int AS card_exp_month,
        COALESCE(
          NULLIF((pt.raw_payload->'current_charge'->'last_transaction'->'card'->>'exp_year'),''),
          (pt.raw_payload->'card'->>'exp_year'),
          (pt.raw_payload->'payment_method'->>'exp_year')
        )::int AS card_exp_year
      FROM payment_transactions pt
      LEFT JOIN merchants m ON m.clinic_id = pt.clinic_id
      WHERE pt.provider_v2 = 'PAGARME'
        AND pt.customer_id IS NOT NULL
    ) x
    JOIN customer_providers cp ON cp.customer_id = x.customer_id AND cp.provider = 'PAGARME' AND cp.account_id IS NOT DISTINCT FROM x.account_id
    WHERE x.card_id IS NOT NULL AND x.card_id <> ''
      AND NOT EXISTS (
        SELECT 1 FROM customer_payment_methods cpm
        WHERE cpm.customer_id = cp.customer_id
          AND cpm.provider = 'PAGARME'
          AND cpm.account_id = cp.account_id
          AND cpm.provider_payment_method_id = x.card_id
      );
  `;
  const r = await exec(sql);
  console.log(r.ok ? `OK rows=${r.res}` : `ERR ${r.error}`);
}

async function createPaymentMethodsFromAppmax() {
  section('Create CustomerPaymentMethods from Appmax payload (best-effort)');
  // Best-effort extraction for Appmax (structure may vary)
  const sql = `
    INSERT INTO customer_payment_methods (
      id, customer_id, customer_provider_id, provider, account_id,
      provider_payment_method_id, brand, last4, exp_month, exp_year,
      is_default, status, metadata, created_at, updated_at
    )
    SELECT DISTINCT ON (cp.customer_id, cp.provider, cp.account_id, card_id)
      gen_random_uuid(),
      cp.customer_id,
      cp.id AS customer_provider_id,
      'APPMAX'::"PaymentProvider",
      cp.account_id,
      card_id,
      card_brand,
      card_last4,
      card_exp_month,
      card_exp_year,
      TRUE,
      'active',
      jsonb_build_object('source','backfill_appmax_card'),
      NOW(), NOW()
    FROM (
      SELECT 
        pt.customer_id,
        COALESCE(pt.merchant_id, m.id) AS account_id,
        -- heuristic fields (adjust as your payload dictates)
        COALESCE(
          (pt.raw_payload->'card'->>'id'),
          (pt.raw_payload->'payment_method'->>'id')
        ) AS card_id,
        UPPER(COALESCE(
          (pt.raw_payload->'card'->>'brand'),
          (pt.raw_payload->'payment_method'->>'brand'),
          (pt.raw_payload->'metadata'->>'brand')
        )) AS card_brand,
        COALESCE(
          (pt.raw_payload->'card'->>'last4'),
          (pt.raw_payload->'payment_method'->>'last4'),
          (pt.raw_payload->'metadata'->>'last4')
        ) AS card_last4,
        COALESCE(
          (pt.raw_payload->'card'->>'exp_month'),
          (pt.raw_payload->'payment_method'->>'exp_month'),
          (pt.raw_payload->'metadata'->>'exp_month')
        )::int AS card_exp_month,
        COALESCE(
          (pt.raw_payload->'card'->>'exp_year'),
          (pt.raw_payload->'payment_method'->>'exp_year'),
          (pt.raw_payload->'metadata'->>'exp_year')
        )::int AS card_exp_year
      FROM payment_transactions pt
      LEFT JOIN merchants m ON m.clinic_id = pt.clinic_id
      WHERE pt.provider_v2 = 'APPMAX'
        AND pt.customer_id IS NOT NULL
    ) x
    JOIN customer_providers cp ON cp.customer_id = x.customer_id AND cp.provider = 'APPMAX' AND cp.account_id IS NOT DISTINCT FROM x.account_id
    WHERE x.card_id IS NOT NULL AND x.card_id <> ''
      AND NOT EXISTS (
        SELECT 1 FROM customer_payment_methods cpm
        WHERE cpm.customer_id = cp.customer_id
          AND cpm.provider = 'APPMAX'
          AND cpm.account_id = cp.account_id
          AND cpm.provider_payment_method_id = x.card_id
      );
  `;
  const r = await exec(sql);
  console.log(r.ok ? `OK rows=${r.res}` : `ERR ${r.error}`);
}

async function linkTxToPaymentMethod() {
  section('Link payment_transactions.customer_payment_method_id');
  // For Pagarme
  const r1 = await exec(`
    UPDATE payment_transactions pt
       SET customer_payment_method_id = cpm.id
      FROM customer_payment_methods cpm
     WHERE pt.customer_id = cpm.customer_id
       AND pt.merchant_id = cpm.account_id
       AND pt.provider_v2 = 'PAGARME'
       AND pt.customer_payment_method_id IS NULL
       AND COALESCE(
         (pt.raw_payload->'current_charge'->'last_transaction'->'card'->>'id'),
         (pt.raw_payload->'card'->>'id')
       ) = cpm.provider_payment_method_id;
  `);
  console.log(r1.ok ? `PAGARME linked rows=${r1.res}` : `PAGARME ERR ${r1.error}`);
  // For Appmax (best-effort)
  const r2 = await exec(`
    UPDATE payment_transactions pt
       SET customer_payment_method_id = cpm.id
      FROM customer_payment_methods cpm
     WHERE pt.customer_id = cpm.customer_id
       AND pt.merchant_id = cpm.account_id
       AND pt.provider_v2 = 'APPMAX'
       AND pt.customer_payment_method_id IS NULL
       AND COALESCE(
         (pt.raw_payload->'card'->>'id'),
         (pt.raw_payload->'payment_method'->>'id')
       ) = cpm.provider_payment_method_id;
  `);
  console.log(r2.ok ? `APPMAX linked rows=${r2.res}` : `APPMAX ERR ${r2.error}`);
}

async function linkTxToCustomerProvider() {
  section('Link payment_transactions.customer_provider_id');
  const sql = `
    UPDATE payment_transactions pt
       SET customer_provider_id = cp.id
      FROM customer_providers cp
     WHERE pt.customer_id = cp.customer_id
       AND pt.provider_v2 = cp.provider
       AND cp.account_id IS NOT DISTINCT FROM pt.merchant_id
       AND pt.customer_provider_id IS NULL;
  `;
  const r = await exec(sql);
  console.log(r.ok ? `Linked rows=${r.res}` : `ERR ${r.error}`);
}

async function summary() {
  section('Summary');
  const rows = await q(`
    SELECT 
      COUNT(*) FILTER (WHERE customer_id IS NOT NULL) AS tx_with_customer,
      COUNT(*) FILTER (WHERE customer_provider_id IS NOT NULL) AS tx_with_provider,
      COUNT(*) FILTER (WHERE customer_payment_method_id IS NOT NULL) AS tx_with_method,
      COUNT(*) AS tx_total
    FROM payment_transactions
    WHERE created_at > NOW() - INTERVAL '90 days';
  `);
  console.table(rows);
}

(async function run(){
  try {
    await createCustomerProviders();
    await linkTxToCustomerProvider();
    await createPaymentMethodsFromPagarme();
    await createPaymentMethodsFromAppmax();
    await linkTxToPaymentMethod();
    await summary();
  } catch (e) {
    console.error('Backfill providers/methods failed:', e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
