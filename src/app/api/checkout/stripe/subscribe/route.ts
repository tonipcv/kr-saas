import { NextResponse } from 'next/server'
import { getStripeFromClinicIntegration } from '@/lib/payments/stripe/integration'
import { prisma } from '@/lib/prisma'
import type Stripe from 'stripe'

// Request body
// {
//   clinicId: string,
//   productId?: string,
//   offerId?: string,
//   buyer?: { name?: string; email?: string; phone?: string },
//   stripePriceId: string,
//   // Phase 1: no paymentMethodId -> create SetupIntent and return client_secret
//   // Phase 2: provide paymentMethodId -> attach and create subscription immediately
//   paymentMethodId?: string,
//   customerId?: string
// }
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const clinicId: string = String(body?.clinicId || '')
    const stripePriceId: string = String(body?.stripePriceId || '')
    const productId: string | undefined = body?.productId ? String(body.productId) : undefined
    const offerId: string | undefined = body?.offerId ? String(body.offerId) : undefined
    const paymentMethodId: string | undefined = body?.paymentMethodId ? String(body.paymentMethodId) : undefined
    const buyer = body?.buyer || {}
    if (!clinicId) return NextResponse.json({ error: 'clinicId is required', code: 'missing_param' }, { status: 400 })
    if (!stripePriceId) return NextResponse.json({ error: 'stripePriceId is required', code: 'missing_param' }, { status: 400 })

    const { stripe, accountId } = await getStripeFromClinicIntegration(clinicId) as { stripe: any; accountId?: string }

    // Try resolve or create a Stripe customer
    let customerId: string | undefined = (body?.customerId ? String(body.customerId) : undefined)
    if (!customerId) {
      const cust = await stripe.customers.create({
        email: buyer?.email || undefined,
        name: buyer?.name || undefined,
        phone: buyer?.phone || undefined,
        metadata: { clinicId, productId: productId || '', offerId: offerId || '' },
      })
      customerId = cust.id
    }
    // Enrich buyer from Stripe (ensures we have Contact in UI)
    let stripeCustomer: any = null
    try { stripeCustomer = await stripe.customers.retrieve(String(customerId)) } catch {}
    const buyerName = buyer?.name || stripeCustomer?.name || null
    const buyerEmail = buyer?.email || stripeCustomer?.email || null
    const buyerPhone = buyer?.phone || stripeCustomer?.phone || null

    if (!paymentMethodId) {
      // Phase 1: Create a SetupIntent so frontend can collect/confirm a PM
      const si = await stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ['card'],
        usage: 'off_session',
        metadata: { clinicId, productId: productId || '', offerId: offerId || '', flow: 'subscription_setup' },
      })
      if (!si?.client_secret) return NextResponse.json({ error: 'Failed to create SetupIntent' }, { status: 500 })
      return NextResponse.json({ ok: true, phase: 'setup', clientSecret: si.client_secret, customerId })
    }

    // Phase 2: attach PM and create subscription
    try {
      await stripe.paymentMethods.attach(paymentMethodId, { customer: String(customerId) })
    } catch {}
    // Make default payment method for invoice
    await stripe.customers.update(String(customerId), { invoice_settings: { default_payment_method: paymentMethodId } })

    const sub: Stripe.Subscription = await stripe.subscriptions.create({
      customer: String(customerId),
      items: [{ price: stripePriceId }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
      metadata: { clinicId, productId: productId || '', offerId: offerId || '' },
    })

    const pi = (sub.latest_invoice as any)?.payment_intent
    const clientSecret = pi?.client_secret || null

    // ===== Persist internal Customer/Subscription records =====
    try {
      // Resolve merchant from clinic
      const merchant = await prisma.merchant.findFirst({ where: { clinicId }, select: { id: true } })
      const merchantId = merchant?.id || null

      // Ensure Customer (internal). Be resilient to older DBs without customers.merchantId
      let customer = null as any
      
      // VALIDATION: Only create customer if we have complete data (name, email, phone)
      const hasCompleteData = buyerName && buyerEmail && buyerPhone && 
                              String(buyerName).trim() !== '' && 
                              String(buyerEmail).trim() !== '' && 
                              String(buyerPhone).trim() !== ''
      
      if (!hasCompleteData) {
        console.warn('[stripe][subscribe] Skipping customer creation - incomplete data', { 
          hasName: !!buyerName, 
          hasEmail: !!buyerEmail, 
          hasPhone: !!buyerPhone 
        })
      }
      
      try {
        customer = await prisma.customer.findFirst({ where: { email: buyerEmail || undefined }, select: { id: true } })
      } catch {}
      
      if (!customer && hasCompleteData) {
        try {
          // Detect if customers has merchant id column (camel or snake)
          const colRows: any[] = await prisma.$queryRawUnsafe(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'customers' AND column_name IN ('merchantId','merchant_id')"
          )
          const colNames = Array.isArray(colRows) ? colRows.map((r: any) => r.column_name) : []
          const hasCamel = colNames.includes('merchantId')
          const hasSnake = colNames.includes('merchant_id')
          if (hasCamel) {
            customer = await prisma.customer.create({ data: { merchantId: merchantId || '', name: buyerName, email: buyerEmail, phone: buyerPhone, metadata: { clinicId, productId, offerId } as any } })
          } else if (hasSnake) {
            // Minimal insert with merchant_id snake_case
            const id = (global as any).crypto?.randomUUID ? (global as any).crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`
            await prisma.$executeRawUnsafe(
              `INSERT INTO "customers" ("id", "merchant_id", "name", "email", "phone") VALUES ($1, $2, $3, $4, $5)`,
              id,
              merchantId || '',
              buyerName,
              buyerEmail,
              buyerPhone,
            )
            customer = { id }
          } else {
            // Minimal insert without merchantId column
            const id = (global as any).crypto?.randomUUID ? (global as any).crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`
            await prisma.$executeRawUnsafe(
              `INSERT INTO "customers" ("id", "name", "email", "phone") VALUES ($1, $2, $3, $4)`,
              id,
              buyerName,
              buyerEmail,
              buyerPhone,
            )
            customer = { id }
          }
        } catch {}
      } else if (buyerName || buyerEmail || buyerPhone) {
        // Update existing Customer basic info if missing
        try {
          await prisma.$executeRawUnsafe(
            `UPDATE "customers" SET name = COALESCE($2, name), email = COALESCE($3, email), phone = COALESCE($4, phone), updated_at = NOW() WHERE id = $1`,
            String(customer.id),
            buyerName,
            buyerEmail,
            buyerPhone,
          )
        } catch {}
      }

      // Upsert CustomerProvider (Stripe) via raw SQL (snake_case)
      let customerProvider: any = null
      if (merchantId && customer?.id && customerId) {
        const cpExist: any[] = await prisma.$queryRawUnsafe(
          `SELECT id FROM "customer_providers" WHERE customer_id = $1 AND provider = 'STRIPE' AND ${accountId ? 'account_id = $2' : 'account_id IS NULL'} LIMIT 1`,
          String(customer.id),
          ...(accountId ? [accountId] as any : [])
        )
        const metaObj = { clinicId, productId, offerId, buyerName, buyerEmail, buyerPhone }
        if (Array.isArray(cpExist) && cpExist.length > 0) {
          const cpId = cpExist[0].id
          await prisma.$executeRawUnsafe(
            `UPDATE "customer_providers" SET provider_customer_id = $1, metadata = $2::jsonb, updated_at = NOW() WHERE id = $3`,
            String(customerId),
            JSON.stringify(metaObj),
            cpId,
          )
          customerProvider = { id: cpId }
        } else {
          const newCpId = (global as any).crypto?.randomUUID ? (global as any).crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`
          await prisma.$executeRawUnsafe(
            `INSERT INTO "customer_providers" ("id","customer_id","provider","account_id","provider_customer_id","metadata") VALUES ($1, $2, 'STRIPE', $3, $4, $5::jsonb)`,
            newCpId,
            String(customer.id),
            accountId || null,
            String(customerId),
            JSON.stringify(metaObj),
          )
          customerProvider = { id: newCpId }
        }
        // Immediately upsert initial payment_transactions if PI exists (first subscription charge)
        try {
          const piAny: any = (sub.latest_invoice as any)?.payment_intent || null
          const piId: string | null = piAny?.id ? String(piAny.id) : null
          const piStatus: string = String(piAny?.status || '').toLowerCase()
          if (piId) {
            const normalized = (piStatus === 'succeeded') ? 'paid' : (piStatus === 'requires_capture' ? 'authorized' : (piStatus || 'processing'))
            const statusV2 = (piStatus === 'succeeded') ? 'SUCCEEDED' : (piStatus === 'requires_action' || piStatus === 'processing' ? 'PROCESSING' : (piStatus === 'requires_capture' ? 'PROCESSING' : 'FAILED'))
            await prisma.$executeRawUnsafe(
              `INSERT INTO payment_transactions (
                 id, provider, provider_order_id, clinic_id, merchant_id, product_id, customer_id,
                 amount_cents, currency, payment_method_type, status, provider_v2, status_v2, routed_provider, raw_payload
               ) VALUES (
                 gen_random_uuid(), 'stripe', $1, $2, $9, $3, $4,
                 $5, $6, 'credit_card', $7, 'STRIPE'::"PaymentProvider", $8::"PaymentStatus", 'STRIPE', $10::jsonb
               ) ON CONFLICT (provider, provider_order_id) DO NOTHING`,
              String(piId),
              clinicId,
              productId,
              customer?.id || null,
              unitAmount,
              currency,
              normalized,
              statusV2,
              JSON.stringify({ provider: 'stripe', subscription_id: sub.id, payment_intent_id: piId })
            )
            try {
              const { onPaymentTransactionCreated } = await import('@/lib/webhooks/emit-updated')
              const rows: any[] = await prisma.$queryRawUnsafe(
                `SELECT id FROM payment_transactions WHERE provider = 'stripe' AND provider_order_id = $1 ORDER BY created_at DESC LIMIT 1`,
                String(piId)
              )
              const txId = rows?.[0]?.id
              if (txId) await onPaymentTransactionCreated(String(txId))
            } catch {}
          }
        } catch (e) {
          console.warn('[stripe][subscribe] upsert initial payment_transactions failed', (e as any)?.message || e)
        }
      }

      // Retrieve PM details and upsert CustomerPaymentMethod via raw SQL
      let vaultPaymentMethodId: string | null = null
      if (merchantId && customer?.id && paymentMethodId) {
        let pm: any = null
        try { pm = await stripe.paymentMethods.retrieve(paymentMethodId, accountId ? { stripeAccount: accountId } : undefined) } catch {}
        const brand = pm?.card?.brand || null
        const last4 = pm?.card?.last4 || null
        const expMonth = pm?.card?.exp_month || null
        const expYear = pm?.card?.exp_year || null
        const cpmExist: any[] = await prisma.$queryRawUnsafe(
          `SELECT id FROM "customer_payment_methods" WHERE provider = 'STRIPE' AND ${accountId ? 'account_id = $1' : 'account_id IS NULL'} AND provider_payment_method_id = ${accountId ? '$2' : '$1'} LIMIT 1`,
          ...(accountId ? [accountId, String(paymentMethodId)] as any : [String(paymentMethodId)] as any)
        )
        if (Array.isArray(cpmExist) && cpmExist.length > 0) {
          const cpmId = cpmExist[0].id
          await prisma.$executeRawUnsafe(
            `UPDATE "customer_payment_methods" SET customer_id = $1, brand = $2, last4 = $3, exp_month = $4, exp_year = $5, customer_provider_id = $6, status = 'ACTIVE', updated_at = NOW() WHERE id = $7`,
            String(customer.id),
            brand,
            last4,
            expMonth,
            expYear,
            customerProvider?.id || null,
            cpmId,
          )
          vaultPaymentMethodId = cpmId
        } else {
          const newCpmId = (global as any).crypto?.randomUUID ? (global as any).crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`
          await prisma.$executeRawUnsafe(
            `INSERT INTO "customer_payment_methods" ("id","customer_id","customer_provider_id","provider","account_id","provider_payment_method_id","brand","last4","exp_month","exp_year","is_default","status") VALUES ($1, $2, $3, 'STRIPE', $4, $5, $6, $7, $8, $9, $10, 'ACTIVE')`,
            newCpmId,
            String(customer.id),
            customerProvider?.id || null,
            accountId || null,
            String(paymentMethodId),
            brand,
            last4,
            expMonth,
            expYear,
            true,
          )
          vaultPaymentMethodId = newCpmId
        }
      }

      // Create/Update customer_subscriptions using raw SQL (snake_case) aligned to DB
      if (merchantId && customer?.id) {
        const item0: any = Array.isArray(sub.items?.data) ? sub.items.data[0] : null
        const unitAmount = Number(item0?.price?.unit_amount || 0)
        const currency = String(item0?.price?.currency || 'USD').toUpperCase()
        const mapStatus = (s?: string, piStatus?: string, hasTrial?: boolean) => {
          const v = String(s || '').toLowerCase()
          // If paid and no trial, consider ACTIVE immediately
          if (!hasTrial && String(piStatus || '').toLowerCase() === 'succeeded') return 'ACTIVE'
          if (v === 'active') return 'ACTIVE'
          if (v === 'trialing') return 'TRIAL'
          if (v === 'past_due') return 'PAST_DUE'
          if (v === 'canceled') return 'CANCELED'
          if (v === 'incomplete' || v === 'incomplete_expired') return 'PENDING'
          // Default to PENDING for new subscriptions until first payment confirms
          return 'PENDING'
        }

        const existRows: any[] = await prisma.$queryRawUnsafe(
          'SELECT id FROM "customer_subscriptions" WHERE provider_subscription_id = $1 LIMIT 1',
          String(sub.id)
        )
        const piStatus = ((sub.latest_invoice as any)?.payment_intent as any)?.status
        const hasTrial = !!sub.trial_end
        const statusVal = mapStatus(sub.status, piStatus, hasTrial)
        const startAt = sub.start_date ? new Date(sub.start_date * 1000) : new Date()
        const trialEndsAt = sub.trial_end ? new Date(sub.trial_end * 1000) : null
        const curStart = sub.current_period_start ? new Date(sub.current_period_start * 1000) : null
        const curEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null
        const cancelAt = sub.cancel_at ? new Date(sub.cancel_at * 1000) : null
        const canceledAt = sub.canceled_at ? new Date(sub.canceled_at * 1000) : null
        const recurring: any = (Array.isArray(sub.items?.data) && sub.items.data[0]?.price?.recurring) ? sub.items.data[0].price.recurring : null
        const interval = recurring?.interval || null
        const intervalCount = recurring?.interval_count || null
        const metaSub = {
          clinicId,
          productId,
          offerId,
          buyerName,
          buyerEmail,
          buyerPhone,
          interval,
          intervalCount,
        }

        if (Array.isArray(existRows) && existRows.length > 0) {
          // Update minimal fields
          await prisma.$executeRawUnsafe(
            'UPDATE "customer_subscriptions" SET status = $1::"SubscriptionStatus", current_period_start = $2, current_period_end = $3, trial_ends_at = $4, cancel_at = $5, canceled_at = $6, price_cents = $7, currency = $8::"Currency", metadata = $10::jsonb, updated_at = NOW() WHERE provider_subscription_id = $9',
            statusVal,
            curStart,
            curEnd,
            trialEndsAt,
            cancelAt,
            canceledAt,
            unitAmount,
            currency,
            String(sub.id),
            JSON.stringify(metaSub)
          )
        } else {
          const newId = (global as any).crypto?.randomUUID ? (global as any).crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`
          await prisma.$executeRawUnsafe(
            'INSERT INTO "customer_subscriptions" ("id","merchant_id","customer_id","product_id","offer_id","provider","account_id","customer_provider_id","provider_subscription_id","vault_payment_method_id","status","start_at","trial_ends_at","current_period_start","current_period_end","cancel_at","canceled_at","price_cents","currency","metadata") VALUES ($1, $2, $3, $4, $5, $6::"PaymentProvider", $7, $8, $9, $10, $11::"SubscriptionStatus", $12, $13, $14, $15, $16, $17, $18, $19::"Currency", $20::jsonb)',
            newId,
            String(merchantId),
            String(customer.id),
            productId || '',
            offerId || null,
            'STRIPE',
            accountId || null,
            customerProvider?.id || null,
            String(sub.id),
            vaultPaymentMethodId || null,
            statusVal,
            startAt,
            trialEndsAt,
            curStart,
            curEnd,
            cancelAt,
            canceledAt,
            unitAmount,
            currency,
            JSON.stringify(metaSub)
          )
        }
      }
    } catch (persistErr) {
      console.warn('[stripe][subscribe] persist CustomerSubscription failed', persistErr)
    }

    return NextResponse.json({ ok: true, phase: 'subscribe', subscriptionId: sub.id, clientSecret })
  } catch (e: any) {
    // Normalize Stripe error payload
    const raw: any = e?.raw || e || {}
    const decline_code: string | null = raw?.decline_code || e?.decline_code || null
    const code: string | null = raw?.code || e?.code || null
    const type: string | null = raw?.type || e?.type || null
    const payment_intent: any = raw?.payment_intent || e?.payment_intent || null
    const pi_id: string | null = payment_intent?.id || null
    const pi_status: string | null = payment_intent?.status || null
    const status = typeof e?.statusCode === 'number' ? e.statusCode : (decline_code ? 402 : 500)
    return NextResponse.json({
      error: 'Failed to create Stripe subscription',
      message: e?.message || raw?.message || 'Unknown error',
      decline_code,
      code,
      type,
      payment_intent_id: pi_id,
      payment_intent_status: pi_status,
    }, { status })
  }
}
