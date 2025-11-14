import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import Stripe from 'stripe'
import { randomUUID } from 'crypto'

const prisma = new PrismaClient()

// Fallback: record a Stripe PaymentIntent in payment_transactions when webhooks are not received
// Body: { payment_intent_id: string, productId?: string, slug?: string }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const piId = String(body?.payment_intent_id || '')
    const productId = body?.productId ? String(body.productId) : ''
    const slug = body?.slug ? String(body.slug) : ''
    if (!piId) return NextResponse.json({ error: 'payment_intent_id ausente', step: 'input_validation' }, { status: 400 })

    // Resolve product/clinic/merchant from productId or slug
    let product: any = null
    let clinic: any = null
    if (productId) {
      product = await prisma.products.findUnique({ where: { id: productId } })
    }
    if (!product && slug) {
      clinic = await prisma.clinic.findFirst({ where: { slug } })
      if (clinic) {
        product = await prisma.products.findFirst({ where: { clinicId: clinic.id } })
      }
    }
    if (!product) {
      console.error('[stripe][record][error]', { step: 'resolve_product', productId, slug });
      return NextResponse.json({ error: 'Produto não encontrado para registrar transação Stripe', step: 'resolve_product', details: { productId, slug } }, { status: 404 })
    }
    if (!clinic) {
      if (product?.clinicId) {
        clinic = await prisma.clinic.findUnique({ where: { id: String(product.clinicId) } })
      } else if (slug) {
        // Fallback to slug if product does not carry clinicId (defensive)
        clinic = await prisma.clinic.findFirst({ where: { slug } })
      }
    }
    if (!clinic) {
      console.error('[stripe][record][error]', { step: 'resolve_clinic', clinicId: product?.clinicId });
      return NextResponse.json({ error: 'Clínica não encontrada', step: 'resolve_clinic', details: { clinicId: product?.clinicId } }, { status: 404 })
    }

    const merchant = await prisma.merchant.findUnique({ where: { id: String(clinic.merchantId) } })
    if (!merchant) {
      console.error('[stripe][record][error]', { step: 'resolve_merchant', clinicId: clinic.id });
      return NextResponse.json({ error: 'Merchant não encontrado', step: 'resolve_merchant', details: { clinicId: clinic.id } }, { status: 404 })
    }

    // Load Stripe integration strictly from MerchantIntegration
    const integ = await prisma.merchantIntegration.findUnique({
      where: { merchantId_provider: { merchantId: String(merchant.id), provider: 'STRIPE' as any } },
      select: { isActive: true, credentials: true },
    })
    if (!integ || !integ.isActive) {
      console.error('[stripe][record][error]', { step: 'resolve_integration', merchantId: merchant.id, isActive: integ?.isActive });
      return NextResponse.json({ error: 'Stripe não está ativo para este merchant', step: 'resolve_integration', details: { merchantId: merchant.id } }, { status: 400 })
    }
    const creds = (integ.credentials || {}) as any
    const apiKey: string | undefined = creds?.apiKey
    const accountId: string | undefined = creds?.accountId || undefined
    if (!apiKey) {
      console.error('[stripe][record][error]', { step: 'resolve_integration', hasApiKey: !!apiKey, hasAccountId: !!accountId });
      return NextResponse.json({ error: 'Credenciais da Stripe ausentes', step: 'resolve_integration', details: { hasApiKey: !!apiKey, hasAccountId: !!accountId } }, { status: 400 })
    }

    const stripe = new Stripe(apiKey)
    let pi
    try {
      pi = await stripe.paymentIntents.retrieve(piId, accountId ? { stripeAccount: accountId } : undefined)
    } catch (e: any) {
      console.error('[stripe][record][error]', { step: 'stripe_retrieve_pi', piId, accountId, err: e?.message || String(e) });
      return NextResponse.json({ error: 'Falha ao recuperar PaymentIntent da Stripe', step: 'stripe_retrieve_pi', details: { piId, accountId, msg: e?.message || String(e) } }, { status: 400 })
    }
    // Optionally expand charge to get billing details
    let charge: Stripe.Charge | null = null
    try {
      const expanded = await stripe.paymentIntents.retrieve(piId, accountId ? ({ expand: ['latest_charge'], stripeAccount: accountId } as any) : ({ expand: ['latest_charge'] } as any))
      charge = (expanded.latest_charge as any) || null
    } catch {}

    const amount = Number(pi.amount || 0)
    const currency = String(pi.currency || 'usd').toUpperCase()
    const status = String(pi.status || '').toLowerCase()
    const isSucceeded = status === 'succeeded'
    const isRequiresCapture = status === 'requires_capture'

    const buyer = {
      name: (pi as any)?.shipping?.name || (charge?.billing_details?.name ?? ''),
      email: (pi as any)?.receipt_email || (charge?.billing_details?.email ?? ''),
    }

    // Persist minimal payment_transactions row (upsert via ON CONFLICT)
    try {
      const txId = randomUUID()
      await prisma.$executeRawUnsafe(
        `INSERT INTO payment_transactions (
          id, provider, provider_order_id, doctor_id, patient_profile_id, clinic_id, product_id,
          amount_cents, clinic_amount_cents, platform_amount_cents, platform_fee_cents, currency,
          installments, payment_method_type, status, raw_payload, routed_provider
        ) VALUES (
          $1, 'stripe', $2, null, null, $3, $4,
          $5, NULL, NULL, NULL, $6,
          1, 'credit_card', $7, $8::jsonb, 'STRIPE'
        )
        ON CONFLICT (provider, provider_order_id) DO NOTHING`,
        txId,
        String(pi.id),
        String(clinic.id),
        String(product.id),
        amount,
        currency,
        isSucceeded ? 'paid' : (isRequiresCapture ? 'authorized' : status || 'processing'),
        JSON.stringify({ provider: 'stripe', payment_intent_id: pi.id, buyer })
      )
    } catch (e) {
      console.warn('[stripe][record] failed to persist payment_transactions:', e instanceof Error ? e.message : e)
    }

    return NextResponse.json({ ok: true, status: pi.status, amount, currency })
  } catch (e: any) {
    console.error('[stripe][record][error][unhandled]', e);
    return NextResponse.json({ error: e?.message || 'internal_error', step: 'unhandled', details: { stack: e?.stack || null } }, { status: 500 })
  }
}
