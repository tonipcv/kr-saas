import { prisma } from '@/lib/prisma'
import { normalize as normalizeStripe } from '../payments/providers/stripe/webhooks'
import { normalize as normalizeKrxpay } from '../payments/providers/krxpay/webhooks'
import { applyWebhookUpdate } from '../payments/domain/paymentDomain'

type EventRow = {
  id: string
  provider: string
  provider_event_id: string | null
  type: string
  raw: any
  retry_count: number
  max_retries: number
}

export async function publish(provider: string, eventId: string) {
  await prisma.webhookEvent.update({
    where: { provider_provider_event_id: { provider, provider_event_id: eventId } },
    data: { next_retry_at: new Date() },
  }).catch(async () => {
    await prisma.webhookEvent.create({
      data: {
        provider,
        hook_id: eventId,
        provider_event_id: eventId,
        type: 'unknown',
        raw: {},
        processed: false,
        retry_count: 0,
        max_retries: 3,
        is_retryable: true,
        next_retry_at: new Date(),
      }
    }).catch(() => {})
  })
}

async function processEvent(row: EventRow) {
  const provider = String(row.provider || '').toLowerCase()
  if (provider === 'stripe') {
    try {
      // Normalize first (no behavior change yet)
      try {
        const norm = normalizeStripe(row.raw)
        // Debug only: keep small log to compare
        console.log('[worker][normalize][stripe]', { type: norm.type, chargeId: norm.chargeId, status: norm.status })
        // Try domain handler for incremental migration (e.g., payment_intent.succeeded)
        const handled = await applyWebhookUpdate({ ...norm })
        if (handled) {
          return true
        }
      } catch {}
      const ev = row.raw || {}
      const type = String(row.type || '').toLowerCase()
      // Extract common IDs
      const obj = (ev as any)?.data?.object || {}
      const piId: string | null = obj?.payment_intent || obj?.id?.startsWith?.('pi_') ? String(obj.id) : (typeof obj?.payment_intent === 'string' ? String(obj.payment_intent) : null)
      const chargeId: string | null = obj?.id?.startsWith?.('ch_') ? String(obj.id) : (typeof obj?.charge === 'string' ? String(obj.charge) : null)

      // payment_intent.succeeded -> mark paid
      if (type === 'payment_intent.succeeded' && piId) {
        await prisma.$executeRawUnsafe(
          `UPDATE payment_transactions
             SET status = CASE
                            WHEN status IN ('pending','processing') THEN 'paid'
                            ELSE status
                          END,
                 paid_at = COALESCE(paid_at, NOW()),
                 raw_payload = $2::jsonb,
                 updated_at = NOW()
           WHERE provider = 'stripe' AND provider_order_id = $1`,
          String(piId),
          JSON.stringify(ev)
        )
      }

      // charge.captured -> captured_at
      if (type === 'charge.captured') {
        const id = chargeId || piId || null
        if (id) {
          await prisma.$executeRawUnsafe(
            `UPDATE payment_transactions
               SET captured_at = COALESCE(captured_at, NOW()),
                   raw_payload = $2::jsonb,
                   updated_at = NOW()
             WHERE provider = 'stripe' AND (provider_charge_id = $1 OR provider_order_id = $1)`,
            String(id),
            JSON.stringify(ev)
          )
        }
      }

      // charge.refunded (or refund succeeded) -> refund_status/refunded_at
      if (type === 'charge.refunded' || type === 'charge.refund.updated' || type === 'charge.refund.created') {
        const id = chargeId || piId || null
        if (id) {
          await prisma.$executeRawUnsafe(
            `UPDATE payment_transactions
               SET refund_status = 'refunded',
                   refunded_at = COALESCE(refunded_at, NOW()),
                   raw_payload = $2::jsonb,
                   updated_at = NOW()
             WHERE provider = 'stripe' AND (provider_charge_id = $1 OR provider_order_id = $1)`,
            String(id),
            JSON.stringify(ev)
          )
        }
      }
      return true
    } catch {
      return false
    }
  }
  if (provider === 'pagarme') {
    try {
      // Normalize first (no behavior change yet)
      try {
        const norm = normalizeKrxpay(row.raw)
        console.log('[worker][normalize][krxpay]', { type: norm.type, orderId: norm.orderId, chargeId: norm.chargeId, status: norm.status })
      } catch {}
      const event = row.raw || {}
      const type = String((event as any)?.type || (event as any)?.event || '').toLowerCase()
      const typeLower = type
      // Normalize identifiers
      let orderId: string | null = (event as any)?.data?.order?.id
        || (event as any)?.order?.id
        || (event as any)?.object?.order?.id
        || null
      if (!orderId && typeLower.startsWith('order')) {
        orderId = (event as any)?.data?.id || (event as any)?.id || null
      }
      const subscriptionId: string | null = (event as any)?.data?.subscription?.id
        || (event as any)?.subscription?.id
        || (event as any)?.object?.subscription_id
        || (event as any)?.data?.subscription_id
        || null
      if (!orderId && subscriptionId) orderId = subscriptionId
      let chargeId: string | null = (event as any)?.data?.charge?.id
        || (event as any)?.data?.charges?.[0]?.id
        || (event as any)?.charge?.id
        || (event as any)?.object?.charge?.id
        || null
      if (!chargeId && typeLower.startsWith('charge')) {
        chargeId = (event as any)?.data?.id || (event as any)?.id || null
      }
      if (orderId && String(orderId).startsWith('ch_')) {
        orderId = null
      }
      // Remediation: fix rows where order id was recorded as charge id
      if (orderId && chargeId) {
        await prisma.$executeRawUnsafe(
          `UPDATE payment_transactions
             SET provider_order_id = $2,
                 provider_charge_id = COALESCE(provider_charge_id, $1),
                 raw_payload = $3::jsonb
           WHERE provider = 'pagarme'
             AND provider_order_id = $1`,
          String(chargeId), String(orderId), JSON.stringify(event)
        )
      }
      // Status mapping
      const rawStatus = ((event as any)?.data?.status
        || (event as any)?.data?.order?.status
        || (event as any)?.order?.status
        || (event as any)?.status
        || '').toString().toLowerCase()
      const statusMap: Record<string, string> = {
        paid: 'paid', approved: 'paid', captured: 'paid',
        canceled: 'canceled', cancelled: 'canceled',
        refused: 'refused', failed: 'failed', refunded: 'refunded',
        processing: 'processing', pending: 'pending',
        underpaid: 'underpaid', overpaid: 'overpaid', chargedback: 'chargedback',
      }
      const isPaidEvent = typeLower.includes('order.paid') || typeLower.includes('charge.paid')
      const mappedRaw = statusMap[rawStatus] || (rawStatus ? rawStatus : undefined)
      let mapped = (mappedRaw === 'paid' && !isPaidEvent) ? undefined : mappedRaw
      if (mapped === 'active') mapped = undefined
      // Extract method/installments
      const chargeObj = (event as any)?.data?.charge || (Array.isArray((event as any)?.data?.charges) ? (event as any)?.data?.charges?.[0] : null) || (event as any)?.charge || null
      const lastTx = chargeObj?.last_transaction || (event as any)?.data?.transaction || null
      const paymentMethodRaw: string | null = lastTx?.payment_method || (lastTx ? chargeObj?.payment_method : null) || null
      const paymentMethodType: string | null = paymentMethodRaw ? String(paymentMethodRaw).toLowerCase() : null
      const installmentsVal: number | null = (() => {
        const raw = (lastTx as any)?.installments ?? (event as any)?.data?.installments ?? null
        const n = Number(raw)
        return Number.isFinite(n) && n > 0 ? n : null
      })()
      // Update by orderId
      if (orderId) {
        const result = await prisma.$executeRawUnsafe(
          `UPDATE payment_transactions
             SET status = CASE
                            WHEN ($2::text) IS NULL THEN status
                            WHEN status = 'pending' AND ($2::text) IN ('processing','paid','refunded','canceled','failed','underpaid','overpaid','chargedback') THEN ($2::text)
                            WHEN status = 'processing' AND ($2::text) IN ('paid','refunded','canceled','failed','underpaid','overpaid','chargedback') THEN ($2::text)
                            WHEN status = 'paid' AND ($2::text) IN ('refunded','canceled','failed','chargedback') THEN ($2::text)
                            WHEN status = 'refunded' AND ($2::text) IN ('canceled','failed') THEN ($2::text)
                            WHEN status = 'canceled' AND ($2::text) = 'failed' THEN ($2::text)
                            ELSE status
                          END,
                 raw_payload = $3::jsonb,
                 payment_method_type = COALESCE($4::text, payment_method_type),
                 installments = COALESCE($5::int, installments),
                 updated_at = NOW()
           WHERE provider = 'pagarme' AND provider_order_id = $1`,
          String(orderId), mapped || null, JSON.stringify(event), paymentMethodType, installmentsVal
        )
        if (result === 0) {
          // Insert placeholder row (mirrors webhook route behavior)
          const webhookTxId = `wh_${orderId}_${Date.now()}`
          await prisma.$executeRawUnsafe(
            `INSERT INTO payment_transactions (id, provider, provider_order_id, status, payment_method_type, installments, amount_cents, currency, raw_payload, created_at, routed_provider)
             VALUES ($1, 'pagarme', $2, $3::text, $4::text, $5::int, 0, 'BRL', $6::jsonb, NOW(), 'KRXPAY')
             ON CONFLICT DO NOTHING`,
            webhookTxId, String(orderId), (mapped || 'processing'), paymentMethodType, installmentsVal, JSON.stringify(event)
          )
        }
      }
      // Update by chargeId
      if (chargeId) {
        const result2 = await prisma.$executeRawUnsafe(
          `UPDATE payment_transactions
             SET provider_charge_id = COALESCE(provider_charge_id, $1),
                 status = CASE
                            WHEN ($2::text) IS NULL THEN status
                            WHEN status = 'pending' AND ($2::text) IN ('processing','paid','refunded','canceled','failed','underpaid','overpaid','chargedback') THEN ($2::text)
                            WHEN status = 'processing' AND ($2::text) IN ('paid','refunded','canceled','failed','underpaid','overpaid','chargedback') THEN ($2::text)
                            WHEN status = 'paid' AND ($2::text) IN ('refunded','canceled','failed','chargedback') THEN ($2::text)
                            WHEN status = 'refunded' AND ($2::text) IN ('canceled','failed') THEN ($2::text)
                            WHEN status = 'canceled' AND ($2::text) = 'failed' THEN ($2::text)
                            ELSE status
                          END,
                 raw_payload = $3::jsonb,
                 payment_method_type = COALESCE($5::text, payment_method_type),
                 installments = COALESCE($6::int, installments),
                 updated_at = NOW()
           WHERE provider = 'pagarme' AND (provider_charge_id = $1 OR provider_order_id = $4)`,
          String(chargeId), mapped || null, JSON.stringify(event), orderId ? String(orderId) : null, paymentMethodType, installmentsVal
        )
        if (result2 === 0 && !orderId) {
          const webhookTxId2 = `wh_${chargeId}_${Date.now()}`
          await prisma.$executeRawUnsafe(
            `INSERT INTO payment_transactions (id, provider, provider_charge_id, status, payment_method_type, installments, amount_cents, currency, raw_payload, created_at, routed_provider)
             VALUES ($1, 'pagarme', $2, $3::text, $4::text, $5::int, 0, 'BRL', $6::jsonb, NOW(), 'KRXPAY')
             ON CONFLICT DO NOTHING`,
            webhookTxId2, String(chargeId), (mapped || 'processing'), paymentMethodType, installmentsVal, JSON.stringify(event)
          )
        }
      }
      return true
    } catch {
      return false
    }
  }
  return true
}

