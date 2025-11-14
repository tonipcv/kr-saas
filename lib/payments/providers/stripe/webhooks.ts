export type NormalizedPaymentEvent = {
  provider: 'STRIPE'
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
  // Not wired yet. Route should continue doing validation until we migrate.
  return { ok: true }
}

export function normalize(event: any): NormalizedPaymentEvent {
  // Minimal shape; fill as we migrate worker route.
  const type = String(event?.type || '')
  const dataObj = event?.data?.object || {}
  const idVal = dataObj?.id || null
  const chargeId = dataObj?.charge || idVal || null
  const orderId = (() => {
    const pi = (typeof dataObj?.payment_intent === 'string') ? dataObj.payment_intent : null
    if (typeof idVal === 'string' && idVal.startsWith('pi_')) return idVal
    if (typeof pi === 'string' && pi) return pi
    return null
  })()
  const currency = (dataObj?.currency || '').toString().toUpperCase() || null
  const amountMinor = typeof dataObj?.amount === 'number' ? dataObj.amount : (typeof dataObj?.amount_total === 'number' ? dataObj.amount_total : null)
  return {
    provider: 'STRIPE',
    type,
    orderId,
    chargeId: chargeId || null,
    customerId: dataObj?.customer || null,
    status: (dataObj?.status || null),
    amountMinor,
    currency,
    occurredAt: (event?.created ? new Date(event.created * 1000).toISOString() : null),
    raw: event,
  }
}
