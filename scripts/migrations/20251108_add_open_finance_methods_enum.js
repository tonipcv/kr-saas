#!/usr/bin/env node
/**
 * Migration: Add OPEN_FINANCE and OPEN_FINANCE_AUTOMATIC to PaymentMethod enum
 * and clean up legacy offer columns when present.
 *
 * - Adds enum values to PostgreSQL enum type backing Prisma enum PaymentMethod
 * - Drops legacy offer columns pix_automatic_enabled and open_finance_enabled if they exist
 *
 * Usage:
 *   node scripts/migrations/20251108_add_open_finance_methods_enum.js --execute
 *   (without --execute runs in dry-run mode)
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function log(...args) { console.log('[add_open_finance_methods_enum]', ...args); }

async function enumTypeName(client) {
  // Try to resolve the postgres enum type name for Prisma enum PaymentMethod
  // Commonly it is "PaymentMethod" (quoted) in Postgres
  const rows = await client.$queryRawUnsafe(
    `SELECT typname FROM pg_type WHERE typcategory = 'E' AND typname ILIKE 'paymentmethod' LIMIT 1`
  );
  const found = Array.isArray(rows) && rows[0]?.typname ? rows[0].typname : 'PaymentMethod';
  return found;
}

async function enumHasLabel(client, typeName, label) {
  const rows = await client.$queryRawUnsafe(
    `SELECT 1
       FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = $1 AND e.enumlabel = $2
      LIMIT 1`,
    String(typeName), String(label)
  ).catch(() => []);
  return Array.isArray(rows) && rows.length > 0;
}

async function addEnumLabel(client, typeName, label, execute) {
  const has = await enumHasLabel(client, typeName, label);
  if (has) { log(`enum '${typeName}' already has value '${label}', skipping`); return false; }
  const sql = `ALTER TYPE "${typeName}" ADD VALUE '${label}'`;
  if (execute) {
    await client.$executeRawUnsafe(sql);
    log(`added enum value '${label}' to '${typeName}'`);
  } else {
    log(`[dry-run] would execute: ${sql}`);
  }
  return true;
}

async function dropColumnIfExists(client, table, column, execute) {
  const existsRows = await client.$queryRawUnsafe(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
      LIMIT 1`,
    String(table), String(column)
  ).catch(() => []);
  const exists = Array.isArray(existsRows) && existsRows.length > 0;
  if (!exists) { log(`column ${table}.${column} does not exist, skipping drop`); return false; }
  const sql = `ALTER TABLE ${table} DROP COLUMN IF EXISTS ${column}`;
  if (execute) {
    await client.$executeRawUnsafe(sql);
    log(`dropped column ${table}.${column}`);
  } else {
    log(`[dry-run] would execute: ${sql}`);
  }
  return true;
}

async function main() {
  const EXECUTE = process.argv.includes('--execute');
  log('Starting migration. Execute =', EXECUTE);

  const typeName = await enumTypeName(prisma);
  log('Detected enum type name =', typeName);

  // Add enum values
  await addEnumLabel(prisma, typeName, 'OPEN_FINANCE', EXECUTE);
  await addEnumLabel(prisma, typeName, 'OPEN_FINANCE_AUTOMATIC', EXECUTE);

  // Cleanup legacy columns on offers (safe if present)
  await dropColumnIfExists(prisma, 'offers', 'pix_automatic_enabled', EXECUTE);
  await dropColumnIfExists(prisma, 'offers', 'open_finance_enabled', EXECUTE);

  log('Migration complete.');
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