export async function runWebhookWorker(opts?: { batchSize?: number, backoffMs?: number, sleepMs?: number }) {
  const batchSize = opts?.batchSize ?? 10
  const backoffMs = opts?.backoffMs ?? 5 * 60 * 1000
  const sleepMs = opts?.sleepMs ?? 1000
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const rows = await prisma.$queryRawUnsafe<any[]>(
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
       RETURNING id, provider, provider_event_id, type, raw, retry_count, max_retries`
      , batchSize
    ).catch(() => [])

    if (!rows || rows.length === 0) {
      await new Promise(r => setTimeout(r, sleepMs))
      continue
    }

    for (const r of rows) {
      const ok = await processEvent(r as EventRow).catch(() => false)
      if (ok) {
        await prisma.webhookEvent.update({
          where: { id: String(r.id) },
          data: { processed: true, processed_at: new Date(), processing_error: null, status: null }
        }).catch(() => {})
      } else {
        const next = new Date(Date.now() + backoffMs)
        await prisma.webhookEvent.update({
          where: { id: String(r.id) },
          data: {
            retry_count: { increment: 1 },
            next_retry_at: next,
            processing_error: 'process_failed',
            moved_dead_letter: (Number(r.retry_count || 0) + 1) >= Number(r.max_retries || 3),
            dead_letter_reason: ((Number(r.retry_count || 0) + 1) >= Number(r.max_retries || 3)) ? 'max_retries' : undefined,
            status: null,
          }
        }).catch(() => {})
      }
    }
  }
}
