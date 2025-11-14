import { NextResponse } from 'next/server'
import { getStripeClientForCurrentDoctor } from '@/lib/payments/stripe-client'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = (searchParams.get('id') || '').trim()
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const { stripe, accountId } = await getStripeClientForCurrentDoctor()
    const product = await stripe.products.retrieve(id, accountId ? { stripeAccount: accountId } : undefined)

    const payload = {
      id: product.id,
      name: String(product.name || ''),
      description: String(product.description || ''),
      active: !!product.active,
      metadata: product.metadata || {},
      images: Array.isArray(product.images) ? product.images : [],
    }
    return NextResponse.json(payload)
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed to retrieve Stripe product', message: e?.message || 'Unknown error' }, { status: 404 })
  }
}
