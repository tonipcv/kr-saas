#!/usr/bin/env node
/*
 * Migration: Create webhook_events table (idempotent)
 * - Table: webhook_events
 *   - id uuid PK (default gen_random_uuid() if available)
 *   - provider text NOT NULL (e.g., 'pagarme')
 *   - hook_id text NOT NULL (e.g., 'hook_...')
 *   - type text NOT NULL (e.g., 'order.paid')
 *   - resource_order_id text NULL
 *   - resource_charge_id text NULL
 *   - status text NULL
 *   - received_at timestamptz NOT NULL DEFAULT NOW()
 *   - processed_at timestamptz NULL
 *   - attempts integer NULL
 *   - raw jsonb NOT NULL
 * - Constraints
 *   - UNIQUE(provider, hook_id)
 * - Indexes
 *   - idx_webhook_events_type
 *   - idx_webhook_events_order
 *   - idx_webhook_events_charge
 *   - idx_webhook_events_received
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
const { Client: PgClient } = require('pg');

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
  const m = schemaContent.match(/datasource\s+db\s*\{[\s\S]*?url\s*=\s*"([^"]+)"/);
  return m ? m[1] : null;
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
    await client.query('BEGIN');

    // Ensure pgcrypto/gen_random_uuid exists (optional)
    await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

    // Create table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS webhook_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        provider text NOT NULL,
        hook_id text NOT NULL,
        type text NOT NULL,
        resource_order_id text NULL,
        resource_charge_id text NULL,
        status text NULL,
        received_at timestamptz NOT NULL DEFAULT NOW(),
        processed_at timestamptz NULL,
        attempts integer NULL,
        raw jsonb NOT NULL
      )
    `);

    // Unique constraint
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'webhook_events_provider_hook_id_key'
        ) THEN
          ALTER TABLE webhook_events ADD CONSTRAINT webhook_events_provider_hook_id_key UNIQUE (provider, hook_id);
        END IF;
      END $$;
    `);

    // Indexes
    const createIndexIfMissing = async (name, ddl) => {
      const r = await client.query(
        `SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='i' AND c.relname=$1 AND n.nspname='public' LIMIT 1`,
        [name]
      );
      if (r.rowCount === 0) {
        console.log('[migrate] creating index', name);
        await client.query(ddl);
      } else {
        console.log('[migrate] index already exists', name);
      }
    };

    await createIndexIfMissing('idx_webhook_events_type', `CREATE INDEX idx_webhook_events_type ON webhook_events(type)`);
    await createIndexIfMissing('idx_webhook_events_order', `CREATE INDEX idx_webhook_events_order ON webhook_events(resource_order_id)`);
    await createIndexIfMissing('idx_webhook_events_charge', `CREATE INDEX idx_webhook_events_charge ON webhook_events(resource_charge_id)`);
    await createIndexIfMissing('idx_webhook_events_received', `CREATE INDEX idx_webhook_events_received ON webhook_events(received_at)`);

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
