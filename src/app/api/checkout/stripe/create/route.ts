import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import Stripe from 'stripe'
import { buildStripeClientForMerchant } from '@/lib/payments/stripe/build'
import { getCurrencyForCountry } from '@/lib/payments/countryCurrency'
import { onPaymentTransactionCreated } from '@/lib/webhooks/emit-updated'
import { normalizeEmail } from '@/lib/utils'

function jsonError(status: number, error: string, step: string, details?: any) {
  try { console.error('[stripe][create][error]', { step, error, details }); } catch {}
  return NextResponse.json({ error, step, details }, { status })
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const { productId, slug, buyer, amountCents, currency } = body || {}

    if (!buyer?.email || !buyer?.name) return jsonError(400, 'buyer.name e buyer.email são obrigatórios', 'input_validation')

    // Resolve product/clinic/merchant
    let product: any = null
    if (productId) {
      product = await prisma.product.findUnique({ where: { id: String(productId) }, select: { id: true, clinicId: true, price: true, doctorId: true, name: true } })
    }

    let clinic: any = null
    if (product?.clinicId) clinic = await prisma.clinic.findUnique({ where: { id: String(product.clinicId) } })
    if (!clinic && slug) clinic = await prisma.clinic.findFirst({ where: { slug: String(slug) } })
    if (!clinic) return jsonError(404, 'Clínica não encontrada', 'resolve_clinic', { productId, slug })

    let merchant = await prisma.merchant.findUnique({ where: { clinicId: String(clinic.id) } })
    if (!merchant) {
      try { merchant = await prisma.merchant.create({ data: { clinicId: String(clinic.id) } as any }) } catch {}
    }
    if (!merchant?.id) return jsonError(404, 'Merchant não encontrado', 'resolve_merchant', { clinicId: clinic.id })

    // Build Stripe client
    let stripe: Stripe
    try {
      const b = await buildStripeClientForMerchant(String(merchant.id))
      stripe = b.stripe
    } catch (e: any) {
      return jsonError(400, e?.message || 'stripe_integration_error', 'resolve_integration')
    }

    // Amount in cents
    const resolvedAmountCents = (() => {
      const override = Number(amountCents)
      if (Number.isFinite(override) && override > 0) return Math.round(override)
      const fromProduct = Number(product?.price || 0)
      if (fromProduct > 0) return Math.round(fromProduct * 100)
      return 0
    })()
    if (!resolvedAmountCents || resolvedAmountCents <= 0) return jsonError(400, 'Valor inválido (amountCents)', 'resolve_amount', { amountCents })

    const resolvedCurrency = String(currency || 'BRL').toUpperCase()

    // Ensure unified Customer
    const buyerEmail = normalizeEmail(buyer.email)
    if (!buyerEmail) return jsonError(400, 'Email inválido', 'input_validation')
    const buyerName = String(buyer.name || '')
    let unifiedCustomerId: string
    const existing = await prisma.customer.findFirst({ where: { merchantId: String(merchant.id), email: buyerEmail }, select: { id: true } })
    if (existing?.id) {
      unifiedCustomerId = existing.id
      await prisma.customer.update({ where: { id: existing.id }, data: { name: buyerName || undefined } }).catch(() => {})
    } else {
      const created = await prisma.customer.create({ data: { merchantId: String(merchant.id), email: buyerEmail, name: buyerName } as any, select: { id: true } })
      unifiedCustomerId = created.id
    }

    // Ensure customer_providers (STRIPE)
    let customerProvider = await prisma.customerProvider.findFirst({ where: { customerId: unifiedCustomerId, provider: 'STRIPE' as any, accountId: String(merchant.id) }, select: { id: true, providerCustomerId: true } })
    if (!customerProvider || !customerProvider.providerCustomerId) {
      const stripeCustomer = await stripe.customers.create({
        email: buyerEmail || undefined,
        name: buyerName || undefined,
        metadata: { unifiedCustomerId, merchantId: String(merchant.id) }
      })
      if (!customerProvider) {
        customerProvider = await prisma.customerProvider.create({ data: { customerId: unifiedCustomerId, provider: 'STRIPE' as any, accountId: String(merchant.id), providerCustomerId: stripeCustomer.id } as any, select: { id: true, providerCustomerId: true } })
      } else {
        await prisma.customerProvider.update({ where: { id: customerProvider.id }, data: { providerCustomerId: stripeCustomer.id } })
        customerProvider.providerCustomerId = stripeCustomer.id
      }
    }

    const stripeCustomerId = customerProvider.providerCustomerId!

    // Create PaymentIntent (on-session) with setup_future_usage to save card automatically
    const pi = await stripe.paymentIntents.create({
      amount: resolvedAmountCents,
      currency: resolvedCurrency.toLowerCase(),
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      setup_future_usage: 'off_session',
      description: product?.name || 'Cobrança',
      metadata: {
        merchantId: String(merchant.id),
        clinicId: String(clinic.id),
        productId: product?.id ? String(product.id) : '',
        unifiedCustomerId
      }
    })

    // Optionally create an early transaction row for visibility
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO payment_transactions (
           id, provider, provider_order_id, clinic_id, merchant_id, product_id,
           customer_id, amount_cents, currency, payment_method_type, status, provider_v2, status_v2, routed_provider, raw_payload, client_name, client_email
         ) VALUES (
           gen_random_uuid(), 'stripe', $1, $2, $9, $3,
           $4, $5, $6, 'credit_card', 'processing', 'STRIPE'::"PaymentProvider", 'PROCESSING'::"PaymentStatus", 'STRIPE', $7::jsonb, $10, $11
         ) ON CONFLICT DO NOTHING`,
        String(pi.id),
        String(clinic.id),
        product?.id ? String(product.id) : null,
        unifiedCustomerId,
        resolvedAmountCents,
        resolvedCurrency.toUpperCase(),
        JSON.stringify({ step: 'create_pi', pi: { id: pi.id, status: pi.status } }),
        String(merchant.id),
        String(buyer.name || ''),
        String(buyer.email || ''),
      )
      // Emit created event (best-effort): fetch id and emit
      try {
        const rows: any[] = await prisma.$queryRawUnsafe(
          `SELECT id FROM payment_transactions WHERE provider = 'stripe' AND provider_order_id = $1 ORDER BY created_at DESC LIMIT 1`,
          String(pi.id)
        )
        const txId = rows?.[0]?.id
        if (txId) await onPaymentTransactionCreated(String(txId))
      } catch {}
    } catch {}

    return NextResponse.json({ ok: true, provider: 'STRIPE', payment_intent_id: pi.id, client_secret: pi.client_secret })
  } catch (e: any) {
    try { console.error('[stripe][create][unhandled]', e) } catch {}
    return NextResponse.json({ error: e?.message || 'internal_error', step: 'unhandled' }, { status: 500 })
  }
}
