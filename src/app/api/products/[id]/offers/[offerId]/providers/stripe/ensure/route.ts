import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getStripeClientForCurrentDoctor } from '@/lib/payments/stripe-client'

function mapInterval(unit?: string): 'day'|'week'|'month'|'year'|null {
  const u = String(unit || '').toUpperCase()
  if (u === 'DAY') return 'day'
  if (u === 'WEEK') return 'week'
  if (u === 'MONTH') return 'month'
  if (u === 'YEAR') return 'year'
  return null
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string, offerId: string }> }) {
  try {
    const { id: productId, offerId } = await params
    const body = await req.json().catch(() => ({}))
    const currency = String(body?.currency || '').toUpperCase()
    const amountCentsOverride = typeof body?.amountCents === 'number' ? Math.max(0, Math.floor(body.amountCents)) : null

    if (!currency) return NextResponse.json({ error: 'currency is required' }, { status: 400 })

    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      select: {
        id: true,
        name: true,
        currency: true,
        priceCents: true,
        isSubscription: true,
        intervalUnit: true,
        intervalCount: true,
        providerConfig: true,
      }
    })
    if (!offer) return NextResponse.json({ error: 'Offer not found' }, { status: 404 })

    const { stripe, accountId } = await getStripeClientForCurrentDoctor()

    // Resolve desired amount/currency and recurring
    const isSub = !!offer.isSubscription
    const stripeInterval = isSub ? mapInterval(offer.intervalUnit as any) : null
    const interval_count = isSub ? Math.max(1, Number(offer.intervalCount || 1)) : undefined
    const amountCents = amountCentsOverride ?? Number(offer.priceCents || 0)

    // 1) Ensure Product
    // Try to find by name first (best-effort), otherwise create
    // Note: Stripe doesn't provide a direct search by name in list API; we list a few and match locally
    let productIdStripe: string | null = null
    try {
      const products = await stripe.products.list({ active: true, limit: 50 }, accountId ? { stripeAccount: accountId } : undefined)
      const found = (products.data || []).find(p => String(p.name || '').trim().toLowerCase() === String(offer.name || '').trim().toLowerCase())
      if (found) productIdStripe = found.id
    } catch {}
    if (!productIdStripe) {
      const created = await stripe.products.create({ name: offer.name || `Offer ${offer.id}` }, accountId ? { stripeAccount: accountId } : undefined)
      productIdStripe = created.id
    }

    // 2) Ensure Price matching currency/amount/recurring
    // Try to find an existing active price for this product
    let priceIdStripe: string | null = null
    try {
      const prices = await stripe.prices.list({
        active: true,
        product: productIdStripe || undefined,
        currency: currency.toLowerCase(),
        limit: 50,
      }, accountId ? { stripeAccount: accountId } : undefined)
      const match = (prices.data || []).find((p: any) => {
        const amountOk = typeof p.unit_amount === 'number' ? p.unit_amount === amountCents : false
        if (isSub) {
          const rinv = p.recurring || {}
          const unitOk = (rinv.interval || '') === stripeInterval
          const countOk = (typeof rinv.interval_count === 'number' ? rinv.interval_count : 1) === (interval_count || 1)
          return amountOk && unitOk && countOk
        }
        return amountOk && !p.recurring
      })
      if (match) priceIdStripe = match.id
    } catch {}

    if (!priceIdStripe) {
      // Create new price
      const createParams: any = {
        product: productIdStripe!,
        currency: currency.toLowerCase(),
        unit_amount: amountCents,
        active: true,
      }
      if (isSub && stripeInterval) {
        createParams.recurring = { interval: stripeInterval, interval_count }
      }
      const created = await stripe.prices.create(createParams, accountId ? { stripeAccount: accountId } : undefined)
      priceIdStripe = created.id
    }

    // 3) Persist on Offer.providerConfig
    const cfg = (offer.providerConfig && typeof offer.providerConfig === 'object') ? offer.providerConfig as any : {}
    cfg.STRIPE = cfg.STRIPE || {}
    cfg.STRIPE[currency] = cfg.STRIPE[currency] || {}
    cfg.STRIPE[currency].externalPriceId = priceIdStripe

    await prisma.offer.update({ where: { id: offer.id }, data: { providerConfig: cfg } })

    return NextResponse.json({ ok: true, productId: productIdStripe, priceId: priceIdStripe })
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed to ensure Stripe product/price', message: e?.message || 'Unknown error' }, { status: 500 })
  }
}
