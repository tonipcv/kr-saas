#!/usr/bin/env node
/*
  Fix merchants.status column to use a native Postgres enum matching Prisma enum MerchantStatus.
  Usage: node scripts/migrations/20250925_fix_merchants_status_enum.js
*/

const { prisma } = require('../../dist/lib/prisma.js');

async function main() {
  console.log('[migration] Starting: fix merchants.status enum');

  // 1) Create enum type if not exists
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MerchantStatus') THEN
        CREATE TYPE "MerchantStatus" AS ENUM ('PENDING','ACTIVE','REJECTED','DISABLED');
      END IF;
    END$$;
  `);

  // 2) Drop old CHECK constraint if it exists (from previous VARCHAR approach)
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'merchants_status_chk' AND conrelid = 'merchants'::regclass
      ) THEN
        ALTER TABLE merchants DROP CONSTRAINT merchants_status_chk;
      END IF;
    END$$;
  `);

  // 3) Prepare column for enum cast: drop default, normalize values, then cast, then set default
  await prisma.$executeRawUnsafe(`ALTER TABLE merchants ALTER COLUMN status DROP DEFAULT;`);

  // Ensure all values are one of the allowed set; if any null/invalid, set to 'PENDING'
  await prisma.$executeRawUnsafe(`
    UPDATE merchants
    SET status = 'PENDING'
    WHERE status IS NULL OR status NOT IN ('PENDING','ACTIVE','REJECTED','DISABLED');
  `);

  // Convert to enum
  await prisma.$executeRawUnsafe(`
    ALTER TABLE merchants
    ALTER COLUMN status TYPE "MerchantStatus" USING status::text::"MerchantStatus";
  `);

  // Restore default
  await prisma.$executeRawUnsafe(`
    ALTER TABLE merchants ALTER COLUMN status SET DEFAULT 'PENDING'::"MerchantStatus";
  `);

  console.log('[migration] Done.');
}

main()
  .catch((e) => { console.error('[migration] Error:', e); process.exit(1); })
  .finally(async () => { try { await prisma.$disconnect(); } catch {} });
