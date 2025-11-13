import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrencyForCountry as mapCurrency } from '@/lib/payments/countryCurrency'

const METHODS: Array<'CARD'|'PIX'|'OPEN_FINANCE'|'OPEN_FINANCE_AUTOMATIC'> = ['CARD','PIX','OPEN_FINANCE','OPEN_FINANCE_AUTOMATIC']

function ok(data: any, init?: number) { return NextResponse.json(data, { status: init || 200 }) }
function bad(message: string, extra?: any) { return NextResponse.json({ error: message, ...(extra||{}) }, { status: 400 }) }
function fail(message: string, extra?: any) { return NextResponse.json({ error: message, ...(extra||{}) }, { status: 500 }) }

export async function PUT(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const offerId = String(body?.offerId || '')
    const country = String(body?.country || '').toUpperCase()
    const method = String(body?.method || '').toUpperCase()
    const provider = String(body?.provider || '').toUpperCase()
    const priority = Number.isFinite(Number(body?.priority)) ? Number(body.priority) : 10
    const isActive = typeof body?.isActive === 'boolean' ? !!body.isActive : true

    const METHODS: Record<string, true> = { CARD: true, PIX: true, OPEN_FINANCE: true, OPEN_FINANCE_AUTOMATIC: true }
    const PROVIDERS: Record<string, true> = { STRIPE: true, KRXPAY: true }
    if (!offerId) return bad('offerId is required')
    if (!country || country.length !== 2) return bad('country is required (CC)')
    if (!METHODS[method]) return bad('invalid method')
    if (!PROVIDERS[provider]) return bad('invalid provider')

    // Detect column types to decide casting strategy
    const colType = async (col: string) => {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT data_type, udt_name FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
        'payment_routing_rules', col
      ) as Array<{ data_type: string; udt_name: string }>
      return rows && rows[0] ? rows[0] : { data_type: '', udt_name: '' }
    }
    const methodCol = await colType('method')
    const providerCol = await colType('provider')
    const isMethodEnum = /PaymentMethod/i.test(methodCol.udt_name || '')
    const isProviderEnum = /PaymentProvider/i.test(providerCol.udt_name || '')

    // Try raw upsert to be robust regardless of enum vs text
    const sel = await prisma.$queryRawUnsafe(
      `SELECT id FROM payment_routing_rules
       WHERE offer_id = $1 AND country = $2 AND ` + (isMethodEnum ? `method = $3::"PaymentMethod"` : `method::text = $3`),
      offerId, country, method
    ) as Array<{ id: string }>

    if (sel && sel[0]?.id) {
      const id = sel[0].id
      await prisma.$executeRawUnsafe(
        `UPDATE payment_routing_rules
         SET provider = ${isProviderEnum ? `$1::"PaymentProvider"` : `$1`}, priority = $2, is_active = $3, updated_at = now()
         WHERE id = $4`,
        provider, priority, isActive, id
      )
      return ok({ rule: { id, offerId, country, method, provider, priority, isActive } })
    } else {
      const newIdRows = await prisma.$queryRawUnsafe(`SELECT gen_random_uuid() AS id`) as Array<{ id: string }>
      const id = (newIdRows && newIdRows[0]?.id) || undefined
      await prisma.$executeRawUnsafe(
        `INSERT INTO payment_routing_rules (id, offer_id, country, method, provider, priority, is_active, created_at, updated_at, merchant_id)
         VALUES ($1, $2, $3, ${isMethodEnum ? `$4::"PaymentMethod"` : `$4`}, ${isProviderEnum ? `$5::"PaymentProvider"` : `$5`}, $6, $7, now(), now(), '')`,
        id, offerId, country, method, provider, priority, isActive
      )
      return ok({ rule: { id, offerId, country, method, provider, priority, isActive } })
    }
  } catch (e: any) {
    try {
      // Fallback to Prisma client path if raw fails for any reason
      const body = await req.json().catch(() => ({}))
      const existing = await prisma.paymentRoutingRule.findFirst({ where: { offerId: String(body?.offerId||''), country: String(body?.country||'').toUpperCase(), method: String(body?.method||'').toUpperCase() as any } })
      if (existing) {
        const rule = await prisma.paymentRoutingRule.update({ where: { id: existing.id }, data: { provider: String(body?.provider||'').toUpperCase() as any, priority: Number(body?.priority)||10, isActive: !!body?.isActive } })
        return ok({ rule })
      } else {
        const rule = await prisma.paymentRoutingRule.create({ data: { offerId: String(body?.offerId||''), country: String(body?.country||'').toUpperCase(), method: String(body?.method||'').toUpperCase() as any, provider: String(body?.provider||'').toUpperCase() as any, priority: Number(body?.priority)||10, isActive: body?.isActive !== false, merchantId: '' } })
        return ok({ rule })
      }
    } catch (_) {
      return fail('Failed to upsert payment routing rule', { message: e?.message || 'Unknown error' })
    }
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const offerId = String(url.searchParams.get('offerId') || '')
    const country = String(url.searchParams.get('country') || '').toUpperCase()
    if (!offerId) return bad('offerId is required')
    if (!country || country.length !== 2) return bad('country is required (CC)')

    // 1) Read rules scoped to offer and country
    const scoped = await prisma.paymentRoutingRule.findMany({
      where: { offerId, country, isActive: true },
      orderBy: [{ priority: 'asc' }, { updatedAt: 'desc' }]
    })
    // 2) Fallback to country-level global rules (no offerId)
    const global = await prisma.paymentRoutingRule.findMany({
      where: { offerId: null, country, isActive: true },
      orderBy: [{ priority: 'asc' }, { updatedAt: 'desc' }]
    })

    // 3) Legacy fallback: providerConfig.CHECKOUT[country] → CARD only
    const offer = await prisma.offer.findUnique({ where: { id: offerId }, select: { providerConfig: true } })
    const cfg = (offer?.providerConfig || {}) as any
    const legacyCheckout = (cfg?.CHECKOUT && typeof cfg.CHECKOUT === 'object') ? cfg.CHECKOUT[country] : null

    const pick = (method: string): 'STRIPE'|'KRXPAY'|null => {
      const first = scoped.find(r => r.method === method)
      if (first) return first.provider as any
      const g = global.find(r => r.method === method)
      if (g) return g.provider as any
      if (method === 'CARD') {
        const v = legacyCheckout
        if (v === 'STRIPE' || v === 'KRXPAY') return v
      }
      return null
    }

    const currency = mapCurrency(country)
    const methods = Object.fromEntries(METHODS.map(m => [m, { provider: pick(m) }]))
    return ok({ country, currency, methods })
  } catch (e: any) {
    return fail('Failed to resolve payment routing', { message: e?.message || 'Unknown error' })
  }
}
