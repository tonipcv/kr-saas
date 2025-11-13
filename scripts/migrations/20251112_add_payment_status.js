#!/usr/bin/env node
/*
 * Migration: PaymentStatus enum + status_v2 column (progressive, non-breaking)
 * - Create enum PaymentStatus (if not exists)
 * - Add column payment_transactions.status_v2 (PaymentStatus, nullable)
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

async function run() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL not set');

  console.log('[migrate] using DB url     :', redact(dbUrl));

  const client = new PgClient({ connectionString: dbUrl });
  await client.connect();

  try {
    console.log('[migrate] BEGIN');
    await client.query('BEGIN');

    // 1) Enum PaymentStatus
    await ensureEnum(client, 'PaymentStatus', [
      'PENDING', 'PROCESSING', 'REQUIRES_ACTION', 'SUCCEEDED', 'FAILED', 'CANCELED',
      'EXPIRED', 'REFUNDING', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CHARGEBACK', 'DISPUTED'
    ]);

    // 2) Column payment_transactions.status_v2
    await ensureColumn(client, 'payment_transactions', 'status_v2', '"PaymentStatus" NULL');

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
