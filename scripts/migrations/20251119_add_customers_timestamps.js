#!/usr/bin/env node
/*
  Migration: Add customers.createdAt/updatedAt columns (idempotent)
  Usage:
    node scripts/migrations/20251119_add_customers_timestamps.js
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
    console.log('[migration][customers.timestamps] starting');

    // Ensure table exists
    const tableRows = await prisma.$queryRawUnsafe(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='customers') AS exists"
    );
    const tableExists = Array.isArray(tableRows) && (tableRows[0]?.exists === true || tableRows[0]?.exists === 't');
    if (!tableExists) {
      console.error('[migration][customers.timestamps] table public.customers does not exist. Aborting.');
      process.exitCode = 1;
      return;
    }

    // Add createdAt if missing
    const hasCreatedAt = await columnExists(prisma, 'customers', 'createdAt');
    if (!hasCreatedAt) {
      console.log('[migration][customers.timestamps] adding column createdAt...');
      await prisma.$executeRawUnsafe('ALTER TABLE public.customers ADD COLUMN "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()');
    } else {
      console.log('[migration][customers.timestamps] createdAt already exists. Skipping.');
    }

    // Add updatedAt if missing
    const hasUpdatedAt = await columnExists(prisma, 'customers', 'updatedAt');
    if (!hasUpdatedAt) {
      console.log('[migration][customers.timestamps] adding column updatedAt...');
      await prisma.$executeRawUnsafe('ALTER TABLE public.customers ADD COLUMN "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()');
    } else {
      console.log('[migration][customers.timestamps] updatedAt already exists. Skipping.');
    }

    console.log('[migration][customers.timestamps] done ✅');
  } catch (e) {
    console.error('[migration][customers.timestamps] error:', e?.message || e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
