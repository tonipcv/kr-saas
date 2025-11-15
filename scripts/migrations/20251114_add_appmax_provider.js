/*
  Adds 'APPMAX' to the Postgres enum "PaymentProvider" and runs prisma generate.

  Usage:
    node scripts/migrations/20251114_add_appmax_provider.js
*/

const { PrismaClient } = require('@prisma/client');
const { execSync } = require('child_process');

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('— Checking enum values for "PaymentProvider"…');
    const rows = await prisma.$queryRawUnsafe(
      `SELECT e.enumlabel AS value
         FROM pg_type t
         JOIN pg_enum e ON t.oid = e.enumtypid
         JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'PaymentProvider'
        ORDER BY e.enumsortorder`);
    const values = rows.map(r => r.value);
    console.log('Current values:', values);

    if (!values.includes('APPMAX')) {
      console.log('— Adding APPMAX to enum "PaymentProvider"…');
      await prisma.$executeRawUnsafe(`ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'APPMAX';`);
      console.log('✅ APPMAX added to enum');
    } else {
      console.log('ℹ️ APPMAX already present in enum');
    }

    console.log('— Running prisma generate…');
    execSync('npx prisma generate', { stdio: 'inherit' });
    console.log('✅ prisma generate completed');
  } catch (e) {
    console.error('❌ Migration failed:', e?.message || e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
