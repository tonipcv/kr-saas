#!/usr/bin/env node
/*
  Migration: Normalize customers.merchant_id vs "merchantId" (idempotent)
  - Ensures snake_case column exists and is populated
  - Backfills from camelCase column when needed
  Usage:
    node scripts/migrations/20251119_fix_customers_merchant_id.js
*/
const { PrismaClient } = require('@prisma/client');

async function columnExists(prisma, table, column) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns 
       WHERE table_schema='public' AND table_name=$1 AND column_name=$2
     ) AS exists`,
    table,
    column
  );
  return Array.isArray(rows) && (rows[0]?.exists === true || rows[0]?.exists === 't');
}

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('[migration][customers.merchant_id] starting');

    const tableRows = await prisma.$queryRawUnsafe(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='customers') AS exists"
    );
    const tableExists = Array.isArray(tableRows) && (tableRows[0]?.exists === true || tableRows[0]?.exists === 't');
    if (!tableExists) {
      console.error('[migration][customers.merchant_id] table public.customers does not exist. Aborting.');
      process.exitCode = 1;
      return;
    }

    const hasSnake = await columnExists(prisma, 'customers', 'merchant_id');
    const hasCamel = await columnExists(prisma, 'customers', 'merchantId');

    if (!hasSnake) {
      console.log('[migration][customers.merchant_id] adding column merchant_id (TEXT NULL)...');
      await prisma.$executeRawUnsafe('ALTER TABLE public.customers ADD COLUMN merchant_id TEXT');
    } else {
      console.log('[migration][customers.merchant_id] column merchant_id already exists.');
    }

    // Backfill merchant_id from merchantId when merchant_id is NULL and camel exists
    if (hasCamel) {
      console.log('[migration][customers.merchant_id] backfilling merchant_id from "merchantId" where NULL...');
      await prisma.$executeRawUnsafe('UPDATE public.customers SET merchant_id = "merchantId" WHERE merchant_id IS NULL AND "merchantId" IS NOT NULL');
    } else {
      console.log('[migration][customers.merchant_id] camel column merchantId not present, skipping backfill from camel.');
    }

    // Optional: if merchant_id still NULL, keep NULL (do NOT enforce NOT NULL here for safety)
    // Create useful indexes on snake_case if missing
    const idxRows = await prisma.$queryRawUnsafe(`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='customers'`);
    const indexNames = (idxRows || []).map(r => r.indexname);

    if (!indexNames.includes('customers_merchant_id_email_idx')) {
      console.log('[migration][customers.merchant_id] creating index customers_merchant_id_email_idx...');
      await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS customers_merchant_id_email_idx ON public.customers (merchant_id, email)');
    }
    if (!indexNames.includes('customers_merchant_id_phone_idx')) {
      console.log('[migration][customers.merchant_id] creating index customers_merchant_id_phone_idx...');
      await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS customers_merchant_id_phone_idx ON public.customers (merchant_id, phone)');
    }

    console.log('[migration][customers.merchant_id] done ✅');
  } catch (e) {
    console.error('[migration][customers.merchant_id] error:', e?.message || e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
