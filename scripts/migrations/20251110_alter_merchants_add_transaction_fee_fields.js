#!/usr/bin/env node
/*
  Migration: Alter merchants to add transaction fee fields
  - transaction_fee_cents INT DEFAULT 0
  - transaction_fee_type  VARCHAR(20) DEFAULT 'flat'

  Usage:
    node scripts/migrations/20251110_alter_merchants_add_transaction_fee_fields.js
*/
const { PrismaClient } = require('@prisma/client');

async function columnExists(prisma, table, column) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2 LIMIT 1`,
    table,
    column
  ).catch(() => []);
  return Array.isArray(rows) && rows.length > 0;
}

async function exec(prisma, sql) {
  try { await prisma.$executeRawUnsafe(sql); } catch (e) { /* ignore */ }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('[migration] Start: alter merchants add transaction fee fields');
    // Ensure table exists
    const existsRows = await prisma.$queryRawUnsafe(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'merchants') AS exists"
    );
    const exists = Array.isArray(existsRows) && (existsRows[0]?.exists === true || existsRows[0]?.exists === 't');
    if (!exists) {
      console.log('[migration] merchants table not found. Exiting.');
      return;
    }

    if (!(await columnExists(prisma, 'merchants', 'transaction_fee_cents'))) {
      await exec(prisma, `ALTER TABLE public.merchants ADD COLUMN transaction_fee_cents INTEGER DEFAULT 0`);
      console.log('[migration] Added merchants.transaction_fee_cents');
    }
    if (!(await columnExists(prisma, 'merchants', 'transaction_fee_type'))) {
      await exec(prisma, `ALTER TABLE public.merchants ADD COLUMN transaction_fee_type VARCHAR(20) DEFAULT 'flat'`);
      await exec(prisma, `DO $$ BEGIN
        ALTER TABLE public.merchants
          ADD CONSTRAINT merchants_transaction_fee_type_chk CHECK (transaction_fee_type IN ('flat','percent','hybrid'));
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
      console.log('[migration] Added merchants.transaction_fee_type + check');
    }

    console.log('[migration] Done.');
  } catch (e) {
    console.error('[migration] Error:', e?.message || e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
