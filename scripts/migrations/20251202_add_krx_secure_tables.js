#!/usr/bin/env node
/*
 * Migration: Add KRX Secure metering and vault tables (idempotent & safe)
 * - Creates table krx_secure_usage
 * - Creates table vault_cards (dual-mode: Evervault & provider-native)
 * - Adds required indexes
 *
 * Notes:
 * - Non-breaking, no FKs to avoid hard failures in mixed environments
 * - Uses text/json/decimal to stay compatible with Prisma mappings
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

async function ensureExtension(client, ext) {
  const q = `SELECT 1 FROM pg_extension WHERE extname = $1 LIMIT 1`;
  const r = await client.query(q, [ext]);
  if (r.rowCount === 0) {
    console.log(`[migrate] enabling extension ${ext}`);
    await client.query(`CREATE EXTENSION IF NOT EXISTS ${ext}`);
  } else {
    console.log(`[migrate] extension ${ext} already enabled`);
  }
}

async function ensureTableKrxSecureUsage(client) {
  const exists = await client.query(`select 1 from information_schema.tables where table_schema='public' and table_name='krx_secure_usage' limit 1`);
  if (exists.rowCount === 0) {
    console.log('[migrate] creating table krx_secure_usage');
    await client.query(`
      CREATE TABLE public.krx_secure_usage (
        id text PRIMARY KEY,
        merchant_id text NOT NULL,
        customer_id text NULL,
        payment_tx_id text NULL,
        operation text NOT NULL,
        evervault_cost numeric(10,4) NOT NULL,
        krx_price numeric(10,4) NOT NULL,
        margin numeric(10,4) NOT NULL,
        metadata jsonb NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
  } else {
    console.log('[migrate] table krx_secure_usage already exists');
  }

  // Indexes
  await ensureIndex(client, 'idx_krx_usage_merchant_created_at', `CREATE INDEX idx_krx_usage_merchant_created_at ON public.krx_secure_usage (merchant_id, created_at)`);
  await ensureIndex(client, 'idx_krx_usage_operation_created_at', `CREATE INDEX idx_krx_usage_operation_created_at ON public.krx_secure_usage (operation, created_at)`);
}

async function ensureTableVaultCards(client) {
  const exists = await client.query(`select 1 from information_schema.tables where table_schema='public' and table_name='vault_cards' limit 1`);
  if (exists.rowCount === 0) {
    console.log('[migrate] creating table vault_cards');
    await client.query(`
      CREATE TABLE public.vault_cards (
        id text PRIMARY KEY,
        merchant_id text NOT NULL,
        customer_id text NOT NULL,

        evervault_card_id text NULL UNIQUE,
        network_token_id text NULL,
        network_token_number text NULL,

        provider text NULL,
        provider_token_id text NULL,

        brand text NOT NULL,
        last4 varchar(4) NOT NULL,
        exp_month integer NOT NULL,
        exp_year integer NOT NULL,

        fingerprint text NOT NULL,
        status text NOT NULL DEFAULT 'active',
        is_default boolean NOT NULL DEFAULT false,

        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
  } else {
    console.log('[migrate] table vault_cards already exists');
  }

  // Indexes
  await ensureIndex(client, 'idx_vault_cards_merchant_customer', `CREATE INDEX idx_vault_cards_merchant_customer ON public.vault_cards (merchant_id, customer_id)`);
  await ensureIndex(client, 'idx_vault_cards_fingerprint', `CREATE INDEX idx_vault_cards_fingerprint ON public.vault_cards (fingerprint)`);
  await ensureIndex(client, 'idx_vault_cards_evervault_card_id', `CREATE INDEX idx_vault_cards_evervault_card_id ON public.vault_cards (evervault_card_id)`);
}

async function ensureIndex(client, name, ddl) {
  const exists = await client.query(
    `select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='i' and c.relname=$1 limit 1`,
    [name]
  );
  if (exists.rowCount === 0) {
    console.log('[migrate] creating index', name);
    await client.query(ddl);
  } else {
    console.log('[migrate] index already exists', name);
  }
}

async function ensureTriggerUpdatedAt(client, table) {
  // Ensure a simple updated_at trigger (if updated_at column exists)
  const col = await client.query(
    `select 1 from information_schema.columns where table_schema='public' and table_name=$1 and column_name='updated_at' limit 1`,
    [table]
  );
  if (col.rowCount === 0) return; // no updated_at column

  await ensureExtension(client, 'pgcrypto');

  const fnName = `set_updated_at_${table}`;
  const trgName = `${table}_set_updated_at`;

  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = '${fnName}') THEN
        CREATE OR REPLACE FUNCTION public.${fnName}()
        RETURNS trigger AS $fn$
        BEGIN
          NEW.updated_at = now();
          RETURN NEW;
        END;
        $fn$ LANGUAGE plpgsql;
      END IF;
    END;
    $$;
  `);

  const trg = await client.query(
    `select 1 from pg_trigger where tgname = $1 limit 1`,
    [trgName]
  );
  if (trg.rowCount === 0) {
    console.log('[migrate] creating updated_at trigger for', table);
    await client.query(
      `CREATE TRIGGER ${trgName} BEFORE UPDATE ON public.${table} FOR EACH ROW EXECUTE FUNCTION public.${fnName}()`
    );
  } else {
    console.log('[migrate] trigger already exists for', table);
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

    // Ensure required extensions
    await ensureExtension(client, 'pgcrypto');

    // 1) krx_secure_usage
    await ensureTableKrxSecureUsage(client);

    // 2) vault_cards
    await ensureTableVaultCards(client);

    // 3) updated_at triggers (optional safety)
    await ensureTriggerUpdatedAt(client, 'vault_cards');

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
