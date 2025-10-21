#!/usr/bin/env node
/*
  Migration: Create payment_transactions table
  Usage:
    node scripts/migrations/20251015_create_payment_transactions.js
*/
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('[migration] Checking if payment_transactions exists...');
    const existsRows = await prisma.$queryRawUnsafe(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_transactions') AS exists"
    );
    const exists = Array.isArray(existsRows) && (existsRows[0]?.exists === true || existsRows[0]?.exists === 't');
    if (exists) {
      console.log('[migration] payment_transactions already exists. Skipping create.');
      return;
    }

    console.log('[migration] Creating payment_transactions...');
    await prisma.$executeRawUnsafe(
      `CREATE TABLE public.payment_transactions (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        provider_order_id TEXT,
        doctor_id TEXT,
        patient_profile_id TEXT,
        clinic_id TEXT,
        product_id TEXT,
        amount_cents INTEGER NOT NULL DEFAULT 0,
        currency VARCHAR(10) NOT NULL DEFAULT 'BRL',
        installments INTEGER,
        payment_method_type VARCHAR(30),
        status VARCHAR(30) NOT NULL DEFAULT 'processing',
        raw_payload JSONB,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )`
    );
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_payment_tx_doctor ON public.payment_transactions (doctor_id)`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_payment_tx_product ON public.payment_transactions (product_id)`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_payment_tx_created ON public.payment_transactions (created_at)`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_payment_tx_provider_order ON public.payment_transactions (provider_order_id)`);

    console.log('[migration] payment_transactions created successfully.');
  } catch (e) {
    console.error('[migration] Error creating payment_transactions:', e?.message || e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
