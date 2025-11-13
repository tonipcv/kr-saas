#!/usr/bin/env node
/*
 * Migration: Payment Foundation (multi-gateway base)
 * - Create enum PaymentProvider
 * - Create table merchant_integrations
 * - Alter checkout_sessions: add provider (enum), country (char(2)), locale (varchar(10))
 * - Alter payment_transactions: add merchant_id, provider_v2 (enum), index(merchant_id)
 * - Alter webhook_events: add idempotency/retry fields + indexes
 *
 * Idempotent: checks existence before each change. Safe to re-run.
 */

const fs = require('fs');
const path = require('path');
const { Client: PgClient } = require('pg');

// Load envs (.env and .env.local) if present
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

function readSchemaPrisma() {
  const schemaPath = path.resolve(process.cwd(), 'prisma', 'schema.prisma');
  const content = fs.readFileSync(schemaPath, 'utf8');
  return { content, schemaPath };
}

function extractDatasourceUrl(schemaContent) {
  const mLiteral = schemaContent.match(/datasource\s+db\s*\{[\s\S]*?url\s*=\s*"([^"]+)"/);
  if (mLiteral && mLiteral[1]) return mLiteral[1];
  const mEnv = schemaContent.match(/datasource\s+db\s*\{[\s\S]*?url\s*=\s*env\(\"([^\)\"\s]+)\"\)/);
  if (mEnv && mEnv[1]) return process.env[mEnv[1]] || null;
  return null;
}

async function ensureEnum(client, name, values) {
  const existsEnumSQL = `select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace where t.typname = '${name}' limit 1`;
  const r = await client.query(existsEnumSQL);
  if (r.rowCount === 0) {
    const vals = values.map(v => `\'${v}\'`).join(',');
    console.log(`[migrate] creating enum ${name}`);
    await client.query(`CREATE TYPE "${name}" AS ENUM (${vals})`);
  } else {
    console.log(`[migrate] enum ${name} already exists`);
  }
}

async function ensureTable(client, table, ddl) {
  const existsTableSQL = `select 1 from information_schema.tables where table_schema='public' and table_name='${table}' limit 1`;
  const r = await client.query(existsTableSQL);
  if (r.rowCount === 0) {
    console.log(`[migrate] creating table ${table}`);
    await client.query(ddl);
  } else {
    console.log('[migrate] table already exists', table);
  }
}

async function ensureColumn(client, table, column, ddl) {
  const existsColumnSQL = `select 1 from information_schema.columns where table_name='${table}' and column_name='${column}' limit 1`;
  const r = await client.query(existsColumnSQL);
  if (r.rowCount === 0) {
    console.log(`[migrate] adding column ${table}.${column}`);
    await client.query(`ALTER TABLE public.${table} ADD COLUMN ${column} ${ddl}`);
  }
}

async function ensureIndex(client, schema, indexName, ddl) {
  const existsIndexSQL = `select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='i' and c.relname='${indexName}' and n.nspname='${schema}' limit 1`;
  const r = await client.query(existsIndexSQL);
  if (r.rowCount === 0) {
    console.log('[migrate] creating index', indexName);
    await client.query(ddl);
  }
}

async function ensureConstraint(client, table, constraintName, ddl) {
  const existsConstraintSQL = `select 1 from information_schema.table_constraints where table_schema='public' and table_name='${table}' and constraint_name='${constraintName}' limit 1`;
  const r = await client.query(existsConstraintSQL);
  if (r.rowCount === 0) {
    console.log('[migrate] adding constraint', constraintName);
    await client.query(ddl);
  }
}

async function run() {
  const envUrl = process.env.DATABASE_URL || null;
  const { content: schemaContent, schemaPath } = readSchemaPrisma();
  const schemaUrl = extractDatasourceUrl(schemaContent);
  const dbUrl = envUrl || schemaUrl;
  if (!dbUrl) throw new Error('DATABASE_URL not set and no url found in prisma/schema.prisma');

  console.log('[migrate] schema.prisma:', schemaPath);
  console.log('[migrate] DATABASE_URL (env):', redact(envUrl));
  console.log('[migrate] schema url       :', redact(schemaUrl));
  console.log('[migrate] using DB url     :', redact(dbUrl));

  const client = new PgClient({ connectionString: dbUrl });
  await client.connect();

  try {
    console.log('[migrate] BEGIN');
    await client.query('BEGIN');

    // 1) Enum PaymentProvider
    await ensureEnum(client, 'PaymentProvider', [
      'KRXPAY', 'STRIPE', 'ADYEN', 'PAYPAL', 'MERCADOPAGO', 'PAGARME', 'OPENFINANCE'
    ]);

    // 2) Table merchant_integrations
    await ensureTable(client, 'merchant_integrations', `
      CREATE TABLE public.merchant_integrations (
        id text PRIMARY KEY,
        merchant_id text NOT NULL,
        provider "PaymentProvider" NOT NULL,
        credentials jsonb NOT NULL,
        config jsonb NULL,
        is_active boolean NOT NULL DEFAULT true,
        is_primary boolean NOT NULL DEFAULT false,
        connected_at timestamptz NOT NULL DEFAULT now(),
        last_used_at timestamptz NULL,
        last_error text NULL,
        last_error_at timestamptz NULL
      )
    `);
    await ensureIndex(client, 'public', 'idx_merchant_integrations_unique',
      'CREATE UNIQUE INDEX idx_merchant_integrations_unique ON public.merchant_integrations(merchant_id, provider)');
    await ensureIndex(client, 'public', 'idx_merchant_integrations_active',
      'CREATE INDEX idx_merchant_integrations_active ON public.merchant_integrations(merchant_id, is_active)');
    await ensureIndex(client, 'public', 'idx_merchant_integrations_provider',
      'CREATE INDEX idx_merchant_integrations_provider ON public.merchant_integrations(provider, is_active)');

    // 3) Alter checkout_sessions: provider, country, locale
    await ensureColumn(client, 'checkout_sessions', 'provider', '"PaymentProvider" NULL');
    await ensureColumn(client, 'checkout_sessions', 'country', 'varchar(2) NULL');
    await ensureColumn(client, 'checkout_sessions', 'locale', 'varchar(10) NULL');

    // 4) Alter payment_transactions: merchant_id, provider_v2, index(merchant_id)
    await ensureColumn(client, 'payment_transactions', 'merchant_id', 'text NULL');
    await ensureColumn(client, 'payment_transactions', 'provider_v2', '"PaymentProvider" NULL');
    await ensureIndex(client, 'public', 'payment_transactions_merchant_id_idx',
      'CREATE INDEX payment_transactions_merchant_id_idx ON public.payment_transactions(merchant_id)');

    // 5) Alter webhook_events: idempotency/retry fields + indexes
    const we = 'webhook_events';
    await ensureColumn(client, we, 'provider_event_id', 'text NULL');
    await ensureColumn(client, we, 'processed', 'boolean NOT NULL DEFAULT false');
    await ensureColumn(client, we, 'processing_error', 'text NULL');
    await ensureColumn(client, we, 'retry_count', 'int NOT NULL DEFAULT 0');
    await ensureColumn(client, we, 'max_retries', 'int NOT NULL DEFAULT 3');
    await ensureColumn(client, we, 'next_retry_at', 'timestamptz NULL');
    await ensureColumn(client, we, 'last_retry_at', 'timestamptz NULL');
    await ensureColumn(client, we, 'error_type', 'text NULL');
    await ensureColumn(client, we, 'is_retryable', 'boolean NOT NULL DEFAULT true');
    await ensureColumn(client, we, 'moved_dead_letter', 'boolean NOT NULL DEFAULT false');
    await ensureColumn(client, we, 'dead_letter_reason', 'text NULL');

    await ensureConstraint(client, we, 'webhook_events_provider_event_unique',
      'ALTER TABLE public.webhook_events ADD CONSTRAINT webhook_events_provider_event_unique UNIQUE (provider, provider_event_id)');
    await ensureIndex(client, 'public', 'idx_webhook_events_processing',
      'CREATE INDEX idx_webhook_events_processing ON public.webhook_events(provider, type, processed)');
    await ensureIndex(client, 'public', 'idx_webhook_events_unprocessed',
      'CREATE INDEX idx_webhook_events_unprocessed ON public.webhook_events(processed, received_at)');

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
