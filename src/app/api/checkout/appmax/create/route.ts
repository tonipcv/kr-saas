import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { AppmaxClient, buildAppmaxClientForMerchant } from '@/lib/payments/appmax/sdk'
import crypto from 'crypto'

function jsonError(status: number, error: string, step: string, details?: any) {
  try { console.error('[appmax][create][error]', { step, error, details }); } catch {}
  return NextResponse.json({ error, step, details }, { status })
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const { productId, slug, buyer, items, method, installments, card, token, shipping, discount } = body || {}

    // Validate input
    if (!productId && !slug) return jsonError(400, 'productId ou slug ausente', 'input_validation')
    if (!method || !['card','pix'].includes(String(method))) return jsonError(400, 'method inválido (use card ou pix)', 'input_validation', { method })
    if (!buyer || !buyer?.email || !buyer?.name) return jsonError(400, 'buyer incompleto (name/email)', 'input_validation')

    // Resolve product/clinic/merchant
    let product: any = null
    let clinic: any = null
    if (productId) {
      product = await prisma.product.findUnique({ where: { id: String(productId) } })
    }
    if (!product && slug) {
      clinic = await prisma.clinic.findFirst({ where: { slug: String(slug) } })
    }
    if (!product) return jsonError(404, 'Produto não encontrado', 'resolve_product', { productId, slug })
    
    // CRITICAL: Resolve clinicId from product or from doctor's clinic
    let resolvedClinicId = product.clinicId ? String(product.clinicId) : null
    if (!resolvedClinicId && product.doctorId) {
      try {
        const doctorClinic = await prisma.clinic.findFirst({ 
          where: { ownerId: String(product.doctorId), isActive: true }, 
          select: { id: true },
          orderBy: { createdAt: 'desc' }
        })
        resolvedClinicId = doctorClinic?.id || null
      } catch {}
    }
    if (!resolvedClinicId) {
      console.error('[appmax][create] CRITICAL: product has no clinicId', { productId, doctorId: product.doctorId })
      return jsonError(400, 'Produto sem clínica vinculada', 'product_missing_clinic')
    }
    
    // Try resolve clinic by product relation; if not present, fallback to slug
    if (!clinic) {
      if (resolvedClinicId) {
        clinic = await prisma.clinic.findUnique({ where: { id: resolvedClinicId } })
      }
      if (!clinic && slug) {
        clinic = await prisma.clinic.findFirst({ where: { slug: String(slug) } })
      }
    }
    if (!clinic) return jsonError(404, 'Clínica não encontrada', 'resolve_clinic', { clinicId: resolvedClinicId, slug })

    let merchant = clinic.merchantId
      ? await prisma.merchant.findUnique({ where: { id: String(clinic.merchantId) } })
      : null
    // Fallback by clinicId (unique)
    if (!merchant) {
      merchant = await prisma.merchant.findUnique({ where: { clinicId: String(clinic.id) } })
    }
    // Auto-provision minimal merchant if still missing
    if (!merchant) {
      try {
        merchant = await prisma.merchant.create({ data: { clinicId: String(clinic.id) } as any })
      } catch (e) {
        return jsonError(404, 'Merchant não encontrado', 'resolve_merchant', { clinicId: clinic.id })
      }
    }

    // Build Appmax client from MerchantIntegration
    let client: AppmaxClient
    try {
      client = await buildAppmaxClientForMerchant(String(merchant.id))
    } catch (e: any) {
      return jsonError(400, e?.message || 'appmax_integration_error', 'resolve_integration')
    }

    // 1) Create/Update Customer on Appmax
    // Appmax requires several address fields; we pass what we have and leave optional otherwise
    const firstname = String((buyer.name || '').split(' ')[0] || buyer.name || 'Cliente')
    const lastname = String((buyer.name || '').split(' ').slice(1).join(' ') || '-')
    const customerPayload: any = {
      firstname,
      lastname,
      email: String(buyer.email),
      telephone: (buyer.telephone || buyer.phone || '').toString().replace(/\D+/g, '').slice(0, 11) || '11999999999',
      postcode: (buyer.postcode || buyer.zip || '').toString().replace(/\D+/g, '').slice(0, 8) || '01010000',
      address_street: buyer.address_street || buyer.street || 'Rua Desconhecida',
      address_street_number: buyer.address_street_number || buyer.number || '0',
      address_street_complement: buyer.address_street_complement || buyer.complement || '',
      address_street_district: buyer.address_street_district || buyer.district || 'Centro',
      address_city: buyer.address_city || buyer.city || 'São Paulo',
      address_state: buyer.address_state || buyer.state || 'SP',
      ip: buyer.ip || '127.0.0.1',
      tracking: {
        utm_source: buyer.utm_source || null,
        utm_campaign: buyer.utm_campaign || null,
        utm_medium: buyer.utm_medium || null,
        utm_content: buyer.utm_content || null,
        utm_term: buyer.utm_term || null,
      },
    }

    let customerResp: any
    try {
      customerResp = await client.customersCreate(customerPayload)
    } catch (e: any) {
      return jsonError(400, 'Falha ao criar cliente na Appmax', 'appmax_customers_create', { msg: e?.message, resp: e?.response })
    }
    const customer_id = Number(customerResp?.customer_id || customerResp?.id || customerResp?.data?.id || customerResp?.data?.customer_id)
    if (!customer_id || !Number.isFinite(customer_id)) return jsonError(400, 'Resposta inválida ao criar cliente', 'appmax_customers_create_parse', { customerResp })

    // BEGIN Non-blocking orchestration dual-write (Customer + CustomerProvider)
    let unifiedCustomerId: string | null = null
    let unifiedCustomerProviderId: string | null = null
    try {
      console.log('[appmax][create][orchestration] 🔄 Starting dual-write...', { merchantId: merchant.id, buyerEmail: buyer.email })
      // Upsert Customer by email ONLY
      const docDigits = (buyer.document_number || buyer.document || '').toString().replace(/\D/g, '') || null
      const buyerEmail = buyer.email ? String(buyer.email) : null
      
      // VALIDATION: Only create customer if we have complete data (name, email, phone)
      const buyerName = String(buyer.name || '').trim()
      const buyerPhone = (buyer.telephone || buyer.phone || '').toString().replace(/\D/g, '').slice(0, 11) || ''
      const hasCompleteData = buyerName && buyerEmail && buyerPhone && 
                              buyerName !== '' && buyerEmail !== '' && buyerPhone !== ''
      
      if (!hasCompleteData) {
        console.warn('[appmax][create][orchestration] Skipping customer creation - incomplete data', { 
          hasName: !!buyerName, 
          hasEmail: !!buyerEmail, 
          hasPhone: !!buyerPhone 
        })
        throw new Error('Incomplete customer data')
      }
      
      let customer = null
      if (buyerEmail) {
        customer = await prisma.customer.findFirst({
          where: { merchantId: merchant.id, email: buyerEmail },
          select: { id: true }
        })
      }
      if (customer && hasCompleteData) {
        // Update existing customer
        await prisma.customer.update({
          where: { id: customer.id },
          data: {
            name: buyerName,
            phone: buyerPhone,
            document: docDigits || undefined,
            metadata: { source: 'appmax_checkout', appmaxCustomerId: customer_id },
          }
        }).catch(() => {})
        unifiedCustomerId = customer.id
        console.log('[appmax][create][orchestration] ✅ Customer found and updated', { customerId: unifiedCustomerId })
      } else if (!customer && buyerEmail && hasCompleteData) {
        const created = await prisma.customer.create({
          data: {
            merchantId: merchant.id,
            name: buyerName,
            email: buyerEmail,
            phone: buyerPhone,
            document: docDigits,
            metadata: { source: 'appmax_checkout', appmaxCustomerId: customer_id },
          },
          select: { id: true },
        })
        unifiedCustomerId = created.id
        console.log('[appmax][create][orchestration] ✅ Customer created', { customerId: unifiedCustomerId })
      }
      // Upsert CustomerProvider (APPMAX)
      if (unifiedCustomerId) {
        const cpWhere = { customerId: unifiedCustomerId, provider: 'APPMAX' as any, accountId: merchant.id }
        let customerProvider = await prisma.customerProvider.findFirst({ where: cpWhere, select: { id: true } })
        if (!customerProvider) {
          customerProvider = await prisma.customerProvider.create({
            data: { ...cpWhere, providerCustomerId: String(customer_id), metadata: { source: 'appmax_checkout' } },
            select: { id: true },
          })
          console.log('[appmax][create][orchestration] ✅ CustomerProvider created', { customerProviderId: customerProvider.id })
        } else {
          await prisma.customerProvider.update({
            where: { id: customerProvider.id },
            data: { providerCustomerId: String(customer_id), metadata: { source: 'appmax_checkout' } },
          })
          console.log('[appmax][create][orchestration] ✅ CustomerProvider updated', { customerProviderId: customerProvider.id })
        }
        unifiedCustomerProviderId = customerProvider.id
      }
    } catch (e) {
      console.warn('[appmax][create][orchestration] ⚠️  Dual-write failed (non-blocking)', e instanceof Error ? e.message : String(e))
    }
    // END Non-blocking orchestration dual-write

    // 2) Create Order
    // CRITICAL: Determine base price in CENTS for the order
    // Priority: items[].price (reais) > product.price (reais)
    const basePriceCents = (() => {
      // If items come with price, sum them and convert to cents
      if (Array.isArray(items) && items.length > 0) {
        const hasAllPrices = items.every((it: any) => typeof it.price === 'number' && it.price > 0)
        if (hasAllPrices) {
          const totalReais = items.reduce((acc: number, it: any) => {
            return acc + (Number(it.price) * Number(it.qty || 1))
          }, 0)
          return Math.round(totalReais * 100)
        }
      }
      // Fallback: use product.price (Decimal in reais)
      return Math.round(Number(product?.price || 0) * 100)
    })()

    // CRITICAL: AppMax API expects values in REAIS (Decimal 10,2), not cents!
    // We store in cents internally, but send reais to AppMax
    const totalReais = basePriceCents / 100
    
    // Build products list for AppMax (items in their payload format, prices in REAIS)
    const prods = Array.isArray(items) && items.length > 0 ? items.map((it: any) => ({
      sku: String(it.sku || product?.sku || product?.id),
      name: String(it.name || product?.name || 'Produto'),
      qty: Number(it.qty || 1),
      ...(it.price ? { price: Number(it.price) } : {}), // Keep in REAIS
      ...(it.digital_product != null ? { digital_product: it.digital_product ? 1 : 0 } : {}),
    })) : [
      { sku: String(product?.sku || product?.id), name: String(product?.name || 'Produto'), qty: 1, price: totalReais }
    ]

    console.log('[appmax][create] price calculation', { 
      productPrice: product?.price, 
      basePriceCents, 
      totalReais, 
      totalCents: basePriceCents,
      hasItems: Array.isArray(items) && items.length > 0,
      resolvedClinicId 
    })

    const orderPayload: any = {
      total: totalReais, // AppMax expects REAIS (Decimal 10,2)
      products: prods,
      shipping: typeof shipping === 'number' ? Number(shipping) : 0,
      discount: typeof discount === 'number' ? Number(discount) : 0,
      customer_id,
      freight_type: 'PAC',
    }

    let orderResp: any
    try {
      orderResp = await client.ordersCreate(orderPayload)
    } catch (e: any) {
      return jsonError(400, 'Falha ao criar pedido na Appmax', 'appmax_orders_create', { msg: e?.message, resp: e?.response })
    }
    const order_id = Number(orderResp?.order_id || orderResp?.id || orderResp?.data?.id)
    if (!order_id || !Number.isFinite(order_id)) return jsonError(400, 'Resposta inválida ao criar pedido', 'appmax_orders_create_parse', { orderResp })

    // 3) Persist early row for visibility (with doctor_id and patient_profile_id)
    // Resolve doctor from product
    const doctorId = product?.doctorId || null
    // Resolve or create patient profile by buyer email + doctor
    let patientProfileId: string | null = null
    if (doctorId && buyer?.email) {
      try {
        // Find or create User by email
        let user = await prisma.user.findUnique({ where: { email: String(buyer.email) }, select: { id: true } })
        if (!user) {
          const userId = crypto.randomUUID()
          user = await prisma.user.create({
            data: {
              id: userId,
              email: String(buyer.email),
              name: String(buyer.name || 'Cliente'),
              role: 'PATIENT' as any,
            },
            select: { id: true },
          })
        }
        // Find or create PatientProfile
        const prof = await prisma.$queryRawUnsafe<any[]>(
          `SELECT id FROM patient_profiles WHERE doctor_id = $1 AND user_id = $2 LIMIT 1`,
          String(doctorId),
          String(user.id)
        )
        if (prof && prof[0]?.id) {
          patientProfileId = String(prof[0].id)
        } else {
          const newProf = await prisma.$queryRawUnsafe<any[]>(
            `INSERT INTO patient_profiles (id, doctor_id, user_id, name, created_at, updated_at)
             VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW())
             RETURNING id`,
            String(doctorId),
            String(user.id),
            String(buyer.name || 'Cliente')
          )
          patientProfileId = newProf?.[0]?.id || null
        }
      } catch (e) {
        console.warn('[appmax][create] failed to resolve patient_profile', e instanceof Error ? e.message : e)
      }
    }

    try {
      const txRows = await prisma.$queryRawUnsafe<any[]>(
        `INSERT INTO payment_transactions (
           id, provider, provider_order_id, clinic_id, merchant_id, product_id, doctor_id, patient_profile_id,
           customer_id, customer_provider_id,
           amount_cents, currency, payment_method_type, status, provider_v2, status_v2, routed_provider, raw_payload, client_name, client_email
         ) VALUES (
           gen_random_uuid(), 'appmax', $1, $2, $11, $3, $4, $5,
           $12, $13,
           $6, 'BRL', $7, 'processing', 'APPMAX'::"PaymentProvider", 'PROCESSING'::"PaymentStatus", 'APPMAX', $8::jsonb, $9, $10
         )
         RETURNING id`,
        String(order_id),
        resolvedClinicId, // Use resolved clinicId (never null)
        String(product.id),
        doctorId ? String(doctorId) : null,
        patientProfileId,
        basePriceCents, // Store in cents for consistency
        method === 'card' ? 'credit_card' : (method === 'pix' ? 'pix' : null),
        JSON.stringify({ step: 'create_order', customerResp, orderResp, buyer: { name: buyer.name, email: buyer.email }, orchestration: { unifiedCustomerId, unifiedCustomerProviderId } }),
        String(buyer.name || ''),
        String(buyer.email || ''),
        String(merchant.id),
        unifiedCustomerId,
        unifiedCustomerProviderId
      )
      console.log('[appmax][create] ✅ transaction created', { 
        txId: txRows?.[0]?.id,
        orderId: order_id, 
        clinicId: resolvedClinicId, 
        amountCents: basePriceCents,
        amountReais: totalReais,
        doctorId,
        patientProfileId 
      })
    } catch (e) {
      console.error('[appmax][create] ❌ CRITICAL: failed to persist transaction', { 
        error: e instanceof Error ? e.message : e, 
        stack: e instanceof Error ? e.stack : undefined,
        orderId: order_id, 
        clinicId: resolvedClinicId,
        productId: product.id,
        doctorId,
        patientProfileId,
        amountCents: basePriceCents
      })
      // Don't fail the whole request, just log the error
    }

    // 3.5) If product is a subscription, create customer_subscriptions row
    let customerSubscriptionId: string | null = null
    if (product.type === 'SUBSCRIPTION' && unifiedCustomerId) {
      try {
        // Resolve subscription interval from Offer if available; fallback to Product config
        let interval: any = product.interval || null
        let intervalCount: any = product.intervalCount || null
        let trialDays = Number(product.trialDays ?? 0)
        try {
          const subOffer = await prisma.offer.findFirst({
            where: { productId: String(product.id), isSubscription: true, active: true },
            orderBy: { createdAt: 'desc' },
            select: { intervalUnit: true, intervalCount: true, trialDays: true }
          })
          if (subOffer?.intervalUnit) interval = subOffer.intervalUnit
          if (subOffer?.intervalCount != null) intervalCount = subOffer.intervalCount
          if (subOffer?.trialDays != null) trialDays = Number(subOffer.trialDays)
        } catch {}
        interval = interval || 'MONTH'
        intervalCount = intervalCount || 1
        const hasTrial = trialDays > 0
        
        // Calculate periods
        const now = new Date()
        const startAt = now.toISOString()
        const trialEndsAt = hasTrial ? new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000).toISOString() : null
        const currentPeriodStart = now.toISOString()
        
        // Calculate next billing based on interval
        const nextBilling = new Date(now)
        if (interval === 'DAY') nextBilling.setDate(nextBilling.getDate() + intervalCount)
        else if (interval === 'WEEK') nextBilling.setDate(nextBilling.getDate() + intervalCount * 7)
        else if (interval === 'MONTH') nextBilling.setMonth(nextBilling.getMonth() + intervalCount)
        else if (interval === 'YEAR') nextBilling.setFullYear(nextBilling.getFullYear() + intervalCount)
        const currentPeriodEnd = nextBilling.toISOString()
        
        const status = hasTrial ? 'TRIAL' : 'PENDING'
        const metadata = JSON.stringify({
          interval,
          intervalCount,
          buyerName: String(buyer.name || ''),
          buyerEmail: String(buyer.email || ''),
          productName: String(product.name || ''),
          source: 'appmax_checkout',
          appmaxOrderId: order_id
        })
        
        // Check if subscription already exists
        const existingSub = await prisma.$queryRawUnsafe<any[]>(
          `SELECT id FROM customer_subscriptions 
           WHERE customer_id = $1 AND merchant_id = $2 AND product_id = $3 AND provider = 'APPMAX' 
           LIMIT 1`,
          unifiedCustomerId,
          String(merchant.id),
          String(product.id)
        )
        
        let subRows: any[]
        if (existingSub && existingSub.length > 0) {
          // Update existing (use queryRaw to fetch RETURNING values)
          subRows = await prisma.$queryRawUnsafe<any[]>(
            `UPDATE customer_subscriptions 
             SET status = $5::"SubscriptionStatus",
                 start_at = $6::timestamp,
                 trial_ends_at = $7::timestamp,
                 current_period_start = $8::timestamp,
                 current_period_end = $9::timestamp,
                 price_cents = $10,
                 metadata = $11::jsonb,
                 updated_at = NOW()
             WHERE customer_id = $1 AND merchant_id = $2 AND product_id = $3 AND provider = 'APPMAX'
             RETURNING id`,
            unifiedCustomerId,
            String(merchant.id),
            String(product.id),
            String(merchant.id), // accountId (not used in WHERE but keeping param order)
            status,
            startAt,
            trialEndsAt,
            currentPeriodStart,
            currentPeriodEnd,
            basePriceCents,
            metadata
          )
        } else {
          // Insert new
          subRows = await prisma.$queryRawUnsafe<any[]>(
            `INSERT INTO customer_subscriptions (
               id, customer_id, merchant_id, product_id, offer_id, provider, account_id, is_native,
               provider_subscription_id, status, start_at, trial_ends_at, current_period_start, current_period_end,
               price_cents, currency, metadata, created_at, updated_at
             ) VALUES (
               gen_random_uuid(), $1, $2, $3, NULL, 'APPMAX'::"PaymentProvider", $4, true,
               NULL, $5::"SubscriptionStatus", $6::timestamp, $7::timestamp, $8::timestamp, $9::timestamp,
               $10, 'BRL', $11::jsonb, NOW(), NOW()
             )
             RETURNING id`,
            unifiedCustomerId,
            String(merchant.id),
            String(product.id),
            String(merchant.id), // accountId
            status,
            startAt,
            trialEndsAt,
            currentPeriodStart,
            currentPeriodEnd,
            basePriceCents,
            metadata
          )
        }
        customerSubscriptionId = subRows?.[0]?.id || null
        console.log('[appmax][create][subscription] ✅ Subscription created/updated', {
          subscriptionId: customerSubscriptionId,
          customerId: unifiedCustomerId,
          productId: product.id,
          status,
          interval,
          intervalCount,
          hasTrial,
          trialDays
        })
        
        // Link subscription to payment_transaction
        if (customerSubscriptionId) {
          try {
            await prisma.$executeRawUnsafe(
              `UPDATE payment_transactions 
               SET customer_subscription_id = $2 
               WHERE provider = 'appmax' AND provider_order_id = $1`,
              String(order_id),
              customerSubscriptionId
            )
          } catch {}
        }
      } catch (e) {
        console.error('[appmax][create][subscription] ❌ Failed to create subscription', {
          error: e instanceof Error ? e.message : e,
          productId: product.id,
          customerId: unifiedCustomerId
        })
      }
    }

    // 4) Payment (card or pix)
    if (method === 'card') {
      // Tokenization-first if token provided or card present
      let ccToken: string | null = null
      if (token && typeof token === 'string') {
        ccToken = token
      } else if (card && (card.number && card.cvv && card.month && card.year)) {
        try {
          const tokResp = await client.tokenizeCard({
            card: {
              name: String(card.name || buyer.name),
              number: String(card.number),
              cvv: String(card.cvv),
              month: Number(card.month),
              year: Number(card.year),
            }
          })
          ccToken = tokResp?.token || tokResp?.data?.token || null
        } catch (e: any) {
          // Fallback: proceed without token, sending raw card details in payment payload
          try { console.warn('[appmax][tokenize][warn] fallback to raw card payment', e?.message || e) } catch {}
          ccToken = null
        }
      } else {
        return jsonError(400, 'Dados de cartão ou token ausentes', 'input_validation', { need: 'card or token' })
      }

      const buyerDoc = (buyer.document_number || buyer.document || '').toString().replace(/\D+/g, '').slice(0, 14)
      const payPayload: any = {
        cart: { order_id },
        customer: { customer_id },
        payment: { CreditCard: ccToken ? {
          token: ccToken,
          installments: Number(installments || 1),
          soft_descriptor: 'KRXLABS',
          document_number: buyerDoc,
          name: String(card?.name || buyer?.name || '')
        } : {
          number: String(card.number),
          cvv: String(card.cvv),
          month: Number(card.month),
          year: Number(card.year),
          document_number: buyerDoc,
          name: String(card.name || buyer.name),
          installments: Number(installments || 1),
          soft_descriptor: 'KRXLABS',
        } }
      }

      let payResp: any
      try {
        payResp = await client.paymentsCreditCard(payPayload)
      } catch (e: any) {
        try {
          await prisma.$executeRawUnsafe(
            `UPDATE payment_transactions
               SET status = 'failed', status_v2 = 'FAILED'::"PaymentStatus",
                   provider_v2 = COALESCE(provider_v2,'APPMAX'::"PaymentProvider"),
                   raw_payload = $2::jsonb, updated_at = NOW()
             WHERE provider = 'appmax' AND provider_order_id = $1`,
            String(order_id),
            JSON.stringify({ step: 'payment_card_error', error: e?.message || String(e), response: e?.response || null })
          )
        } catch {}
        return jsonError(400, 'Falha ao criar pagamento (cartão)', 'appmax_payment_card', { msg: e?.message, resp: e?.response })
      }

      // Best-effort update status to authorized/paid if retornado
      const mapped = (() => {
        const s = String(payResp?.status || payResp?.data?.status || '').toLowerCase()
        const txt = String(payResp?.text || payResp?.data?.text || '').toLowerCase()
        // Prefer explicit status
        if (s.includes('aprov')) return 'paid'
        if (s.includes('autor')) return 'authorized'
        if (s.includes('pend')) return 'pending'
        // Fallback: infer from success text when status field is absent
        if (txt.includes('captur') || (txt.includes('autoriz') && txt.includes('sucesso'))) return 'paid'
        return 'processing'
      })()

      try {
        await prisma.$executeRawUnsafe(
          `UPDATE payment_transactions SET status=$2, status_v2=CASE WHEN $2='paid' THEN 'SUCCEEDED'::"PaymentStatus" WHEN $2='authorized' THEN 'PROCESSING'::"PaymentStatus" WHEN $2='failed' THEN 'FAILED'::"PaymentStatus" ELSE 'PROCESSING'::"PaymentStatus" END, provider_v2=COALESCE(provider_v2,'APPMAX'::"PaymentProvider"), raw_payload=$3::jsonb, client_name=COALESCE(client_name,$4), client_email=COALESCE(client_email,$5), updated_at=NOW()
            WHERE provider='appmax' AND provider_order_id=$1`,
          String(order_id), mapped, JSON.stringify({ step: 'payment_card', payResp }), String(buyer.name||''), String(buyer.email||'')
        )
        console.log('[appmax][create][payment] ✅ Card payment completed', { orderId: order_id, status: mapped, statusV2: mapped === 'paid' ? 'SUCCEEDED' : 'PROCESSING' })
      } catch {}

      return NextResponse.json({ ok: true, provider: 'APPMAX', order_id, status: mapped })
    }

    if (method === 'pix') {
      // Build according to Appmax docs: requires payment.pix.document_number and expiration_date
      const doc = (buyer.document_number || buyer.document || '').toString().replace(/\D+/g, '')
      if (!doc) return jsonError(400, 'document_number ausente para PIX', 'input_validation', { need: 'buyer.document_number' })
      const expAt = (() => {
        // Format: YYYY-MM-DD HH:mm:ss (as in docs)
        const d = new Date(Date.now() + 30 * 60 * 1000)
        const pad = (n: number) => String(n).padStart(2, '0')
        const y = d.getFullYear()
        const m = pad(d.getMonth() + 1)
        const day = pad(d.getDate())
        const hh = pad(d.getHours())
        const mm = pad(d.getMinutes())
        const ss = pad(d.getSeconds())
        return `${y}-${m}-${day} ${hh}:${mm}:${ss}`
      })()
      const payPayload: any = {
        cart: { order_id },
        customer: { customer_id },
        payment: { pix: { document_number: doc, expiration_date: expAt } }
      }
      let payResp: any
      try {
        payResp = await client.paymentsPix(payPayload)
      } catch (e: any) {
        try {
          await prisma.$executeRawUnsafe(
            `UPDATE payment_transactions
               SET status = 'failed', status_v2 = 'FAILED'::"PaymentStatus",
                   provider_v2 = COALESCE(provider_v2,'APPMAX'::"PaymentProvider"),
                   raw_payload = $2::jsonb, updated_at = NOW()
             WHERE provider = 'appmax' AND provider_order_id = $1`,
            String(order_id),
            JSON.stringify({ step: 'payment_pix_error', error: e?.message || String(e), response: e?.response || null })
          )
        } catch {}
        return jsonError(400, 'Falha ao criar pagamento (pix)', 'appmax_payment_pix', { msg: e?.message, resp: e?.response })
      }

      const mapped = (() => {
        const s = String(payResp?.status || payResp?.data?.status || '').toLowerCase()
        if (s.includes('aprov')) return 'paid'
        if (s.includes('autor')) return 'authorized'
        if (s.includes('pend')) return 'pending'
        return 'processing'
      })()

      try {
        await prisma.$executeRawUnsafe(
          `UPDATE payment_transactions SET status=$2, status_v2=CASE WHEN $2='paid' THEN 'SUCCEEDED'::"PaymentStatus" WHEN $2='pending' THEN 'PROCESSING'::"PaymentStatus" WHEN $2='failed' THEN 'FAILED'::"PaymentStatus" ELSE 'PROCESSING'::"PaymentStatus" END, provider_v2=COALESCE(provider_v2,'APPMAX'::"PaymentProvider"), raw_payload=$3::jsonb, client_name=COALESCE(client_name,$4), client_email=COALESCE(client_email,$5), updated_at=NOW()
            WHERE provider='appmax' AND provider_order_id=$1`,
          String(order_id), mapped, JSON.stringify({ step: 'payment_pix', payResp }), String(buyer.name||''), String(buyer.email||'')
        )
        console.log('[appmax][create][payment] ✅ PIX payment completed', { orderId: order_id, status: mapped, statusV2: mapped === 'paid' ? 'SUCCEEDED' : 'PROCESSING' })
      } catch {}

      // Extract PIX fields when available (AppMax returns at data.pix_qrcode, data.pix_emv, data.pix_expiration_date)
      // Map to names expected by frontend modal: qr_code_url (for image) and qr_code (for copy-paste EMV)
      const d = payResp?.data || {}
      const expiresAt = d?.pix_expiration_date || d?.pix_creation_date || null
      const expiresIn = expiresAt ? Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)) : 0
      const pix = {
        qr_code_url: d?.pix_qrcode ? `data:image/png;base64,${d.pix_qrcode}` : null, // Convert base64 to data URL
        qr_code: d?.pix_emv || null, // EMV code for copy-paste
        expires_at: expiresAt,
        expires_in: expiresIn,
      }
      console.log('[appmax][create][pix] fields mapped', { 
        has_qrcode: !!d?.pix_qrcode, 
        has_emv: !!d?.pix_emv, 
        qr_code_url_length: pix.qr_code_url?.length || 0,
        qr_code_length: pix.qr_code?.length || 0,
        expires_in: expiresIn 
      })
      return NextResponse.json({ ok: true, provider: 'APPMAX', order_id, status: mapped, pix })
    }

    return jsonError(400, 'method não suportado', 'input_validation')
  } catch (e: any) {
    try { console.error('[appmax][create][unhandled]', e) } catch {}
    return NextResponse.json({ error: e?.message || 'internal_error', step: 'unhandled' }, { status: 500 })
  }
}
