#!/usr/bin/env node
/*
 * Migration: PaymentRoutingRule table + Offer.preferred_provider (non-breaking)
 * - Create table payment_routing_rules if not exists
 * - Add column offers.preferred_provider (PaymentProvider) nullable if not exists
 */

const fs = require('fs');
const path = require('path');
const { Client: PgClient } = require('pg');

try {
  const dotenv = require('dotenv');
  const root = process.cwd();
  const envPath = path.resolve(root, '.env');
  const envLocalPath = path.resolve(root, '.env.local');
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
  if (fs.existsSync(envLocalPath)) dotenv.config({ path: envLocalPath, override: true });
} catch {}

function redact(url) {
  if (!url) return '(unset)';
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    if (u.username) u.username = '***';
    return u.toString();
  } catch {
    return String(url).replace(/:\/\/([^:]+):([^@]+)@/, '://***:***@');
  }
}

async function ensureColumn(client, table, column, ddl) {
  const existsColumnSQL = `select 1 from information_schema.columns where table_name='${table}' and column_name='${column}' limit 1`;
  const r = await client.query(existsColumnSQL);
  if (r.rowCount === 0) {
    console.log(`[migrate] adding column ${table}.${column}`);
    await client.query(`ALTER TABLE public.${table} ADD COLUMN ${column} ${ddl}`);
  } else {
    console.log(`[migrate] column ${table}.${column} already exists`);
  }
}

async function ensureIndex(client, name, ddl) {
  const existsIdxSQL = `select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='i' and c.relname='${name}' limit 1`;
  const r = await client.query(existsIdxSQL);
  if (r.rowCount === 0) {
    console.log(`[migrate] creating index ${name}`);
    await client.query(ddl);
  } else {
    console.log(`[migrate] index ${name} already exists`);
  }
}

async function ensureTablePaymentRoutingRules(client) {
  const existsTableSQL = `select 1 from information_schema.tables where table_name='payment_routing_rules' and table_schema='public' limit 1`;
  const r = await client.query(existsTableSQL);
  if (r.rowCount === 0) {
    console.log('[migrate] creating table payment_routing_rules');
    await client.query(`
      CREATE TABLE public.payment_routing_rules (
        id text PRIMARY KEY,
        merchant_id text NOT NULL,
        product_id text NULL,
        offer_id text NULL,
        country varchar(2) NULL,
        method text NULL,
        provider text NOT NULL,
        priority integer NOT NULL DEFAULT 100,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    // Note: foreign keys intentionally omitted (non-breaking, allow progressive wiring)
  } else {
    console.log('[migrate] table payment_routing_rules already exists');
  }

  // Indexes
  await ensureIndex(client, 'idx_prr_merchant_active_priority', `CREATE INDEX idx_prr_merchant_active_priority ON public.payment_routing_rules (merchant_id, is_active, priority)`);
  await ensureIndex(client, 'idx_prr_merchant_country_method', `CREATE INDEX idx_prr_merchant_country_method ON public.payment_routing_rules (merchant_id, country, method)`);
  await ensureIndex(client, 'idx_prr_product', `CREATE INDEX idx_prr_product ON public.payment_routing_rules (product_id)`);
  await ensureIndex(client, 'idx_prr_offer', `CREATE INDEX idx_prr_offer ON public.payment_routing_rules (offer_id)`);
}

async function run() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL not set');

  console.log('[migrate] using DB url     :', redact(dbUrl));

  const client = new PgClient({ connectionString: dbUrl });
  await client.connect();

  try {
    console.log('[migrate] BEGIN');
    await client.query('BEGIN');

    // 1) Ensure table payment_routing_rules
    await ensureTablePaymentRoutingRules(client);

    // 2) Add offers.preferred_provider (enum PaymentProvider in Prisma; in DB we keep as text for non-breaking)
    await ensureColumn(client, 'offers', 'preferred_provider', 'text NULL');

    await client.query('COMMIT');
    console.log('[migrate] DONE');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[migrate] error:', e && e.message ? e.message : e);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

run().catch((e) => {
  console.error('[migrate] unhandled error', e);
  process.exitCode = 1;
});
