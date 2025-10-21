#!/usr/bin/env node
/*
  Migration: Create payment_methods table
  Usage:
    node scripts/migrations/20251016_create_payment_methods.js
*/
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('[migration] Checking if payment_methods exists...');
    const existsRows = await prisma.$queryRawUnsafe(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_methods') AS exists"
    );
    const exists = Array.isArray(existsRows) && (existsRows[0]?.exists === true || existsRows[0]?.exists === 't');
    if (exists) {
      console.log('[migration] payment_methods already exists. Skipping create.');
    } else {
      console.log('[migration] Creating payment_methods...');
      await prisma.$executeRawUnsafe(
        `CREATE TABLE public.payment_methods (
          id TEXT PRIMARY KEY,
          payment_customer_id TEXT NOT NULL,
          provider_card_id TEXT,
          brand TEXT,
          last4 VARCHAR(8),
          exp_month INTEGER,
          exp_year INTEGER,
          is_default BOOLEAN DEFAULT FALSE,
          status VARCHAR(30) DEFAULT 'active',
          raw_payload JSONB,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        )`
      );
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_payment_methods_customer ON public.payment_methods (payment_customer_id)`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_payment_methods_created ON public.payment_methods (created_at)`);
    }
  } catch (e) {
    console.error('[migration] Error creating payment_methods:', e?.message || e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
