#!/usr/bin/env node
/*
 * Migration: Create checkout_sessions table and enum CheckoutSessionStatus
 * - Creates Postgres enum: "CheckoutSessionStatus"
 * - Creates table public.checkout_sessions (idempotent)
 * - Adds unique and indexes (idempotent)
 *
 * Safe to re-run: checks for existence before each change.
 */

const fs = require('fs');
const path = require('path');
const { Client: PgClient } = require('pg');
// Load environment variables early
try {
  const dotenv = require('dotenv');
  // Load .env and .env.local if present (ignore errors)
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
  // 1) Literal URL inside schema (rare)
  const mLiteral = schemaContent.match(/datasource\s+db\s*\{[\s\S]*?url\s*=\s*"([^"]+)"/);
  if (mLiteral && mLiteral[1]) return mLiteral[1];
  // 2) env("VAR_NAME") pattern
  const mEnv = schemaContent.match(/datasource\s+db\s*\{[\s\S]*?url\s*=\s*env\(\"([^\)\"\s]+)\"\)/);
  if (mEnv && mEnv[1]) {
    const varName = mEnv[1];
    return process.env[varName] || null;
  }
  return null;
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

  const existsEnumSQL = (name) => `select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace where t.typname = '${name}' limit 1`;
  const existsTableSQL = (table) => `select 1 from information_schema.tables where table_schema='public' and table_name='${table}' limit 1`;
  const existsColumnSQL = (table, column) => `select 1 from information_schema.columns where table_name='${table}' and column_name='${column}' limit 1`;
  const existsIndexSQL = (schema, indexName) => `select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='i' and c.relname='${indexName}' and n.nspname='${schema}' limit 1`;
  const existsConstraintSQL = (table, constraint) => `select 1 from information_schema.table_constraints where table_schema='public' and table_name='${table}' and constraint_name='${constraint}' limit 1`;

  try {
    console.log('[migrate] starting transaction');
    await client.query('BEGIN');

    // 1) Create enum CheckoutSessionStatus if not exists
    const enumName = 'CheckoutSessionStatus';
    const enumExists = await client.query(existsEnumSQL(enumName));
    if (enumExists.rowCount === 0) {
      console.log(`[migrate] creating enum ${enumName}`);
      await client.query(`CREATE TYPE "${enumName}" AS ENUM ('started','pix_generated','paid','abandoned','canceled')`);
    } else {
      console.log(`[migrate] enum ${enumName} already exists`);
    }

    // 2) Create table checkout_sessions if not exists (minimal shape)
    const table = 'checkout_sessions';
    const tableExists = await client.query(existsTableSQL(table));
    if (tableExists.rowCount === 0) {
      console.log(`[migrate] creating table ${table}`);
      await client.query(`
        CREATE TABLE public.${table} (
          id text PRIMARY KEY,
          resume_token text NOT NULL,
          clinic_id text NULL,
          product_id text NULL,
          offer_id text NULL,
          slug text NULL,
          status "${enumName}" NOT NULL DEFAULT 'started',
          payment_method text NOT NULL DEFAULT 'unknown',
          order_id text NULL,
          pix_order_id text NULL,
          pix_expires_at timestamptz NULL,
          email text NULL,
          phone text NULL,
          document text NULL,
          utm_source text NULL,
          utm_medium text NULL,
          utm_campaign text NULL,
          utm_term text NULL,
          utm_content text NULL,
          referrer text NULL,
          ip text NULL,
          user_agent text NULL,
          selected_installments integer NULL,
          selected_bank text NULL,
          payment_methods_allowed jsonb NULL,
          metadata jsonb NULL,
          started_at timestamptz NOT NULL DEFAULT now(),
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          last_heartbeat_at timestamptz NULL,
          last_step text NULL,
          reminder_expiring_sent_at timestamptz NULL,
          reminder_expired_sent_at timestamptz NULL,
          conversion_likelihood double precision NULL,
          origin text NULL,
          created_by text NULL,
          payment_transaction_id text NULL
        )
      `);
    } else {
      console.log('[migrate] table already exists', table);
    }

    // 3) Add missing columns (idempotent)
    const ensureColumn = async (col, ddl) => {
      const r = await client.query(existsColumnSQL(table, col));
      if (r.rowCount === 0) {
        console.log(`[migrate] adding column ${table}.${col}`);
        await client.query(`ALTER TABLE public.${table} ADD COLUMN ${col} ${ddl}`);
      }
    };

    // Ensure columns added after initial create (idempotent)
    await ensureColumn('created_at', 'timestamptz NOT NULL DEFAULT now()');
    await ensureColumn('reminder_expiring_sent_at', 'timestamptz NULL');
    await ensureColumn('reminder_expired_sent_at', 'timestamptz NULL');
    await ensureColumn('conversion_likelihood', 'double precision NULL');
    await ensureColumn('origin', 'text NULL');
    await ensureColumn('created_by', 'text NULL');
    await ensureColumn('payment_transaction_id', 'text NULL');

    // Unique resume_token
    const uniqueName = 'checkout_sessions_resume_token_key';
    const uniqueExists = await client.query(existsConstraintSQL(table, uniqueName));
    if (uniqueExists.rowCount === 0) {
      console.log('[migrate] adding unique constraint', uniqueName);
      await client.query(`ALTER TABLE public.${table} ADD CONSTRAINT ${uniqueName} UNIQUE (resume_token)`);
    }
    // Unique payment_transaction_id
    const uniquePt = 'checkout_sessions_payment_transaction_id_key';
    const uniquePtExists = await client.query(existsConstraintSQL(table, uniquePt));
    if (uniquePtExists.rowCount === 0) {
      console.log('[migrate] adding unique constraint', uniquePt);
      await client.query(`ALTER TABLE public.${table} ADD CONSTRAINT ${uniquePt} UNIQUE (payment_transaction_id)`);
    }

    // 4) Indexes
    const idx1 = 'checkout_sessions_status_clinic_updated_idx';
    if ((await client.query(existsIndexSQL('public', idx1))).rowCount === 0) {
      console.log('[migrate] creating index', idx1);
      await client.query(`CREATE INDEX ${idx1} ON public.${table}(status, clinic_id, updated_at)`);
    }

    const idx2 = 'checkout_sessions_order_id_idx';
    if ((await client.query(existsIndexSQL('public', idx2))).rowCount === 0) {
      console.log('[migrate] creating index', idx2);
      await client.query(`CREATE INDEX ${idx2} ON public.${table}(order_id)`);
    }

    const idx3 = 'checkout_sessions_pix_order_id_idx';
    if ((await client.query(existsIndexSQL('public', idx3))).rowCount === 0) {
      console.log('[migrate] creating index', idx3);
      await client.query(`CREATE INDEX ${idx3} ON public.${table}(pix_order_id)`);
    }

    const idx4 = 'checkout_sessions_status_pix_expires_idx';
    if ((await client.query(existsIndexSQL('public', idx4))).rowCount === 0) {
      console.log('[migrate] creating index', idx4);
      await client.query(`CREATE INDEX ${idx4} ON public.${table}(status, pix_expires_at)`);
    }

    await client.query('COMMIT');
    console.log('[migrate] done');
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
