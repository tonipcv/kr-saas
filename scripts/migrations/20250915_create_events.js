#!/usr/bin/env node
/*
  Creates the unified events table for analytics/auditing.
  Usage: node scripts/migrations/20250915_create_events.js
*/

const { prisma } = require('../../dist/lib/prisma.js');

async function main() {
  console.log('[migration] Starting: create events');

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
      event_id TEXT UNIQUE,
      event_type TEXT NOT NULL,
      customer_id TEXT,
      clinic_id TEXT NOT NULL,
      actor TEXT NOT NULL CHECK (actor IN ('customer','clinic','system','ai')),
      timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_events_clinic_ts ON events (clinic_id, timestamp DESC);`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_events_type_ts ON events (event_type, timestamp DESC);`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_events_customer_ts ON events (customer_id, timestamp DESC);`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_events_metadata_gin ON events USING GIN (metadata);`);

  console.log('[migration] Done.');
}

main()
  .catch((e) => { console.error('[migration] Error:', e); process.exit(1); })
  .finally(async () => { try { await prisma.$disconnect(); } catch {} });
