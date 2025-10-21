#!/usr/bin/env node
/*
  Migration: Alter payment_transactions add provider_charge_id
  Usage:
    node scripts/migrations/20251016_alter_payment_transactions_add_charge_id.js
*/
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('[migration] Checking payment_transactions table...');
    const existsRows = await prisma.$queryRawUnsafe(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_transactions') AS exists"
    );
    const exists = Array.isArray(existsRows) && (existsRows[0]?.exists === true || existsRows[0]?.exists === 't');
    if (!exists) {
      console.log('[migration] payment_transactions not found. Run 20251015_create_payment_transactions.js first.');
      return;
    }

    // Check if column exists
    const colRows = await prisma.$queryRawUnsafe(
      "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='payment_transactions' AND column_name='provider_charge_id') AS exists"
    );
    const colExists = Array.isArray(colRows) && (colRows[0]?.exists === true || colRows[0]?.exists === 't');
    if (colExists) {
      console.log('[migration] Column provider_charge_id already exists. Skipping.');
    } else {
      console.log('[migration] Adding column provider_charge_id to payment_transactions...');
      await prisma.$executeRawUnsafe(
        'ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS provider_charge_id TEXT'
      );
      console.log('[migration] Column added.');
    }
  } catch (e) {
    console.error('[migration] Error altering payment_transactions:', e?.message || e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
