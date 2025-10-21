#!/usr/bin/env node
/*
  Migration: Add unique indexes for payment_transactions idempotency
  Usage:
    node scripts/migrations/20251020_add_unique_indexes_payment_transactions.js
*/
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('[migration] Ensuring unique/idempotent indexes for payment_transactions...');

    // Check table existence before creating indexes
    const tables = await prisma.$queryRawUnsafe(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('payment_transactions')`
    );
    const hasPT = Array.isArray(tables) && tables.some((r) => r.table_name === 'payment_transactions');

    if (!hasPT) {
      console.warn('[migration] payment_transactions table not found. Run 20251015_create_payment_transactions.js first.');
      return;
    }

    // Unique by provider + provider_order_id when order id is present
    console.log('[migration] Creating unique index on (provider, provider_order_id) where provider_order_id is not null...');
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_tx_provider_order
       ON public.payment_transactions (provider, provider_order_id)
       WHERE provider_order_id IS NOT NULL`
    );

    // Unique by provider + provider_charge_id when charge id is present
    console.log('[migration] Creating unique index on (provider, provider_charge_id) where provider_charge_id is not null...');
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_tx_provider_charge
       ON public.payment_transactions (provider, provider_charge_id)
       WHERE provider_charge_id IS NOT NULL`
    );

    console.log('[migration] payment_transactions unique indexes ensured successfully.');
  } catch (e) {
    console.error('[migration] Error creating unique indexes for payment_transactions:', e?.message || e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
