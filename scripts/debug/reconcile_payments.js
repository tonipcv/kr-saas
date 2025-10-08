#!/usr/bin/env node
/*
  Reconciliation script: checks pending/processing payment_transactions (PIX/Card)
  against Pagar.me Orders and updates statuses accordingly.

  Usage:
    node scripts/debug/reconcile_payments.js
    LIMIT=50 SINCE_HOURS=72 node scripts/debug/reconcile_payments.js
*/

const { prisma } = require('../../dist/lib/prisma.js');
let pagarme;

async function ensurePagarme() {
  try {
    pagarme = require('../../dist/lib/pagarme.js');
  } catch (e) {
    console.error('[reconcile] Could not load pagarme lib from dist/lib/pagarme.js. Build the project first.');
    throw e;
  }
}

function mapStatus(raw) {
  const s = String(raw || '').toLowerCase();
  const map = {
    paid: 'paid',
    approved: 'paid',
    captured: 'paid',
    canceled: 'canceled',
    cancelled: 'canceled',
    refused: 'refused',
    failed: 'failed',
    processing: 'processing',
    pending: 'pending',
  };
  return map[s] || (s || null);
}

async function listCandidates(limit, sinceHours) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT id, provider_order_id, status, payment_method_type
       FROM payment_transactions
      WHERE provider = 'pagarme'
        AND status IN ('processing','pending')
        AND created_at > now() - interval '${sinceHours} hours'
      ORDER BY created_at DESC
      LIMIT ${Number(limit) || 50}`
  );
  return rows;
}

async function reconcileOne(row) {
  const orderId = row.provider_order_id;
  if (!orderId) return false;
  const order = await pagarme.pagarmeGetOrder(orderId);
  const pay = Array.isArray(order?.payments) ? order.payments[0] : null;
  const raw = pay?.status || order?.status || null;
  const mapped = mapStatus(raw);
  if (!mapped) return false;
  if (mapped === row.status) return false;

  await prisma.$executeRawUnsafe(
    `UPDATE payment_transactions
       SET status = $2, raw_webhook = $3, updated_at = NOW()
     WHERE provider = 'pagarme' AND provider_order_id = $1`,
    String(orderId),
    mapped,
    JSON.stringify(order)
  );
  console.log('[reconcile] updated', { id: row.id, orderId, from: row.status, to: mapped });
  return true;
}

async function main() {
  await ensurePagarme();
  const limit = process.env.LIMIT || 50;
  const since = process.env.SINCE_HOURS || 72;
  console.log('[reconcile] starting', { limit, since });
  const rows = await listCandidates(limit, since);
  console.log('[reconcile] candidates:', rows.length);
  let updated = 0;
  for (const r of rows) {
    try { if (await reconcileOne(r)) updated++; } catch (e) { console.warn('[reconcile] skip', r.id, e?.message || e); }
  }
  console.log('[reconcile] done', { updated, checked: rows.length });
}

main()
  .catch((e) => { console.error('[reconcile] error', e); process.exit(1); })
  .finally(async () => { try { await prisma.$disconnect(); } catch {} });
