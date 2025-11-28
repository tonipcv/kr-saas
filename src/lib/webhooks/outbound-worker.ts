import { prisma } from '@/lib/prisma'
import { signPayload } from './signature'

const BACKOFF_SECONDS = [0, 60, 300, 900, 3600, 21600, 86400, 86400, 86400, 86400]

function calcNextAttempt(attempts: number): Date {
  const idx = Math.min(attempts, BACKOFF_SECONDS.length - 1)
  const delay = BACKOFF_SECONDS[idx]
  return new Date(Date.now() + delay * 1000)
}

async function deliverOnce(deliveryId: string) {
  const d = await prisma.outboundWebhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { endpoint: true, event: true },
  })
  if (!d) return
  if (d.status === 'DELIVERED') return

  // Security: enforce HTTPS
  if (!d.endpoint.url.startsWith('https://')) {
    await prisma.outboundWebhookDelivery.update({
      where: { id: d.id },
      data: {
        status: 'FAILED',
        attempts: 1,
        lastError: 'Endpoint URL must use HTTPS for security',
        nextAttemptAt: null,
      },
    })
    return
  }

  const attempts = (d.attempts ?? 0) + 1

  // Build payload as per guide v2.0
  const payload = {
    specVersion: '1.0',
    id: d.eventId,
    type: d.event.type,
    createdAt: d.event.createdAt.toISOString(),
    attempt: attempts,
    idempotencyKey: d.eventId,
    clinicId: d.event.clinicId,
    resource: d.event.resource,
    data: d.event.payload,
  }
  const body = JSON.stringify(payload)

  // ✅ VALIDAÇÃO: Verificar tamanho do payload (max 1MB)
  const MAX_PAYLOAD_SIZE_BYTES = 1024 * 1024 // 1MB
  const sizeBytes = Buffer.byteLength(body, 'utf8')
  
  if (sizeBytes > MAX_PAYLOAD_SIZE_BYTES) {
    console.error(`[webhooks] Payload too large: ${sizeBytes} bytes (max: ${MAX_PAYLOAD_SIZE_BYTES})`)
    
    await prisma.outboundWebhookDelivery.update({
      where: { id: d.id },
      data: {
        status: 'FAILED',
        lastError: `Payload too large: ${sizeBytes} bytes (max: 1MB)`,
        nextAttemptAt: null,
        attempts,
      },
    })
    
    return
  }
  
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = signPayload(d.endpoint.secret, body, timestamp)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch(d.endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Id': d.eventId,
        'X-Webhook-Event': d.event.type,
        'X-Webhook-Spec-Version': '1.0',
        'X-Webhook-Signature': signature,
        'X-Webhook-Timestamp': String(timestamp),
        'User-Agent': 'KrxScale-OutboundWebhooks/1.0',
      },
      body,
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (res.ok) {
      await prisma.outboundWebhookDelivery.update({
        where: { id: d.id },
        data: {
          status: 'DELIVERED',
          attempts,
          lastCode: res.status,
          lastError: null,
          deliveredAt: new Date(),
          nextAttemptAt: null,
        },
      })
      return
    }

    const text = await res.text().catch(() => 'Unknown error')
    throw new Error(`HTTP ${res.status}: ${text}`)
  } catch (err: any) {
    const nextAt = calcNextAttempt(attempts)
    const permanent = attempts >= BACKOFF_SECONDS.length
    await prisma.outboundWebhookDelivery.update({
      where: { id: d.id },
      data: permanent
        ? {
            status: 'FAILED',
            attempts,
            lastCode: null,
            lastError: String(err?.message || err),
            nextAttemptAt: null,
          }
        : {
            status: 'PENDING',
            attempts,
            lastCode: null,
            lastError: String(err?.message || err),
            nextAttemptAt: nextAt,
          },
    })
  }
}

let running = false
let stopSignal = false

export function startOutboundWebhookWorker(opts?: { batchSize?: number; sleepMs?: number }) {
  if (running) return
  running = true
  stopSignal = false
  const batchSize = opts?.batchSize ?? 10
  const sleepMs = opts?.sleepMs ?? 5000

  async function loop() {
    // eslint-disable-next-line no-constant-condition
    while (!stopSignal) {
      try {
        const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
          `WITH endpoint_counts AS (
             SELECT endpoint_id, COUNT(*) as in_flight
               FROM outbound_webhook_deliveries
              WHERE status = 'PENDING' 
                AND updated_at > NOW() - INTERVAL '5 minutes'
              GROUP BY endpoint_id
           ),
           eligible AS (
             SELECT d.id, d.endpoint_id, e.max_concurrent_deliveries
               FROM outbound_webhook_deliveries d
               JOIN webhook_endpoints e ON e.id = d.endpoint_id
               LEFT JOIN endpoint_counts ec ON ec.endpoint_id = d.endpoint_id
              WHERE d.status = 'PENDING'
                AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= NOW())
                AND COALESCE(ec.in_flight, 0) < e.max_concurrent_deliveries
              ORDER BY d.created_at ASC
              LIMIT $1
                FOR UPDATE SKIP LOCKED
           )
           UPDATE outbound_webhook_deliveries
              SET updated_at = NOW()
            WHERE id IN (SELECT id FROM eligible)
           RETURNING id`,
          batchSize
        ).catch(() => [])

        if (!rows || rows.length === 0) {
          await new Promise((r) => setTimeout(r, sleepMs))
          continue
        }

        for (const r of rows) {
          await deliverOnce(r.id)
        }
      } catch (e) {
        // backoff on loop error
        await new Promise((r) => setTimeout(r, sleepMs))
      }
    }
  }

  // Fire and forget
  loop().catch(() => {})
}

export function stopOutboundWebhookWorker() {
  stopSignal = true
  running = false
}
