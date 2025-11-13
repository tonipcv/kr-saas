import { NextRequest, NextResponse } from 'next/server'
import type { PaymentProvider } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import Stripe from 'stripe'

// Internal test endpoint to validate provider flows without touching legacy checkout
// POST /api/payments/create
// { merchantId, provider?: 'STRIPE', amount, currency, customerEmail, customerName?, customerPhone? }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const merchantId: string = body?.merchantId
    const provider: PaymentProvider = body?.provider || 'STRIPE'
    const amount: number = Number(body?.amount)
    const currency: string = String(body?.currency || 'USD').toUpperCase()
    const customerEmail: string = String(body?.customerEmail || '')
    const customerName: string | undefined = body?.customerName
    const customerPhone: string | undefined = body?.customerPhone

    if (!merchantId) return NextResponse.json({ error: 'merchantId is required' }, { status: 400 })
    if (!amount || amount <= 0) return NextResponse.json({ error: 'amount must be > 0' }, { status: 400 })
    if (!customerEmail) return NextResponse.json({ error: 'customerEmail is required' }, { status: 400 })

    // Ensure merchant exists (for clearer errors)
    const merchant = await prisma.merchant.findFirst({ where: { id: merchantId } })
    if (!merchant) return NextResponse.json({ error: 'merchant not found' }, { status: 404 })

    if (provider !== 'STRIPE') {
      return NextResponse.json({ error: 'Only STRIPE is supported in this test endpoint for now' }, { status: 400 })
    }

    // Load Stripe credentials from MerchantIntegration
    const integration = await prisma.merchantIntegration.findUnique({
      where: { merchantId_provider: { merchantId, provider: 'STRIPE' as any } },
    })
    if (!integration || !integration.isActive) {
      return NextResponse.json({ error: 'stripe_integration_not_found' }, { status: 400 })
    }
    const creds = integration.credentials as any
    const apiKey: string | undefined = creds?.apiKey
    const accountId: string | undefined = creds?.accountId
    if (!apiKey) return NextResponse.json({ error: 'missing_stripe_api_key' }, { status: 400 })

    const stripe = new Stripe(apiKey, { apiVersion: '2023-10-16' })

    // Create or ensure provider customer
    const customer = await stripe.customers.create({ email: customerEmail, name: customerName, phone: customerPhone }, accountId ? { stripeAccount: accountId } : undefined)

    // Minimal currency minor unit conversion (common zero-decimal currencies handled)
    const zeroDecimal = new Set(['JPY', 'KRW', 'VND'])
    const amountInMinor = zeroDecimal.has(currency) ? Math.round(amount) : Math.round(amount * 100)

    // Create PaymentIntent
    const pi = await stripe.paymentIntents.create({
      amount: amountInMinor,
      currency: currency.toLowerCase(),
      customer: customer.id,
      metadata: { merchantId },
      automatic_payment_methods: { enabled: true },
    }, accountId ? { stripeAccount: accountId } : undefined)

    const payment = { id: pi.id, clientSecret: pi.client_secret }

    return NextResponse.json({ ok: true, provider, payment })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'internal_error' }, { status: 500 })
  }
}
