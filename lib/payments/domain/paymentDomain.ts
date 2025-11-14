import { prisma } from '@/lib/prisma'

export type NormalizedPaymentEvent = {
  provider: 'STRIPE' | 'KRXPAY'
  type: string
  orderId?: string | null
  chargeId?: string | null
  status?: string | null
  amountMinor?: number | null
  currency?: string | null
  occurredAt?: string | null
  raw: any
}

// Apply normalized webhook event to domain models in an idempotent and anti-downgrade safe manner.
// Return true when this function fully handled the event; false to let legacy logic handle it.
export async function applyWebhookUpdate(e: NormalizedPaymentEvent): Promise<boolean> {
  const provider = String(e.provider || '').toUpperCase()
  const type = String(e.type || '').toLowerCase()

  // First incremental migration: handle Stripe payment_intent.succeeded via normalized event
  if (provider === 'STRIPE' && type === 'payment_intent.succeeded') {
    const piId = (typeof e.orderId === 'string' && e.orderId) ? e.orderId : null
    if (!piId) return false
    try {
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
        JSON.stringify(e.raw || {})
      )
      return true
    } catch {
      return false
    }
  }

  // Not handled here; allow legacy logic to run
  return false
}
