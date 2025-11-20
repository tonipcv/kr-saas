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
    const explicitSavedCardId: string | null = payment?.saved_card_id || null;
    const explicitProviderCustomerId: string | null = payment?.provider_customer_id || null;

    let product: any = null;
    let clinic: any = null;
    let merchant: any = null;
    let amountCents = 0;
    let baseAmountCents = 0; // price before any interest embedding
    let doctorId: string | null = null;
    let selectedOffer: any = null;
    // Hoist resolvedOfferPrice so later metadata access is safe even if DB block fails
    let resolvedOfferPrice: any = null;
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
      // Final guard: reject subscription offers ONLY if this is a pure one-time purchase (no subscriptionPeriodMonths)
      const isSubscriptionOffer = !!selectedOffer?.isSubscription;
      const hasPrepaidSubHint = typeof (body as any)?.subscriptionPeriodMonths === 'number' && (body as any).subscriptionPeriodMonths > 0;
      if (isSubscriptionOffer && !hasPrepaidSubHint) {
        console.warn('[checkout][create] selected offer is subscription but no subscriptionPeriodMonths in body, rejecting', { offerId: selectedOffer?.id });
        return NextResponse.json({ error: 'Oferta de assinatura requer fluxo de checkout específico' }, { status: 400 });
      }
      // Resolve price by country, prioritizing KRXPAY OfferPrice for the checkout amount
      // Priority order:
      //  1) OfferPrice(offerId, country=desiredCountry, provider=KRXPAY, active=true)
      //  2) OfferPrice(offerId, country=desiredCountry, active=true) [any provider]
      //  3) selectedOffer.priceCents (fallback)
      let desiredCountry = 'BR';
      try {
        desiredCountry = String(((buyer as any)?.address?.country) || clinic?.country || 'BR').toUpperCase();
      } catch {}
      if (selectedOffer) {
        try {
          resolvedOfferPrice = await prisma.offerPrice.findFirst({
            where: { offerId: String(selectedOffer.id), country: desiredCountry, provider: PaymentProvider.KRXPAY, active: true },
            orderBy: { updatedAt: 'desc' },
          });
          if (!resolvedOfferPrice) {
            resolvedOfferPrice = await prisma.offerPrice.findFirst({
              where: { offerId: String(selectedOffer.id), country: desiredCountry, active: true },
              orderBy: { updatedAt: 'desc' },
            });
          }
        } catch (e) {
          try { console.warn('[checkout][create] OfferPrice lookup failed, using offer price', e instanceof Error ? e.message : e); } catch {}
        }
      }
      if (resolvedOfferPrice?.amountCents != null && Number(resolvedOfferPrice.amountCents) > 0) {
        amountCents = Number(resolvedOfferPrice.amountCents);
      } else if (selectedOffer) {
        amountCents = Number(selectedOffer.priceCents || 0);
      } else {
        // Fallback to legacy product price if no offer exists
        const price = Number(product?.price as any);
        amountCents = Math.round((price || 0) * 100);
      }
      baseAmountCents = amountCents;
      try { console.log('[checkout][create] pricing resolved', { desiredCountry, offerId: selectedOffer?.id, amountCents, from: resolvedOfferPrice ? 'offer_price' : 'offer_base' }); } catch {}
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
    // Subscription prepaid hint from UI (subscriptionPeriodMonths)
    const subMonths = (typeof (body as any)?.subscriptionPeriodMonths === 'number' && (body as any).subscriptionPeriodMonths > 0)
      ? Math.trunc(Number((body as any).subscriptionPeriodMonths))
      : null;
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

    // Decide provider (non-breaking: we still use current Pagar.me flow; provider is logged and attached to metadata)
    let selectedProvider: PaymentProvider | null = null;
    try {
      const requestedMethod = (payment?.method === 'pix') ? PaymentMethod.PIX : (payment?.method === 'boleto' ? PaymentMethod.BOLETO : PaymentMethod.CARD);
      selectedProvider = await selectProvider({
        merchantId: String(merchant?.id || ''),
        offerId: selectedOffer?.id || null,
        productId: String(product?.id || productId || ''),
        country: String(billingAddr.country || 'BR'),
        method: requestedMethod,
      });
      try { console.log('[checkout][create] selected provider', { selectedProvider, country: billingAddr.country, productId: product?.id, offerId: selectedOffer?.id }); } catch {}
    } catch (e) {
      try { console.warn('[checkout][create] provider selection failed, falling back to default Pagar.me path', e instanceof Error ? e.message : e); } catch {}
      selectedProvider = null;
    }
    // Enforce KRXPAY (Pagar.me) only in BR
    if (selectedProvider === PaymentProvider.KRXPAY && !isBR) {
      return NextResponse.json({ error: 'KRXPAY indisponível fora do Brasil' }, { status: 400 });
    }

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
      if (explicitSavedCardId && explicitProviderCustomerId) return { id: explicitProviderCustomerId, ...core };
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
        currency: (resolvedOfferPrice && (resolvedOfferPrice as any)?.currency) ? String((resolvedOfferPrice as any).currency).toUpperCase() : undefined,
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
        currency: String((resolvedOfferPrice as any)?.currency || 'BRL').toUpperCase(),
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
      const cur = (resolvedOfferPrice && (resolvedOfferPrice as any)?.currency) ? String((resolvedOfferPrice as any).currency).trim() : '';
      if (!cur) {
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
          `INSERT INTO payment_transactions (id, provider, provider_order_id, doctor_id, patient_profile_id, clinic_id, product_id, amount_cents, clinic_amount_cents, platform_amount_cents, platform_fee_cents, currency, installments, payment_method_type, status, raw_payload, routed_provider)
           VALUES ($1, 'pagarme', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'processing', $14::jsonb, 'KRXPAY')
           ON CONFLICT (provider, provider_order_id) DO UPDATE
             SET doctor_id = COALESCE(payment_transactions.doctor_id, EXCLUDED.doctor_id),
                 patient_profile_id = COALESCE(payment_transactions.patient_profile_id, EXCLUDED.patient_profile_id),
                 clinic_id = COALESCE(payment_transactions.clinic_id, EXCLUDED.clinic_id),
                 product_id = COALESCE(payment_transactions.product_id, EXCLUDED.product_id),
                 amount_cents = CASE WHEN payment_transactions.amount_cents = 0 THEN EXCLUDED.amount_cents ELSE payment_transactions.amount_cents END,
                 clinic_amount_cents = COALESCE(payment_transactions.clinic_amount_cents, EXCLUDED.clinic_amount_cents),
                 platform_amount_cents = COALESCE(payment_transactions.platform_amount_cents, EXCLUDED.platform_amount_cents),
                 platform_fee_cents = COALESCE(payment_transactions.platform_fee_cents, EXCLUDED.platform_fee_cents)`,
          txId,
          orderId,
          String(doctorId),
          String(profileId),
          clinic?.id ? String(clinic.id) : null,
          String(productId),
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
