#!/usr/bin/env node
/*
  Ensures merchants.onboarding_state column exists (JSONB).
  Usage: node scripts/migrations/20250925_fix_merchants_onboarding_state_column.js
*/

const { prisma } = require('../../dist/lib/prisma.js');

async function main() {
  console.log('[migration] Starting: ensure merchants.onboarding_state');

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'merchants' AND column_name = 'onboarding_state'
      ) THEN
        ALTER TABLE merchants ADD COLUMN onboarding_state JSONB;
      END IF;
    END$$;
  `);

  console.log('[migration] Done.');
}

main()
  .catch((e) => { console.error('[migration] Error:', e); process.exit(1); })
  .finally(async () => { try { await prisma.$disconnect(); } catch {} });
