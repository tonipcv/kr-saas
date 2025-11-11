#!/usr/bin/env node
/*
 * Run Prisma migration for merchant onboarding schema changes.
 * - Uses: `npx prisma migrate dev --name merchant_onboarding`
 * - Loads .env automatically so DATABASE_URL is available
 */
const { execSync } = require('child_process');
const path = require('path');

// Load .env (and .env.local if present)
try {
  const dotenv = require('dotenv');
  const envPath = path.resolve(process.cwd(), '.env');
  dotenv.config({ path: envPath });
  // Optional: .env.local overrides
  try { dotenv.config({ path: path.resolve(process.cwd(), '.env.local') }); } catch {}
} catch {}

function run(cmd) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', env: process.env });
}

function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('ERROR: DATABASE_URL is not set. Please configure your .env before running migrations.');
    console.error(`Tried loading from: ${path.resolve(process.cwd(), '.env')} (and .env.local if present)`);
    process.exit(1);
  }

  try {
    // Apply migration based on current prisma/schema.prisma
    run('npx prisma migrate dev --name merchant_onboarding');
    console.log('\nMigration completed successfully.');
  } catch (err) {
    console.error('\nMigration failed:', err?.message || err);
    process.exit(1);
  }
}

main();
