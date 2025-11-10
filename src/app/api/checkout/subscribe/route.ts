import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma, PaymentMethod } from '@prisma/client';
import { isV5, pagarmeCreateCustomer, pagarmeCreateCustomerCard, pagarmeCreateSubscription, pagarmeCreatePlan } from '@/lib/pagarme';
import crypto from 'crypto';

function onlyDigits(s: string) { return (s || '').replace(/\D/g, ''); }

export async function POST(req: Request) {
  try {
    const ENABLED = String(process.env.PAGARME_ENABLE_SUBSCRIPTIONS || '').toLowerCase() === 'true';
    if (!ENABLED) return NextResponse.json({ error: 'Assinaturas desabilitadas' }, { status: 400 });

    if (!isV5()) return NextResponse.json({ error: 'Pagar.me v5 não configurado' }, { status: 400 });
    const isDev = process.env.NODE_ENV !== 'production';

    const body = await req.json();
    const { productId, slug, buyer, payment } = body || {};
    if (!productId) return NextResponse.json({ error: 'productId é obrigatório' }, { status: 400 });
    if (!buyer?.name || !buyer?.email || !buyer?.phone) return NextResponse.json({ error: 'Dados do comprador incompletos' }, { status: 400 });

    // Load product and ensure type SUBSCRIPTION
    const product = await prisma.products.findUnique({ where: { id: String(productId) } });
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

    // Find a subscription Offer for this product (prefer active)
    const offers = await prisma.offer.findMany({
      where: { productId: String(product.id), active: true, isSubscription: true },
      include: { paymentMethods: true },
      orderBy: { createdAt: 'asc' },
    });
    const selectedOffer = offers[0] || null;
    // Validate payment method availability according to Offer when present (subscriptions require CARD)
    if (selectedOffer) {
      const hasCard = Array.isArray(selectedOffer.paymentMethods)
        ? selectedOffer.paymentMethods.some((m: any) => m.active && m.method === PaymentMethod.CARD)
        : true;
      if (!hasCard) {
        return NextResponse.json({ error: 'Oferta não permite pagamento com cartão' }, { status: 400 });
      }
    }

    // Ensure provider plan exists; auto-create if missing
    let providerPlanId: string | null = (product as any)?.providerPlanId || null;
    if (!providerPlanId) {
      // Derive minimal plan payload from product
      const planName = String((product as any)?.name || 'Subscription Plan');
      // Amount and interval from Offer when available, otherwise legacy product price
      const offerAmountCents = selectedOffer ? Number(selectedOffer.priceCents || 0) : null;
      const amountCents = (offerAmountCents != null && offerAmountCents > 0)
        ? offerAmountCents
        : Math.round(Number((product as any)?.price || 0) * 100);
      if (!amountCents || amountCents <= 0) {
        return NextResponse.json({ error: 'Preço inválido para criar plano de assinatura' }, { status: 400 });
      }
      const planPayload: any = {
        name: planName,
        interval: (selectedOffer?.intervalUnit ? String(selectedOffer.intervalUnit).toLowerCase() : 'month'),
        interval_count: (selectedOffer?.intervalCount && selectedOffer.intervalCount > 0) ? Number(selectedOffer.intervalCount) : 1,
        billing_type: 'prepaid',
        currency: 'BRL',
        payment_methods: ['credit_card'],
        items: [
          {
            name: planName,
            quantity: 1,
            pricing_scheme: {
              scheme_type: 'unit',
              price: amountCents,
            },
          },
        ],
        metadata: { productId: String(productId), clinicId: String((product as any)?.clinicId || ''), offerId: selectedOffer?.id || null },
      };
      // Include trial period from Offer when > 0
      if (selectedOffer?.trialDays && Number(selectedOffer.trialDays) > 0) {
        planPayload.trial_period_days = Number(selectedOffer.trialDays);
      }
      try {
        if (isDev) console.warn('[subscribe] Creating provider plan', { planPayload });
        const createdPlan = await pagarmeCreatePlan(planPayload);
        providerPlanId = createdPlan?.id || createdPlan?.plan?.id || null;
        if (providerPlanId) {
          try {
            await prisma.products.update({ where: { id: String(productId) }, data: { providerPlanId } });
          } catch {}
        }
      } catch (e: any) {
        try { console.error('[subscribe] create plan failed', { status: e?.status, message: e?.message, response: e?.responseJson || e?.responseText }); } catch {}
        return NextResponse.json({ error: e?.message || 'Falha ao criar plano de assinatura no provedor' }, { status: 500 });
      }
    }

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

    if (isDev) console.warn('[subscribe] Using plan_id', { providerPlanId });
    const payload: any = {
      plan_id: providerPlanId,
      customer: providerCustomerId ? { id: providerCustomerId, ...customerCore } : customerCore,
      payment_method: 'credit_card',
      metadata,
    };
    if (useSavedCard && cardId) {
      payload.card_id = cardId;
    }

    // Create subscription
    let subscription: any = null;
    try {
      if (isDev) console.warn('[subscribe] Creating subscription', { plan_id: payload?.plan_id, has_customer: !!payload?.customer, has_card_id: !!payload?.card_id });
      subscription = await pagarmeCreateSubscription(payload);
    } catch (e: any) {
      const status = Number(e?.status) || 502;
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
    const subscriptionId = subscription?.id || subscription?.subscription?.id || null;

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

      if (doctorId && profileId) {
        // Upsert payment_customers if table exists and provider customer id is available
        try {
          if (providerCustomerId) {
            const custTableRows: any[] = await prisma.$queryRawUnsafe(
              "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_customers') AS exists"
            );
            const custTableExists = Array.isArray(custTableRows) && !!(custTableRows[0]?.exists || custTableRows[0]?.exists === true);
            if (custTableExists) {
              const pcId = crypto.randomUUID();
              const inserted: any[] = await prisma.$queryRawUnsafe(
                `INSERT INTO payment_customers (id, provider, provider_customer_id, doctor_id, patient_profile_id, clinic_id, raw_payload)
                 VALUES ($1, 'pagarme', $2, $3, $4, $5, $6::jsonb)
                 ON CONFLICT DO NOTHING
                 RETURNING id`,
                pcId,
                String(providerCustomerId),
                String(doctorId),
                String(profileId),
                clinic?.id ? String(clinic.id) : null,
                JSON.stringify({ buyer: { name: buyer?.name, email: buyer?.email }, metadata })
              );
              // If ON CONFLICT prevented insert, try to fetch existing row id by provider_customer_id
              let finalPcId = inserted?.[0]?.id || null;
              if (!finalPcId) {
                const existing: any[] = await prisma.$queryRawUnsafe(
                  `SELECT id FROM payment_customers WHERE provider_customer_id = $1 LIMIT 1`,
                  String(providerCustomerId)
                );
                finalPcId = existing?.[0]?.id || pcId;
              }
              // Insert payment_methods if table exists and we have a cardId
              if (cardId) {
                const methodsTableRows: any[] = await prisma.$queryRawUnsafe(
                  "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_methods') AS exists"
                );
                const methodsTableExists = Array.isArray(methodsTableRows) && !!(methodsTableRows[0]?.exists || methodsTableRows[0]?.exists === true);
                if (methodsTableExists) {
                  const pmId = crypto.randomUUID();
                  const last4 = (payment?.card?.number ? String(payment.card.number).replace(/\s+/g, '') : '').slice(-4) || null;
                  await prisma.$executeRawUnsafe(
                    `INSERT INTO payment_methods (id, payment_customer_id, provider_card_id, brand, last4, exp_month, exp_year, is_default, status, raw_payload)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, 'active', $8::jsonb)`,
                    pmId,
                    String(finalPcId),
                    String(cardId),
                    null,
                    last4,
                    Number(payment?.card?.exp_month || 0),
                    Number((() => { const y = Number(payment?.card?.exp_year || 0); return y < 100 ? 2000 + y : y; })()),
                    JSON.stringify({ providerCustomerId, cardId })
                  );
                }
              }
            } else {
              if (process.env.NODE_ENV !== 'production') console.warn('[subscribe] payment_customers table not found — skipping persistence');
            }
          }
        } catch (e) {
          console.warn('[subscribe] persist payment_customers/methods failed:', e instanceof Error ? e.message : e);
        }

        // Check if payment_transactions table exists before inserting
        const existsRows: any[] = await prisma.$queryRawUnsafe(
          "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_transactions') AS exists"
        );
        const tableExists = Array.isArray(existsRows) && !!(existsRows[0]?.exists || existsRows[0]?.exists === true);
        if (doctorId && tableExists) {
          const txId = crypto.randomUUID();
          const amountCents = (selectedOffer ? Number(selectedOffer.priceCents || 0) : Math.round(Number(product?.price as any) * 100)) || 0;
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
            `INSERT INTO payment_transactions (id, provider, provider_order_id, doctor_id, patient_profile_id, clinic_id, product_id, amount_cents, clinic_amount_cents, platform_amount_cents, platform_fee_cents, currency, installments, payment_method_type, status, raw_payload)
             VALUES ($1, 'pagarme', $2, $3, $4, $5, $6, $7, $8, $9, $10, 'BRL', $11, $12, 'processing', $13::jsonb)`,
            txId,
            subscriptionId ? String(subscriptionId) : null,
            String(doctorId),
            String(profileId),
            clinic?.id ? String(clinic.id) : null,
            String(productId),
            Number(amountCents),
            clinicAmountCents,
            platformAmountCents,
            platformFeeTotal,
            1,
            'credit_card',
            JSON.stringify({ payload })
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
