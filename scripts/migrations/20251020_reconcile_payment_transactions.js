#!/usr/bin/env node
/*
  Reconcile and deduplicate payment_transactions

  Strategies:
  1) Processing vs Paid duplicates (Pagar.me):
     - For each PAID row (provider='pagarme'), delete a matching PROCESSING row (same clinic_id, patient_profile_id, product_id)
       created close in time (within 45 minutes prior to the paid row) that lacks provider_order_id.

  2) Duplicates by provider_order_id (exact duplicates):
     - Keep the newest row (max created_at), delete the others.

  Usage:
    node scripts/migrations/20251020_reconcile_payment_transactions.js --dry-run   # default, prints plan only
    node scripts/migrations/20251020_reconcile_payment_transactions.js --execute   # performs changes
*/

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const argv = new Set(process.argv.slice(2));
const DO_EXECUTE = argv.has('--execute');

function log(...args) {
  console.log('[reconcile-pt]', ...args);
}

async function main() {
  log('Starting reconciliation. Execute =', DO_EXECUTE);

  // 0) Basic sanity checks: ensure table exists
  const meta = await prisma.$queryRawUnsafe(
    `SELECT to_regclass('public.payment_transactions') IS NOT NULL as has_pt`
  ).catch(() => [{ has_pt: false }]);
  if (!meta[0]?.has_pt) {
    throw new Error('payment_transactions table not found');
  }

  // 3) Remove duplicates by provider_charge_id keeping the one with order_id if available, otherwise the most recent
  const dupCharges = await prisma.$queryRawUnsafe(
    `WITH grouped AS (
       SELECT provider, provider_charge_id, COUNT(*) AS cnt
         FROM payment_transactions
        WHERE provider = 'pagarme' AND provider_charge_id IS NOT NULL
        GROUP BY provider, provider_charge_id
       HAVING COUNT(*) > 1
     )
     SELECT pt.id, pt.provider_charge_id, pt.provider_order_id, pt.created_at
       FROM payment_transactions pt
       JOIN grouped g ON g.provider = pt.provider AND g.provider_charge_id = pt.provider_charge_id`
  ).catch(() => []);
  // Group by charge id
  const byCharge = new Map();
  for (const r of dupCharges) {
    const key = r.provider_charge_id;
    if (!byCharge.has(key)) byCharge.set(key, []);
    byCharge.get(key).push(r);
  }
  const deleteIdsByCharge = [];
  for (const [key, rows] of byCharge.entries()) {
    // Prefer the one with provider_order_id; if multiple, keep the newest
    const withOrder = rows.filter(r => r.provider_order_id);
    let keep;
    if (withOrder.length > 0) {
      keep = withOrder.sort((a,b) => new Date(b.created_at) - new Date(a.created_at))[0];
    } else {
      keep = rows.sort((a,b) => new Date(b.created_at) - new Date(a.created_at))[0];
    }
    for (const r of rows) {
      if (r.id !== keep.id) deleteIdsByCharge.push(r.id);
    }
  }
  if (deleteIdsByCharge.length) {
    if (DO_EXECUTE) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM payment_transactions WHERE id = ANY($1::uuid[])`,
        deleteIdsByCharge
      );
    }
    totalDeletedDupByCharge = deleteIdsByCharge.length;
    log('Deleted duplicates by provider_charge_id', { count: totalDeletedDupByCharge });
  }

  let totalDeletedProcessing = 0;
  let totalDeletedDupByOrder = 0;
  let totalDeletedDupByCharge = 0;

  // 1) Find PAID rows in last 7 days to reconcile against PROCESSING rows
  const paidRows = await prisma.$queryRawUnsafe(
    `SELECT id, provider_order_id, provider_charge_id, clinic_id, patient_profile_id, product_id, created_at
       FROM payment_transactions
      WHERE provider = 'pagarme' AND status = 'paid' AND created_at >= NOW() - INTERVAL '7 days'`
  ).catch(() => []);

  for (const paid of paidRows) {
    // Find a processing candidate in a recent window
    const candidates = await prisma.$queryRawUnsafe(
      `SELECT id, created_at
         FROM payment_transactions
        WHERE provider = 'pagarme'
          AND status = 'processing'
          AND clinic_id IS NOT DISTINCT FROM $1
          AND patient_profile_id IS NOT DISTINCT FROM $2
          AND product_id IS NOT DISTINCT FROM $3
          AND provider_order_id IS NULL
          AND created_at BETWEEN ($4::timestamp - INTERVAL '45 minutes') AND $4::timestamp
        ORDER BY created_at DESC
        LIMIT 1`,
      paid.clinic_id || null,
      paid.patient_profile_id || null,
      paid.product_id || null,
      paid.created_at
    ).catch(() => []);

    const proc = candidates[0];
    if (!proc) continue;

    if (DO_EXECUTE) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM payment_transactions WHERE id = $1`,
        String(proc.id)
      );
    }
    totalDeletedProcessing += 1;
    log('Deleted processing duplicate', { processingId: proc.id, paidId: paid.id });
  }

  // 2) Remove duplicates by provider_order_id keeping the most recent
  const dupOrders = await prisma.$queryRawUnsafe(
    `WITH grouped AS (
       SELECT provider, provider_order_id, COUNT(*) AS cnt
         FROM payment_transactions
        WHERE provider = 'pagarme' AND provider_order_id IS NOT NULL
        GROUP BY provider, provider_order_id
       HAVING COUNT(*) > 1
     )
     SELECT pt.id, pt.provider_order_id
       FROM payment_transactions pt
       JOIN grouped g ON g.provider = pt.provider AND g.provider_order_id = pt.provider_order_id
      WHERE pt.created_at < (
        SELECT MAX(created_at) FROM payment_transactions x
         WHERE x.provider = pt.provider AND x.provider_order_id = pt.provider_order_id
      )`
  ).catch(() => []);

  const toDeleteByOrder = dupOrders.map(r => r.id);
  if (toDeleteByOrder.length) {
    if (DO_EXECUTE) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM payment_transactions WHERE id = ANY($1::uuid[])`,
        toDeleteByOrder
      );
    }
    totalDeletedDupByOrder = toDeleteByOrder.length;
    log('Deleted older duplicates by provider_order_id', { count: totalDeletedDupByOrder });
  }

  log('Summary:', {
    deleted_processing: totalDeletedProcessing,
    deleted_by_order_id: totalDeletedDupByOrder,
    deleted_by_charge_id: totalDeletedDupByCharge,
    executed: DO_EXECUTE,
  });
}

main()
  .then(async () => {
    log('Done');
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[reconcile-pt] ERROR', err?.message || err);
    await prisma.$disconnect();
    process.exit(1);
  });
