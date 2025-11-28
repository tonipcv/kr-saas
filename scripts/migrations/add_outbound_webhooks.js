#!/usr/bin/env node
/*
  Safe, idempotent migration for outbound webhooks tables using Prisma.
  - Creates tables: webhook_endpoints, outbound_webhook_events, outbound_webhook_deliveries
  - Adds FKs, indexes, and simple CHECK constraints
  - Uses IF NOT EXISTS and catalog checks to remain idempotent
*/

const { PrismaClient } = require('@prisma/client')

async function run() {
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL } },
    errorFormat: 'colorless',
    log: [{ level: 'error', emit: 'event' }, { level: 'warn', emit: 'event' }],
  })
  prisma.$on('warn', (e) => { try { console.warn('[prisma][warn]', e.message) } catch {} })
  prisma.$on('error', (e) => { try { console.error('[prisma][error]', e.message) } catch {} })

  console.log('[migration] Starting outbound webhooks migration')

  try {
    const statements = [
      // webhook_endpoints table
      `CREATE TABLE IF NOT EXISTS webhook_endpoints (
        id text PRIMARY KEY,
        clinic_id text NOT NULL,
        name text NOT NULL,
        url text NOT NULL,
        secret text NOT NULL,
        events text[] NOT NULL,
        enabled boolean NOT NULL DEFAULT true,
        max_concurrent_deliveries int NOT NULL DEFAULT 5,
        category_filter text NOT NULL DEFAULT 'all',
        status_filters text[] NOT NULL DEFAULT '{}',
        product_filters text[] NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
      `DO $$ BEGIN IF NOT EXISTS (
         SELECT 1 FROM pg_constraint WHERE conname = 'webhook_endpoints_https_url_chk'
       ) THEN ALTER TABLE webhook_endpoints ADD CONSTRAINT webhook_endpoints_https_url_chk CHECK (url ~* '^https://'); END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (
         SELECT 1 FROM pg_constraint WHERE conname = 'webhook_endpoints_secret_chk'
       ) THEN ALTER TABLE webhook_endpoints ADD CONSTRAINT webhook_endpoints_secret_chk CHECK (secret ~ '^whsec_'); END IF; END $$;`,
      `CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_clinic_enabled ON webhook_endpoints (clinic_id, enabled)`,
      // New columns for existing tables (idempotent)
      `ALTER TABLE webhook_endpoints ADD COLUMN IF NOT EXISTS max_concurrent_deliveries int NOT NULL DEFAULT 5`,
      `ALTER TABLE webhook_endpoints ADD COLUMN IF NOT EXISTS category_filter text NOT NULL DEFAULT 'all'`,
      `ALTER TABLE webhook_endpoints ADD COLUMN IF NOT EXISTS status_filters text[] NOT NULL DEFAULT '{}'`,
      `ALTER TABLE webhook_endpoints ADD COLUMN IF NOT EXISTS product_filters text[] NOT NULL DEFAULT '{}'`,
      // Simple guards
      `DO $$ BEGIN IF NOT EXISTS (
         SELECT 1 FROM pg_constraint WHERE conname = 'webhook_endpoints_concurrency_chk'
       ) THEN ALTER TABLE webhook_endpoints ADD CONSTRAINT webhook_endpoints_concurrency_chk CHECK (max_concurrent_deliveries >= 1 AND max_concurrent_deliveries <= 15); END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (
         SELECT 1 FROM pg_constraint WHERE conname = 'webhook_endpoints_category_chk'
       ) THEN ALTER TABLE webhook_endpoints ADD CONSTRAINT webhook_endpoints_category_chk CHECK (category_filter IN ('all','marketplaces','products')); END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (
         SELECT 1 FROM pg_constraint WHERE conname = 'webhook_endpoints_clinic_fk'
       ) THEN ALTER TABLE webhook_endpoints ADD CONSTRAINT webhook_endpoints_clinic_fk FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE CASCADE; END IF; END $$;`,

      // outbound_webhook_events table
      `CREATE TABLE IF NOT EXISTS outbound_webhook_events (
        id text PRIMARY KEY,
        clinic_id text NOT NULL,
        type text NOT NULL,
        resource text NOT NULL,
        resource_id text NOT NULL,
        payload jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_out_evt_clinic_type_created ON outbound_webhook_events (clinic_id, type, created_at)`,
      `DO $$ BEGIN IF NOT EXISTS (
         SELECT 1 FROM pg_constraint WHERE conname = 'outbound_webhook_events_clinic_fk'
       ) THEN ALTER TABLE outbound_webhook_events ADD CONSTRAINT outbound_webhook_events_clinic_fk FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE CASCADE; END IF; END $$;`,

      // outbound_webhook_deliveries table
      `CREATE TABLE IF NOT EXISTS outbound_webhook_deliveries (
        id text PRIMARY KEY,
        endpoint_id text NOT NULL,
        event_id text NOT NULL,
        status text NOT NULL DEFAULT 'PENDING',
        attempts int NOT NULL DEFAULT 0,
        last_code int NULL,
        last_error text NULL,
        next_attempt_at timestamptz NULL,
        delivered_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
      `DO $$ BEGIN IF NOT EXISTS (
         SELECT 1 FROM pg_constraint WHERE conname = 'outbound_webhook_deliveries_status_chk'
       ) THEN ALTER TABLE outbound_webhook_deliveries ADD CONSTRAINT outbound_webhook_deliveries_status_chk CHECK (status IN ('PENDING','DELIVERED','FAILED')); END IF; END $$;`,
      `CREATE INDEX IF NOT EXISTS idx_out_deliv_endpoint_status_next ON outbound_webhook_deliveries (endpoint_id, status, next_attempt_at)`,
      `CREATE INDEX IF NOT EXISTS idx_out_deliv_event ON outbound_webhook_deliveries (event_id)`,
      `DO $$ BEGIN IF NOT EXISTS (
         SELECT 1 FROM pg_constraint WHERE conname = 'outbound_webhook_deliveries_endpoint_fk'
       ) THEN ALTER TABLE outbound_webhook_deliveries ADD CONSTRAINT outbound_webhook_deliveries_endpoint_fk FOREIGN KEY (endpoint_id) REFERENCES webhook_endpoints(id) ON DELETE CASCADE; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (
         SELECT 1 FROM pg_constraint WHERE conname = 'outbound_webhook_deliveries_event_fk'
       ) THEN ALTER TABLE outbound_webhook_deliveries ADD CONSTRAINT outbound_webhook_deliveries_event_fk FOREIGN KEY (event_id) REFERENCES outbound_webhook_events(id) ON DELETE CASCADE; END IF; END $$;`,
    ]

    // Execute each statement with guards to keep idempotency
    for (const stmt of statements) {
      try {
        await prisma.$executeRawUnsafe(stmt)
      } catch (e) {
        const msg = String(e?.message || '')
        // ignore duplicate constraint errors to keep idempotent
        if (msg.includes('already exists') || msg.includes('duplicate') || msg.includes('exists')) {
          continue
        }
        throw e
      }
    }
    // Finished
    console.log('[migration] Outbound webhooks migration completed successfully')
  } catch (err) {
    console.error('[migration] Failed:', err?.message || err)
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}

run().catch((e) => {
  console.error('[migration] Unhandled error:', e?.message || e)
  process.exitCode = 1
})
