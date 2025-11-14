/*
  Simple Node worker to process webhook_events without ts-node/tsx.
  Usage: node scripts/webhook_worker.js
*/

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function handleStripe(evRow) {
  try {
    const ev = evRow.raw || {};
    const type = String(evRow.type || '').toLowerCase();
    const obj = (ev && ev.data && ev.data.object) ? ev.data.object : {};
    const idStr = (v) => (typeof v === 'string' ? v : null);
    const startsWith = (s, p) => (typeof s === 'string' && s.startsWith(p));

    let piId = null;
    if (startsWith(obj && obj.id, 'pi_')) piId = String(obj.id);
    if (!piId && idStr(obj && obj.payment_intent)) piId = String(obj.payment_intent);

    let chargeId = null;
    if (startsWith(obj && obj.id, 'ch_')) chargeId = String(obj.id);
    if (!chargeId && idStr(obj && obj.charge)) chargeId = String(obj.charge);

    if (type === 'payment_intent.succeeded' && piId) {
      const meta = (obj && obj.metadata) ? obj.metadata : {};
      const clinicIdMeta = (meta && (meta.clinicId || meta.clinic_id)) ? String(meta.clinicId || meta.clinic_id) : null;
      const productIdMeta = (meta && (meta.productId || meta.product_id)) ? String(meta.productId || meta.product_id) : null;
      const updated = await prisma.$executeRawUnsafe(
        `UPDATE payment_transactions
           SET status = CASE WHEN status IN ('pending','processing') THEN 'paid' ELSE status END,
               paid_at = COALESCE(paid_at, NOW()),
               raw_payload = $2::jsonb,
               clinic_id = COALESCE(clinic_id, $3),
               product_id = COALESCE(product_id, $4),
               updated_at = NOW()
         WHERE provider = 'stripe' AND provider_order_id = $1`,
        String(piId), JSON.stringify(ev), clinicIdMeta, productIdMeta
      );
      if (!updated || Number(updated) === 0) {
        // Insert placeholder if no row exists (idempotent)
        const txId = `wh_${piId}_${Date.now()}`;
        const amt = (typeof obj.amount === 'number' ? obj.amount : (typeof obj.amount_received === 'number' ? obj.amount_received : 0));
        const curr = (obj.currency ? String(obj.currency).toUpperCase() : 'USD');
        await prisma.$executeRawUnsafe(
          `INSERT INTO payment_transactions (
             id, provider, provider_order_id, status, amount_cents, currency, raw_payload, created_at, paid_at, routed_provider, clinic_id, product_id
           ) VALUES (
             $1, 'stripe', $2, 'paid', $3, $4, $5::jsonb, NOW(), NOW(), 'STRIPE', $6, $7
           )
           ON CONFLICT (provider, provider_order_id) DO NOTHING`,
          txId, String(piId), Number(amt || 0), curr, JSON.stringify(ev), clinicIdMeta, productIdMeta
        );
      }
    }

    if (type === 'charge.captured') {
      const id = chargeId || piId || null;
      if (id) {
        await prisma.$executeRawUnsafe(
          `UPDATE payment_transactions
             SET captured_at = COALESCE(captured_at, NOW()),
                 raw_payload = $2::jsonb,
                 updated_at = NOW()
           WHERE provider = 'stripe' AND (provider_charge_id = $1 OR provider_order_id = $1)`,
          String(id), JSON.stringify(ev)
        );
      }
    }

    if (type === 'charge.refunded' || type === 'charge.refund.updated' || type === 'charge.refund.created') {
      const id = chargeId || piId || null;
      if (id) {
        await prisma.$executeRawUnsafe(
          `UPDATE payment_transactions
             SET refund_status = 'refunded',
                 refunded_at = COALESCE(refunded_at, NOW()),
                 raw_payload = $2::jsonb,
                 updated_at = NOW()
           WHERE provider = 'stripe' AND (provider_charge_id = $1 OR provider_order_id = $1)`,
          String(id), JSON.stringify(ev)
        );
      }
    }
    return true;
  } catch (e) {
    return false;
  }
}

async function processEvent(row) {
  const provider = String(row.provider || '').toLowerCase();
  if (provider === 'stripe') return handleStripe(row);
  // For now, skip KRXPAY processing here to avoid duplicating inline webhook logic
  return true;
}

async function runWebhookWorker({ batchSize = 10, backoffMs = 5 * 60 * 1000, sleepMs = 1000 } = {}) {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let rows = [];
    try {
      rows = await prisma.$queryRawUnsafe(
        `UPDATE webhook_events SET status = 'processing', attempts = COALESCE(attempts,0)+1
         WHERE id IN (
           SELECT id FROM webhook_events
            WHERE processed = false
              AND (next_retry_at IS NULL OR next_retry_at <= NOW())
              AND (status IS NULL OR status <> 'processing')
            ORDER BY received_at ASC
            LIMIT $1
            FOR UPDATE SKIP LOCKED
         )
         RETURNING id, provider, provider_event_id, type, raw, retry_count, max_retries`,
        batchSize
      );
    } catch {}

    if (!rows || rows.length === 0) {
      await new Promise((r) => setTimeout(r, sleepMs));
      continue;
    }

    for (const r of rows) {
      const ok = await processEvent(r).catch(() => false);
      if (ok) {
        await prisma.webhookEvent.update({
          where: { id: String(r.id) },
          data: { processed: true, processed_at: new Date(), processing_error: null, status: null },
        }).catch(() => {});
      } else {
        const next = new Date(Date.now() + backoffMs);
        const willDead = (Number(r.retry_count || 0) + 1) >= Number(r.max_retries || 3);
        await prisma.webhookEvent.update({
          where: { id: String(r.id) },
          data: {
            retry_count: { increment: 1 },
            next_retry_at: next,
            processing_error: 'process_failed',
            moved_dead_letter: willDead,
            dead_letter_reason: willDead ? 'max_retries' : undefined,
            status: null,
          },
        }).catch(() => {});
      }
    }
  }
}

async function main() {
  await runWebhookWorker({});
}

main().catch((e) => {
  console.error('[webhook_worker] fatal', e?.message || e);
  process.exit(1);
});
