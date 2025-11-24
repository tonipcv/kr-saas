import { NextResponse } from 'next/server'
import { getStripeFromClinicIntegration } from '@/lib/payments/stripe/integration'

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

    if (!clinicId) return NextResponse.json({ error: 'clinicId is required', code: 'missing_param' }, { status: 400 })

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
      if (!unit || !cur) return NextResponse.json({ error: 'Stripe price not found or missing amount/currency', code: 'invalid_price' }, { status: 400 })
      amountMinor = unit
      currency = cur
    }

    if (!amountMinor || !currency) {
      return NextResponse.json({ error: 'amountCents or stripePriceId with price amount is required', code: 'missing_param' }, { status: 400 })
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

    if (!intent?.client_secret) return NextResponse.json({ error: 'Failed to create Stripe PaymentIntent', code: 'stripe_error' }, { status: 500 })

    return NextResponse.json({ ok: true, clientSecret: intent.client_secret })
  } catch (e: any) {
    const raw: any = e?.raw || e || {}
    const decline_code: string | null = raw?.decline_code || e?.decline_code || null
    const code: string | null = raw?.code || e?.code || null
    const type: string | null = raw?.type || e?.type || null
    const payment_intent: any = raw?.payment_intent || e?.payment_intent || null
    const pi_id: string | null = payment_intent?.id || null
    const pi_status: string | null = payment_intent?.status || null
    const status = typeof e?.statusCode === 'number' ? e.statusCode : (decline_code ? 402 : 500)
    return NextResponse.json({ error: 'Failed to initialize Stripe intent', message: e?.message || raw?.message || 'Unknown error', decline_code, code, type, payment_intent_id: pi_id, payment_intent_status: pi_status }, { status })
  }
}
