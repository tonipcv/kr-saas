export type NormalizedPaymentEvent = {
  provider: 'KRXPAY'
  type: string
  orderId?: string | null
  chargeId?: string | null
  customerId?: string | null
  status?: string | null
  amountMinor?: number | null
  currency?: string | null
  occurredAt?: string | null
  raw: any
}

export async function validateSignature(_req: Request): Promise<{ ok: boolean; message?: string }>{
  // Not wired yet. Keep current route validation until migration.
  return { ok: true }
}

export function normalize(event: any): NormalizedPaymentEvent {
  const type = String(event?.type || event?.event || '')
  const data = event?.data || event?.payload || {}
  const obj = data?.object || data || {}
  const orderId = obj?.order_id || obj?.orderId || obj?.id || null
  const chargeId = obj?.charge_id || obj?.chargeId || null
  const currency = (obj?.currency || '').toString().toUpperCase() || null
  const amountMinor = typeof obj?.amount === 'number' ? obj.amount : (typeof obj?.amount_total === 'number' ? obj.amount_total : null)
  const ts = (event?.created_at || event?.createdAt || obj?.created_at)
  const occurredAt = ts ? new Date(ts).toISOString() : null
  return {
    provider: 'KRXPAY',
    type,
    orderId,
    chargeId,
    customerId: obj?.customer_id || null,
    status: obj?.status || null,
    amountMinor,
    currency,
    occurredAt,
    raw: event,
  }
}
