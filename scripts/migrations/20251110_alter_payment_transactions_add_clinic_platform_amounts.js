#!/usr/bin/env node
/*
  Migration: Alter payment_transactions to add clinic/platform amounts, refunded_cents and fee_payer
  Usage:
    node scripts/migrations/20251110_alter_payment_transactions_add_clinic_platform_amounts.js
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

async function addColumnIfMissing(prisma, sql) {
  try {
    await prisma.$executeRawUnsafe(sql);
  } catch (e) {
    // ignore if already exists or not applicable
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('[migration] Start: alter payment_transactions add clinic/platform amounts');

    // Ensure table exists
    const existsRows = await prisma.$queryRawUnsafe(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_transactions') AS exists"
    );
    const exists = Array.isArray(existsRows) && (existsRows[0]?.exists === true || existsRows[0]?.exists === 't');
    if (!exists) {
      console.log('[migration] payment_transactions table not found. Exiting.');
      return;
    }

    // Add columns if missing
    const hasClinicAmount = await columnExists(prisma, 'payment_transactions', 'clinic_amount_cents');
    if (!hasClinicAmount) {
      await addColumnIfMissing(prisma, `ALTER TABLE public.payment_transactions ADD COLUMN clinic_amount_cents BIGINT`);
      console.log('[migration] Added clinic_amount_cents');
    }

    const hasPlatformAmount = await columnExists(prisma, 'payment_transactions', 'platform_amount_cents');
    if (!hasPlatformAmount) {
      await addColumnIfMissing(prisma, `ALTER TABLE public.payment_transactions ADD COLUMN platform_amount_cents BIGINT`);
      console.log('[migration] Added platform_amount_cents');
    }

    const hasRefunded = await columnExists(prisma, 'payment_transactions', 'refunded_cents');
    if (!hasRefunded) {
      await addColumnIfMissing(prisma, `ALTER TABLE public.payment_transactions ADD COLUMN refunded_cents BIGINT`);
      console.log('[migration] Added refunded_cents');
    }

    const hasFeePayer = await columnExists(prisma, 'payment_transactions', 'fee_payer');
    if (!hasFeePayer) {
      await addColumnIfMissing(
        prisma,
        `ALTER TABLE public.payment_transactions ADD COLUMN fee_payer VARCHAR(20) NOT NULL DEFAULT 'clinic'`
      );
      // Add constraint with safe guard
      await addColumnIfMissing(
        prisma,
        `DO $$ BEGIN
           ALTER TABLE public.payment_transactions
             ADD CONSTRAINT payment_transactions_fee_payer_chk CHECK (fee_payer IN ('clinic','platform','split'));
         EXCEPTION WHEN duplicate_object THEN NULL; END $$;`
      );
      console.log('[migration] Added fee_payer + check constraint');
    }

    // Optional: updated_at column already added by 20251106 migration; keep as is.

    console.log('[migration] Done.');
  } catch (e) {
    console.error('[migration] Error:', e?.message || e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
