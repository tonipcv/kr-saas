import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import Stripe from 'stripe'

// New Stripe webhook endpoint (idempotent), isolated from legacy clinic webhook at /api/stripe/webhook
// Validates signatures using secrets stored in MerchantIntegration.credentials (integration-based)
// Supports platform and Connect: tries to verify using the matching integration (Stripe-Account) or any active STRIPE integration.

export async function POST(req: NextRequest) {
  const signature = req.headers.get('stripe-signature') || ''
  const stripeAccountHeader = req.headers.get('stripe-account') || ''
  const body = await req.text()

  // Load all active STRIPE integrations
  const integrations = await prisma.merchantIntegration.findMany({
    where: { provider: 'STRIPE' as any, isActive: true },
    select: { credentials: true },
  })
  const secrets = integrations
    .map((i: any) => (i?.credentials || {}) as any)
    .filter((c: any) => !!c)
    .filter((c: any) => !stripeAccountHeader || (c?.accountId && String(c.accountId) === String(stripeAccountHeader)))
    .map((c: any) => String(c?.webhookSecret || '').trim())
    .filter((s: string) => !!s)

  if (!secrets.length) {
    return NextResponse.json({ error: 'Webhook secret not configured in integrations' }, { status: 400 })
  }

  // We don't need a real API key to validate signatures
  const stripe = new Stripe('sk_dummy_for_webhook_validation')

  let event: Stripe.Event | null = null
  let lastError: any = null
  for (const sec of secrets) {
    try {
      event = stripe.webhooks.constructEvent(body, signature, sec)
      break
    } catch (e: any) {
      lastError = e
    }
  }
  if (!event) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // Persist (idempotent)
  try {
    await prisma.webhookEvent.create({
      data: {
        provider: 'STRIPE',
        hook_id: event.id,
        provider_event_id: event.id,
        type: event.type,
        raw: event as any,
        processed: false,
        retry_count: 0,
        max_retries: 3,
        is_retryable: true,
        next_retry_at: new Date(),
      },
    })
  } catch (err: any) {
    try {
      await prisma.webhookEvent.update({
        where: { provider_provider_event_id: { provider: 'STRIPE', provider_event_id: event.id } },
        data: { next_retry_at: new Date() },
      })
    } catch {}
    return NextResponse.json({ received: true })
  }
  // MVP inline processing: update/insert payment_transactions for key events
  try {
    const t = String(event.type || '')
    const obj: any = event.data?.object || {}
    if (t === 'payment_intent.succeeded' || t === 'payment_intent.requires_capture' || t === 'charge.succeeded') {
      const isPI = t.startsWith('payment_intent')
      const pi = isPI ? obj : (obj?.payment_intent_object || {})
      const charge = !isPI ? obj : (Array.isArray(obj?.charges?.data) ? obj.charges.data[0] : null)
      const provider_order_id = String((isPI ? pi?.id : (obj?.payment_intent || obj?.id)) || '')
      const status = isPI ? String(pi?.status || 'succeeded') : 'succeeded'
      const amount_cents = Number((isPI ? pi?.amount : obj?.amount) || 0)
      const currency = String((isPI ? pi?.currency : obj?.currency) || 'usd').toUpperCase()
      const md = (isPI ? (pi?.metadata || {}) : (obj?.metadata || {})) as any
      const clinicId = md?.clinicId ? String(md.clinicId) : null
      const productId = md?.productId ? String(md.productId) : null
      const installments = md?.effectiveInstallments ? Number(md.effectiveInstallments) : 1
      const buyer = {
        name: (charge?.billing_details?.name || ''),
        email: (charge?.billing_details?.email || ''),
      }
      // Resolve merchant and unified customer for Business Client
      let merchantId: string | null = null
      try {
        if (clinicId) {
          const m = await prisma.merchant.findFirst({ where: { clinicId: String(clinicId) }, select: { id: true } })
          merchantId = m?.id || null
        }
      } catch {}
      let unifiedCustomerId: string | null = null
      try {
        if (merchantId && buyer.email) {
          const existing = await prisma.customer.findFirst({ where: { merchantId: String(merchantId), email: String(buyer.email) }, select: { id: true } })
          if (existing?.id) unifiedCustomerId = existing.id
          else {
            const created = await prisma.customer.create({ data: { merchantId: String(merchantId), email: String(buyer.email), name: String(buyer.name || '') } as any, select: { id: true } } as any)
            unifiedCustomerId = created.id
          }
        }
      } catch {}
      // Mirror Customer Provider for STRIPE (account from header or event.account when present)
      try {
        if (unifiedCustomerId) {
          const acct = (stripeAccountHeader || (event as any)?.account || null) as string | null
          // Prefer Stripe customer id from object
          const stripeCustomerId = isPI ? (pi?.customer ? String(pi.customer) : null) : (obj?.customer ? String(obj.customer) : null)
          const existCp: any[] = await prisma.$queryRawUnsafe<any[]>(
            `SELECT id FROM customer_providers WHERE customer_id = $1 AND provider = 'STRIPE' AND ${acct ? 'account_id = $2' : 'account_id IS NULL'} LIMIT 1`,
            String(unifiedCustomerId),
            ...(acct ? [String(acct)] as any : [])
          ).catch(() => [])
          if (Array.isArray(existCp) && existCp.length > 0) {
            await prisma.$executeRawUnsafe(
              `UPDATE customer_providers SET provider_customer_id = $2, updated_at = NOW() WHERE id = $1`,
              String(existCp[0].id),
              stripeCustomerId || null
            )
          } else {
            await prisma.$executeRawUnsafe(
              `INSERT INTO customer_providers (id, customer_id, provider, account_id, provider_customer_id, created_at, updated_at)
               VALUES (gen_random_uuid(), $1, 'STRIPE'::"PaymentProvider", $2, $3, NOW(), NOW())`,
              String(unifiedCustomerId),
              acct,
              stripeCustomerId || null
            )
          }
        }
      } catch {}
      if (provider_order_id) {
        // Try insert; if exists, update status and payload
        try {
          await prisma.$executeRawUnsafe(
            `INSERT INTO payment_transactions (
              id, provider, provider_order_id, doctor_id, patient_profile_id, clinic_id, product_id, customer_id,
              amount_cents, clinic_amount_cents, platform_amount_cents, platform_fee_cents, currency,
              installments, payment_method_type, status, raw_payload, routed_provider
            ) VALUES (
              gen_random_uuid(), 'stripe', $1, NULL, NULL, $2, $3, $9,
              $4, NULL, NULL, NULL, $5,
              $6, 'credit_card', $7, $8::jsonb, 'STRIPE'
            )
            ON CONFLICT (provider, provider_order_id) DO NOTHING`,
            provider_order_id,
            clinicId,
            productId,
            amount_cents,
            currency,
            installments,
            (status === 'requires_capture' ? 'authorized' : (status === 'succeeded' ? 'paid' : status)),
            JSON.stringify({ provider: 'stripe', payment_intent_id: provider_order_id, buyer }),
            unifiedCustomerId
          )
        } catch {}
        try {
          await prisma.$executeRawUnsafe(
            `UPDATE payment_transactions
             SET status = $2,
                 amount_cents = CASE WHEN amount_cents IS NULL OR amount_cents = 0 THEN $3 ELSE amount_cents END,
                 currency = CASE WHEN currency IS NULL OR currency = '' THEN $4 ELSE currency END,
                 raw_payload = $5::jsonb,
                 customer_id = COALESCE(customer_id, $8),
                 client_name = CASE WHEN (client_name IS NULL OR client_name = '') AND $6 IS NOT NULL AND $6 <> '' THEN $6 ELSE client_name END,
                 client_email = CASE WHEN (client_email IS NULL OR client_email = '') AND $7 IS NOT NULL AND $7 <> '' THEN $7 ELSE client_email END
             WHERE provider = 'stripe' AND provider_order_id = $1`,
            provider_order_id,
            (status === 'requires_capture' ? 'authorized' : (status === 'succeeded' ? 'paid' : status)),
            amount_cents,
            currency,
            JSON.stringify({ provider: 'stripe', payment_intent_id: provider_order_id, buyer }),
            String(buyer?.name || ''),
            String(buyer?.email || ''),
            unifiedCustomerId
          )
        } catch {}
      }
    }
    // Failure events: mark transaction as failed
    if (t === 'payment_intent.payment_failed' || t === 'charge.failed' || t === 'payment_intent.canceled') {
      const isPI = t.startsWith('payment_intent')
      const obj: any = event.data?.object || {}
      const provider_order_id = String(isPI ? (obj?.id || '') : (obj?.payment_intent || obj?.id || ''))
      const md = (obj?.metadata || {}) as any
      const buyer = {
        name: String((obj?.charges?.data?.[0]?.billing_details?.name) || ''),
        email: String((obj?.charges?.data?.[0]?.billing_details?.email) || ''),
      }
      if (provider_order_id) {
        try {
          await prisma.$executeRawUnsafe(
            `UPDATE payment_transactions
               SET status = 'failed', status_v2 = 'FAILED'::"PaymentStatus",
                   raw_payload = $2::jsonb,
                   client_name = COALESCE(client_name, $3),
                   client_email = COALESCE(client_email, $4),
                   updated_at = NOW()
             WHERE provider = 'stripe' AND provider_order_id = $1`,
            provider_order_id,
            JSON.stringify({ provider: 'stripe', failure_event: t, object: obj, metadata: md }),
            String(buyer.name || ''),
            String(buyer.email || '')
          )
        } catch {}
      }
    }
    // Mark webhook event as processed
    try {
      await prisma.webhookEvent.update({
        where: { provider_provider_event_id: { provider: 'STRIPE', provider_event_id: event.id } },
        data: { processed: true },
      })
    } catch {}
  } catch {}

  return NextResponse.json({ received: true, processed: true })
}
