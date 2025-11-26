import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma, PaymentMethod, PaymentProvider, PaymentStatus } from '@prisma/client';
import { SubscriptionService } from '@/services/subscription';
import { isV5, pagarmeCreateCustomer, pagarmeCreateCustomerCard, pagarmeCreateSubscription, pagarmeCreatePlan, pagarmeGetSubscription, pagarmeUpdateCharge } from '@/lib/payments/pagarme/sdk';
import { createPagarmeSubscription } from '@/lib/providers/pagarme/legacy';
import crypto from 'crypto';

function onlyDigits(s: string) { return (s || '').replace(/\D/g, ''); }

export async function POST(req: Request) {
  try {
    const ENABLED = String(process.env.PAGARME_ENABLE_SUBSCRIPTIONS || '').toLowerCase() === 'true';
    if (!ENABLED) return NextResponse.json({ error: 'Assinaturas desabilitadas' }, { status: 400 });

    if (!isV5()) return NextResponse.json({ error: 'Pagar.me v5 não configurado' }, { status: 400 });
    const isDev = process.env.NODE_ENV !== 'production';
    const USE_PLANLESS = String(process.env.USE_PLANLESS_SUBSCRIPTION || '').toLowerCase() === 'true';

    const body = await req.json();
    const DELEGATE = String(process.env.SUBSCRIBE_V1_DELEGATE || '').toLowerCase() === 'true';
    // If delegation flag is on, try to normalize and delegate to legacy (DRY). We resolve clinicId if missing.
    if (DELEGATE) {
      try {
        const inputCustomer = body.customer || body.buyer || {};
        let inputPayment = body.paymentMethod || body.payment || {};
        // Infer credit card type if missing but card details are present
        const hasSavedCard = !!(inputPayment?.saved_card_id || inputPayment?.card_id || body?.saved_card_id);
        const hasRawCard = !!(inputPayment?.card && (inputPayment?.card?.number || inputPayment?.card?.token));
        if (!inputPayment?.type && (hasSavedCard || hasRawCard)) {
          inputPayment = { ...inputPayment, type: 'credit_card' };
        }
        let clinicId: string | null = body.clinicId ? String(body.clinicId) : null;
        // resolve clinicId from product or slug if not provided
        if (!clinicId) {
          if (body.productId) {
            const prod = await prisma.product.findUnique({ where: { id: String(body.productId) } });
            clinicId = (prod as any)?.clinicId ? String((prod as any).clinicId) : null;
          }
          if (!clinicId && body.slug) {
            const clinic = await prisma.clinic.findFirst({ where: { slug: String(body.slug) } });
            clinicId = clinic ? String(clinic.id) : null;
          }
        }
        try {
          console.log('[subscribe][v1] delegation check', {
            DELEGATE,
            hasClinicIdInBody: !!body.clinicId,
            resolvedClinicId: clinicId,
            hasOfferIdInBody: !!body.offerId,
            hasOfferObj: !!body.offer?.id,
            paymentMethodType: inputPayment?.type || inputPayment?.payment_method,
            inferredCreditCard: (!body?.paymentMethod?.type && (hasSavedCard || hasRawCard)) || false,
          });
        } catch {}
        if (clinicId && (body.offerId || body.offer?.id)) {
          const offerId = String(body.offerId || body.offer?.id);
          const result = await createPagarmeSubscription({
            clinicId,
            customerId: String(body.customerId || ''),
            offerId,
            amount: Number(body.amount || 0),
            currency: String(body.currency || 'BRL'),
            interval: String(body.interval || 'month'),
            customer: inputCustomer,
            paymentMethod: inputPayment,
            metadata: body.metadata || undefined,
          });
          // Update Provider IDs into unified CustomerProvider and pre-created Transaction (best-effort)
          // Skip early post-update here to avoid referencing variables before initialization; webhooks will persist IDs.
          try { /* no-op */ } catch {}
          try { console.log('[subscribe][v1->legacy] delegated', { clinicId, offerId, hasSplit: !!result?.providerData, amount: body.amount }); } catch {}
          return NextResponse.json({ success: true, subscription: result, subscription_id: String(result?.subscriptionId || result?.id || '') });
        } else {
          try { console.log('[subscribe][v1] not delegating (missing clinicId or offerId)'); } catch {}
        }
      } catch (e: any) {
        try { console.error('[subscribe][v1->legacy] delegation failed', { error: e?.message }); } catch {}
        // fall through to legacy v1 flow below
      }
    }
    const { productId, slug, buyer, payment } = body || {};
    if (!productId) return NextResponse.json({ error: 'productId é obrigatório' }, { status: 400 });
    if (!buyer?.name || !buyer?.email || !buyer?.phone) return NextResponse.json({ error: 'Dados do comprador incompletos' }, { status: 400 });

    // Load product and ensure type SUBSCRIPTION
    const product = await prisma.product.findUnique({ where: { id: String(productId) } });
    if (!product) return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 });
    if ((product as any).type !== 'SUBSCRIPTION') {
      return NextResponse.json({ error: 'Produto não é do tipo SUBSCRIPTION' }, { status: 400 });
    }

    // Resolve clinic and merchant
    let clinic: any = null;
    if (slug) {
      clinic = await prisma.clinic.findFirst({ where: { slug: String(slug) } });
    }
    if (!clinic && (product as any)?.clinicId) {
      clinic = await prisma.clinic.findUnique({ where: { id: (product as any).clinicId } });
    }
    if (!clinic) return NextResponse.json({ error: 'Clínica não encontrada para este produto' }, { status: 400 });

    const merchant = await prisma.merchant.findUnique({ where: { clinicId: clinic.id } });
    if (!merchant?.recipientId) {
      return NextResponse.json({ error: 'Clínica sem recebedor cadastrado. Pagamentos indisponíveis no momento.', code: 'MISSING_RECIPIENT' }, { status: 400 });
    }

    // Enforce monthly transactions limit (Option A)
    try {
      const subscriptionService = new SubscriptionService();
      const allowed = await subscriptionService.canProcessTransaction(String(clinic.id));
      if (!allowed) {
        return NextResponse.json(
          { error: 'Limite mensal de transações atingido. Atualize seu plano para continuar processando pagamentos.', code: 'TX_LIMIT_REACHED' },
          { status: 402 }
        );
      }
    } catch (e) {
      try { console.warn('[subscribe] canProcessTransaction check failed, blocking as safe default', e instanceof Error ? e.message : e); } catch {}
      return NextResponse.json({ error: 'Não foi possível validar sua assinatura. Tente novamente mais tarde.', code: 'SUBSCRIPTION_CHECK_FAILED' }, { status: 503 });
    }

    // Find the subscription Offer: prefer body.offerId when provided; fallback to first active
    let selectedOffer: any = null;
    if (body?.offerId) {
      selectedOffer = await prisma.offer.findUnique({
        where: { id: String(body.offerId) },
        include: { paymentMethods: true },
      }).catch(() => null as any);
      // Ensure the offer belongs to the product and is subscription
      if (selectedOffer && String(selectedOffer.productId) !== String(product.id)) selectedOffer = null;
      if (selectedOffer && !selectedOffer.isSubscription) selectedOffer = null;
      if (selectedOffer && selectedOffer.active === false) selectedOffer = null;
    }
    if (!selectedOffer) {
      const offers = await prisma.offer.findMany({
        where: { productId: String(product.id), active: true, isSubscription: true },
        include: { paymentMethods: true },
        orderBy: { createdAt: 'asc' },
      });
      selectedOffer = offers[0] || null;
    }
    // Relaxed: do not block by Offer.paymentMethods; routing/provider will decide

    // Ensure provider plan only when planless mode is disabled
    let providerPlanId: string | null = (product as any)?.providerPlanId || null;
    if (!USE_PLANLESS) {
      // Derive desired amount from OfferPrice/Product for plan creation
      const planName = String((product as any)?.name || 'Subscription Plan');
      let amountCents = 0;
      let desiredCountry = 'BR';
      try { desiredCountry = String(((buyer as any)?.address?.country) || clinic?.country || 'BR').toUpperCase(); } catch {}
      let resolvedRow: any = null;
      if (selectedOffer) {
        try {
          resolvedRow = await prisma.offerPrice.findFirst({ where: { offerId: String(selectedOffer.id), country: desiredCountry, provider: 'KRXPAY' as any, active: true }, orderBy: { updatedAt: 'desc' } });
          if (!resolvedRow) resolvedRow = await prisma.offerPrice.findFirst({ where: { offerId: String(selectedOffer.id), country: desiredCountry, active: true }, orderBy: { updatedAt: 'desc' } });
        } catch (e: any) { try { console.warn('[subscribe] OfferPrice lookup failed, falling back', e?.message || String(e)); } catch {} }
      }
      if (resolvedRow?.amountCents != null && Number(resolvedRow.amountCents) > 0) amountCents = Number(resolvedRow.amountCents);
      else if (selectedOffer && Number(selectedOffer.priceCents || 0) > 0) amountCents = Number(selectedOffer.priceCents || 0);
      else amountCents = Math.round(Number((product as any)?.price || 0) * 100);
      try { console.warn('[subscribe] plan amount resolution', { desiredCountry, from: resolvedRow ? 'offer_price' : (selectedOffer ? 'offer_base' : 'product_base'), amountCents, offerId: selectedOffer?.id, productId }); } catch {}
      if (!amountCents || amountCents <= 0) {
        try { console.error('[subscribe] invalid plan amount', { desiredCountry, offerId: selectedOffer?.id || null, offerPriceCents: selectedOffer?.priceCents || null, productPrice: (product as any)?.price || null }); } catch {}
        return NextResponse.json({ error: 'Preço inválido para criar plano de assinatura', country: desiredCountry, offerId: selectedOffer?.id || null }, { status: 400 });
      }
      const currentPlanPrice = (() => { try { const d: any = (product as any)?.providerPlanData || null; const price0 = d?.items?.[0]?.pricing_scheme?.price; return Number(price0 || 0) || 0; } catch { return 0; } })();
      const planDataMissing = !((product as any)?.providerPlanData);
      try { console.warn('[subscribe][plan-check]', { providerPlanId, planDataMissing, currentPlanPrice, desired: amountCents }); } catch {}
      if (providerPlanId && (planDataMissing || currentPlanPrice !== amountCents)) {
        try { console.warn('[subscribe] provider plan cache missing or price mismatch; will recreate', { providerPlanId, currentPlanPrice, desired: amountCents }); } catch {}
        providerPlanId = null;
      }
      if (!providerPlanId) {
        const planPayload: any = {
          name: planName,
          interval: (selectedOffer?.intervalUnit ? String(selectedOffer.intervalUnit).toLowerCase() : 'month'),
          interval_count: (selectedOffer?.intervalCount && selectedOffer.intervalCount > 0) ? Number(selectedOffer.intervalCount) : 1,
          billing_type: 'prepaid',
          currency: (resolvedRow?.currency || (selectedOffer as any)?.currency || 'BRL'),
          payment_methods: ['credit_card'],
          items: [{ name: planName, quantity: 1, pricing_scheme: { scheme_type: 'unit', price: amountCents } }],
          metadata: { productId: String(productId), clinicId: String((product as any)?.clinicId || ''), offerId: selectedOffer?.id || null },
        };
        if (selectedOffer?.trialDays && Number(selectedOffer.trialDays) > 0) planPayload.trial_period_days = Number(selectedOffer.trialDays);
        try {
          if (isDev) console.warn('[subscribe] Creating provider plan', { planPayload });
          const createdPlan = await pagarmeCreatePlan(planPayload);
          providerPlanId = createdPlan?.id || createdPlan?.plan?.id || null;
          if (providerPlanId) { try { await prisma.product.update({ where: { id: String(productId) }, data: { providerPlanId, providerPlanData: createdPlan || null } }); } catch {} }
        } catch (e: any) {
          try { console.error('[subscribe] create plan failed', { status: e?.status, message: e?.message, response: e?.responseJson || e?.responseText }); } catch {}
          return NextResponse.json({ error: e?.message || 'Falha ao criar plano de assinatura no provedor' }, { status: 500 });
        }
      } else {
        try { console.warn('[subscribe] Using existing providerPlanId', { providerPlanId, currentPlanPrice, desired: amountCents }); } catch {}
      }
    } else {
      try { console.warn('[subscribe] planless mode enabled; skipping plan ensure'); } catch {}
      providerPlanId = null;
    }

    // BEGIN Non-blocking orchestration dual-write (Customer, Provider, Pre-Transaction)
    let unifiedCustomer: any = null;
    let unifiedCustomerProvider: any = null;
    let preTransactionId: string | null = null;
    try {
      // Upsert unified Customer by email ONLY (unique key: merchantId + email)
      const docDigits = onlyDigits(String(buyer.document || '')) || null;
      const buyerEmail = buyer.email ? String(buyer.email) : null;
      if (!buyerEmail) throw new Error('Email is required for customer');
      
      // VALIDATION: Only create customer if we have complete data (name, email, phone)
      const buyerName = buyer.name ? String(buyer.name).trim() : '';
      const buyerPhone = buyer.phone ? String(buyer.phone).trim() : '';
      const hasCompleteData = buyerName && buyerEmail && buyerPhone && 
                              buyerName !== '' && buyerEmail !== '' && buyerPhone !== '';
      
      if (!hasCompleteData) {
        console.warn('[subscribe][orchestration] Skipping customer creation - incomplete data', { 
          hasName: !!buyerName, 
          hasEmail: !!buyerEmail, 
          hasPhone: !!buyerPhone 
        });
        throw new Error('Incomplete customer data');
      }
      
      const existing = await prisma.customer.findFirst({
        where: {
          merchantId: String((merchant as any)?.id || ''),
          email: buyerEmail
        }
      });
      
      if (existing) {
        // Update existing customer with latest data
        unifiedCustomer = await prisma.customer.update({
          where: { id: existing.id },
          data: {
            name: buyerName,
            phone: buyerPhone,
            document: docDigits || undefined,
            address: (buyer as any)?.address ? (buyer as any).address : undefined,
          } as any,
        });
      } else {
        unifiedCustomer = await prisma.customer.create({
          data: {
            merchantId: String((merchant as any)?.id || ''),
            name: buyerName,
            email: buyerEmail,
            phone: buyerPhone,
            document: docDigits,
            address: (buyer as any)?.address ? (buyer as any).address : undefined,
            metadata: { source: 'subscribe_v1' },
          } as any,
        });
      }

      // Upsert CustomerProvider (unique: customerId+provider+accountId)
      if (unifiedCustomer && (merchant as any)?.id) {
        const providerKey = {
          customerId: unifiedCustomer.id,
          provider: PaymentProvider.PAGARME,
          accountId: String((merchant as any).id),
        } as any;
        unifiedCustomerProvider = await prisma.customerProvider.upsert({
          where: { customerId_provider_accountId: providerKey },
          create: { ...providerKey, providerCustomerId: undefined, metadata: { source: 'subscribe_v1' } },
          update: {},
        });
      }

      // Pre-create PaymentTransaction (status PROCESSING)
      // amountCents was resolved above
      const amountCentsPre = (() => {
        try {
          // Try reuse resolution from above branch (resolvedRow/selectedOffer/product)
          const price0 = (typeof (product as any)?.price === 'number') ? Math.round(((product as any).price || 0) * 100) : Math.round(Number((product as any)?.price || 0) * 100);
          return Number.isFinite(price0) ? price0 : 0;
        } catch { return 0; }
      })();
      preTransactionId = crypto.randomUUID();
      await prisma.paymentTransaction.create({
        data: {
          id: preTransactionId,
          provider: 'pagarme',
          provider_v2: PaymentProvider.PAGARME,
          doctorId: (product as any)?.doctorId || null,
          clinicId: (product as any)?.clinicId || (clinic?.id || null),
          merchantId: (merchant as any)?.id || null,
          productId: String(product.id),
          offerId: selectedOffer?.id || null,
          subscriptionId: null,
          amountCents: amountCentsPre || 0,
          currency: String(((selectedOffer as any)?.currency) || 'BRL'),
          installments: 1,
          paymentMethodType: 'credit_card',
          status: 'processing',
          status_v2: PaymentStatus.PROCESSING,
          customerId: unifiedCustomer?.id || null,
          customerProviderId: unifiedCustomerProvider?.id || null,
          routedProvider: 'pagarme',
        },
      });
    } catch (e) {
      try { console.warn('[subscribe][orchestration] dual-write failed (non-blocking)', e instanceof Error ? e.message : String(e)); } catch {}
      unifiedCustomer = null;
      unifiedCustomerProvider = null;
      preTransactionId = null;
    }
    // END Non-blocking orchestration dual-write

    // Build customer payload
    const phoneDigits = onlyDigits(String(buyer.phone));
    let ddd = phoneDigits.slice(0, 2), number = phoneDigits.slice(2);
    if (phoneDigits.startsWith('55') && phoneDigits.length >= 12) { ddd = phoneDigits.slice(2, 4); number = phoneDigits.slice(4); }
    const phoneObj = { country_code: '55', area_code: ddd, number };

    const addr = (buyer as any)?.address || {};
    const billingAddr = {
      line_1: `${addr.street || 'Av. Paulista'}, ${addr.number || '1000'}`,
      zip_code: String(addr.zip_code || '01310200').replace(/\D/g, ''),
      city: String(addr.city || 'São Paulo'),
      state: String(addr.state || 'SP'),
      country: String(addr.country || 'BR'),
    };

    const customerCore: any = {
      name: buyer.name,
      email: buyer.email,
      document: onlyDigits(String(buyer.document || '')) || undefined,
      type: (onlyDigits(String(buyer.document || '')).length > 11) ? 'company' : 'individual',
      phones: { mobile_phone: phoneObj },
      address: billingAddr,
      metadata: { source: 'subscribe' },
    };

    const explicitSavedCardId: string | null = payment?.saved_card_id || null;
    const explicitProviderCustomerId: string | null = payment?.provider_customer_id || null;

    // Prepare subscription payment method
    let useSavedCard = false;
    let cardId: string | null = null;
    let providerCustomerId: string | null = explicitProviderCustomerId || null;

    if (payment?.method !== 'card') {
      return NextResponse.json({ error: 'Assinaturas exigem método de pagamento cartão' }, { status: 400 });
    }

    if (explicitSavedCardId && providerCustomerId) {
      useSavedCard = true;
      cardId = explicitSavedCardId;
    } else {
      // Create customer and save card (v5)
      try {
        if (isDev) console.warn('[subscribe] Creating provider customer', { name: customerCore?.name, email: customerCore?.email, hasDocument: !!customerCore?.document });
        const createdCustomer = await pagarmeCreateCustomer(customerCore);
        providerCustomerId = createdCustomer?.id || null;
      } catch (e: any) {
        const status = Number(e?.status) || 502;
        const payloadSummary = isDev ? { name: customerCore?.name, email: customerCore?.email, hasDocument: !!customerCore?.document } : undefined;
        try { console.error('[subscribe] create_customer failed', { status: e?.status, message: e?.message, response: e?.responseJson || e?.responseText }); } catch {}
        return NextResponse.json({
          error: 'Falha ao criar cliente no provedor',
          step: 'create_customer',
          provider_status: e?.status || null,
          provider_message: e?.message || null,
          provider_response: isDev ? (e?.responseJson || e?.responseText || null) : undefined,
          payload: payloadSummary,
        }, { status });
      }
      const cc = payment?.card || {};
      if (!cc.number || !cc.holder_name || !cc.exp_month || !cc.exp_year || !cc.cvv) {
        return NextResponse.json({ error: 'Dados do cartão incompletos' }, { status: 400 });
      }
      const cardPayload: any = {
        holder_name: cc.holder_name,
        exp_month: Number(cc.exp_month),
        exp_year: (() => { const y = Number(cc.exp_year); return y < 100 ? 2000 + y : y; })(),
        cvv: String(cc.cvv),
        number: String(cc.number).replace(/\s+/g, ''),
        billing_address: billingAddr,
        options: { verify_card: true },
      };
      try {
        if (isDev) console.warn('[subscribe] Creating provider customer card', { holder: cardPayload?.holder_name, last4: String(cardPayload?.number || '').slice(-4) });
        const createdCard = await pagarmeCreateCustomerCard(String(providerCustomerId), cardPayload);
        cardId = createdCard?.id || createdCard?.card?.id || null;
        useSavedCard = !!cardId;
      } catch (e: any) {
        const status = Number(e?.status) || 502;
        const payloadSummary = isDev ? { holder_name: cardPayload?.holder_name, last4: String(cardPayload?.number || '').slice(-4) } : undefined;
        try { console.error('[subscribe] create_card failed', { status: e?.status, message: e?.message, response: e?.responseJson || e?.responseText }); } catch {}
        return NextResponse.json({
          error: 'Falha ao salvar cartão no provedor',
          step: 'create_card',
          provider_status: e?.status || null,
          provider_message: e?.message || null,
          provider_response: isDev ? (e?.responseJson || e?.responseText || null) : undefined,
          payload: payloadSummary,
        }, { status });
      }
    }

    // Prepare metadata and subscription payload
    const metadata = {
      clinicId: clinic?.id || null,
      buyerEmail: String(buyer?.email || customerCore?.email || ''),
      productId: String(product?.id || productId || ''),
      offerId: selectedOffer?.id || null,
    };

    // Build subscription payload: planless vs plan-based
    let payload: any = {};
    if (USE_PLANLESS) {
      // Resolve amount again (authoritative for creation payload)
      let desiredCountry2 = 'BR';
      try { desiredCountry2 = String(((buyer as any)?.address?.country) || clinic?.country || 'BR').toUpperCase(); } catch {}
      let row2: any = null;
      if (selectedOffer) {
        try {
          row2 = await prisma.offerPrice.findFirst({ where: { offerId: String(selectedOffer.id), country: desiredCountry2, provider: 'KRXPAY' as any, active: true }, orderBy: { updatedAt: 'desc' } });
          if (!row2) row2 = await prisma.offerPrice.findFirst({ where: { offerId: String(selectedOffer.id), country: desiredCountry2, active: true }, orderBy: { updatedAt: 'desc' } });
        } catch {}
      }
      const amountPlanless = (() => {
        if (row2?.amountCents != null && Number(row2.amountCents) > 0) return Number(row2.amountCents);
        if (selectedOffer?.priceCents != null && Number(selectedOffer.priceCents) > 0) return Number(selectedOffer.priceCents);
        return Math.round(Number((product as any)?.price || 0) * 100) || 0;
      })();
      if (!amountPlanless || amountPlanless <= 0) {
        return NextResponse.json({ error: 'Preço inválido para assinatura (planless)' }, { status: 400 });
      }
      const intervalUnit = (selectedOffer?.intervalUnit ? String(selectedOffer.intervalUnit).toLowerCase() : 'month');
      const intervalCount = (selectedOffer?.intervalCount && selectedOffer.intervalCount > 0) ? Number(selectedOffer.intervalCount) : 1;
      const currency2 = (row2?.currency || (selectedOffer as any)?.currency || 'BRL') as any;
      const ENABLE_SPLIT = String(process.env.PAGARME_ENABLE_SPLIT || '').toLowerCase() === 'true';
      const platformRecipientId = String(process.env.PLATFORM_RECIPIENT_ID || process.env.PAGARME_PLATFORM_RECIPIENT_ID || '').trim() || null;
      const clinicPercent = Math.max(0, Math.min(100, Number(merchant?.splitPercent || 85)));
      const platformPercent = Math.max(0, Math.min(100, 100 - clinicPercent));
      const splitBody = (ENABLE_SPLIT && platformRecipientId && merchant?.recipientId) ? {
        enabled: true,
        rules: [
          { recipient_id: String(platformRecipientId), type: 'percentage', amount: platformPercent, liable: true, charge_processing_fee: true, charge_remainder_fee: true },
          { recipient_id: String(merchant.recipientId), type: 'percentage', amount: clinicPercent, liable: false, charge_processing_fee: false },
        ],
      } : undefined;
      if (isDev) console.warn('[subscribe][planless] Creating subscription payload', { amountPlanless, currency: String(currency2), intervalUnit, intervalCount, hasSplit: !!splitBody, itemPricing: 'pricing_scheme.unit' });
      payload = {
        customer: providerCustomerId ? { id: providerCustomerId, ...customerCore } : customerCore,
        payment_method: 'credit_card',
        interval: intervalUnit,
        interval_count: intervalCount,
        billing_type: 'prepaid',
        currency: String(currency2),
        items: [ {
          name: String((product as any)?.name || 'Assinatura'),
          description: 'Assinatura avulsa',
          quantity: 1,
          pricing_scheme: { scheme_type: 'unit', price: amountPlanless }
        } ],
        metadata,
        ...(splitBody ? { split: splitBody } : {}),
      };
      if (useSavedCard && cardId) payload.card_id = cardId;
    } else {
      if (isDev) console.warn('[subscribe] Using plan_id', { providerPlanId });
      payload = {
        plan_id: providerPlanId,
        customer: providerCustomerId ? { id: providerCustomerId, ...customerCore } : customerCore,
        payment_method: 'credit_card',
        metadata,
      };
      if (useSavedCard && cardId) payload.card_id = cardId;
    }

    // Create subscription (with split); on specific 412 error, retry without split and apply split later on charge
    let subscription: any = null;
    try {
      if (isDev) console.warn('[subscribe] Creating subscription', { planless: USE_PLANLESS, plan_id: payload?.plan_id, amount: payload?.amount, has_customer: !!payload?.customer, has_card_id: !!payload?.card_id, has_split: !!payload?.split });
      subscription = await pagarmeCreateSubscription(payload);
    } catch (e: any) {
      const status = Number(e?.status) || 502;
      const msg = String(e?.message || '').toLowerCase();
      const isChargeRemainderSplit = status === 412 && msg.includes('charge_remainder_fee');
      if (isChargeRemainderSplit && payload?.split) {
        try {
          if (isDev) console.warn('[subscribe] Retrying subscription without split due to charge_remainder_fee 412');
          const { split, ...noSplitPayload } = payload as any;
          subscription = await pagarmeCreateSubscription(noSplitPayload);
        } catch (e2: any) {
          const payloadSummary2 = isDev ? { plan_id: payload?.plan_id, has_customer: !!payload?.customer, has_card_id: !!payload?.card_id } : undefined;
          try { console.error('[subscribe] retry_without_split failed', { status: e2?.status, message: e2?.message, response: e2?.responseJson || e2?.responseText }); } catch {}
          return NextResponse.json({ error: 'Falha ao criar assinatura no provedor', step: 'create_subscription_retry', provider_status: e2?.status || null, provider_message: e2?.message || null, provider_response: isDev ? (e2?.responseJson || e2?.responseText || null) : undefined, payload: payloadSummary2 }, { status: Number(e2?.status) || 502 });
        }
      } else {
        const payloadSummary = isDev ? { plan_id: payload?.plan_id, has_customer: !!payload?.customer, has_card_id: !!payload?.card_id } : undefined;
        try { console.error('[subscribe] create_subscription failed', { status: e?.status, message: e?.message, response: e?.responseJson || e?.responseText }); } catch {}
        return NextResponse.json({
          error: 'Falha ao criar assinatura no provedor',
          step: 'create_subscription',
          provider_status: e?.status || null,
          provider_message: e?.message || null,
          provider_response: isDev ? (e?.responseJson || e?.responseText || null) : undefined,
          payload: payloadSummary,
        }, { status });
      }
    }
    const subscriptionId = subscription?.id || subscription?.subscription?.id || null;

    // Mark split as pending; webhook will apply when charge.created arrives (async, non-blocking)
    try {
      const ENABLE_SPLIT = String(process.env.PAGARME_ENABLE_SPLIT || '').toLowerCase() === 'true';
      if (ENABLE_SPLIT && subscriptionId && clinic?.id) {
        if (isDev) console.warn('[subscribe][split] Delegating split application to webhook for async processing', { subscriptionId });
        // No synchronous polling; webhook will handle split on charge.created event
      }
    } catch {}

    // Ensure internal unified customer by merchantId + email (early, before subscription record)
    let internalCustomerId: string | null = null;
    try {
      if (clinic?.id) {
        const merchantRow = await prisma.merchant.findFirst({ where: { clinicId: String(clinic.id) }, select: { id: true } });
        const merchantId = merchantRow?.id || null;
        const buyerEmail = String(buyer?.email || '');
        if (merchantId && buyerEmail) {
          let cust: any = null;
          try {
            cust = await prisma.customer.findFirst({
              where: { merchantId: String(merchantId), email: buyerEmail },
              select: { id: true }
            });
          } catch {}
          // VALIDATION: Only create/update customer if we have complete data
          const buyerNameStr = String(buyer?.name || '').trim();
          const buyerPhoneStr = String(buyer?.phone || '').trim();
          const hasCompleteData = buyerNameStr && buyerEmail && buyerPhoneStr;
          
          if (!hasCompleteData) {
            console.warn('[subscribe][post-order] Skipping customer creation - incomplete data', { 
              hasName: !!buyerNameStr, 
              hasEmail: !!buyerEmail, 
              hasPhone: !!buyerPhoneStr 
            });
          }
          
          if (cust && hasCompleteData) {
            // Update existing customer
            try {
              await prisma.customer.update({
                where: { id: cust.id },
                data: {
                  name: buyerNameStr,
                  phone: buyerPhoneStr,
                  metadata: { clinicId: clinic.id, productId, offerId: selectedOffer?.id || null } as any,
                }
              });
            } catch {}
          } else if (!cust && hasCompleteData) {
            // Create new customer
            try {
              const colRows: any[] = await prisma.$queryRawUnsafe(
                "SELECT column_name FROM information_schema.columns WHERE table_name = 'customers' AND column_name IN ('merchantId','merchant_id')"
              );
              const colNames = Array.isArray(colRows) ? colRows.map((r: any) => r.column_name) : [];
              const hasCamel = colNames.includes('merchantId');
              const hasSnake = colNames.includes('merchant_id');
              if (hasCamel) {
                cust = await prisma.customer.create({ data: { merchantId: String(merchantId), name: buyerNameStr, email: buyerEmail, phone: buyerPhoneStr, metadata: { clinicId: clinic.id, productId, offerId: selectedOffer?.id || null } as any } });
              } else if (hasSnake) {
                const id = crypto.randomUUID();
                await prisma.$executeRawUnsafe(
                  `INSERT INTO "customers" ("id", "merchant_id", "name", "email", "phone") VALUES ($1, $2, $3, $4, $5)`,
                  id, String(merchantId), buyerNameStr, buyerEmail, buyerPhoneStr
                );
                cust = { id };
              } else {
                const id = crypto.randomUUID();
                await prisma.$executeRawUnsafe(
                  `INSERT INTO "customers" ("id", "name", "email", "phone") VALUES ($1, $2, $3, $4)`,
                  id, buyerNameStr, buyerEmail, buyerPhoneStr
                );
                cust = { id };
              }
            } catch {}
          }
          internalCustomerId = cust?.id || null;
        }
      }
    } catch {}

    // Upsert immediate into customer_subscriptions so Business > Subscriptions lists it right away
    try {
      if (subscriptionId && clinic?.id) {
        // Best-effort extraction of period dates
        const mapStatus = (s?: string) => {
          const v = String(s || '').toLowerCase();
          if (v === 'active') return 'ACTIVE';
          if (v === 'trial' || v === 'trialing') return 'TRIAL';
          if (v === 'past_due') return 'PAST_DUE';
          if (v === 'incomplete' || v === 'incomplete_expired' || v === 'pending') return 'PENDING';
          if (v === 'canceled' || v === 'cancelled') return 'CANCELED';
          // Default to PENDING for new subscriptions until first payment confirms
          return 'PENDING';
        };
        const subStatus = mapStatus(subscription?.status || (subscription as any)?.subscription?.status);
        let startAt: string | null = (subscription?.start_at || subscription?.startAt || null) as any;
        let curStart: string | null = (subscription?.current_period_start || subscription?.current_period?.start_at || null) as any;
        let curEnd: string | null = (subscription?.current_period_end || subscription?.current_period?.end_at || null) as any;
        // Fallback: compute current period using Offer/Product interval when provider omits
        try {
          if (!startAt) startAt = new Date().toISOString();
          if (!curStart || !curEnd) {
            const base = curStart ? new Date(curStart) : (startAt ? new Date(startAt) : new Date());
            // Prefer Offer interval; fallback to product interval
            const unit = (selectedOffer?.intervalUnit ? String(selectedOffer.intervalUnit) : ((product as any)?.interval ? String((product as any).interval) : 'MONTH')).toUpperCase();
            const count = Number(selectedOffer?.intervalCount || (product as any)?.intervalCount || 1) || 1;
            const startIso = base.toISOString();
            const end = new Date(base);
            if (unit === 'DAY') end.setDate(end.getDate() + count);
            else if (unit === 'WEEK') end.setDate(end.getDate() + 7 * count);
            else if (unit === 'MONTH') end.setMonth(end.getMonth() + count);
            else if (unit === 'YEAR') end.setFullYear(end.getFullYear() + count);
            const endIso = end.toISOString();
            if (!curStart) curStart = startIso as any;
            if (!curEnd) curEnd = endIso as any;
          }
        } catch {}
        // Derive interval metadata for UI (charged every)
        const intervalUnitMeta = (selectedOffer?.intervalUnit
          ? String(selectedOffer.intervalUnit).toLowerCase()
          : ((product as any)?.interval ? String((product as any).interval).toLowerCase() : 'month'));
        const intervalCountMeta = Number(selectedOffer?.intervalCount || (product as any)?.intervalCount || 1) || 1;
        const meta = {
          buyerName: buyer?.name || customerCore?.name || null,
          buyerEmail: buyer?.email || customerCore?.email || null,
          clinicId: clinic?.id || null,
          productId: String(productId),
          offerId: selectedOffer?.id || null,
          providerPlanId,
          interval: intervalUnitMeta,
          intervalCount: intervalCountMeta,
        } as any;
        // Ensure merchant id
        const merchantRow = await prisma.merchant.findFirst({ where: { clinicId: String(clinic.id) }, select: { id: true } });
        const merchantId = merchantRow?.id || null;
        if (merchantId) {
          const csId = crypto.randomUUID();
          // Reuse internalCustomerId from earlier step; already created

          // Decide currency and price_cents using OfferPrice (prefer KRXPAY for country)
          let desiredCountry = 'BR';
          try { desiredCountry = String(((buyer as any)?.address?.country) || clinic?.country || 'BR').toUpperCase(); } catch {}
          let priceRowForInsert: any = null;
          try {
            if (selectedOffer) {
              priceRowForInsert = await prisma.offerPrice.findFirst({
                where: { offerId: String(selectedOffer.id), country: desiredCountry, provider: 'KRXPAY' as any, active: true },
                orderBy: { updatedAt: 'desc' },
              });
              if (!priceRowForInsert) {
                priceRowForInsert = await prisma.offerPrice.findFirst({
                  where: { offerId: String(selectedOffer.id), country: desiredCountry, active: true },
                  orderBy: { updatedAt: 'desc' },
                });
              }
            }
          } catch {}
          const currencyVal = (priceRowForInsert?.currency || (selectedOffer as any)?.currency || 'BRL') as any;
          const unitAmount = (() => {
            if (priceRowForInsert?.amountCents != null && Number(priceRowForInsert.amountCents) > 0) return Number(priceRowForInsert.amountCents);
            if (selectedOffer?.priceCents != null && Number(selectedOffer.priceCents) > 0) return Number(selectedOffer.priceCents);
            return Math.round(Number((product as any)?.price || 0) * 100) || 0;
          })();
          if (!unitAmount || unitAmount <= 0) {
            return NextResponse.json({ error: 'Preço inválido (zero) para assinatura', details: { country: desiredCountry, offerId: selectedOffer?.id || null, productId } }, { status: 400 });
          }

          // Try to INSERT full row like Stripe to ensure visibility; if fails, fallback to UPDATE
          const exists: any[] = await prisma.$queryRawUnsafe(
            'SELECT id FROM "customer_subscriptions" WHERE provider_subscription_id = $1 LIMIT 1',
            String(subscriptionId)
          );
          if (!exists || exists.length === 0) {
            try {
              // Only attempt INSERT when we have required identifiers to satisfy NOT NULL constraints
              if (internalCustomerId && subscriptionId) {
                const newId = crypto.randomUUID();
                await prisma.$executeRawUnsafe(
                  'INSERT INTO "customer_subscriptions" ("id","merchant_id","customer_id","product_id","offer_id","provider","account_id","customer_provider_id","provider_subscription_id","vault_payment_method_id","status","start_at","trial_ends_at","current_period_start","current_period_end","cancel_at","canceled_at","price_cents","currency","metadata") VALUES ($1, $2, $3, $4, $5, $6::"PaymentProvider", $7, $8, $9, $10, $11::"SubscriptionStatus", $12::timestamp, $13::timestamp, $14::timestamp, $15::timestamp, $16::timestamp, $17::timestamp, $18, $19::"Currency", $20::jsonb)'
                  , newId
                  , String(merchantId)
                  , String(internalCustomerId)
                  , String(productId)
                  , (selectedOffer?.id ? String(selectedOffer.id) : null)
                  , 'KRXPAY'
                  , null
                  , null
                  , String(subscriptionId)
                  , null
                  , subStatus
                  , startAt
                  , null
                  , curStart
                  , curEnd
                  , null
                  , null
                  , unitAmount
                  , String(currencyVal)
                  , JSON.stringify(meta)
                );
              } else {
                // Missing required fields; skip INSERT and let UPDATE path handle it later when data is available
                throw new Error('__SKIP_INSERT__');
              }
            } catch (insErr) {
              // Fallback to UPDATE if INSERT fails due to schema differences
              try {
                await prisma.$executeRawUnsafe(
                  `UPDATE customer_subscriptions
                      SET status = $2::"SubscriptionStatus",
                          current_period_start = COALESCE($3::timestamp, current_period_start),
                          current_period_end = COALESCE($4::timestamp, current_period_end),
                          updated_at = NOW(),
                          metadata = COALESCE(metadata, '{}'::jsonb) || $5::jsonb
                    WHERE provider_subscription_id = $1`,
                  String(subscriptionId),
                  subStatus,
                  curStart,
                  curEnd,
                  JSON.stringify(meta),
                );
              } catch {}
            }
          } else {
            await prisma.$executeRawUnsafe(
              `UPDATE customer_subscriptions
                  SET status = $2::"SubscriptionStatus",
                      current_period_start = COALESCE($3::timestamp, current_period_start),
                      current_period_end = COALESCE($4::timestamp, current_period_end),
                      updated_at = NOW(),
                      metadata = COALESCE(metadata, '{}'::jsonb) || $5::jsonb
                WHERE provider_subscription_id = $1`,
              String(subscriptionId),
              subStatus,
              curStart,
              curEnd,
              JSON.stringify(meta),
            );
          }
        }
      }
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') console.warn('[subscribe] upsert customer_subscriptions failed:', e instanceof Error ? e.message : e);
    }

    // Persist payment records (customers, methods, and transactions)
    try {
      // attempt to resolve doctorId and patient profile
      let doctorId: string | null = clinic?.ownerId || (product as any)?.doctorId || null;
      let userIdForProfile: string | null = null;
      if (buyer?.email) {
        try {
          const u = await prisma.user.findUnique({ where: { email: String(buyer.email) }, select: { id: true } });
          userIdForProfile = u?.id || null;
        } catch {}
      }
      let profileId: string | null = null;
      if (doctorId && userIdForProfile) {
        try {
          const prof = await prisma.patientProfile.findUnique({ where: { doctorId_userId: { doctorId: String(doctorId), userId: String(userIdForProfile) } }, select: { id: true } });
          profileId = prof?.id || null;
        } catch {}
      }
      if (doctorId && !profileId && userIdForProfile) {
        try {
          const createdProf = await prisma.patientProfile.create({ data: { doctorId: String(doctorId), userId: String(userIdForProfile), name: String(buyer?.name || ''), phone: String(buyer?.phone || '') } });
          profileId = createdProf.id;
        } catch {}
      }

      // MIRROR to Business Client data model (unified tables only)
      let unifiedCustomerId: string | null = null;
      let merchantId: string | null = null;
      try {
        const buyerEmailStr = String(buyer?.email || '');
        
        if (buyerEmailStr && clinic?.id) {
          const merchantRow = await prisma.merchant.findFirst({ 
            where: { clinicId: String(clinic.id) }, 
            select: { id: true } 
          });
          if (merchantRow?.id) {
            merchantId = merchantRow.id;
            const existing = await prisma.customer.findFirst({ 
              where: { merchantId: String(merchantId), email: buyerEmailStr }, 
              select: { id: true } 
            });
            if (existing?.id) unifiedCustomerId = existing.id;
            else {
              const created = await prisma.customer.create({ 
                data: { 
                  merchantId: String(merchantId), 
                  email: buyerEmailStr, 
                  name: String(buyer?.name || '') 
                } as any, 
                select: { id: true } 
              } as any);
              unifiedCustomerId = created.id;
            }
          }
        }
        
        if (unifiedCustomerId && merchantId) {
          // Upsert customer_providers
          if (providerCustomerId) {
            const rowsCP = await prisma.$queryRawUnsafe<any[]>(
              `SELECT id FROM customer_providers WHERE customer_id = $1 AND provider = 'PAGARME' AND account_id = $2 LIMIT 1`,
              String(unifiedCustomerId), String(merchantId)
            ).catch(() => []);
            
            if (rowsCP && rowsCP.length > 0) {
              await prisma.$executeRawUnsafe(
                `UPDATE customer_providers SET provider_customer_id = $2, updated_at = NOW() WHERE id = $1`,
                String(rowsCP[0].id), String(providerCustomerId)
              );
            } else {
              await prisma.$executeRawUnsafe(
                `INSERT INTO customer_providers (id, customer_id, provider, account_id, provider_customer_id, created_at, updated_at)
                 VALUES (gen_random_uuid(), $1, 'PAGARME'::"PaymentProvider", $2, $3, NOW(), NOW())`,
                String(unifiedCustomerId), String(merchantId), String(providerCustomerId)
              );
            }
          }
          
          // Upsert customer_payment_methods
          if (cardId) {
            const brand = null;
            const last4 = (payment?.card?.number ? String(payment.card.number).replace(/\s+/g, '') : '').slice(-4) || null;
            const expMonth = Number(payment?.card?.exp_month || 0);
            const expYear = Number((() => { const y = Number(payment?.card?.exp_year || 0); return y < 100 ? 2000 + y : y; })());
            
            const rowsPM = await prisma.$queryRawUnsafe<any[]>(
              `SELECT id FROM customer_payment_methods 
               WHERE customer_id = $1 AND provider = 'PAGARME' AND account_id = $2 AND last4 = $3 
               ORDER BY created_at DESC LIMIT 1`,
              String(unifiedCustomerId), String(merchantId), String(last4 || '')
            ).catch(() => []);
            
            if (rowsPM && rowsPM.length > 0) {
              await prisma.$executeRawUnsafe(
                `UPDATE customer_payment_methods SET brand = $2, exp_month = $3, exp_year = $4, status = 'ACTIVE', updated_at = NOW() WHERE id = $1`,
                String(rowsPM[0].id), brand, expMonth, expYear
              );
            } else {
              await prisma.$executeRawUnsafe(
                `INSERT INTO customer_payment_methods (id, customer_id, provider, account_id, brand, last4, exp_month, exp_year, status, is_default, created_at, updated_at)
                 VALUES (gen_random_uuid(), $1, 'PAGARME'::"PaymentProvider", $2, $3, $4, $5, $6, 'ACTIVE', true, NOW(), NOW())`,
                String(unifiedCustomerId), String(merchantId), brand, last4, expMonth, expYear
              );
            }
          }
          
          try { console.log('[subscribe] ✅ Mirrored to Business Client tables', { customerId: unifiedCustomerId, hasProvider: !!providerCustomerId, hasMethod: !!cardId }); } catch {}
        }
      } catch (e) {
        console.warn('[subscribe] mirror to business tables failed (non-fatal):', e instanceof Error ? e.message : e);
      }

      if (doctorId && profileId) {

        // Check if payment_transactions table exists before inserting
        const existsRows: any[] = await prisma.$queryRawUnsafe(
          "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_transactions') AS exists"
        );
        const tableExists = Array.isArray(existsRows) && !!(existsRows[0]?.exists || existsRows[0]?.exists === true);
        // Relax: create transaction even without doctorId/profileId (make them optional)
        if (tableExists && subscriptionId) {
          const txId = crypto.randomUUID();
          // Resolve amount for initial transaction using OfferPrice as well
          let trxCountry = 'BR';
          try { trxCountry = String(((buyer as any)?.address?.country) || clinic?.country || 'BR').toUpperCase(); } catch {}
          let trxRow: any = null;
          try {
            if (selectedOffer) {
              trxRow = await prisma.offerPrice.findFirst({ where: { offerId: String(selectedOffer.id), country: trxCountry, provider: 'KRXPAY' as any, active: true }, orderBy: { updatedAt: 'desc' } });
              if (!trxRow) trxRow = await prisma.offerPrice.findFirst({ where: { offerId: String(selectedOffer.id), country: trxCountry, active: true }, orderBy: { updatedAt: 'desc' } });
            }
          } catch {}
          const amountCents = (() => {
            if (trxRow?.amountCents != null && Number(trxRow.amountCents) > 0) return Number(trxRow.amountCents);
            if (selectedOffer) return Number(selectedOffer.priceCents || 0) || 0;
            return Math.round(Number(product?.price as any) * 100) || 0;
          })();
          if (!amountCents || amountCents <= 0) {
            return NextResponse.json({ error: 'Preço zero não permitido para transação', details: { country: trxCountry, offerId: selectedOffer?.id || null, productId } }, { status: 400 });
          }
          // Estimate split for initial row; webhook will adjust if needed (hybrid fees)
          let clinicSplitPercent = 70;
          let platformFeeBps = 0;
          let transactionFeeCents = 0;
          try {
            if (clinic?.id) {
              const m = await prisma.merchant.findFirst({ where: { clinicId: String(clinic.id) }, select: { splitPercent: true, platformFeeBps: true, transactionFeeCents: true } });
              if (m && m.splitPercent != null) clinicSplitPercent = Math.max(0, Math.min(100, Number(m.splitPercent)));
              if (m && m.platformFeeBps != null) platformFeeBps = Math.max(0, Number(m.platformFeeBps));
              if (m && m.transactionFeeCents != null) transactionFeeCents = Math.max(0, Number(m.transactionFeeCents));
            }
          } catch {}
          const grossCents = Number(amountCents);
          const clinicShare = Math.round(grossCents * (clinicSplitPercent / 100));
          const feePercent = Math.round(grossCents * (platformFeeBps / 10000));
          const feeFlat = transactionFeeCents;
          const platformFeeTotal = Math.max(0, feePercent + feeFlat);
          const clinicAmountCents = Math.max(0, clinicShare - platformFeeTotal);
          const platformAmountCents = Math.max(0, grossCents - clinicAmountCents);
          await prisma.$executeRawUnsafe(
            `INSERT INTO payment_transactions (id, provider, provider_order_id, doctor_id, patient_profile_id, clinic_id, product_id, customer_id, amount_cents, clinic_amount_cents, platform_amount_cents, platform_fee_cents, currency, installments, payment_method_type, status, raw_payload)
             VALUES ($1, 'pagarme', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'BRL', $12, $13, 'processing', $14::jsonb)
             ON CONFLICT (provider, provider_order_id) DO NOTHING`,
            txId,
            String(subscriptionId),
            doctorId || null,
            profileId || null,
            clinic?.id ? String(clinic.id) : null,
            String(productId),
            unifiedCustomerId,
            Number(amountCents),
            clinicAmountCents,
            platformAmountCents,
            platformFeeTotal,
            1,
            'credit_card',
            JSON.stringify({ buyer, productId, offerId: selectedOffer?.id || null })
          );
        } else {
          // Optional: log once in dev
          if (process.env.NODE_ENV !== 'production') {
            console.warn('[subscribe] payment_transactions table not found — skipping persistence');
          }
        }
      }
    } catch (e) {
      console.warn('[subscribe] persist payment_transactions failed:', e instanceof Error ? e.message : e);
    }

    // Create a "subscription_purchase" entry for Business > Purchases
    try {
      // Resolve doctorId and existing userId
      const doctorId: string | null = clinic?.ownerId || (product as any)?.doctorId || null;
      let userId: string | null = null;
      if (buyer?.email) {
        try {
          const u = await prisma.user.findUnique({ where: { email: String(buyer.email) }, select: { id: true } });
          userId = u?.id || null;
        } catch {}
      }
      // If user doesn't exist, try to auto-create a minimal patient user so the purchase can be recorded
      if (!userId && buyer?.email) {
        try {
          const newId = crypto.randomUUID();
          const created = await prisma.user.create({
            data: {
              id: newId,
              email: String(buyer.email),
              name: String(buyer?.name || null),
              role: 'PATIENT',
              public_page_template: 'DEFAULT',
              phone: String(buyer?.phone || null),
              is_active: true,
            },
            select: { id: true }
          });
          userId = created?.id || null;
        } catch (e) {
          // If user creation fails due to legacy column constraints, skip silently
          if (process.env.NODE_ENV !== 'production') {
            console.warn('[subscribe] auto-create user failed, proceeding without purchase row:', e instanceof Error ? e.message : e);
          }
        }
      }
      if (doctorId && userId) {
        const qty = new Prisma.Decimal(1);
        const unitPrice = new Prisma.Decimal((product as any)?.price || 0);
        const totalPrice = unitPrice.mul(qty);
        const creditsPerUnit = new Prisma.Decimal((product as any)?.creditsPerUnit || 0);
        const pointsAwarded = creditsPerUnit.mul(qty);

        await prisma.$transaction(async (tx) => {
          // Ensure PatientProfile
          let patientProfile = await tx.patientProfile.findFirst({ where: { doctorId: String(doctorId), userId: String(userId) }, select: { id: true } });
          if (!patientProfile) {
            try {
              patientProfile = await tx.patientProfile.create({ data: { doctorId: String(doctorId), userId: String(userId), name: String(buyer?.name || ''), phone: String(buyer?.phone || '') }, select: { id: true } });
            } catch {}
          }

          await tx.purchase.create({
            data: {
              userId: String(userId),
              doctorId: String(doctorId),
              productId: String(productId),
              quantity: 1,
              unitPrice,
              totalPrice,
              pointsAwarded,
              status: 'COMPLETED',
              notes: 'Subscription purchase',
              externalIdempotencyKey: subscriptionId ? `sub_${subscriptionId}` : null,
            },
          });
        });
      }
    } catch (e) {
      console.warn('[subscribe] create subscription_purchase failed:', e instanceof Error ? e.message : e);
    }

    return NextResponse.json({ success: true, subscription_id: subscriptionId, subscription });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro ao criar assinatura' }, { status: 500 });
  }
}
