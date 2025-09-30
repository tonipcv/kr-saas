#!/usr/bin/env node
/*
  Creates merchants table to store Pagar.me integration state per clinic.
  Usage: node scripts/migrations/20250925_create_merchants.js
*/

const { prisma } = require('../../dist/lib/prisma.js');

async function main() {
  console.log('[migration] Starting: create merchants');

  // Create merchants table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS merchants (
      id TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
      clinic_id TEXT NOT NULL UNIQUE,
      status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
      recipient_id TEXT,
      external_account_id TEXT,
      onboarding_state JSONB,
      split_percent INTEGER NOT NULL DEFAULT 100,
      platform_fee_bps INTEGER NOT NULL DEFAULT 0,
      last_sync_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT merchants_status_chk CHECK (status IN ('PENDING','ACTIVE','REJECTED','DISABLED'))
    );
  `);

  // FK and helpful indexes
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'merchants_clinic_id_fkey'
      ) THEN
        ALTER TABLE merchants
          ADD CONSTRAINT merchants_clinic_id_fkey
          FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE CASCADE;
      END IF;
    END$$;
  `);

  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_merchants_status ON merchants (status);`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_merchants_updated_at ON merchants (updated_at DESC);`);

  console.log('[migration] Done.');
}

main()
  .catch((e) => { console.error('[migration] Error:', e); process.exit(1); })
  .finally(async () => { try { await prisma.$disconnect(); } catch {} });
