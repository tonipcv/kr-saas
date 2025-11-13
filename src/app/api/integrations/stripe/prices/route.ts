import { NextResponse } from 'next/server'
import { getStripeClientForCurrentDoctor } from '@/lib/payments/stripe-client'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const currency = (searchParams.get('currency') || '').toUpperCase()
    const query = (searchParams.get('query') || '').toLowerCase()
    const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') || 20)))

    const { stripe, accountId } = await getStripeClientForCurrentDoctor()

    // List active prices; filter by currency if provided
    const prices = await stripe.prices.list({
      active: true,
      currency: currency || undefined,
      limit,
      expand: ['data.product'],
    }, accountId ? { stripeAccount: accountId } : undefined)

    const items = (prices.data || []).map((p: any) => {
      const product = p.product || {}
      const name: string = String(product?.name || '')
      const match = !query || name.toLowerCase().includes(query) || String(p.id).toLowerCase().includes(query)
      if (!match) return null
      return {
        priceId: p.id,
        productId: typeof p.product === 'object' ? p.product.id : p.product,
        productName: name,
        productDescription: String(product?.description || ''),
        priceNickname: String(p.nickname || ''),
        unitAmount: p.unit_amount,
        currency: p.currency?.toUpperCase?.() || null,
        recurring: p.recurring || null,
        interval: p?.recurring?.interval || null,
        intervalCount: typeof p?.recurring?.interval_count === 'number' ? p.recurring.interval_count : null,
        active: !!p.active,
      }
    }).filter(Boolean)

    return NextResponse.json({ ok: true, count: items.length, items })
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed to list Stripe prices', message: e?.message || 'Unknown error' }, { status: 500 })
  }
}
