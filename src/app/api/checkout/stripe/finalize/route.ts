import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { onPaymentTransactionCreated } from '@/lib/webhooks/emit-updated'
import Stripe from 'stripe'

function jsonError(status: number, error: string, step: string, details?: any) {
  try { console.error('[stripe][finalize][error]', { step, error, details }) } catch {}
  return NextResponse.json({ ok: false, error, step, details }, { status })
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const { payment_intent_id } = body || {}
    if (!payment_intent_id) return jsonError(400, 'payment_intent_id é obrigatório', 'input_validation')

    // Use platform secret just to retrieve PI; merchant-specific not required for standard mode
    const secret = process.env.STRIPE_SECRET_KEY
    if (!secret) return jsonError(400, 'STRIPE_SECRET_KEY ausente', 'env_validation')
    const stripe = new Stripe(secret, { apiVersion: '2023-10-16' })

    const pi = await stripe.paymentIntents.retrieve(String(payment_intent_id), { expand: ['charges.data.payment_method_details.card'] })
    if (!pi) return jsonError(404, 'PaymentIntent não encontrado', 'retrieve_pi', { payment_intent_id })

    const status = String(pi.status || '')
    const amount_cents = Number(pi.amount || 0)
    const currency = String(pi.currency || 'BRL').toUpperCase()
    const md = (pi.metadata || {}) as any
    const merchantId = md?.merchantId ? String(md.merchantId) : null
    const clinicId = md?.clinicId ? String(md.clinicId) : null
    const productId = md?.productId ? String(md.productId) : null

    // Basic buyer data
    const charge = Array.isArray(pi.charges?.data) ? pi.charges.data[0] : null
    const buyerEmail = String(charge?.billing_details?.email || '')
    const buyerName = String(charge?.billing_details?.name || '')

    // Ensure unified customer
    if (!merchantId || !buyerEmail) return jsonError(400, 'merchantId/ buyerEmail ausentes no PI.metadata/charges', 'resolve_customer', { hasMerchantId: !!merchantId, buyerEmail })
    let unifiedCustomerId: string
    const existing = await prisma.customer.findFirst({ where: { merchantId: merchantId, email: buyerEmail }, select: { id: true } })
    if (existing?.id) {
      unifiedCustomerId = existing.id
      await prisma.customer.update({ where: { id: existing.id }, data: { name: buyerName || undefined } }).catch(() => {})
    } else {
      const created = await prisma.customer.create({ data: { merchantId, email: buyerEmail, name: buyerName } as any, select: { id: true } })
      unifiedCustomerId = created.id
    }

    // Ensure customer_providers (STRIPE) using PI.customer
    const stripeCustomerId = pi.customer ? String(pi.customer) : null
    if (stripeCustomerId) {
      const cp = await prisma.customerProvider.findFirst({ where: { customerId: unifiedCustomerId, provider: 'STRIPE' as any, accountId: merchantId }, select: { id: true } })
      if (cp?.id) {
        await prisma.customerProvider.update({ where: { id: cp.id }, data: { providerCustomerId: stripeCustomerId } })
      } else {
        await prisma.customerProvider.create({ data: { customerId: unifiedCustomerId, provider: 'STRIPE' as any, providerCustomerId: stripeCustomerId, accountId: merchantId } as any })
      }
    }

    // Save pm_xxx into vault if present
    const paymentMethodId = pi.payment_method ? String(pi.payment_method) : null
    if (paymentMethodId) {
      // Try to fetch PM to extract brand/last4/exp
      let brand: string | null = null
      let last4: string | null = null
      let expMonth: number | null = null
      let expYear: number | null = null
      try {
        const pmObj = await stripe.paymentMethods.retrieve(paymentMethodId)
        const card = (pmObj?.card || null) as any
        brand = card?.brand ? String(card.brand) : null
        last4 = card?.last4 ? String(card.last4) : null
        expMonth = card?.exp_month ? Number(card.exp_month) : null
        expYear = card?.exp_year ? Number(card.exp_year) : null
      } catch {}
      try {
        const { VaultManager } = await import('@/lib/payments/vault/manager')
        const vm = new VaultManager()
        const existingStripe = await vm.listCards(String(unifiedCustomerId), 'STRIPE')
        await vm.saveCard({
          customerId: String(unifiedCustomerId),
          provider: 'STRIPE',
          token: paymentMethodId,
          accountId: merchantId,
          brand,
          last4,
          expMonth,
          expYear,
          setAsDefault: !existingStripe || existingStripe.length === 0,
        })
      } catch (e) {
        console.warn('[stripe][finalize] saveCard error', e)
      }
    }

    // Upsert payment_transactions
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO payment_transactions (
           id, provider, provider_order_id, clinic_id, merchant_id, product_id, customer_id,
           amount_cents, currency, payment_method_type, status, provider_v2, status_v2, routed_provider, raw_payload, client_name, client_email
         ) VALUES (
           gen_random_uuid(), 'stripe', $1, $2, $9, $3, $4,
           $5, $6, 'credit_card', $7, 'STRIPE'::"PaymentProvider", $8::"PaymentStatus", 'STRIPE', $10::jsonb, $11, $12
         ) ON CONFLICT (provider, provider_order_id) DO UPDATE SET
           status = EXCLUDED.status,
           raw_payload = EXCLUDED.raw_payload,
           customer_id = COALESCE(payment_transactions.customer_id, EXCLUDED.customer_id)`,
        String(pi.id),
        clinicId,
        productId,
        unifiedCustomerId,
        amount_cents,
        currency,
        (status === 'requires_capture' ? 'authorized' : (status === 'succeeded' ? 'paid' : status)),
        (status === 'succeeded' ? 'SUCCEEDED' : (status === 'requires_action' ? 'PROCESSING' : (status === 'processing' ? 'PROCESSING' : 'FAILED'))),
        JSON.stringify({ provider: 'stripe', payment_intent_id: pi.id }),
        String(buyerName || ''),
        String(buyerEmail || '')
      )
      // Emit created event (best-effort)
      try {
        const rows: any[] = await prisma.$queryRawUnsafe(
          `SELECT id FROM payment_transactions WHERE provider = 'stripe' AND provider_order_id = $1 ORDER BY created_at DESC LIMIT 1`,
          String(pi.id)
        )
        const txId = rows?.[0]?.id
        if (txId) await onPaymentTransactionCreated(String(txId))
      } catch {}
    } catch {}

    return NextResponse.json({ ok: true, payment_intent_id: pi.id, status: pi.status })
  } catch (e: any) {
    try { console.error('[stripe][finalize][unhandled]', e) } catch {}
    return NextResponse.json({ ok: false, error: e?.message || 'internal_error' }, { status: 500 })
  }
}
