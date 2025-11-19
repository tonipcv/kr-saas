#!/usr/bin/env node
/*
  Migration: Add customers.merchantId column and indexes (idempotent)
  Usage:
    node scripts/migrations/20251119_add_customers_merchantId.js
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

async function indexExists(prisma, indexName) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT EXISTS (
       SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname=$1
     ) AS exists`,
    indexName
  );
  return Array.isArray(rows) && (rows[0]?.exists === true || rows[0]?.exists === 't');
}

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('[migration][customers.merchantId] starting');

    // 1) Ensure table exists
    const tableRows = await prisma.$queryRawUnsafe(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='customers') AS exists"
    );
    const tableExists = Array.isArray(tableRows) && (tableRows[0]?.exists === true || tableRows[0]?.exists === 't');
    if (!tableExists) {
      console.error('[migration][customers.merchantId] table public.customers does not exist. Aborting.');
      process.exitCode = 1;
      return;
    }

    // 2) Add column merchantId if missing (nullable for safe rollout)
    const hasCol = await columnExists(prisma, 'customers', 'merchantId');
    if (!hasCol) {
      console.log('[migration][customers.merchantId] adding column merchantId (TEXT NULL)...');
      await prisma.$executeRawUnsafe('ALTER TABLE public.customers ADD COLUMN "merchantId" TEXT');
      console.log('[migration][customers.merchantId] column added');
    } else {
      console.log('[migration][customers.merchantId] column already exists. Skipping.');
    }

    // 3) Create indexes matching Prisma schema @@index([merchantId, email]) and @@index([merchantId, phone])
    if (!(await indexExists(prisma, 'customers_merchantId_email_idx'))) {
      console.log('[migration][customers.merchantId] creating index customers_merchantId_email_idx...');
      await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS customers_merchantId_email_idx ON public.customers ("merchantId", email)');
    }
    if (!(await indexExists(prisma, 'customers_merchantId_phone_idx'))) {
      console.log('[migration][customers.merchantId] creating index customers_merchantId_phone_idx...');
      await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS customers_merchantId_phone_idx ON public.customers ("merchantId", phone)');
    }

    console.log('[migration][customers.merchantId] done ✅');
  } catch (e) {
    console.error('[migration][customers.merchantId] error:', e?.message || e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
