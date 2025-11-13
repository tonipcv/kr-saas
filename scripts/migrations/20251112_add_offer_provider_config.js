/*
  Add JSONB column provider_config to offers table for MVP per-provider configuration.

  Usage:
    node scripts/migrations/20251112_add_offer_provider_config.js
*/

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function columnExists(table, column) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    table,
    column
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function up() {
  try {
    const exists = await columnExists('offers', 'provider_config');
    if (!exists) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE offers ADD COLUMN provider_config JSONB NULL`
      );
      console.log('✅ Added column offers.provider_config (JSONB)');
    } else {
      console.log('ℹ️ Column offers.provider_config already exists');
    }
  } catch (e) {
    console.error('❌ Migration failed:', e?.message || e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

up();
