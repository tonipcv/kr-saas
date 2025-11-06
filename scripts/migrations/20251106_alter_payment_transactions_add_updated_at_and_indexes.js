#!/usr/bin/env node
/*
 * Migration: Add updated_at and useful indexes to payment_transactions (idempotent)
 *
 * - Adds column updated_at timestamptz with default now()
 * - Backfills updated_at with created_at when null
 * - Creates indexes if missing:
 *     pt_updated_idx on (updated_at)
 *     pt_status_idx on (status)
 *     pt_provider_order_idx on (provider, provider_order_id)
 *     pt_provider_charge_idx on (provider, provider_charge_id)
 */
const { PrismaClient } = require('@prisma/client');

async function ensureIndex(prisma, name, ddl) {
  const rows = await prisma.$queryRawUnsafe(
    "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='i' AND c.relname=$1 AND n.nspname='public' LIMIT 1",
    name
  );
  const exists = Array.isArray(rows) && rows.length > 0;
  if (!exists) {
    console.log('[migration] creating index', name);
    await prisma.$executeRawUnsafe(ddl);
  } else {
    console.log('[migration] index already exists', name);
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('[migration] Start: payment_transactions add updated_at and indexes');

    // Check table exists
    const tbl = await prisma.$queryRawUnsafe(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='payment_transactions') AS exists"
    );
    const tableExists = Array.isArray(tbl) && (tbl[0]?.exists === true || tbl[0]?.exists === 't');
    if (!tableExists) {
      console.log('[migration] payment_transactions not found. Skipping.');
      return;
    }

    // Add updated_at column if not exists
    await prisma.$executeRawUnsafe(
      "ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT NOW()"
    );

    // Backfill updated_at from created_at when null
    await prisma.$executeRawUnsafe(
      "UPDATE public.payment_transactions SET updated_at = COALESCE(updated_at, created_at) WHERE updated_at IS NULL"
    );

    // Create indexes if missing
    await ensureIndex(prisma, 'pt_updated_idx', "CREATE INDEX pt_updated_idx ON public.payment_transactions(updated_at)");
    await ensureIndex(prisma, 'pt_status_idx', "CREATE INDEX pt_status_idx ON public.payment_transactions(status)");
    await ensureIndex(prisma, 'pt_provider_order_idx', "CREATE INDEX pt_provider_order_idx ON public.payment_transactions(provider, provider_order_id)");
    await ensureIndex(prisma, 'pt_provider_charge_idx', "CREATE INDEX pt_provider_charge_idx ON public.payment_transactions(provider, provider_charge_id)");

    console.log('[migration] Done');
  } catch (e) {
    console.error('[migration] Error:', e?.message || e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
