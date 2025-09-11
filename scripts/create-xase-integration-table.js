// Creates the clinic_integrations table for Xase.ai integration
// Usage: node scripts/create-xase-integration-table.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('[XASE MIGRATION] Starting creation of clinic_integrations table...');
  try {
    // Enable pgcrypto if needed for gen_random_uuid in some Postgres setups
    try {
      await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
      console.log('[XASE MIGRATION] Ensured extension pgcrypto exists.');
    } catch (e) {
      console.log('[XASE MIGRATION] Skipping pgcrypto extension:', e.message);
    }

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
    console.log('[XASE MIGRATION] Table clinic_integrations ensured.');

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_clinic_integrations_clinic_provider
      ON clinic_integrations (clinic_id, provider);
    `);
    console.log('[XASE MIGRATION] Unique index ensured.');

    console.log('[XASE MIGRATION] Done.');
  } catch (err) {
    console.error('[XASE MIGRATION] Failed:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
