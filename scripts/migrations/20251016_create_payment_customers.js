#!/usr/bin/env node
/*
  Migration: Create payment_customers table
  Usage:
    node scripts/migrations/20251016_create_payment_customers.js
*/
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('[migration] Checking if payment_customers exists...');
    const existsRows = await prisma.$queryRawUnsafe(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_customers') AS exists"
    );
    const exists = Array.isArray(existsRows) && (existsRows[0]?.exists === true || existsRows[0]?.exists === 't');
    if (exists) {
      console.log('[migration] payment_customers already exists. Skipping create.');
    } else {
      console.log('[migration] Creating payment_customers...');
      await prisma.$executeRawUnsafe(
        `CREATE TABLE public.payment_customers (
          id TEXT PRIMARY KEY,
          provider TEXT NOT NULL,
          provider_customer_id TEXT,
          doctor_id TEXT,
          patient_profile_id TEXT,
          clinic_id TEXT,
          raw_payload JSONB,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        )`
      );
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_payment_cust_doctor ON public.payment_customers (doctor_id)`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_payment_cust_profile ON public.payment_customers (patient_profile_id)`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_payment_cust_created ON public.payment_customers (created_at)`);
    }
  } catch (e) {
    console.error('[migration] Error creating payment_customers:', e?.message || e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
