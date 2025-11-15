import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function mapStatus(pt: string): string | undefined {
  const s = String(pt || '').toLowerCase()
  if (!s) return undefined
  if (s.includes('aprov')) return 'paid'
  if (s.includes('autor')) return 'authorized'
  if (s.includes('pend')) return 'pending'
  if (s.includes('integr')) return 'paid'
  if (s.includes('estorn')) return 'refunded'
  if (s.includes('cancel')) return 'canceled'
  if (s.includes('falh') || s.includes('negad')) return 'failed'
  return undefined
}

export async function POST(req: Request) {
  try {
    const raw = await req.text()
    let evt: any = {}
    try { evt = raw ? JSON.parse(raw) : {} } catch { evt = {} }

    const event = String(evt?.event || evt?.type || '')
    const data = evt?.data || {}
    // In Default template, order id is data.id and customer under data.customer
    const orderId = data?.id ? String(data.id) : null
    const statusRaw = data?.status || evt?.status || null
    const paymentType = data?.payment_type || data?.paymentType || null
    const installments = data?.installments != null ? Number(data.installments) : null

    // Idempotent log of webhook
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO webhook_events (provider, hook_id, provider_event_id, type, status, raw)
         VALUES ('appmax', COALESCE($1,$2), $2, $3, $4, $5::jsonb)
         ON CONFLICT (provider, hook_id) DO NOTHING`,
        String(evt?.id || ''),
        String(orderId || ''),
        String(event),
        String(statusRaw || ''),
        JSON.stringify(evt)
      )
    } catch {}

    if (!orderId) return NextResponse.json({ received: true, ignored: true, reason: 'no order id' })

    const mapped = mapStatus(String(statusRaw || ''))
    const methodNorm = paymentType ? String(paymentType).toLowerCase() : undefined

    // Extract buyer info when available
    const cust = data?.customer || {}
    const buyerName = [cust?.firstname, cust?.lastname].filter(Boolean).join(' ').trim() || null
    const buyerEmail = cust?.email || null

    // Anti-downgrade CASE logic similar to other providers
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE payment_transactions
           SET status = CASE
                          WHEN ($2::text) IS NULL THEN status
                          WHEN status = 'pending' AND ($2::text) IN ('processing','paid','refunded','canceled','failed','authorized') THEN ($2::text)
                          WHEN status = 'processing' AND ($2::text) IN ('paid','refunded','canceled','failed','authorized') THEN ($2::text)
                          WHEN status = 'authorized' AND ($2::text) IN ('paid','refunded','canceled','failed') THEN ($2::text)
                          WHEN status = 'paid' AND ($2::text) IN ('refunded','canceled','failed') THEN ($2::text)
                          WHEN status = 'refunded' AND ($2::text) IN ('canceled','failed') THEN ($2::text)
                          WHEN status = 'canceled' AND ($2::text) = 'failed' THEN ($2::text)
                          ELSE status
                        END,
               payment_method_type = COALESCE($3::text, payment_method_type),
               installments = COALESCE($4::int, installments),
               raw_payload = $5::jsonb,
               client_name = COALESCE(client_name, $6::text),
               client_email = COALESCE(client_email, $7::text),
               updated_at = NOW()
         WHERE provider = 'appmax' AND provider_order_id = $1`,
        String(orderId),
        mapped || null,
        methodNorm || null,
        installments || null,
        JSON.stringify(evt),
        buyerName,
        buyerEmail
      )
    } catch {}

    // If no prior row exists, create a placeholder
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO payment_transactions (
           id, provider, provider_order_id, status, payment_method_type, installments,
           amount_cents, currency, raw_payload, created_at, routed_provider, client_name, client_email
         ) VALUES (
           gen_random_uuid(), 'appmax', $1, COALESCE($2::text,'processing'), $3::text, $4::int,
           0, 'BRL', $5::jsonb, NOW(), 'APPMAX', $6::text, $7::text
         ) ON CONFLICT DO NOTHING`,
        String(orderId),
        mapped || null,
        methodNorm || null,
        installments || null,
        JSON.stringify(evt),
        buyerName,
        buyerEmail
      )
    } catch {}

    return NextResponse.json({ received: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'internal_error' }, { status: 500 })
  }
}
