#!/usr/bin/env node
/*
  Backfill: Populate clinic_amount_cents and platform_amount_cents in payment_transactions
  Strategy (Phase 1, approximate):
    - For rows where clinic_amount_cents/platform_amount_cents are NULL
    - Compute from amount_cents using clinic's merchant.splitPercent (fallback 70)
    - Do not modify rows where these columns are already populated
  Usage:
    node scripts/migrations/20251110_backfill_payment_transactions_clinic_platform_amounts.js
*/
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  const BATCH = 500;
  try {
    console.log('[backfill] Start clinic/platform amounts for payment_transactions');

    // Guard: table exists?
    const existsRows = await prisma.$queryRawUnsafe(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_transactions') AS exists"
    );
    const exists = Array.isArray(existsRows) && (existsRows[0]?.exists === true || existsRows[0]?.exists === 't');
    if (!exists) {
      console.log('[backfill] payment_transactions not found. Exiting.');
      return;
    }

    // Helper cache for clinic split percents
    const splitCache = new Map(); // clinicId -> splitPercent
    async function getSplitPercent(clinicId) {
      if (!clinicId) return 70;
      if (splitCache.has(clinicId)) return splitCache.get(clinicId);
      let p = 70;
      try {
        const m = await prisma.merchant.findFirst({ where: { clinicId: String(clinicId) }, select: { splitPercent: true } });
        if (m && m.splitPercent != null) p = Math.max(0, Math.min(100, Number(m.splitPercent)));
      } catch {}
      splitCache.set(clinicId, p);
      return p;
    }

    let total = 0;
    while (true) {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT id, clinic_id, amount_cents
           FROM payment_transactions
          WHERE clinic_amount_cents IS NULL OR platform_amount_cents IS NULL
          ORDER BY created_at ASC
          LIMIT ${BATCH}`
      );
      if (!rows || rows.length === 0) break;

      for (const r of rows) {
        const id = String(r.id);
        const clinicId = r.clinic_id ? String(r.clinic_id) : null;
        const amountCents = Number(r.amount_cents || 0);
        if (!Number.isFinite(amountCents) || amountCents <= 0) {
          // still set zeros to avoid reprocessing endlessly
          try {
            await prisma.$executeRawUnsafe(
              `UPDATE payment_transactions
                  SET clinic_amount_cents = COALESCE(clinic_amount_cents, 0),
                      platform_amount_cents = COALESCE(platform_amount_cents, 0),
                      updated_at = NOW()
                WHERE id = $1`,
              id
            );
            total += 1;
          } catch {}
          continue;
        }
        const splitPercent = await getSplitPercent(clinicId);
        const clinicAmt = Math.round(amountCents * (splitPercent / 100));
        const platformAmt = Math.max(0, amountCents - clinicAmt);
        try {
          await prisma.$executeRawUnsafe(
            `UPDATE payment_transactions
                SET clinic_amount_cents = COALESCE(clinic_amount_cents, $2::bigint),
                    platform_amount_cents = COALESCE(platform_amount_cents, $3::bigint),
                    updated_at = NOW()
              WHERE id = $1`,
            id,
            clinicAmt,
            platformAmt
          );
          total += 1;
        } catch (e) {
          console.warn('[backfill] update failed', id, e?.message || e);
        }
      }

      console.log(`[backfill] processed batch: ${rows.length}, total ${total}`);
      if (rows.length < BATCH) break;
    }

    console.log('[backfill] Done. Rows touched:', total);
  } catch (e) {
    console.error('[backfill] Error:', e?.message || e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
