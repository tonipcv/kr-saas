import { NextResponse } from 'next/server'
import { getStripeFromClinicIntegration } from '@/lib/payments/stripe-from-integration'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const clinicId: string = String(body?.clinicId || '')
    const productId: string | undefined = body?.productId ? String(body.productId) : undefined
    const offerId: string | undefined = body?.offerId ? String(body.offerId) : undefined
    const country: string | undefined = body?.country ? String(body.country).toUpperCase() : undefined
    const currencyRaw: string | undefined = body?.currency ? String(body.currency).toUpperCase() : undefined
    const stripePriceId: string | undefined = body?.stripePriceId ? String(body.stripePriceId) : undefined
    const amountCentsRaw = body?.amountCents

    if (!clinicId) return NextResponse.json({ error: 'clinicId is required' }, { status: 400 })

    const { stripe } = await getStripeFromClinicIntegration(clinicId)

    let amountMinor: number | null = null
    let currency: string | null = currencyRaw || null

    if (typeof amountCentsRaw === 'number' && amountCentsRaw > 0) {
      amountMinor = Math.floor(amountCentsRaw)
    }

    if (!amountMinor && stripePriceId) {
      // Resolve amount/currency from the provided price
      const price = await stripe.prices.retrieve(stripePriceId)
      const unit = typeof price?.unit_amount === 'number' ? price.unit_amount : null
      const cur = (price?.currency || '').toUpperCase()
      if (!unit || !cur) return NextResponse.json({ error: 'Stripe price not found or missing amount/currency' }, { status: 400 })
      amountMinor = unit
      currency = cur
    }

    if (!amountMinor || !currency) {
      return NextResponse.json({ error: 'amountCents or stripePriceId with price amount is required' }, { status: 400 })
    }

    const intent = await stripe.paymentIntents.create({
      amount: amountMinor,
      currency: currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      metadata: {
        clinicId,
        productId: productId || '',
        offerId: offerId || '',
        country: country || '',
        priceId: stripePriceId || '',
      },
    })

    if (!intent?.client_secret) return NextResponse.json({ error: 'Failed to create Stripe PaymentIntent' }, { status: 500 })

    return NextResponse.json({ ok: true, clientSecret: intent.client_secret })
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed to initialize Stripe intent', message: e?.message || 'Unknown error' }, { status: 500 })
  }
}
