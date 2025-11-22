#!/usr/bin/env node
/*
  Adds the 'PENDING' value to the Postgres enum "SubscriptionStatus".
  Safe to run multiple times (idempotent).
*/

const { Client } = require('pg');
const path = require('path');
const fs = require('fs');

// Load .env if present
try {
  const dotenvPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(dotenvPath)) {
    require('dotenv').config({ path: dotenvPath });
  }
} catch {}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('[migrate] DATABASE_URL not set');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();

    // Ensure the enum type exists
    const typeRes = await client.query(
      `SELECT 1 FROM pg_type WHERE typname = 'SubscriptionStatus'`
    );
    if (!typeRes.rowCount) {
      console.error('[migrate] Enum type "SubscriptionStatus" not found. Aborting.');
      process.exit(2);
    }

    // Check if value already exists
    const valRes = await client.query(
      `SELECT e.enumlabel
         FROM pg_type t
         JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE t.typname = 'SubscriptionStatus' AND e.enumlabel = 'PENDING'`
    );

    if (valRes.rowCount > 0) {
      console.log('[migrate] Value PENDING already exists in "SubscriptionStatus". Nothing to do.');
      process.exit(0);
    }

    // Add value to enum. Avoid wrapping in a transaction for broader Postgres compatibility.
    console.log('[migrate] Adding PENDING to enum "SubscriptionStatus"...');
    await client.query(`ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'PENDING'`);
    console.log('[migrate] Done.');
  } catch (err) {
    console.error('[migrate] Failed:', err?.message || err);
    process.exit(3);
  } finally {
    try { await client.end(); } catch {}
  }
}

main();
