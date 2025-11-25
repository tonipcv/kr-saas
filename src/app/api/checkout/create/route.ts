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
import { EventActor, EventType, PaymentMethod, PaymentProvider } from '@prisma/client';
import crypto from 'crypto';
import { pagarmeCreateOrder, pagarmeGetOrder, isV5, pagarmeCreateCustomer, pagarmeCreateCustomerCard } from '@/lib/payments/pagarme/sdk';
import { sendEmail } from '@/lib/email';
import { baseTemplate } from '@/email-templates/layouts/base';
import { PRICING } from '@/lib/pricing';
import { selectProvider } from '@/lib/payments/core/routing';
import Stripe from 'stripe';
import { getCurrencyForCountry } from '@/lib/payments/countryCurrency';
import { SubscriptionService } from '@/services/subscription';

function onlyDigits(s: string) { return (s || '').replace(/\D/g, ''); }

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { productId, slug, buyer, payment, amountCents: amountCentsFromClient, productName, offerId: offerIdFromClient } = body || {};

    if (!productId) return NextResponse.json({ error: 'productId é obrigatório' }, { status: 400 });
    if (!buyer?.name || !buyer?.email || !buyer?.phone) return NextResponse.json({ error: 'Dados do comprador incompletos' }, { status: 400 });
    if (!payment?.method || !['pix', 'card', 'boleto'].includes(payment.method)) return NextResponse.json({ error: 'Forma de pagamento inválida' }, { status: 400 });
    const explicitSavedCardId: string | null = (typeof payment?.saved_card_id === 'string' && payment.saved_card_id.trim()) ? String(payment.saved_card_id).trim() : null;
    const explicitProviderCustomerId: string | null = (typeof payment?.provider_customer_id === 'string' && payment.provider_customer_id.trim()) ? String(payment.provider_customer_id).trim() : null;
    // When we create a Pagarme customer on-the-fly (to save a card), keep its id to include in the order payload
    let providerCustomerIdForOrder: string | null = null;

    let product: any = null;
    let clinic: any = null;
    let merchant: any = null;
    let amountCents = 0;
    let baseAmountCents = 0; // price before any interest embedding
    let doctorId: string | null = null;
    let selectedOffer: any = null;
    // Hoist resolvedOfferPrice so later metadata access is safe even if DB block fails
    let resolvedOfferPrice: any = null;
    // Hoist desiredCountry so it's visible after DB try/catch and later branches
    let desiredCountry: string = 'BR';
    try {
      // Load product
      product = await prisma.product.findUnique({ where: { id: String(productId) } });
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

      // Subscription/plan guard: enforce monthly transactions limit (Option A)
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
        try { console.warn('[checkout][create] canProcessTransaction check failed, blocking as safe default', e instanceof Error ? e.message : e); } catch {}
        return NextResponse.json(
          { error: 'Não foi possível validar sua assinatura. Tente novamente mais tarde.', code: 'SUBSCRIPTION_CHECK_FAILED' },
          { status: 503 }
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
      // If offer is subscription and body doesn't provide months, infer from offer (intervalUnit/intervalCount)
      const isSubscriptionOffer = !!selectedOffer?.isSubscription;
      const bodyMonthsHint = (typeof (body as any)?.subscriptionPeriodMonths === 'number' && (body as any).subscriptionPeriodMonths > 0)
        ? Math.trunc(Number((body as any).subscriptionPeriodMonths))
        : null;
      const offerMonthsHint = (isSubscriptionOffer && String((selectedOffer as any)?.intervalUnit) === 'MONTH' && Number((selectedOffer as any)?.intervalCount) > 0)
        ? Number((selectedOffer as any).intervalCount)
        : null;
      const resolvedSubMonthsForFlow = bodyMonthsHint ?? offerMonthsHint ?? null;
      // Do not reject; we'll use resolvedSubMonthsForFlow downstream to clamp installments/prepaid logic
      // Resolve desired country; defer provider-specific price enforcement until provider is selected via routing
      try {
        desiredCountry = String(((buyer as any)?.address?.country) || clinic?.country || 'BR').toUpperCase();
      } catch {}
      // Pre-fill base amount from any active OfferPrice for the country (provider-agnostic) or offer base price
      if (selectedOffer) {
        try {
          resolvedOfferPrice = await prisma.offerPrice.findFirst({
            where: { offerId: String(selectedOffer.id), country: desiredCountry, active: true },
            orderBy: { updatedAt: 'desc' },
          });
        } catch (e) {
          try { console.warn('[checkout][create] OfferPrice prefill failed, using offer price', e instanceof Error ? e.message : e); } catch {}
        }
      }
      if (resolvedOfferPrice?.amountCents != null && Number(resolvedOfferPrice.amountCents) > 0) {
        amountCents = Number(resolvedOfferPrice.amountCents);
      } else if (selectedOffer) {
        amountCents = Number(selectedOffer.priceCents || 0);
      } else {
        const price = Number(product?.price as any);
        amountCents = Math.round((price || 0) * 100);
      }
      baseAmountCents = amountCents;
      try { console.log('[checkout][create] pricing prefill', { desiredCountry, offerId: selectedOffer?.id, amountCents, from: resolvedOfferPrice ? 'offer_price_any_provider' : 'offer_base' }); } catch {}
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
    // Country flag used in business rules (no default to BR here)
    const isBR = (() => {
      try {
        const c = String((((buyer as any)?.address)?.country) || clinic?.country || '').toUpperCase();
        return c === 'BR';
      } catch { return false; }
    })();
    const requestedInstallments: number = (payment?.method === 'card') ? Number(payment?.installments || 1) : 1;
    const maxByOffer = selectedOffer?.maxInstallments ? Number(selectedOffer.maxInstallments) : PRICING.INSTALLMENT_MAX_INSTALLMENTS;
    const platformMax = PRICING.INSTALLMENT_MAX_INSTALLMENTS;
    // Subscription prepaid hint resolved from body or inferred from Offer (intervalUnit=MONTH)
    const subMonths = (() => {
      const bodyMonths = (typeof (body as any)?.subscriptionPeriodMonths === 'number' && (body as any).subscriptionPeriodMonths > 0)
        ? Math.trunc(Number((body as any).subscriptionPeriodMonths))
        : null;
      const offerMonths = (selectedOffer?.isSubscription && String((selectedOffer as any)?.intervalUnit) === 'MONTH' && Number((selectedOffer as any)?.intervalCount) > 0)
        ? Number((selectedOffer as any).intervalCount)
        : null;
      return bodyMonths ?? offerMonths ?? null;
    })();
    let effectiveInstallments = 1;
    if (payment?.method === 'card') {
      // Country rule: only Brazil supports installments in our orchestration
      if (!isBR) {
        effectiveInstallments = 1;
      } else if (subMonths && subMonths > 1) {
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
    if (payment?.method === 'card' && effectiveInstallments > 1 && isBR) {
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
    // isBR already computed above based on requested country; do not redeclare here
    // PIX is only available in BR
    if (payment?.method === 'pix' && !isBR) {
      return NextResponse.json({ error: 'PIX indisponível no país selecionado' }, { status: 400 });
    }

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

    // Check if payment_transactions table exists (defensive for environments without it)
    let HAS_PT = false;
    try {
      const exists = await prisma.$queryRaw<any[]>`
        SELECT to_regclass('public.payment_transactions') IS NOT NULL as has_pt
      `;
      HAS_PT = !!exists?.[0]?.has_pt;
    } catch {}

    // Decide provider strictly via routing chips
    let selectedProvider: PaymentProvider | null = null;
    try {
      const requestedMethod = (payment?.method === 'pix') ? PaymentMethod.PIX : (payment?.method === 'boleto' ? PaymentMethod.BOLETO : PaymentMethod.CARD);
      const merchantIdForRouting = String(merchant?.id || 'fallback-merchant-id');
      selectedProvider = await selectProvider({
        merchantId: merchantIdForRouting,
        offerId: selectedOffer?.id || null,
        productId: String(product?.id || productId || ''),
        country: String(billingAddr.country || desiredCountry || 'BR'),
        method: requestedMethod,
      });
      try { console.log('[checkout][create] selected provider', { selectedProvider, country: billingAddr.country || desiredCountry, productId: product?.id, offerId: selectedOffer?.id, merchantId: merchantIdForRouting }); } catch {}
    } catch (e) {
      try { console.warn('[checkout][create] provider selection failed', e instanceof Error ? e.message : e); } catch {}
      selectedProvider = null;
    }
    // Enforce KRXPAY (Pagar.me) only in BR
    if (selectedProvider === PaymentProvider.KRXPAY && !isBR) {
      return NextResponse.json({ error: 'KRXPAY indisponível fora do Brasil' }, { status: 400 });
    }

    // Enforce OfferPrice for the selected provider + country + currency
    const currency = getCurrencyForCountry(String(billingAddr.country || desiredCountry || 'BR'));
    if (!currency) {
      return NextResponse.json({ error: 'Moeda indisponível para o país selecionado.' }, { status: 400 });
    }
    let providerOfferPrice: any = null;
    try {
      if (selectedOffer && selectedProvider) {
        providerOfferPrice = await prisma.offerPrice.findFirst({
          where: { offerId: String(selectedOffer.id), country: desiredCountry, currency: currency as any, provider: selectedProvider, active: true },
          orderBy: { updatedAt: 'desc' },
        });
      }
    } catch (e) {
      try { console.warn('[checkout][create] provider OfferPrice lookup failed', e instanceof Error ? e.message : e); } catch {}
    }
    if (!providerOfferPrice || !(Number(providerOfferPrice?.amountCents || 0) > 0)) {
      try { console.error('[checkout][create] missing OfferPrice', { offerId: selectedOffer?.id, country: desiredCountry, currency, provider: selectedProvider, method: payment?.method }); } catch {}
      return NextResponse.json({ 
        error: `Preço não configurado para método ${String(payment?.method || '')} no país ${desiredCountry} com provedor ${String(selectedProvider || '')}. Configure o preço no editor da oferta.`,
        details: { offerId: selectedOffer?.id, country: desiredCountry, currency, provider: selectedProvider, method: payment?.method }
      }, { status: 400 });
    }
    // Update amounts with the enforced provider price before branching
    baseAmountCents = Number(providerOfferPrice.amountCents || 0);
    amountCents = baseAmountCents;

    // Enforce that the chosen provider has a ProductIntegration mapping (external providers only)
    const needsCatalog = !!(selectedProvider === PaymentProvider.STRIPE && !!selectedOffer?.isSubscription);
    try { console.log('[checkout][create] needsCatalog decision', { selectedProvider, isSubscription: !!selectedOffer?.isSubscription, needsCatalog }); } catch {}
    try {
      if (selectedProvider && needsCatalog) {
        const integration = await prisma.productIntegration.findUnique({
          where: { productId_provider: { productId: String(product?.id || productId || ''), provider: selectedProvider } },
          select: { externalProductId: true },
        });
        if (!integration?.externalProductId) {
          return NextResponse.json({ error: `Produto não está integrado ao provedor ${selectedProvider} para este país. Vincule ou gere o ID do produto no gateway.` }, { status: 400 });
        }
      }
    } catch (e) {
      // Defensive: if integration check fails unexpectedly, keep a clear error
      return NextResponse.json({ error: 'Falha ao validar integração do produto com o provedor selecionado' }, { status: 500 });
    }

    // If routed to STRIPE and method is card, create a Stripe PaymentIntent and return client_secret
    if (selectedProvider === PaymentProvider.STRIPE && payment?.method === 'card') {
      // Resolve Stripe credentials from MerchantIntegration
      const integ = await prisma.merchantIntegration.findUnique({
        where: { merchantId_provider: { merchantId: String(merchant?.id || ''), provider: 'STRIPE' as any } },
        select: { isActive: true, credentials: true },
      });
      if (!integ || !integ.isActive) {
        return NextResponse.json({ error: 'Stripe não está ativo para este merchant' }, { status: 400 });
      }
      const creds = (integ.credentials || {}) as any;
      const apiKey: string | undefined = creds?.apiKey;
      const accountId: string | undefined = creds?.accountId || undefined;
      if (!apiKey) {
        return NextResponse.json({ error: 'Credenciais da Stripe ausentes' }, { status: 400 });
      }
      const stripe = new Stripe(apiKey);
      const currency = getCurrencyForCountry(String(billingAddr.country || 'US'));
      if (!currency || !String(currency).trim()) {
        return NextResponse.json({ error: 'Moeda indisponível para o país selecionado.' }, { status: 400 });
      }
      // Stripe nunca parcela: garantir 1x e usar o preço base (sem juros embutidos)
      const stripeInstallments = 1;
      const baseForStripe = Number(baseAmountCents);
      // amountCents é em centavos (minor units). Para moedas zero-decimais (p.ex. JPY), converter.
      const zeroDecimal = new Set(['JPY', 'KRW', 'VND']);
      const amountMinor = zeroDecimal.has(currency) ? Math.max(0, Math.round(baseForStripe / 100)) : Math.max(0, Math.round(baseForStripe));
      // Ensure/create customer for better acceptance
      const stripeCustomer = await stripe.customers.create({
        email: String(buyer?.email || ''),
        name: String(buyer?.name || ''),
        phone: String(buyer?.phone || ''),
        metadata: { clinicId: String(clinic?.id || ''), productId: String(product?.id || productId || ''), offerId: String(selectedOffer?.id || '') },
      }, accountId ? { stripeAccount: accountId } : undefined);
      const intent = await stripe.paymentIntents.create({
        amount: amountMinor,
        currency: currency.toLowerCase(),
        customer: stripeCustomer.id,
        metadata: {
          clinicId: String(clinic?.id || ''),
          productId: String(product?.id || productId || ''),
          offerId: String(selectedOffer?.id || ''),
          effectiveInstallments: String(stripeInstallments),
        },
        automatic_payment_methods: { enabled: true },
      }, accountId ? { stripeAccount: accountId } : undefined);

      // Persist lightweight payment_transactions row for STRIPE
      try {
        if (HAS_PT && doctorId) {
          const txId = crypto.randomUUID();
          await prisma.$executeRawUnsafe(
            `INSERT INTO payment_transactions (
               id, provider, provider_order_id, doctor_id, patient_profile_id, clinic_id, product_id,
               amount_cents, clinic_amount_cents, platform_amount_cents, platform_fee_cents, currency,
               installments, payment_method_type, status, raw_payload, routed_provider
             ) VALUES (
               $1, 'stripe', $2, $3, $4, $5, $6,
               $7, NULL, NULL, NULL, $8,
               $9, $10, 'processing', $11::jsonb, $12
             )
             ON CONFLICT (provider, provider_order_id) DO NOTHING`,
            txId,
            String(intent.id),
            String(doctorId),
            null,
            String(clinic?.id || ''),
            String(product?.id || productId || ''),
            Number(intent.amount),
            String(intent.currency).toUpperCase(),
            Number(stripeInstallments),
            'credit_card',
            JSON.stringify({ provider: 'stripe', payment_intent_id: intent.id, buyer: { name: String((buyer as any)?.name || ''), email: String((buyer as any)?.email || '') } }),
            'STRIPE'
          );
          // Best-effort: if columns client_name/client_email exist, persist buyer data for Business > Pagamentos UI
          try {
            const cols: any[] = await prisma.$queryRawUnsafe(
              `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payment_transactions' AND column_name IN ('client_name','client_email')`
            );
            const haveName = Array.isArray(cols) && cols.some((r: any) => String(r.column_name) === 'client_name');
            const haveEmail = Array.isArray(cols) && cols.some((r: any) => String(r.column_name) === 'client_email');
            if (haveName || haveEmail) {
              await prisma.$executeRawUnsafe(
                `UPDATE payment_transactions
                   SET ${haveName ? 'client_name = $3,' : ''} ${haveEmail ? 'client_email = $4,' : ''} updated_at = NOW()
                 WHERE provider = 'stripe' AND provider_order_id = $1 AND clinic_id = $2`,
                String(intent.id),
                String(clinic?.id || ''),
                String((buyer as any)?.name || ''),
                String((buyer as any)?.email || '')
              );
            }
          } catch {}
        }
      } catch (e) {
        console.warn('[checkout][create] persist stripe payment_transactions failed:', e instanceof Error ? e.message : e);
      }

      // Respond to client so it can confirm the PaymentIntent via Stripe Elements
      return NextResponse.json({
        success: true,
        provider: 'STRIPE',
        payment_provider: 'stripe',
        payment_intent_id: intent.id,
        client_secret: intent.client_secret,
        currency,
        amount_minor: amountMinor,
        installments: Number(stripeInstallments),
      });
    }

    // Payments (v5)
    let payments: any[] = [];
    let paymentObject: any = null; // normalized single-method object to reuse in charges
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
      paymentObject = { amount: amountCents, payment_method: 'pix', pix: pixPayload };
      payments = [paymentObject];
    } else if (payment.method === 'card') {
      const cc = payment.card || {};
      // Fallback: resolve latest saved PAGARME card for this buyer if UI didn't send it
      let savedCardIdForCharge: string | null = explicitSavedCardId;
      let providerCustomerIdForCharge: string | null = explicitProviderCustomerId;
      try {
        if (!savedCardIdForCharge && merchant?.id) {
          const buyerEmailStr = String(buyer?.email || customer?.email || '').trim();
          if (buyerEmailStr) {
            const cust = await prisma.customer.findFirst({ where: { merchantId: String(merchant.id), email: buyerEmailStr }, select: { id: true } });
            const customerIdUnified = cust?.id || null;
            if (customerIdUnified) {
              const row = await prisma.$queryRawUnsafe<any>(
                `SELECT cpm.provider_payment_method_id, cp.provider_customer_id
                   FROM customer_payment_methods cpm
                   LEFT JOIN customer_providers cp ON cp.id = cpm.customer_provider_id
                  WHERE cpm.customer_id = $1 AND cpm.provider IN ('KRXPAY', 'PAGARME') AND cpm.status = 'ACTIVE'
                  ORDER BY cpm.is_default DESC, cpm.created_at DESC
                  LIMIT 1`,
                String(customerIdUnified)
              ).catch(() => null as any);
              if (row?.provider_payment_method_id) {
                savedCardIdForCharge = String(row.provider_payment_method_id);
                providerCustomerIdForCharge = row?.provider_customer_id ? String(row.provider_customer_id) : providerCustomerIdForCharge;
                try { console.log('[checkout][create] resolved saved card from DB', { has_card: !!savedCardIdForCharge, has_provider_customer_id: !!providerCustomerIdForCharge }); } catch {}
              }
            }
          }
        }
      } catch {}
      // Two paths: (A) explicit saved card, (B) raw card capture
      try { console.log('[checkout][create] card flow decision', { has_saved_card_id: !!savedCardIdForCharge, has_provider_customer_id: !!(providerCustomerIdForCharge || providerCustomerIdForOrder), has_cc_number: !!cc?.number }); } catch {}
      if (!savedCardIdForCharge) {
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
      if (savedCardIdForCharge) {
        payments = [{
          amount: amountCents,
          payment_method: 'credit_card',
          credit_card: {
            installments,
            operation_type: 'auth_and_capture',
            card_id: savedCardIdForCharge,
          }
        }];
        useSavedCard = true;
        // Make sure the order payload uses this customer id when charging with card_id
        if (providerCustomerIdForCharge && !providerCustomerIdForOrder) providerCustomerIdForOrder = providerCustomerIdForCharge;
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
            // Make sure the order payload uses this customer id when charging with card_id
            providerCustomerIdForOrder = String(customerId);
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
      paymentObject = payments[0];
    } else if (payment.method === 'boleto') {
      // Minimal boleto support; allow caller to pass optional fields
      const due_date = (payment?.boleto?.due_date || null);
      const instructions = (payment?.boleto?.instructions || undefined);
      const boletoPayload: any = {};
      if (due_date) boletoPayload.due_date = String(due_date);
      if (instructions) boletoPayload.instructions = String(instructions);
      paymentObject = {
        amount: amountCents,
        payment_method: 'boleto',
        boleto: boletoPayload,
      };
      payments = [paymentObject];
    }

    // Apply recipient split only for Pagar.me (KRXPAY) when a clinic merchant recipient is available (behind feature flag)
    // CRITICAL: clear global variable to avoid reusing charges from previous requests
    (global as any).__charges_for_payload = null;
    let actualSplitApplied = false;
    try {
      const ENABLE_SPLIT = String(process.env.PAGARME_ENABLE_SPLIT || '').toLowerCase() === 'true';
      const clinicRecipientId = (String(process.env.PAGARME_RECIPIENT_ID_OVERRIDE || merchant?.recipientId || '').trim()) || null;
      const platformRecipientId = (String(process.env.PAGARME_PLATFORM_RECIPIENT_ID_OVERRIDE || process.env.PLATFORM_RECIPIENT_ID || process.env.PAGARME_PLATFORM_RECIPIENT_ID || '').trim()) || null;
      const rawSplitPercent = typeof merchant?.splitPercent === 'number' ? merchant.splitPercent : 70; // default 70% clínica
      // Split style per method with sensible defaults:
      // - all methods: payments_percentage (per Pagar.me support example)
      const method = String(payment?.method || '').toLowerCase();
      const envStyleGlobal = String(process.env.PAGARME_SPLIT_STYLE || '').toLowerCase();
      const envStyleCard = String(process.env.PAGARME_SPLIT_STYLE_CARD || '').toLowerCase();
      const envStylePix = String(process.env.PAGARME_SPLIT_STYLE_PIX || '').toLowerCase();
      const envStyleBoleto = String(process.env.PAGARME_SPLIT_STYLE_BOLETO || '').toLowerCase();
      let SPLIT_STYLE = envStyleGlobal || 'payments_percentage';
      if (method === 'card') SPLIT_STYLE = envStyleCard || envStyleGlobal || 'payments_percentage';
      if (method === 'pix') SPLIT_STYLE = envStylePix || envStyleGlobal || 'payments_percentage';
      if (method === 'boleto') SPLIT_STYLE = envStyleBoleto || envStyleGlobal || 'payments_percentage';
      let charges: any[] | null = null;
      // Enable split whenever using Pagar.me gateway (this checkout path), independent of selectedProvider label
      const splitEnabled = ENABLE_SPLIT && !!clinicRecipientId && !!platformRecipientId;
      try {
        console.log('[checkout][create] split env/resolution', {
          ENABLE_SPLIT,
          clinicRecipientId,
          platformRecipientId,
          usingClinicOverride: Boolean(process.env.PAGARME_RECIPIENT_ID_OVERRIDE),
          usingPlatformOverride: Boolean(process.env.PAGARME_PLATFORM_RECIPIENT_ID_OVERRIDE),
        });
      } catch {}
      if (splitEnabled) {
        const clinicPercent = Math.max(0, Math.min(100, Number(rawSplitPercent)));
        if (SPLIT_STYLE === 'payments_percentage') {
          const platformPercent = 100 - clinicPercent;
          // Attach split to payments[] as percentage with options, per support example
          // Order: clinic (larger %) first with charge_processing_fee=true, platform second with charge_processing_fee=false
          const paySplit = [
            {
              amount: clinicPercent,
              recipient_id: String(clinicRecipientId),
              type: 'percentage',
              options: {
                charge_processing_fee: true,
                charge_remainder_fee: true,
                liable: true,
              },
            },
            {
              amount: platformPercent,
              recipient_id: String(platformRecipientId),
              type: 'percentage',
              options: {
                charge_processing_fee: false,
                charge_remainder_fee: false,
                liable: true,
              },
            },
          ];
          payments = payments.map((p: any) => ({ ...p, split: paySplit }));
          console.log('[checkout][create] applying split (payments percentage)', { provider: selectedProvider, method, platformRecipientId, clinicRecipientId, platformPercent, clinicPercent });
          charges = null; // keep payments-driven flow
          actualSplitApplied = true;
        } else {
          // Fallback: charges[].split with flat amount (previous behavior)
          const clinicAmount = Math.round(Number(amountCents) * clinicPercent / 100);
          const platformAmount = Number(amountCents) - clinicAmount;
          const splitRules = [
            {
              recipient_id: String(platformRecipientId),
              amount: platformAmount,
              type: 'flat',
              liable: true,
              charge_processing_fee: true,
            },
            {
              recipient_id: String(clinicRecipientId),
              amount: clinicAmount,
              type: 'flat',
              liable: false,
              charge_processing_fee: false,
            },
          ];
          console.log('[checkout][create] applying split (charges flat amount)', { method, platformRecipientId, clinicRecipientId, platformAmount, clinicAmount, clinicPercent });
          charges = payments.map((p: any) => {
            const base: any = { amount: p.amount, payment: undefined as any, split: splitRules };
            const paymentPayload: any = { payment_method: p.payment_method };
            if (p.credit_card) paymentPayload.credit_card = p.credit_card;
            if (p.pix) paymentPayload.pix = p.pix;
            if (p.boleto) paymentPayload.boleto = p.boleto;
            base.payment = paymentPayload;
            if (p.device) base.device = p.device;
            return base;
          });
          actualSplitApplied = true;
        }
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
      // Prefer explicit id from UI when using an explicit saved card
      if (explicitSavedCardId && explicitProviderCustomerId) return { id: explicitProviderCustomerId, ...core };
      // If we created a provider customer to store the card, include its id per Pagarme v5 order schema
      if (providerCustomerIdForOrder) return { id: providerCustomerIdForOrder, ...core };
      return { ...core };
    })();
    // At this point, we may not have resolved a user profile yet; omit patient user id in metadata
    const patientUserIdVal = '';
    const payload: any = scopedCharges && scopedCharges.length ? {
      customer: baseCustomer,
      items,
      payments, // required by API schema; charges[].split will apply when charges present
      charges: scopedCharges,
      metadata: {
        clinicId: clinic?.id || null,
        buyerEmail: String(buyer?.email || customer?.email || ''),
        buyerName: String(buyer?.name || customer?.name || ''),
        productId: String(product?.id || productId || ''),
        currency: (() => {
          const pcur = (providerOfferPrice && (providerOfferPrice as any)?.currency) ? String((providerOfferPrice as any).currency).toUpperCase() : '';
          const rcur = (!pcur && resolvedOfferPrice && (resolvedOfferPrice as any)?.currency) ? String((resolvedOfferPrice as any).currency).toUpperCase() : '';
          return pcur || rcur || 'BRL';
        })(),
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
        buyerName: String(buyer?.name || customer?.name || ''),
        productId: String(product?.id || productId || ''),
        currency: (() => {
          const pcur = (providerOfferPrice && (providerOfferPrice as any)?.currency) ? String((providerOfferPrice as any).currency).toUpperCase() : '';
          const rcur = (!pcur && resolvedOfferPrice && (resolvedOfferPrice as any)?.currency) ? String((resolvedOfferPrice as any).currency).toUpperCase() : '';
          return pcur || rcur || 'BRL';
        })(),
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
    // Debug: log full payload to diagnose provider rejections and split issues
    try {
      if (actualSplitApplied && payload.charges) {
        console.log('[checkout][create] charges with split payload', JSON.stringify({
          method: payment?.method,
          charges_count: payload.charges.length,
          charges: payload.charges.map((c: any) => ({
            amount: c.amount,
            payment_method: c.payment?.payment_method,
            has_split: !!c.split,
            split: c.split || null,
          })),
          payments_count: payload.payments?.length || 0,
        }, null, 2));
      } else if (actualSplitApplied && payload.payments && payload.payments[0]?.split) {
        console.log('[checkout][create] payments with split payload', JSON.stringify({
          method: payment?.method,
          payments_count: payload.payments.length,
          payments: payload.payments.map((p: any) => ({
            amount: p.amount,
            payment_method: p.payment_method,
            has_split: !!p.split,
            split: p.split || null,
          })),
        }, null, 2));
      } else if (payment?.method === 'pix') {
        console.log('[checkout][create] PIX payload', JSON.stringify({
          payments: payload.payments,
          charges: payload.charges || null,
          has_charges: !!payload.charges,
          customer: { email: payload.customer?.email, has_document: !!payload.customer?.document },
          items_count: payload.items?.length || 0,
          metadata: payload.metadata
        }, null, 2));
      }
    } catch {}
    // Guard: KRXPAY requires explicit offer currency. Do not create order if missing.
    try {
      const cur = (providerOfferPrice && (providerOfferPrice as any)?.currency)
        ? String((providerOfferPrice as any).currency).trim()
        : ((resolvedOfferPrice && (resolvedOfferPrice as any)?.currency) ? String((resolvedOfferPrice as any).currency).trim() : '');
      if (!cur) {
        try { console.error('[checkout][create] currency guard failed — no currency on providerOfferPrice or resolvedOfferPrice', { offerId: selectedOffer?.id, country: desiredCountry, provider: selectedProvider }); } catch {}
        return NextResponse.json({ error: 'Moeda ausente para a oferta/país. Configure OfferPrice.currency.' }, { status: 400 });
      }
    } catch {}
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
        const basePix = {
          qr_code_url: tx?.qr_code_url || null,
          qr_code: tx?.qr_code || null,
          expires_in: (typeof (payment?.pix?.expires_in ?? payment?.pixExpiresIn) === 'number' ? Number(payment?.pix?.expires_in ?? payment?.pixExpiresIn) : 1800),
          expires_at: tx?.expires_at ?? null,
        } as any;
        // Attach debug info on failure to help surface reasons instead of nulls
        if (pixStatus === 'failed') {
          const debug = {
            order_status: order?.status ?? null,
            charge_status: ch?.status ?? null,
            tx_status: tx?.status ?? null,
            status_reason: tx?.status_reason ?? null,
            code: (tx as any)?.code ?? null,
            message: (tx as any)?.message ?? null,
            error_code: (tx as any)?.error_code ?? null,
            refusal_reason: (tx as any)?.refusal_reason ?? null,
            gateway_response_code: (tx as any)?.gateway_response_code ?? null,
            gateway_response_message: (tx as any)?.gateway_response_message ?? null,
            acquirer_name: (tx as any)?.acquirer_name ?? null,
            provider: (tx as any)?.provider ?? null,
          };
          basePix.debug = debug;
          try {
            console.error('[checkout][create] PIX failed diagnostics', {
              order_id: order?.id,
              charge_id: ch?.id,
              tx_id: tx?.id,
              ...debug,
              has_qr_code: !!(tx?.qr_code_url || tx?.qr_code),
              split_applied: actualSplitApplied,
              split_env_flag: String(process.env.PAGARME_ENABLE_SPLIT || '').toLowerCase() === 'true',
              is_subscription_prepaid: !!(body as any)?.subscriptionPeriodMonths
            });
            // One more attempt to refresh order details for richer tx error payload
            try {
              const refreshed = await pagarmeGetOrder(order?.id);
              const rch = Array.isArray(refreshed?.charges) ? refreshed.charges[0] : null;
              const rtx = rch?.last_transaction || null;
              console.error('[checkout][create] PIX refreshed tx snapshot', {
                tx_status: rtx?.status ?? null,
                status_reason: rtx?.status_reason ?? null,
                code: (rtx as any)?.code ?? null,
                message: (rtx as any)?.message ?? null,
                error_code: (rtx as any)?.error_code ?? null,
                gateway_response_code: (rtx as any)?.gateway_response_code ?? null,
                gateway_response_message: (rtx as any)?.gateway_response_message ?? null,
              });
            } catch {}
          } catch {}
        }
        pix = basePix;

        // Optional: mark checkout session as pix_generated when feature flag enabled
        try {
          const SESS_ENABLED = String(process.env.CHECKOUT_SESSIONS_ENABLED || '').toLowerCase() === 'true';
          if (SESS_ENABLED) {
            const hdrToken = (req.headers as any).get?.('x-checkout-resume-token') || (req.headers as any).get?.('X-Checkout-Resume-Token') || null;
            const bodyToken = (body as any)?.resumeToken || (body as any)?.resume_token || null;
            const resumeToken = String(hdrToken || bodyToken || '').trim();
            if (resumeToken) {
              const expAt: Date | null = basePix?.expires_at ? new Date(String(basePix.expires_at)) : (typeof basePix?.expires_in === 'number' ? new Date(Date.now() + Number(basePix.expires_in) * 1000) : null);
              await prisma.checkoutSession.update({
                where: { resumeToken },
                data: { status: 'pix_generated' as any, orderId: order?.id || undefined, pixOrderId: (ch?.id || tx?.id || null) || undefined, pixExpiresAt: expAt || undefined },
              }).catch(() => null);
            }
          }
        } catch {}
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

      // Mirror to Business Client data model (unified tables only)
      try {
        const pgCustomerId = order?.customer?.id || null;
        const ch = Array.isArray(order?.charges) ? order.charges[0] : null;
        const tx = ch?.last_transaction || null;
        const cardObj = tx?.card || null;
        const pgCardId = cardObj?.id || null;
        // MIRROR to Business Client data model: customer_providers, customer_payment_methods, payment_transactions.customer_id
        // This makes Providers/Methods/Charges appear on /business/clients/[id]
        try {
          // Resolve unified Customer by merchant+email
          const buyerEmailStr = String(buyer?.email || customer?.email || '')
          let unifiedCustomerIdForBiz: string | null = null
          if (buyerEmailStr && clinic?.id) {
            const merchantRow = await prisma.merchant.findFirst({ where: { clinicId: String(clinic.id) }, select: { id: true } })
            if (merchantRow?.id) {
              const existing = await prisma.customer.findFirst({ where: { merchantId: String(merchantRow.id), email: buyerEmailStr }, select: { id: true } })
              if (existing?.id) {
                unifiedCustomerIdForBiz = existing.id
              } else {
                // Create unified Customer for this merchant+email (first-time buyer path)
                try {
                  const created = await prisma.customer.create({
                    data: {
                      merchantId: String(merchantRow.id),
                      name: String(customer?.name || buyer?.name || ''),
                      email: buyerEmailStr,
                      phone: String(customer?.phone || buyer?.phone || ''),
                      document: String(customer?.document || ''),
                      address: (customer as any)?.address ? (customer as any).address : undefined,
                      metadata: {
                        source: 'checkout_create',
                        created_from_order: true
                      }
                    },
                    select: { id: true }
                  })
                  unifiedCustomerIdForBiz = created?.id || null
                  try { console.log('[checkout][create] created unified customer for business', { merchantId: merchantRow.id, email: buyerEmailStr, customerId: unifiedCustomerIdForBiz }); } catch {}
                } catch (e) {
                  // Race-safe: if unique constraint triggers, fetch it
                  try {
                    const fallback = await prisma.customer.findFirst({ where: { merchantId: String(merchantRow.id), email: buyerEmailStr }, select: { id: true } })
                    unifiedCustomerIdForBiz = fallback?.id || null
                  } catch {}
                }
              }
            }
          }
          
          if (unifiedCustomerIdForBiz) {
            // Upsert customer_providers for KRXPAY (Pagarme gateway)
            if (pgCustomerId) {
              const acctId = String(merchant?.id || '')
              const rowsCP = await prisma.$queryRawUnsafe<any[]>(
                `SELECT id FROM customer_providers WHERE customer_id = $1 AND provider IN ('KRXPAY', 'PAGARME') AND account_id = $2 LIMIT 1`,
                String(unifiedCustomerIdForBiz), acctId
              ).catch(() => [])
              if (rowsCP && rowsCP.length > 0) {
                await prisma.$executeRawUnsafe(
                  `UPDATE customer_providers SET provider = 'KRXPAY', provider_customer_id = $2, updated_at = NOW() WHERE id = $1`,
                  String(rowsCP[0].id), String(pgCustomerId)
                )
              } else {
                await prisma.$executeRawUnsafe(
                  `INSERT INTO customer_providers (id, customer_id, provider, account_id, provider_customer_id, created_at, updated_at)
                   VALUES (gen_random_uuid(), $1, 'KRXPAY'::"PaymentProvider", $2, $3, NOW(), NOW())`,
                  String(unifiedCustomerIdForBiz), acctId, String(pgCustomerId)
                )
              }
            }
            
            // Upsert customer_payment_methods when we have card (CRITICAL: save provider_payment_method_id for reuse)
            if (pgCardId && cardObj) {
              const acctId = String(merchant?.id || '')
              const brand = cardObj?.brand || null
              const last4 = cardObj?.last_four_digits || cardObj?.last4 || null
              const expMonth = cardObj?.exp_month || null
              const expYear = cardObj?.exp_year || null

              // Resolve customer_provider_id (KRXPAY link) for this account
              const cpRows = await prisma.$queryRawUnsafe<any[]>(
                `SELECT id FROM customer_providers WHERE customer_id = $1 AND provider IN ('KRXPAY', 'PAGARME') AND account_id = $2 LIMIT 1`,
                String(unifiedCustomerIdForBiz), acctId
              ).catch(() => [])
              const customerProviderId = cpRows && cpRows.length > 0 ? String(cpRows[0].id) : null

              // Prefer deduplication by provider_payment_method_id (card_id)
              const rowsPM = await prisma.$queryRawUnsafe<any[]>(
                `SELECT id FROM customer_payment_methods 
                 WHERE customer_id = $1 AND provider IN ('KRXPAY', 'PAGARME') AND provider_payment_method_id = $2 
                 LIMIT 1`,
                String(unifiedCustomerIdForBiz), String(pgCardId)
              ).catch(() => [])

              if (rowsPM && rowsPM.length > 0) {
                await prisma.$executeRawUnsafe(
                  `UPDATE customer_payment_methods 
                   SET provider = 'KRXPAY', brand = $2, last4 = $3, exp_month = $4, exp_year = $5, status = 'ACTIVE', 
                       customer_provider_id = $6, updated_at = NOW() 
                   WHERE id = $1`,
                  String(rowsPM[0].id), brand, last4, expMonth, expYear, customerProviderId
                )
                try { console.log('[checkout][create][card-save] ✅ Updated existing card', { id: rowsPM[0].id, pgCardId }); } catch {}
              } else {
                await prisma.$executeRawUnsafe(
                  `INSERT INTO customer_payment_methods 
                   (id, customer_id, customer_provider_id, provider, account_id, provider_payment_method_id, 
                    brand, last4, exp_month, exp_year, status, is_default, created_at, updated_at)
                   VALUES (gen_random_uuid(), $1, $2, 'KRXPAY'::"PaymentProvider", $3, $4, $5, $6, $7, $8, 'ACTIVE', false, NOW(), NOW())`,
                  String(unifiedCustomerIdForBiz), customerProviderId, acctId, String(pgCardId), brand, last4, expMonth, expYear
                )
                try { console.log('[checkout][create][card-save] ✅ Created new card', { pgCardId, brand, last4 }); } catch {}
              }
            }
            
            try { console.log('[checkout][create] ✅ Mirrored to Business Client tables', { customerId: unifiedCustomerIdForBiz, hasProvider: !!pgCustomerId, hasMethod: !!pgCardId }); } catch {}
          }
        } catch (e) {
          console.warn('[checkout][create] mirror to business tables failed (non-fatal):', e instanceof Error ? e.message : e)
        }
      } catch (e) {
        console.warn('[checkout][create] persist payment customer/method from order failed:', e instanceof Error ? e.message : e);
      }
      try { console.log('[checkout][create] tx persist precheck', { doctorId, profileId, orderId: order?.id, method: payment?.method, amountCents }); } catch {}
      
      // Resolve unified customer_id for payment_transactions
      let txCustomerId: string | null = null;
      try {
        const buyerEmailStr = String(buyer?.email || customer?.email || '');
        if (buyerEmailStr && merchant?.id) {
          const cust = await prisma.customer.findFirst({ where: { merchantId: String(merchant.id), email: buyerEmailStr }, select: { id: true } });
          txCustomerId = cust?.id || null;
        }
      } catch {}
      
      if (HAS_PT && doctorId && profileId) {
        const txId = crypto.randomUUID();
        const methodType = payment?.method === 'pix' ? 'pix' : 'credit_card';
        const orderId = order?.id || null;
        try { console.log('[checkout][create] inserting payment_transactions row', { txId, orderId, methodType, customerId: txCustomerId }); } catch {}
        // Compute clinic/platform amounts from merchant.splitPercent (fallback 70) and hybrid fees (platformFeeBps + transactionFeeCents)
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
          `INSERT INTO payment_transactions (id, provider, provider_order_id, doctor_id, patient_profile_id, clinic_id, product_id, customer_id, amount_cents, clinic_amount_cents, platform_amount_cents, platform_fee_cents, currency, installments, payment_method_type, status, raw_payload, routed_provider)
           VALUES ($1, 'krxpay', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'processing', $15::jsonb, 'KRXPAY')
           ON CONFLICT (provider, provider_order_id) DO UPDATE
             SET doctor_id = COALESCE(payment_transactions.doctor_id, EXCLUDED.doctor_id),
                 patient_profile_id = COALESCE(payment_transactions.patient_profile_id, EXCLUDED.patient_profile_id),
                 clinic_id = COALESCE(payment_transactions.clinic_id, EXCLUDED.clinic_id),
                 product_id = COALESCE(payment_transactions.product_id, EXCLUDED.product_id),
                 customer_id = COALESCE(payment_transactions.customer_id, EXCLUDED.customer_id),
                 amount_cents = CASE WHEN payment_transactions.amount_cents = 0 THEN EXCLUDED.amount_cents ELSE payment_transactions.amount_cents END,
                 clinic_amount_cents = COALESCE(payment_transactions.clinic_amount_cents, EXCLUDED.clinic_amount_cents),
                 platform_amount_cents = COALESCE(payment_transactions.platform_amount_cents, EXCLUDED.platform_amount_cents),
                 platform_fee_cents = COALESCE(payment_transactions.platform_fee_cents, EXCLUDED.platform_fee_cents)`
,
          txId,
          orderId,
          String(doctorId),
          String(profileId),
          clinic?.id ? String(clinic.id) : null,
          String(productId),
          txCustomerId,
          Number(amountCents),
          clinicAmountCents,
          platformAmountCents,
          platformFeeTotal,
          (resolvedOfferPrice && (resolvedOfferPrice as any)?.currency) ? String((resolvedOfferPrice as any).currency).toUpperCase() : null,
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
              const prod = await prisma.product.findUnique({ where: { id: String(productId) }, select: { doctorId: true, clinicId: true } });
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
              const prod = await prisma.product.findUnique({ where: { id: String(productId) } });
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

    // Create customer_subscriptions for prepaid subscription purchases
    try {
      const isSubscriptionPurchase = !!selectedOffer?.isSubscription || (typeof (body as any)?.subscriptionPeriodMonths === 'number' && (body as any).subscriptionPeriodMonths > 0);
      const wasPaid = !!order?.charges && Array.isArray(order.charges) && ['paid'].includes(String(order.charges[0]?.status || '').toLowerCase());
      
      // Create subscription for both paid and pending orders
      if (isSubscriptionPurchase && order?.id && merchant?.id) {
        try { console.log('[checkout][create][subscription] detected prepaid subscription', { orderId: order.id, isSubscription: selectedOffer?.isSubscription, periodMonths: (body as any)?.subscriptionPeriodMonths, wasPaid }); } catch {}
        
        // Check if already exists
        const existingSub: any[] = await prisma.$queryRawUnsafe(
          `SELECT id FROM customer_subscriptions WHERE metadata->>'pagarmeOrderId' = $1 LIMIT 1`,
          String(order.id)
        );
        
        if (!existingSub || existingSub.length === 0) {
          // Ensure Customer exists (create if missing)
          let unifiedCustomerId: string | null = null;
          try {
            const buyerEmail = String(buyer?.email || '');
            const buyerName = String(buyer?.name || '');
            const buyerPhone = String(buyer?.phone || '');
            
            if (buyerEmail && merchant?.id) {
              // Try to find existing
              let cust = await prisma.customer.findFirst({
                where: { merchantId: String(merchant.id), email: buyerEmail },
                select: { id: true }
              });
              
              // Create if not found (allow minimal data: name optional, phone optional)
              if (!cust) {
                try {
                  const docDigits = onlyDigits(String(buyer?.document || '')) || null;
                  cust = await prisma.customer.create({
                    data: {
                      merchantId: String(merchant.id),
                      name: buyerName || null,
                      email: buyerEmail,
                      phone: buyerPhone || null,
                      document: docDigits,
                      metadata: { source: 'checkout_create_subscription', pagarmeOrderId: order.id } as any
                    },
                    select: { id: true }
                  });
                  try { console.log('[checkout][create][subscription] ✅ Created Customer', { customerId: cust.id, email: buyerEmail }); } catch {}
                } catch (e) {
                  console.error('[checkout][create][subscription] Failed to create Customer', e instanceof Error ? e.message : e);
                }
              }
              
              unifiedCustomerId = cust?.id || null;
            }
          } catch (e) {
            console.error('[checkout][create][subscription] Failed to resolve Customer', e instanceof Error ? e.message : e);
          }
          
          if (unifiedCustomerId) {
            // Compute subscription period from metadata or offer
            const subMonths = (typeof (body as any)?.subscriptionPeriodMonths === 'number' && (body as any).subscriptionPeriodMonths > 0)
              ? Math.trunc(Number((body as any).subscriptionPeriodMonths))
              : 1;
            
            let interval: any = 'MONTH';
            let intervalCount = subMonths;
            
            // Try to get from Offer if available
            try {
              if (selectedOffer?.id) {
                const offerData = await prisma.offer.findUnique({
                  where: { id: String(selectedOffer.id) },
                  select: { intervalUnit: true, intervalCount: true, trialDays: true }
                });
                if (offerData?.intervalUnit) interval = offerData.intervalUnit;
                if (offerData?.intervalCount != null) intervalCount = offerData.intervalCount;
              }
            } catch {}
            
            const now = new Date();
            const startAt = now.toISOString();
            const trialEndsAt = null; // No trial for prepaid
            const currentPeriodStart = now.toISOString();
            
            // Calculate end date based on interval
            const periodEnd = new Date(now);
            if (interval === 'DAY') periodEnd.setDate(periodEnd.getDate() + intervalCount);
            else if (interval === 'WEEK') periodEnd.setDate(periodEnd.getDate() + intervalCount * 7);
            else if (interval === 'MONTH') periodEnd.setMonth(periodEnd.getMonth() + intervalCount);
            else if (interval === 'YEAR') periodEnd.setFullYear(periodEnd.getFullYear() + intervalCount);
            const currentPeriodEnd = periodEnd.toISOString();
            
            // Extract customer_id and card_id from order response for renewal
            const pagarmeCustomerId = order?.customer?.id || null;
            const pagarmeCardId = (() => {
              const ch = Array.isArray(order?.charges) ? order.charges[0] : null;
              const tx = ch?.last_transaction || null;
              const cardId = tx?.card?.id || null;
              if (cardId) return cardId;
              const pay = Array.isArray(order?.payments) ? order.payments[0] : null;
              const payTx = pay?.last_transaction || pay?.transaction || null;
              return payTx?.card?.id || null;
            })();
            
            const metadata = JSON.stringify({
              interval,
              intervalCount,
              buyerName: String(buyer?.name || ''),
              buyerEmail: String(buyer?.email || ''),
              productName: String(productData?.name || ''),
              source: 'checkout_create_prepaid',
              pagarmeOrderId: order.id,
              subscriptionPeriodMonths: subMonths,
              pagarmeCustomerId,
              pagarmeCardId
            });
            
            // Determine status: ACTIVE if paid, PENDING if not
            const subStatus = wasPaid ? 'ACTIVE' : 'PENDING';
            
            const subId = crypto.randomUUID();
            await prisma.$queryRawUnsafe(
              `INSERT INTO customer_subscriptions (
                 id, customer_id, merchant_id, product_id, offer_id, provider, account_id, is_native,
                 provider_subscription_id, status, start_at, trial_ends_at, current_period_start, current_period_end,
                 price_cents, currency, metadata, created_at, updated_at
               ) VALUES (
                 $1, $2, $3, $4, $5, 'KRXPAY'::"PaymentProvider", $6, true,
                 $7, $8::"SubscriptionStatus", $9::timestamp, $10::timestamp, $11::timestamp, $12::timestamp,
                 $13, 'BRL', $14::jsonb, NOW(), NOW()
               )`,
              subId,
              unifiedCustomerId,
              String(merchant.id),
              String(productId),
              selectedOffer?.id || null,
              String(merchant.id), // accountId
              String(order.id), // use order id as provider_subscription_id for idempotency
              subStatus,
              startAt,
              trialEndsAt,
              currentPeriodStart,
              currentPeriodEnd,
              Number(amountCents),
              metadata
            );
            
            try { console.log('[checkout][create][subscription] ✅ Created customer_subscriptions', { subId, customerId: unifiedCustomerId, productId, interval, intervalCount, periodEnd: currentPeriodEnd, status: subStatus }); } catch {}
          } else {
            try { console.warn('[checkout][create][subscription] ⚠️  No unified customer found, skipping subscription creation'); } catch {}
          }
        } else {
          try { console.log('[checkout][create][subscription] Subscription already exists for order', { orderId: order.id }); } catch {}
        }
      }
    } catch (e) {
      console.error('[checkout][create][subscription] Failed to create customer_subscriptions', e instanceof Error ? e.message : e);
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
