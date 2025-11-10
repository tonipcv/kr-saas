#!/usr/bin/env node
/*
  Migration: Alter payment_transactions to add platform_fee_cents
  Usage:
    node scripts/migrations/20251110_alter_payment_transactions_add_platform_fee_cents.js
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

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('[migration] Start: alter payment_transactions add platform_fee_cents');
    const existsRows = await prisma.$queryRawUnsafe(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_transactions') AS exists"
    );
    const exists = Array.isArray(existsRows) && (existsRows[0]?.exists === true || existsRows[0]?.exists === 't');
    if (!exists) {
      console.log('[migration] payment_transactions table not found. Exiting.');
      return;
    }

    const hasPlatformFee = await columnExists(prisma, 'payment_transactions', 'platform_fee_cents');
    if (!hasPlatformFee) {
      await prisma.$executeRawUnsafe(`ALTER TABLE public.payment_transactions ADD COLUMN platform_fee_cents BIGINT`);
      console.log('[migration] Added platform_fee_cents');
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
