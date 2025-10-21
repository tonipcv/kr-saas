#!/usr/bin/env node
/*
  Migration: Add unique indexes for payment_customers and payment_methods
  Usage:
    node scripts/migrations/20251020_add_unique_indexes_payment_customers_methods.js
*/
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('[migration] Ensuring unique indexes for payment_customers/payment_methods...');

    // Check table existence before creating indexes
    const tables = await prisma.$queryRawUnsafe(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('payment_customers','payment_methods')`
    );
    const hasPC = Array.isArray(tables) && tables.some((r) => r.table_name === 'payment_customers');
    const hasPM = Array.isArray(tables) && tables.some((r) => r.table_name === 'payment_methods');

    if (hasPC) {
      console.log('[migration] Creating unique index on payment_customers (doctor_id, patient_profile_id, provider)...');
      await prisma.$executeRawUnsafe(
        `CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_customers_doctor_profile_provider
         ON public.payment_customers (doctor_id, patient_profile_id, provider)`
      );
    } else {
      console.warn('[migration] Skipping payment_customers index (table not found).');
    }

    if (hasPM) {
      console.log('[migration] Creating unique index on payment_methods (payment_customer_id, provider_card_id)...');
      await prisma.$executeRawUnsafe(
        `CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_methods_customer_card
         ON public.payment_methods (payment_customer_id, provider_card_id)`
      );
    } else {
      console.warn('[migration] Skipping payment_methods index (table not found).');
    }

    console.log('[migration] Unique indexes ensured successfully.');
  } catch (e) {
    console.error('[migration] Error creating unique indexes:', e?.message || e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
