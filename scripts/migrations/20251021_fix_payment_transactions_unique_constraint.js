#!/usr/bin/env node
/*
  Migration: Fix payment_transactions unique constraint for ON CONFLICT
  The partial index doesn't work with ON CONFLICT (col1, col2) syntax.
  We need a proper unique constraint.
  
  Usage:
    node scripts/migrations/20251021_fix_payment_transactions_unique_constraint.js
*/
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('[migration] Fixing payment_transactions unique constraint for ON CONFLICT...');

    // Check table existence
    const tables = await prisma.$queryRawUnsafe(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_transactions'`
    );
    const hasPT = Array.isArray(tables) && tables.length > 0;

    if (!hasPT) {
      console.warn('[migration] payment_transactions table not found. Skipping.');
      return;
    }

    // Drop the partial index if it exists
    console.log('[migration] Dropping partial unique index if exists...');
    await prisma.$executeRawUnsafe(
      `DROP INDEX IF EXISTS ux_payment_tx_provider_order`
    );

    // Add a proper unique constraint (this works with ON CONFLICT)
    // We'll use a unique constraint that allows NULL values to coexist
    // but prevents duplicate non-NULL combinations
    console.log('[migration] Adding unique constraint on (provider, provider_order_id)...');
    await prisma.$executeRawUnsafe(
      `ALTER TABLE payment_transactions 
       DROP CONSTRAINT IF EXISTS ux_payment_tx_provider_order_id`
    );
    
    // Create the unique constraint
    // Note: In PostgreSQL, multiple NULLs are allowed in unique constraints
    await prisma.$executeRawUnsafe(
      `ALTER TABLE payment_transactions 
       ADD CONSTRAINT ux_payment_tx_provider_order_id 
       UNIQUE (provider, provider_order_id)`
    );

    console.log('[migration] payment_transactions unique constraint fixed successfully.');
  } catch (e) {
    console.error('[migration] Error fixing unique constraint:', e?.message || e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
