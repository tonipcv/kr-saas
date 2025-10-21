    // Helper no-op: relationship model was removed; keep compatibility without failing
    const ensureRelationship = async (_patientId: string, _doctorId: string) => {
      try {
        // Intentionally left blank to avoid errors in environments without this model/table
      } catch (e) {
        try { console.warn('[checkout][create] ensureRelationship failed:', (e as any)?.message || e); } catch {}
      }
    };
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { emitEvent } from '@/lib/events';
import { EventActor, EventType, PaymentMethod } from '@prisma/client';
import crypto from 'crypto';
import { pagarmeCreateOrder, pagarmeGetOrder, isV5, pagarmeCreateCustomer, pagarmeCreateCustomerCard } from '@/lib/pagarme';
import { sendEmail } from '@/lib/email';
import { baseTemplate } from '@/email-templates/layouts/base';
import { PRICING } from '@/lib/pricing';

function onlyDigits(s: string) { return (s || '').replace(/\D/g, ''); }

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { productId, slug, buyer, payment, amountCents: amountCentsFromClient, productName, offerId: offerIdFromClient } = body || {};

    if (!productId) return NextResponse.json({ error: 'productId é obrigatório' }, { status: 400 });
    if (!buyer?.name || !buyer?.email || !buyer?.phone) return NextResponse.json({ error: 'Dados do comprador incompletos' }, { status: 400 });
    if (!payment?.method || !['pix', 'card'].includes(payment.method)) return NextResponse.json({ error: 'Forma de pagamento inválida' }, { status: 400 });
    const explicitSavedCardId: string | null = payment?.saved_card_id || null;
    const explicitProviderCustomerId: string | null = payment?.provider_customer_id || null;

    let product: any = null;
    let clinic: any = null;
    let merchant: any = null;
    let amountCents = 0;
    let baseAmountCents = 0; // price before any interest embedding
    let doctorId: string | null = null;
    let selectedOffer: any = null;
    try {
      // Load product
      product = await prisma.products.findUnique({ where: { id: String(productId) } });
      if (!product) return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 });
      // Resolve clinic
      if (slug) {
        clinic = await prisma.clinic.findFirst({ where: { slug: String(slug) } });
      }
      if (!clinic && product?.clinicId) {
        clinic = await prisma.clinic.findUnique({ where: { id: product.clinicId } });
      }
      if (!clinic) return NextResponse.json({ error: 'Clínica não encontrada para este produto' }, { status: 400 });
      merchant = await prisma.merchant.findUnique({ where: { clinicId: clinic.id } });
      // Guard: only allow checkout when recipient is configured for clinic
      if (!merchant?.recipientId) {
        return NextResponse.json(
          { error: 'Clínica sem recebedor cadastrado. Pagamentos indisponíveis no momento.', code: 'MISSING_RECIPIENT' },
          { status: 400 }
        );
      }
      // Select exact offer if provided; otherwise pick first active one-time offer
      // Note: subscription offers are allowed when subscriptionPeriodMonths is set (prepaid subscription flow)
      if (offerIdFromClient) {
        selectedOffer = await prisma.offer.findUnique({
          where: { id: String(offerIdFromClient) },
          include: { paymentMethods: true },
        });
        // Guard: ensure offer belongs to product
        if (!selectedOffer || String(selectedOffer.productId) !== String(product.id)) {
          console.warn('[checkout][create] requested offerId not found or belongs to different product', { offerIdFromClient, productId: product.id });
          selectedOffer = null;
        }
      }
      if (!selectedOffer) {
        const offers = await prisma.offer.findMany({
          where: { productId: String(product.id), active: true },
          include: { paymentMethods: true },
          orderBy: { createdAt: 'asc' },
        });
        // If subscriptionPeriodMonths hint exists, allow subscription offers; otherwise prefer one-time
        const hasPrepaidSubHint = typeof (body as any)?.subscriptionPeriodMonths === 'number' && (body as any).subscriptionPeriodMonths > 0;
        const nonSub = hasPrepaidSubHint ? null : offers.find((o: any) => !o.isSubscription);
        selectedOffer = nonSub || offers[0] || null;
        console.log('[checkout][create] using fallback offer', { selectedOfferId: selectedOffer?.id, priceCents: selectedOffer?.priceCents, isSubscription: selectedOffer?.isSubscription, hasPrepaidSubHint });
      } else {
        console.log('[checkout][create] using requested offer', { selectedOfferId: selectedOffer?.id, priceCents: selectedOffer?.priceCents, isSubscription: selectedOffer?.isSubscription });
      }
      // Final guard: reject subscription offers ONLY if this is a pure one-time purchase (no subscriptionPeriodMonths)
      const isSubscriptionOffer = !!selectedOffer?.isSubscription;
      const hasPrepaidSubHint = typeof (body as any)?.subscriptionPeriodMonths === 'number' && (body as any).subscriptionPeriodMonths > 0;
      if (isSubscriptionOffer && !hasPrepaidSubHint) {
        console.warn('[checkout][create] selected offer is subscription but no subscriptionPeriodMonths in body, rejecting', { offerId: selectedOffer?.id });
        return NextResponse.json({ error: 'Oferta de assinatura requer fluxo de checkout específico' }, { status: 400 });
      }
      // Validate requested payment method against OfferPaymentMethod if we have an offer
      if (selectedOffer) {
        const requested = (payment?.method === 'pix') ? PaymentMethod.PIX : PaymentMethod.CARD;
        const allowed = Array.isArray(selectedOffer.paymentMethods)
          ? selectedOffer.paymentMethods.some((m: any) => m.active && m.method === requested)
          : true;
        if (!allowed) {
          return NextResponse.json({ error: 'Método de pagamento indisponível para esta oferta' }, { status: 400 });
        }
        amountCents = Number(selectedOffer.priceCents || 0);
      } else {
        // Fallback to legacy product price if no offer exists
        const price = Number(product?.price as any);
        amountCents = Math.round((price || 0) * 100);
      }
      baseAmountCents = amountCents;
      // Resolve doctorId early for persistence (prefer clinic owner, fallback to product.doctorId)
      doctorId = clinic?.ownerId || (product as any)?.doctorId || null;
    } catch (dbErr: any) {
      // DB unavailable or transient error: allow fallback when client provides amountCents and productName
      if (!amountCentsFromClient || !productName) {
        return NextResponse.json({ error: 'Banco de dados indisponível. Informe amountCents e productName para prosseguir sem DB.' }, { status: 503 });
      }
      amountCents = Number(amountCentsFromClient) || 0;
      baseAmountCents = amountCents;
      try { console.warn('[checkout][create] DB error on product/clinic load, using client-provided amount as fallback:', dbErr?.code || dbErr?.message || String(dbErr)); } catch {}
    }

    if (!amountCents || amountCents <= 0) return NextResponse.json({ error: 'Preço inválido' }, { status: 400 });

    // Determine effective installments from request (for CARD only), clamped by offer/platform/business rules
    const requestedInstallments: number = (payment?.method === 'card') ? Number(payment?.installments || 1) : 1;
    const maxByOffer = selectedOffer?.maxInstallments ? Number(selectedOffer.maxInstallments) : PRICING.INSTALLMENT_MAX_INSTALLMENTS;
    const platformMax = PRICING.INSTALLMENT_MAX_INSTALLMENTS;
    // Subscription prepaid hint from UI (subscriptionPeriodMonths)
    const subMonths = (typeof (body as any)?.subscriptionPeriodMonths === 'number' && (body as any).subscriptionPeriodMonths > 0)
      ? Math.trunc(Number((body as any).subscriptionPeriodMonths))
      : null;
    let effectiveInstallments = 1;
    if (payment?.method === 'card') {
      if (subMonths && subMonths > 1) {
        // Subscription-prepaid: ignore the R$97 threshold, but respect the user's selection
        // Clamp to [1 .. min(subMonths, maxByOffer, platformMax)]. If UI didn't send, default to 1 (à vista).
        const subCap = Math.min(subMonths, maxByOffer, platformMax);
        const requested = (Number.isFinite(requestedInstallments) && Number(requestedInstallments) > 0)
          ? Number(requestedInstallments)
          : 1;
        effectiveInstallments = Math.max(1, Math.min(subCap, requested));
      } else {
        // One-time flow: apply business rule R$97 threshold
        const businessMax = baseAmountCents >= 9700 ? platformMax : 1;
        effectiveInstallments = Math.max(1, Math.min(maxByOffer, Math.min(businessMax, requestedInstallments)));
      }
    }

    // If card and installments > 1, embed interest in total amount using amortization (Tabela Price)
    // A = P * i * (1+i)^n / ((1+i)^n - 1); total = round(A * n)
    try {
      console.log('[checkout][create] installments calc', {
        requestedInstallments,
        subMonths,
        maxByOffer,
        platformMax,
        effectiveInstallments_preAPR: effectiveInstallments,
      });
    } catch {}
    if (payment?.method === 'card' && effectiveInstallments > 1) {
      const P = Number(baseAmountCents);
      const i = PRICING.INSTALLMENT_CUSTOMER_APR_MONTHLY;
      const n = effectiveInstallments;
      const factor = Math.pow(1 + i, n);
      const denom = factor - 1;
      if (denom > 0) {
        const per = (P * i * factor) / denom; // in cents
        const totalRounded = Math.round(per * n);
        amountCents = totalRounded;
      } else {
        // Fallback safe: split equally (no interest)
        amountCents = Math.round(baseAmountCents);
      }
    }

    // Build customer
    const phoneDigits = onlyDigits(String(buyer.phone));
    let ddd = phoneDigits.slice(0, 2), number = phoneDigits.slice(2);
    if (phoneDigits.startsWith('55') && phoneDigits.length >= 12) { ddd = phoneDigits.slice(2, 4); number = phoneDigits.slice(4); }

    const phoneObj = {
      country_code: '55',
      area_code: ddd,
      number,
    };
    // Try to infer client IP for antifraud/device
    const forwarded = (req.headers as any).get?.('x-forwarded-for') || undefined as any;
    const clientIp = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : undefined;

    // Build billing/address from buyer or defaults (helps antifraud)
    const addr = (buyer as any)?.address || {};
    const billingAddr = {
      line_1: `${addr.street || 'Av. Paulista'}, ${addr.number || '1000'}`,
      line_2: addr.line_2 ? String(addr.line_2) : undefined,
      zip_code: String(addr.zip_code || '01310200').replace(/\D/g, ''),
      city: String(addr.city || 'São Paulo'),
      state: String(addr.state || 'SP'),
      country: String(addr.country || 'BR'),
    };

    // Optional home_phone support
    let phonesObj: any = { mobile_phone: phoneObj };
    if ((buyer as any)?.home_phone) {
      const hp = onlyDigits(String((buyer as any).home_phone));
      if (hp) {
        let hddd = hp.slice(0, 2), hnumber = hp.slice(2);
        if (hp.startsWith('55') && hp.length >= 12) { hddd = hp.slice(2, 4); hnumber = hp.slice(4); }
        phonesObj.home_phone = { country_code: '55', area_code: hddd, number: hnumber };
      }
    }
    const customer: any = {
      name: buyer.name,
      email: buyer.email,
      document: onlyDigits(String(buyer.document || '')) || undefined,
      type: (onlyDigits(String(buyer.document || '')).length > 11) ? 'company' : 'individual',
      phones: phonesObj,
      address: billingAddr,
      metadata: {},
    };

    // Items (v5 requires a code for some gateways)
    const itemCode = String((product as any)?.code || product?.id || productId || 'prod_checkout');
    
    // Ensure we have product data for metadata
    const productData = {
      name: product?.name || productName || 'Produto',
      imageUrl: (product as any)?.imageUrl || (product as any)?.image_url || (product as any)?.image || null,
      // IMPORTANT: store the base offer price (without embedded interest) for display purposes
      priceCents: baseAmountCents,
      id: productId
    };
    
    console.log('[checkout][create] product data for order', productData);
    
    // IMPORTANT: Pagar.me does NOT preserve items[].metadata - must use order.metadata instead
    const items = [{
      code: itemCode,
      type: 'product',
      amount: amountCents,
      quantity: 1,
      description: productData.name,
    }];
    
    // Log the final items payload
    console.log('[checkout][create] order items payload', JSON.stringify(items));

    // Check existence of optional payment persistence tables and metadata (guard all raw SQL)
    let HAS_PC = false, HAS_PM = false, HAS_PT = false;
    let PC_HAS_UPDATED_AT = false, PM_HAS_UPDATED_AT = false;
    let PC_HAS_UNIQUE = false, PM_HAS_UNIQUE = false;
    try {
      const exists = await prisma.$queryRaw<any[]>`
        SELECT 
          to_regclass('public.payment_customers') IS NOT NULL as has_pc,
          to_regclass('public.payment_methods') IS NOT NULL as has_pm,
          to_regclass('public.payment_transactions') IS NOT NULL as has_pt,
          (
            SELECT COUNT(*) > 0 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'payment_customers' AND column_name = 'updated_at'
          ) as pc_has_updated_at,
          (
            SELECT COUNT(*) > 0 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'payment_methods' AND column_name = 'updated_at'
          ) as pm_has_updated_at,
          (
            SELECT COUNT(*) > 0 FROM pg_indexes 
            WHERE schemaname = 'public' AND tablename = 'payment_customers' AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%(doctor_id, patient_profile_id, provider)%'
          ) as pc_has_unique,
          (
            SELECT COUNT(*) > 0 FROM pg_indexes 
            WHERE schemaname = 'public' AND tablename = 'payment_methods' AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%(payment_customer_id, provider_card_id)%'
          ) as pm_has_unique
      `;
      HAS_PC = !!exists?.[0]?.has_pc;
      HAS_PM = !!exists?.[0]?.has_pm;
      HAS_PT = !!exists?.[0]?.has_pt;
      PC_HAS_UPDATED_AT = !!exists?.[0]?.pc_has_updated_at;
      PM_HAS_UPDATED_AT = !!exists?.[0]?.pm_has_updated_at;
      PC_HAS_UNIQUE = !!exists?.[0]?.pc_has_unique;
      PM_HAS_UNIQUE = !!exists?.[0]?.pm_has_unique;
    } catch {}

    // Payments (v5)
    let payments: any[] = [];
    if (payment.method === 'pix') {
      // expires_in: accept number or string; default 1800s
      const rawExpires = (payment?.pix?.expires_in ?? payment?.pixExpiresIn);
      const expires_in = (
        (typeof rawExpires === 'string' && rawExpires.trim()) ? rawExpires.trim() :
        (Number.isFinite(Number(rawExpires)) && Number(rawExpires) > 0 ? Math.floor(Number(rawExpires)) : 1800)
      ) as any;
      const additional_information = Array.isArray(payment?.pix?.additional_information)
        ? payment.pix.additional_information.map((ai: any) => ({ name: String(ai?.name || ''), value: String(ai?.value || '') }))
        : undefined;
      const pixPayload: any = { expires_in };
      if (additional_information && additional_information.length) pixPayload.additional_information = additional_information;
      payments = [{ amount: amountCents, payment_method: 'pix', pix: pixPayload }];
    } else if (payment.method === 'card') {
      const cc = payment.card || {};
      // Two paths: (A) explicit saved card, (B) raw card capture
      if (!explicitSavedCardId) {
        if (!cc.number || !cc.holder_name || !cc.exp_month || !cc.exp_year || !cc.cvv) {
          return NextResponse.json({ error: 'Dados do cartão incompletos' }, { status: 400 });
        }
      }
      // Use previously clamped effective installments
      const installments = effectiveInstallments;

      // Default raw-card payments (fallback)
      const fallbackPayments = [{
        amount: amountCents,
        payment_method: 'credit_card',
        credit_card: {
          installments,
          operation_type: 'auth_and_capture',
          card: {
            number: String(cc.number).replace(/\s+/g, ''),
            holder_name: cc.holder_name,
            exp_month: Number(cc.exp_month),
            exp_year: (() => { const y = Number(cc.exp_year); return y < 100 ? 2000 + y : y; })(),
            cvv: String(cc.cvv),
            billing_address: billingAddr,
          }
        },
        device: clientIp ? { ip: clientIp } : undefined,
      }];

      // Attempt to create/reuse Pagar.me customer and save card to wallet
      let useSavedCard = false;
      // Path (A): explicit saved card provided by caller (UI)
      if (explicitSavedCardId) {
        payments = [{
          amount: amountCents,
          payment_method: 'credit_card',
          credit_card: {
            installments,
            operation_type: 'auth_and_capture',
            card_id: explicitSavedCardId,
          }
        }];
        useSavedCard = true;
      }
      // Hoisted profile id for card save flow persistence
      let profileIdForCardFlow: string | null = null;
      try {
        if (isV5() && !useSavedCard) {
          const customerPayload: any = {
            name: customer.name,
            email: customer.email,
            document: customer.document,
            type: customer.type,
            address: billingAddr,
            phones: customer.phones,
            metadata: { ...customer.metadata, source: 'checkout' },
          };
          const createdCustomer = await pagarmeCreateCustomer(customerPayload);
          const customerId = createdCustomer?.id;
          if (customerId) {
            // Defer PaymentCustomer persistence to post-order-response block for single source of truth
            try {
              let profileId: string | null = null;
              try {
                const u = buyer?.email ? await prisma.user.findUnique({ where: { email: String(buyer.email) }, select: { id: true } }) : null;
                if (u?.id && doctorId) {
                  const existingProfile = await prisma.patientProfile.findUnique({
                    where: { doctorId_userId: { doctorId: String(doctorId), userId: String(u.id) } },
                    select: { id: true }
                  }).catch(() => null as any);
                  profileId = existingProfile?.id || null;
                  await ensureRelationship(String(u.id), String(doctorId));
                }
              } catch {}
              if (!profileId && buyer?.email) {
                const u = await prisma.user.findUnique({ where: { email: String(buyer.email) }, select: { id: true } }).catch(() => null as any);
                if (u?.id && doctorId) {
                  try {
                    const createdProfile = await prisma.patientProfile.create({
                      data: { doctorId: String(doctorId), userId: String(u.id), name: String(buyer?.name || ''), phone: String(buyer?.phone || '') }
                    });
                    profileId = createdProfile.id;
                    await ensureRelationship(String(u.id), String(doctorId));
                  } catch {}
                }
              }
              profileIdForCardFlow = profileId;
              try { console.log('[checkout][create] deferring PaymentCustomer persistence to order response'); } catch {}
            } catch {}
            // Create and verify card for the newly created provider customer
            const cardPayload: any = {
              holder_name: cc.holder_name,
              exp_month: Number(cc.exp_month),
              exp_year: (() => { const y = Number(cc.exp_year); return y < 100 ? 2000 + y : y; })(),
              cvv: String(cc.cvv),
              number: String(cc.number).replace(/\s+/g, ''),
              billing_address: billingAddr,
              options: { verify_card: true },
            };
            const createdCard = await pagarmeCreateCustomerCard(customerId, cardPayload);
            const cardId = createdCard?.id || createdCard?.card?.id;
            if (cardId) {
              // Defer PaymentMethod persistence to post-order-response block
              try { console.log('[checkout][create] deferring PaymentMethod persistence to order response'); } catch {}
              payments = [{
                amount: amountCents,
                payment_method: 'credit_card',
                credit_card: {
                  installments,
                  operation_type: 'auth_and_capture',
                  card_id: cardId,
                }
              }];
              useSavedCard = true;
            }
          }
        }
      } catch (e) {
        // Do not break flow; fall back to raw card
        console.warn('[checkout][create] save-card flow failed, falling back to raw card:', e instanceof Error ? e.message : e);
      }

      // If split is enabled, avoid using saved card to prevent split restrictions with stored cards
      try {
        const ENABLE_SPLIT_FLAG = String(process.env.PAGARME_ENABLE_SPLIT || '').toLowerCase() === 'true';
        if (ENABLE_SPLIT_FLAG && !useSavedCard) {
          useSavedCard = false;
        }
      } catch {}

      if (!useSavedCard) {
        payments = fallbackPayments;
      }
    }

    // Apply recipient split when a clinic merchant recipient is available (behind feature flag)
    // CRITICAL: clear global variable to avoid reusing charges from previous requests
    (global as any).__charges_for_payload = null;
    let actualSplitApplied = false;
    try {
      const ENABLE_SPLIT = String(process.env.PAGARME_ENABLE_SPLIT || '').toLowerCase() === 'true';
      const clinicRecipientId = merchant?.recipientId || null;
      const rawSplitPercent = typeof merchant?.splitPercent === 'number' ? merchant.splitPercent : null;
      // We'll prefer split at charges[].split for broader v5 compatibility
      let charges: any[] | null = null;
      // IMPORTANT: avoid split for PIX to prevent provider rejections
      const allCreditCard = Array.isArray(payments) && payments.length > 0 && payments.every((p: any) => p?.payment_method === 'credit_card');
      if (ENABLE_SPLIT && clinicRecipientId && rawSplitPercent != null && allCreditCard) {
        // Temporary safeguard: enforce 100% to clinic if platform recipient/remainder is not configured
        let effectiveSplitPercent = Number(rawSplitPercent);
        if (effectiveSplitPercent !== 100) {
          console.warn('[checkout][create] splitPercent != 100 detected; overriding to 100% to avoid remainder issues without platform recipient');
          effectiveSplitPercent = 100;
        }
        const clinicAmount = Math.max(0, Math.min(Number(amountCents), Math.round(Number(amountCents) * (effectiveSplitPercent / 100)))) || 0;
        // Build split rules for Pagar.me v5 (core) using minimal compatible fields
        // Some accounts reject extra properties. Keep only required fields.
        const splitRules = clinicAmount > 0 ? [{
          recipient_id: String(clinicRecipientId),
          amount: clinicAmount,
          type: 'flat',
        }] : [] as any[];

        if (splitRules.length) {
          console.log('[checkout][create] applying split', { recipient_id: String(clinicRecipientId), amount: clinicAmount });
          // Convert payments to charges with split rules
          charges = payments.map((p: any) => {
            const base: any = { amount: p.amount, payment_method: p.payment_method, split: splitRules };
            if (p.credit_card) base.credit_card = p.credit_card;
            if (p.pix) base.pix = p.pix;
            if (p.device) base.device = p.device;
            return base;
          });
          actualSplitApplied = true;
        }
      } else if (ENABLE_SPLIT && !allCreditCard) {
        console.log('[checkout][create] split disabled for this payment method', { payment_methods: payments.map((p: any) => p?.payment_method) });
      }
      // Expose charges in a scoped variable for payload construction
      (global as any).__charges_for_payload = charges;
    } catch (e) {
      console.warn('[checkout][create] split rules not applied:', e instanceof Error ? e.message : e);
    }

    // Recipient split (optional): for MVP, we let full amount to clinic recipient when known
    const scopedCharges = (global as any).__charges_for_payload as any[] | null;
    // Build payload; when using explicit saved card, still include identity fields (Pagarme may require name/email)
    const baseCustomer = (() => {
      const core: any = {
        name: customer?.name,
        email: customer?.email,
        document: customer?.document,
        type: customer?.type,
        address: billingAddr,
        phones: customer?.phones,
        metadata: { ...(customer?.metadata || {}), source: 'checkout' },
      };
      if (explicitSavedCardId && explicitProviderCustomerId) return { id: explicitProviderCustomerId, ...core };
      return { ...core };
    })();
    // At this point, we may not have resolved a user profile yet; omit patient user id in metadata
    const patientUserIdVal = '';
    const payload: any = scopedCharges && scopedCharges.length ? {
      customer: baseCustomer,
      items,
      payments, // keep payments to satisfy API while using charges for split
      charges: scopedCharges,
      metadata: {
        clinicId: clinic?.id || null,
        buyerEmail: String(buyer?.email || customer?.email || ''),
        productId: String(product?.id || productId || ''),
        patientUserId: patientUserIdVal || null,
        subscriptionPeriodMonths: (typeof body?.subscriptionPeriodMonths === 'number' && body.subscriptionPeriodMonths > 0) ? Number(body.subscriptionPeriodMonths) : null,
        // Product display data (Pagar.me doesn't preserve item.metadata)
        ...productData,
        offerId: selectedOffer?.id || null,
        effectiveInstallments,
      }
    } : {
      customer: baseCustomer,
      items,
      payments,
      metadata: {
        clinicId: clinic?.id || null,
        buyerEmail: String(buyer?.email || customer?.email || ''),
        productId: String(product?.id || productId || ''),
        patientUserId: patientUserIdVal || null,
        subscriptionPeriodMonths: (typeof body?.subscriptionPeriodMonths === 'number' && body.subscriptionPeriodMonths > 0) ? Number(body.subscriptionPeriodMonths) : null,
        // Product display data (Pagar.me doesn't preserve item.metadata)
        ...productData,
        offerId: selectedOffer?.id || null,
        effectiveInstallments,
      }
    };

    if (!isV5()) {
      return NextResponse.json({ error: 'Pagar.me v5 não configurado no ambiente' }, { status: 400 });
    }

    try {
      console.log('[checkout][create] payload installments', {
        effectiveInstallments,
        payments_installments: Array.isArray((payload as any)?.payments) ? (payload as any).payments.map((p: any) => p?.credit_card?.installments || null) : null,
        charges_installments: Array.isArray((payload as any)?.charges) ? (payload as any).charges.map((c: any) => c?.credit_card?.installments || null) : null,
      });
    } catch {}
    // Debug: log full payload for PIX to diagnose provider rejections
    if (payment?.method === 'pix') {
      try {
        console.log('[checkout][create] PIX payload', JSON.stringify({
          payments: payload.payments,
          charges: payload.charges || null,
          has_charges: !!payload.charges,
          customer: { email: payload.customer?.email, has_document: !!payload.customer?.document },
          items_count: payload.items?.length || 0,
          metadata: payload.metadata
        }, null, 2));
      } catch {}
    }
    let order = await pagarmeCreateOrder(payload);

    // Try to extract payment link or relevant info
    let payment_url: string | null = null;
    let pix: any = null;
    let card: any = null;
    try {
      // Prefer charges[0].last_transaction for PIX info
      let ch = Array.isArray(order?.charges) ? order.charges[0] : null;
      let tx = ch?.last_transaction || null;
      // Fallback to payments if needed
      let pay = Array.isArray(order?.payments) ? order.payments[0] : null;
      if (!tx) tx = pay?.last_transaction || pay?.transaction || null;
      // If transaction is not yet available, refetch order once
      if (!tx) {
        for (let i = 0; i < 3 && !tx; i++) {
          try {
            await new Promise(r => setTimeout(r, 400));
            const refreshed = await pagarmeGetOrder(order?.id);
            order = refreshed || order;
            ch = Array.isArray(order?.charges) ? order.charges[0] : ch;
            tx = ch?.last_transaction || tx;
            if (!tx) {
              pay = Array.isArray(order?.payments) ? order.payments[0] : pay;
              tx = pay?.last_transaction || pay?.transaction || tx;
            }
          } catch {}
        }
      }
      payment_url = tx?.qr_code_url || tx?.gateway_reference || tx?.url || null;
      if (payment?.method === 'pix') {
        const pixStatus = (tx?.status || ch?.status || order?.status || 'processing').toString().toLowerCase();
        pix = {
          qr_code_url: tx?.qr_code_url || null,
          qr_code: tx?.qr_code || null,
          expires_in: (typeof (payment?.pix?.expires_in ?? payment?.pixExpiresIn) === 'number' ? Number(payment?.pix?.expires_in ?? payment?.pixExpiresIn) : 1800),
          expires_at: tx?.expires_at ?? null,
        };
        // Diagnostics for failed PIX
        if (pixStatus === 'failed') {
          try {
            console.error('[checkout][create] PIX failed diagnostics', {
              order_id: order?.id,
              charge_id: ch?.id,
              tx_id: tx?.id,
              status_reason: tx?.status_reason ?? null,
              gateway_response_code: (tx as any)?.gateway_response_code ?? null,
              gateway_response_message: (tx as any)?.gateway_response_message ?? null,
              has_qr_code: !!(tx?.qr_code_url || tx?.qr_code),
              split_applied: actualSplitApplied,
              split_env_flag: String(process.env.PAGARME_ENABLE_SPLIT || '').toLowerCase() === 'true',
              is_subscription_prepaid: !!(body as any)?.subscriptionPeriodMonths
            });
          } catch {}
        }
      }
      if (payment?.method === 'card') {
        const status = (tx?.status || pay?.status || ch?.status || order?.status || 'processing').toString().toLowerCase();
        const debugInfo = {
          transaction_id: tx?.id ?? null,
          status_reason: tx?.status_reason ?? null,
          acquirer_message: tx?.acquirer_message ?? null,
          acquirer_return_code: tx?.acquirer_return_code ?? null,
          authorization_code: tx?.authorization_code ?? null,
          gateway_response_code: (tx as any)?.gateway_response_code ?? null,
          gateway_response_message: (tx as any)?.gateway_response_message ?? null,
          antifraud_score: (tx as any)?.antifraud_score ?? null,
          operation_type: (tx as any)?.operation_type ?? null,
          charge_id: ch?.id ?? null,
        };
        card = {
          status,
          approved: status === 'paid' || status === 'approved' || status === 'authorized' || status === 'captured',
          authorization_code: tx?.authorization_code || null,
          acquirer_message: tx?.acquirer_message || tx?.status_reason || (status === 'processing' ? 'Processando pagamento' : null),
          acquirer_return_code: tx?.acquirer_return_code || null,
          tid: tx?.tid || tx?.id || null,
          nsu: tx?.nsu || null,
          amount: tx?.amount || ch?.amount || null,
          brand: tx?.card?.brand || null,
          last4: tx?.card?.last_four_digits || tx?.card?.last4 || null,
          soft_descriptor: tx?.soft_descriptor || null,
          debug: debugInfo,
        };
        // Extra diagnostics if failed
        if (status === 'failed') {
          try {
            console.error('[checkout][create] card failed diagnostics', {
              order_id: order?.id,
              charge_id: ch?.id,
              tx_id: tx?.id,
              status_reason: debugInfo.status_reason,
              gateway_response_code: debugInfo.gateway_response_code,
              gateway_response_message: debugInfo.gateway_response_message,
              antifraud_score: debugInfo.antifraud_score,
              operation_type: debugInfo.operation_type,
              split_applied: String(process.env.PAGARME_ENABLE_SPLIT || '').toLowerCase() === 'true'
            });
          } catch {}
        }
      }
    } catch {}

    // Persist PaymentTransaction for both PIX and Card (processing status)
    try {
      // Resolve or create patient profile id
      let userIdForProfile: string | null = null;
      if (buyer?.email) {
        try {
          const u = await prisma.user.findUnique({ where: { email: String(buyer.email) }, select: { id: true } });
          userIdForProfile = u?.id || null;
        } catch {}
      }
      // Create minimal PATIENT user if not exists (normalize dependency)
      if (!userIdForProfile && buyer?.email) {
        try {
          const created = await prisma.user.create({
            data: {
              id: crypto.randomUUID(),
              email: String(buyer.email),
              name: String(buyer?.name || ''),
              phone: String(buyer?.phone || ''),
              role: 'PATIENT',
              is_active: true,
            } as any,
            select: { id: true },
          } as any);
          userIdForProfile = created.id;
        } catch {}
      }
      let profileId: string | null = null;
      if (doctorId && userIdForProfile) {
        try {
          const prof = await prisma.patientProfile.findUnique({ where: { doctorId_userId: { doctorId: String(doctorId), userId: String(userIdForProfile) } }, select: { id: true } });
          if (prof?.id) profileId = prof.id;
        } catch {}
      }
      if (doctorId && !profileId && userIdForProfile) {
        try {
          const createdProf = await prisma.patientProfile.create({ data: { doctorId: String(doctorId), userId: String(userIdForProfile), name: String(buyer?.name || ''), phone: String(buyer?.phone || '') } });
          profileId = createdProf.id;
          await ensureRelationship(String(userIdForProfile), String(doctorId));
        } catch {}
      }
      // Notify customer by email (non-blocking)
      try {
        const clinicNameStr = (clinic?.name as any) || 'Zuzz';
        const customerEmail = String(buyer?.email || customer?.email || '');
        const customerName = String(buyer?.name || customer?.name || '');
        const currency = 'BRL';
        const itemsForEmail = items.map((it: any) => ({ name: it.description || it.code || 'Item', qty: it.quantity || 1, price: it.amount }));
        const totalCents = Number(amountCents);
        const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(v / 100);

        if (customerEmail) {
          const ch = Array.isArray(order?.charges) ? order.charges[0] : null;
          const tx = ch?.last_transaction || null;
          const method = (tx?.payment_method || payment.method || '').toString();
          const chStatus = (ch?.status || '').toString();
          const txStatus = (tx?.status || '').toString();
          try { console.log('[checkout][email] status snapshot', { method, chStatus, txStatus, hasPix: !!(tx?.qr_code_url || tx?.qr_code) }); } catch {}

          // PIX generated: send QR/link email immediately
          if (method === 'pix') {
            const qr = tx?.qr_code_url || tx?.qr_code || null;
            const pixCopy = tx?.qr_code || null;
            const content = `
              <div style="font-size:16px; color:#111;">
                <p style="font-size:20px; font-weight:600; margin:0 0 12px;">PIX gerado</p>
                <p style="margin:0 0 8px;">${customerName ? `Olá ${customerName},` : 'Olá,'} seu PIX foi gerado para finalizar o pagamento.</p>
                <p style="margin:8px 0;">Valor: <strong>${fmt(totalCents)}</strong></p>
                ${qr ? `<p><a href="${qr}" target="_blank">Abrir QR Code do PIX</a></p>` : ''}
                ${pixCopy ? `<p style="word-break:break-all; font-size:12px; color:#444;">Copia e cola: ${pixCopy}</p>` : ''}
              </div>`;
            const html = baseTemplate({ content, clinicName: clinicNameStr });
            await sendEmail({ to: customerEmail, subject: `[${clinicNameStr}] PIX gerado`, html }).catch(() => {});
          }

          // Consider confirmed only when truly paid (strict)
          const paidNow = (chStatus === 'paid') || (txStatus === 'paid');
          if (paidNow) {
            try { console.log('[checkout][email] sending payment_confirmed (sync)'); } catch {}
            const itemsHtml = itemsForEmail.map((it: any) => `<tr><td style="padding:6px 0;">${it.name}</td><td style=\"padding:6px 0; text-align:right;\">${it.qty}x</td></tr>`).join('');
            const content = `
              <div style="font-size:16px; color:#111;">
                <p style="font-size:20px; font-weight:600; margin:0 0 12px;">Pagamento confirmado</p>
                <p style="margin:0 0 16px;">${customerName ? `Olá ${customerName},` : 'Olá,'} recebemos o seu pagamento.</p>
                <table style="width:100%; font-size:14px; border-collapse:collapse;">${itemsHtml}</table>
                <p style="margin-top:12px; font-weight:600;">Total: <span>${fmt(totalCents)}</span></p>
              </div>`;
            const html = baseTemplate({ content, clinicName: clinicNameStr });
            await sendEmail({ to: customerEmail, subject: `[${clinicNameStr}] Pagamento confirmado`, html }).catch(() => {});
          }
        }
      } catch (e) {
        console.warn('[checkout][email] send failed (non-fatal):', e instanceof Error ? e.message : e);
      }

      // Also persist payment customer/method from order response when available (works even if save-card flow didn't run)
      try {
        const pgCustomerId = order?.customer?.id || null;
        // card info can be nested in charges[0].last_transaction.card
        const ch = Array.isArray(order?.charges) ? order.charges[0] : null;
        const tx = ch?.last_transaction || null;
        const cardObj = tx?.card || null;
        const pgCardId = cardObj?.id || null;
        if (HAS_PC && doctorId && profileId && pgCustomerId) {
          const pcId = crypto.randomUUID();
          const sql = PC_HAS_UNIQUE
            ? (
                PC_HAS_UPDATED_AT
                  ? `INSERT INTO payment_customers (id, provider, provider_customer_id, doctor_id, patient_profile_id, clinic_id)
                     VALUES ($1, 'pagarme', $2, $3, $4, $5)
                     ON CONFLICT (doctor_id, patient_profile_id, provider)
                     DO UPDATE SET provider_customer_id = EXCLUDED.provider_customer_id, updated_at = NOW()`
                  : `INSERT INTO payment_customers (id, provider, provider_customer_id, doctor_id, patient_profile_id, clinic_id)
                     VALUES ($1, 'pagarme', $2, $3, $4, $5)
                     ON CONFLICT (doctor_id, patient_profile_id, provider)
                     DO UPDATE SET provider_customer_id = EXCLUDED.provider_customer_id`
              )
            : `INSERT INTO payment_customers (id, provider, provider_customer_id, doctor_id, patient_profile_id, clinic_id)
               VALUES ($1, 'pagarme', $2, $3, $4, $5)
               ON CONFLICT DO NOTHING`;
          await prisma.$executeRawUnsafe(sql, pcId, String(pgCustomerId), String(doctorId), String(profileId), clinic?.id ? String(clinic.id) : null);
        }
        if (HAS_PM && HAS_PC && doctorId && profileId && pgCardId) {
          // find payment_customer id
          const rows = await prisma.$queryRawUnsafe<any[]>(
            `SELECT id FROM payment_customers WHERE doctor_id = $1 AND patient_profile_id = $2 AND provider = 'pagarme' LIMIT 1`,
            String(doctorId), String(profileId)
          ).catch(() => []);
          const paymentCustomerId = rows?.[0]?.id || null;
          if (paymentCustomerId) {
            const pmId = crypto.randomUUID();
            const sql = PM_HAS_UNIQUE
              ? (
                  PM_HAS_UPDATED_AT
                    ? `INSERT INTO payment_methods (id, payment_customer_id, provider_card_id, brand, last4, exp_month, exp_year, is_default, status)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE')
                       ON CONFLICT (payment_customer_id, provider_card_id)
                       DO UPDATE SET brand = EXCLUDED.brand, last4 = EXCLUDED.last4, exp_month = EXCLUDED.exp_month, exp_year = EXCLUDED.exp_year, updated_at = NOW()`
                    : `INSERT INTO payment_methods (id, payment_customer_id, provider_card_id, brand, last4, exp_month, exp_year, is_default, status)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE')
                       ON CONFLICT (payment_customer_id, provider_card_id)
                       DO UPDATE SET brand = EXCLUDED.brand, last4 = EXCLUDED.last4, exp_month = EXCLUDED.exp_month, exp_year = EXCLUDED.exp_year`
                )
              : `INSERT INTO payment_methods (id, payment_customer_id, provider_card_id, brand, last4, exp_month, exp_year, is_default, status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE')
                 ON CONFLICT DO NOTHING`;
            await prisma.$executeRawUnsafe(
              sql,
              pmId,
              String(paymentCustomerId),
              String(pgCardId),
              cardObj?.brand || null,
              cardObj?.last_four_digits || cardObj?.last4 || null,
              cardObj?.exp_month || null,
              cardObj?.exp_year || null,
              true
            );
          }
        }
      } catch (e) {
        console.warn('[checkout][create] persist payment customer/method from order failed:', e instanceof Error ? e.message : e);
      }
      try { console.log('[checkout][create] tx persist precheck', { doctorId, profileId, orderId: order?.id, method: payment?.method, amountCents }); } catch {}
      if (HAS_PT && doctorId && profileId) {
        const txId = crypto.randomUUID();
        const methodType = payment?.method === 'pix' ? 'pix' : 'credit_card';
        const orderId = order?.id || null;
        try { console.log('[checkout][create] inserting payment_transactions row', { txId, orderId, methodType }); } catch {}
        await prisma.$executeRawUnsafe(
          `INSERT INTO payment_transactions (id, provider, provider_order_id, doctor_id, patient_profile_id, clinic_id, product_id, amount_cents, currency, installments, payment_method_type, status, raw_payload)
           VALUES ($1, 'pagarme', $2, $3, $4, $5, $6, $7, 'BRL', $8, $9, 'processing', $10::jsonb)
           ON CONFLICT (provider, provider_order_id) DO UPDATE
             SET doctor_id = COALESCE(payment_transactions.doctor_id, EXCLUDED.doctor_id),
                 patient_profile_id = COALESCE(payment_transactions.patient_profile_id, EXCLUDED.patient_profile_id),
                 clinic_id = COALESCE(payment_transactions.clinic_id, EXCLUDED.clinic_id),
                 product_id = COALESCE(payment_transactions.product_id, EXCLUDED.product_id),
                 amount_cents = CASE WHEN payment_transactions.amount_cents = 0 THEN EXCLUDED.amount_cents ELSE payment_transactions.amount_cents END`,
          txId,
          orderId,
          String(doctorId),
          String(profileId),
          clinic?.id ? String(clinic.id) : null,
          String(productId),
          Number(amountCents),
          Number(payment?.installments || 1),
          methodType,
          JSON.stringify({ payload })
        );
        try { console.log('[checkout][create] inserted payment_transactions row', { txId }); } catch {}
      }
    } catch (e) {
      console.warn('[checkout][create] persist PaymentTransaction failed:', e instanceof Error ? e.message : e);
    }

    // Persist Purchase when card is approved immediately
    try {
      // Only create purchase synchronamente when truly paid (strict). Avoid approving on 'approved/authorized/captured' only.
      const wasPaid = !!order?.charges && Array.isArray(order.charges) && ['paid'].includes(String(order.charges[0]?.status || '').toLowerCase());
      if (wasPaid && order?.id && productId) {
        // Idempotency: avoid duplicate purchase for the same order
        const existing = await prisma.purchase.findFirst({ where: { externalIdempotencyKey: order.id } });
        if (!existing) {
          // Resolve clinic/doctor
          let clinic = null as any;
          try { clinic = await prisma.clinic.findFirst({ where: { slug }, select: { id: true, ownerId: true } }); } catch {}
          let doctorId: string | null = clinic?.ownerId || null;
          if (!doctorId) {
            // Fallback: product's doctor
            try {
              const prod = await prisma.products.findUnique({ where: { id: String(productId) }, select: { doctorId: true, clinicId: true } });
              doctorId = prod?.doctorId || null;
              if (!clinic && prod?.clinicId) clinic = await prisma.clinic.findUnique({ where: { id: prod.clinicId }, select: { id: true, ownerId: true } });
              if (!doctorId) doctorId = clinic?.ownerId || null;
            } catch {}
          }
          // Ensure patient user by buyer email (create if missing)
          let patientId: string | null = null;
          try {
            if (buyer?.email) {
              const existingUser = await prisma.user.findUnique({ where: { email: String(buyer.email) }, select: { id: true } });
              if (existingUser) {
                patientId = existingUser.id;
              } else {
                const createdUser = await prisma.user.create({
                  data: {
                    id: crypto.randomUUID(),
                    email: String(buyer.email),
                    name: String(buyer?.name || ''),
                    phone: String(buyer?.phone || ''),
                    role: 'PATIENT',
                    is_active: true,
                  } as any,
                  select: { id: true },
                } as any);
                patientId = createdUser.id;
              }
            }
          } catch {}
          // Ensure PatientProfile for this doctor/patient
          try {
            if (patientId && doctorId) {
              const fullAddress = `${billingAddr.line_1}, ${billingAddr.city} - ${billingAddr.state}, ${billingAddr.zip_code}, ${billingAddr.country}`;
              await prisma.patientProfile.upsert({
                where: {
                  doctorId_userId: { doctorId: String(doctorId), userId: String(patientId) }
                },
                create: {
                  doctorId: String(doctorId),
                  userId: String(patientId),
                  name: String(buyer?.name || ''),
                  phone: String(buyer?.phone || ''),
                  address: fullAddress,
                  emergency_contact: null,
                  emergency_phone: null,
                  medical_history: null,
                  allergies: null,
                  medications: null,
                  notes: null,
                },
                update: {
                  name: String(buyer?.name || ''),
                  phone: String(buyer?.phone || ''),
                  address: fullAddress,
                }
              });
              await ensureRelationship(String(patientId), String(doctorId));
            }
          } catch (e) {
            console.warn('[checkout][create] patient profile upsert failed (non-fatal):', e instanceof Error ? e.message : e);
          }

          // Create purchase; patientId may be null in some flows (we still record the sale)
          if (doctorId) {
            try {
              const prod = await prisma.products.findUnique({ where: { id: String(productId) } });
              if (prod) {
                const unitPriceNumber = (typeof amountCents === 'number' ? amountCents : Number(amountCents)) / 100;
                const created = await prisma.purchase.create({
                  data: {
                    userId: patientId!,
                    doctorId,
                    productId: String(productId),
                    quantity: 1,
                    unitPrice: unitPriceNumber as any,
                    totalPrice: unitPriceNumber as any,
                    pointsAwarded: prod.creditsPerUnit as any,
                    status: 'COMPLETED',
                    externalIdempotencyKey: order.id,
                    // notes intentionally omitted
                  }
                });

                // Emit events for analytics
                try {
                  if (clinic?.id) {
                    const value = Number(unitPriceNumber || 0);
                    const pts = Number(prod.creditsPerUnit || 0);
                    // Purchase made
                    await emitEvent({
                      eventId: `purchase_${created.id}`,
                      eventType: EventType.purchase_made,
                      actor: EventActor.clinic,
                      clinicId: clinic.id,
                      customerId: patientId || undefined,
                      timestamp: created.createdAt as any,
                      metadata: {
                        value,
                        currency: 'BRL',
                        items: [ { name: productData.name, categoria: (product as any)?.category || (product as any)?.productCategory?.name || 'outros', qty: 1, price: value } ],
                        channel: 'online',
                        purchase_id: created.id,
                        idempotency_key: order.id,
                      },
                    });
                    // Points earned
                    if (patientId) {
                      await emitEvent({
                        eventId: `points_${created.id}`,
                        eventType: EventType.points_earned,
                        actor: EventActor.customer,
                        clinicId: clinic.id,
                        customerId: patientId,
                        timestamp: created.createdAt as any,
                        metadata: { value: Math.round(pts), source: 'purchase', source_id: created.id },
                      });
                    }
                  }
                } catch (ee) {
                  console.error('[checkout][create] emit events failed', ee);
                }
              }
            } catch (e) {
              console.error('[checkout][create] failed to create Purchase', e);
            }
          }
        }
      }
    } catch (e) {
      console.error('[checkout][create] purchase-persist error', e);
    }

    const responsePayload = { success: true, order, order_id: order?.id, payment_method: payment?.method, payment_url, pix, card };
    try { console.log('[checkout][create] responding', { method: payment?.method, order_id: order?.id, card_status: card?.status, has_qr: !!pix?.qr_code_url || !!pix?.qr_code, acquirer_message: card?.acquirer_message, acquirer_return_code: card?.acquirer_return_code }); } catch {}
    return NextResponse.json(responsePayload);
  } catch (e: any) {
    console.error('[checkout][create] error', e);
    const status = Number(e?.status) || 500;
    return NextResponse.json({ error: e?.message || 'Erro interno', details: e?.responseJson || null }, { status });
  }
}
