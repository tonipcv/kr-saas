import { NextResponse } from 'next/server'
import { getStripeClientForCurrentDoctor } from '@/lib/payments/stripe-client'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = (searchParams.get('id') || '').trim()
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const { stripe, accountId } = await getStripeClientForCurrentDoctor()
    const price = await stripe.prices.retrieve(id, accountId ? { stripeAccount: accountId } : undefined)

    // Minimal, stable shape for checkout UI
    const payload = {
      id: price.id,
      unit_amount: price.unit_amount,
      currency: (price.currency || '').toUpperCase(),
      active: !!price.active,
      recurring: price.recurring || null,
      product: typeof price.product === 'string' ? price.product : (price.product as any)?.id || null,
      price: {
        id: price.id,
        unit_amount: price.unit_amount,
        currency: (price.currency || '').toUpperCase(),
        active: !!price.active,
      },
    }
    return NextResponse.json(payload)
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed to retrieve Stripe price', message: e?.message || 'Unknown error' }, { status: 404 })
  }
}
