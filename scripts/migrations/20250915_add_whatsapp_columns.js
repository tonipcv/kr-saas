#!/usr/bin/env node
/*
  Adds columns waba_id (TEXT) and meta (JSONB) to clinic_integrations,
  and ensures unique index on (clinic_id, provider).

  Usage:
    node scripts/migrations/20250915_add_whatsapp_columns.js
*/

const { prisma } = require('../../dist/lib/prisma.js');

async function main() {
  console.log('[migration] Starting: add waba_id/meta to clinic_integrations');
  // Create table if not exists (defensive)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS clinic_integrations (
      id TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
      clinic_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      api_key_enc TEXT NOT NULL,
      iv TEXT NOT NULL,
      instance_id TEXT,
      phone TEXT,
      status TEXT,
      last_seen_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  // Add columns if missing
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      BEGIN
        ALTER TABLE clinic_integrations ADD COLUMN waba_id TEXT;
      EXCEPTION WHEN duplicate_column THEN
        -- ignore
        NULL;
      END;
      BEGIN
        ALTER TABLE clinic_integrations ADD COLUMN meta JSONB;
      EXCEPTION WHEN duplicate_column THEN
        -- ignore
        NULL;
      END;
    END $$;
  `);

  // Ensure unique index on (clinic_id, provider)
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_clinic_integrations_clinic_provider
      ON clinic_integrations (clinic_id, provider);
  `);

  console.log('[migration] Done.');
}

main()
  .catch((e) => {
    console.error('[migration] Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    try { await prisma.$disconnect(); } catch {}
  });
