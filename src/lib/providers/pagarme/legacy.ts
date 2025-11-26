// Legacy wrapper used by PagarmeAdapter in Phase 1.
// This function mirrors the current subscribe route behavior (planless first) and returns a normalized result.

import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { PaymentMethod as PrismaPaymentMethod } from '@prisma/client';
import { pagarmeCreateCustomer, pagarmeCreateCustomerCard, pagarmeCreateSubscription, isV5 } from '@/lib/payments/pagarme/sdk';

export interface LegacyCreatePagarmeSubscriptionParams {
  clinicId: string;
  customerId: string; // internal user/customer id (for linking)
  offerId: string;
  amount: number; // cents (fallback if OfferPrice missing)
  currency: string; // e.g. 'BRL'
  interval: string; // 'month' | 'year'
  customer: any; // { name, email, document, phone, address? }
  paymentMethod: any; // { type: 'credit_card', token? | saved_card_id?, provider_customer_id? }
  metadata?: any;
}

function onlyDigits(s: string) { return (s || '').replace(/\D/g, ''); }

export async function createPagarmeSubscription(params: LegacyCreatePagarmeSubscriptionParams): Promise<any> {
  if (!isV5()) throw new Error('Pagar.me v5 não configurado');

  // Load clinic, product/offer context
  const clinic = await prisma.clinic.findUnique({ where: { id: String(params.clinicId) } });
  if (!clinic) throw new Error('Clínica não encontrada');
  const offer = await prisma.offer.findUnique({ where: { id: String(params.offerId) }, include: { paymentMethods: true } });
  if (!offer) throw new Error('Oferta não encontrada');
  const product = await prisma.product.findUnique({ where: { id: String(offer.productId) } });
  if (!product) throw new Error('Produto não encontrado');
  if ((product as any).type !== 'SUBSCRIPTION') throw new Error('Produto não é do tipo SUBSCRIPTION');

  // Validate payment method availability
  const hasCard = Array.isArray(offer.paymentMethods)
    ? offer.paymentMethods.some((m: any) => m.active && m.method === PrismaPaymentMethod.CARD)
    : true;
  if (!hasCard) throw new Error('Oferta não permite pagamento com cartão');

  // Merchant/recipient
  const merchant = await prisma.merchant.findUnique({ where: { clinicId: String(clinic.id) } });
  if (!merchant?.recipientId) throw new Error('Clínica sem recebedor cadastrado');

  // Resolve amount and currency from OfferPrice (prefer KRXPAY for country)
  let desiredCountry = 'BR';
  try { desiredCountry = String((params.customer?.address?.country) || clinic?.country || 'BR').toUpperCase(); } catch {}
  let priceRow: any = null;
  try {
    priceRow = await prisma.offerPrice.findFirst({
      where: { offerId: String(offer.id), country: desiredCountry, provider: 'KRXPAY' as any, active: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (!priceRow) {
      priceRow = await prisma.offerPrice.findFirst({ where: { offerId: String(offer.id), country: desiredCountry, active: true }, orderBy: { updatedAt: 'desc' } });
    }
  } catch {}
  const unitAmount = (() => {
    if (priceRow?.amountCents != null && Number(priceRow.amountCents) > 0) return Number(priceRow.amountCents);
    if (offer?.priceCents != null && Number(offer.priceCents) > 0) return Number(offer.priceCents);
    return Number(params.amount || 0);
  })();
  const currency = (priceRow?.currency || (offer as any)?.currency || params.currency || 'BRL') as any;
  if (!unitAmount || unitAmount <= 0) throw new Error('Preço inválido para assinatura');

  // Build customer and card
  const phoneDigits = onlyDigits(String(params.customer?.phone || ''));
  let ddd = phoneDigits.slice(0, 2), number = phoneDigits.slice(2);
  if (phoneDigits.startsWith('55') && phoneDigits.length >= 12) { ddd = phoneDigits.slice(2, 4); number = phoneDigits.slice(4); }
  const phoneObj = { country_code: '55', area_code: ddd, number };
  const addr = (params.customer?.address || {});
  const billingAddr = {
    line_1: `${addr.street || 'Av. Paulista'}, ${addr.number || '1000'}`,
    zip_code: String(addr.zip_code || '01310200').replace(/\D/g, ''),
    city: String(addr.city || 'São Paulo'),
    state: String(addr.state || 'SP'),
    country: String(addr.country || 'BR'),
  };
  const customerCore: any = {
    name: params.customer?.name,
    email: params.customer?.email,
    document: onlyDigits(String(params.customer?.document || '')) || undefined,
    type: (onlyDigits(String(params.customer?.document || '')).length > 11) ? 'company' : 'individual',
    phones: { mobile_phone: phoneObj },
    address: billingAddr,
    metadata: { source: 'subscribe_v2' },
  };

  const explicitSavedCardId: string | null = params.paymentMethod?.saved_card_id || null;
  const explicitProviderCustomerId: string | null = params.paymentMethod?.provider_customer_id || null;
  let providerCustomerId: string | null = explicitProviderCustomerId || null;
  let cardId: string | null = null;

  if (params.paymentMethod?.type !== 'credit_card') throw new Error('Assinaturas exigem método de pagamento cartão');

  if (explicitSavedCardId && providerCustomerId) {
    cardId = explicitSavedCardId;
  } else {
    // Create customer
    const createdCustomer = await pagarmeCreateCustomer(customerCore);
    providerCustomerId = createdCustomer?.id || null;
    // Save card
    const cc = params.paymentMethod?.card || {};
    if (!cc.number || !cc.holder_name || !cc.exp_month || !cc.exp_year || !cc.cvv) throw new Error('Dados do cartão incompletos');
    const cardPayload: any = {
      holder_name: cc.holder_name,
      exp_month: Number(cc.exp_month),
      exp_year: (() => { const y = Number(cc.exp_year); return y < 100 ? 2000 + y : y; })(),
      cvv: String(cc.cvv),
      number: String(cc.number).replace(/\s+/g, ''),
      billing_address: billingAddr,
      options: { verify_card: true },
    };
    const createdCard = await pagarmeCreateCustomerCard(String(providerCustomerId), cardPayload);
    cardId = createdCard?.id || createdCard?.card?.id || null;
  }

  // Metadata and split
  const metadata = {
    ...(params.metadata || {}),
    clinicId: clinic?.id || null,
    buyerEmail: String(params.customer?.email || ''),
    productId: String(product?.id || ''),
    offerId: String(offer?.id || ''),
  };

  const ENABLE_SPLIT = String(process.env.PAGARME_ENABLE_SPLIT || '').toLowerCase() === 'true';
  const platformRecipientId = String(process.env.PAGARME_PLATFORM_RECIPIENT_ID_OVERRIDE || process.env.PLATFORM_RECIPIENT_ID || process.env.PAGARME_PLATFORM_RECIPIENT_ID || '').trim() || null;
  const clinicPercent = Math.max(0, Math.min(100, Number(merchant?.splitPercent || 85)));
  const platformPercent = Math.max(0, Math.min(100, 100 - clinicPercent));
  const clinicRecipientId = String(process.env.PAGARME_RECIPIENT_ID_OVERRIDE || merchant?.recipientId || '').trim() || null;
  try {
    console.log('[subscribe][split] config', {
      ENABLE_SPLIT,
      platformRecipientId,
      clinicRecipientId,
      clinicPercent,
      platformPercent,
      usingOverride: Boolean(process.env.PAGARME_RECIPIENT_ID_OVERRIDE),
      usingPlatformOverride: Boolean(process.env.PAGARME_PLATFORM_RECIPIENT_ID_OVERRIDE),
    });
  } catch {}
  const splitBody = (ENABLE_SPLIT && platformRecipientId && clinicRecipientId) ? {
    enabled: true,
    rules: [
      { recipient_id: String(platformRecipientId), type: 'percentage', amount: platformPercent, options: { liable: true, charge_processing_fee: true, charge_remainder_fee: false } },
      { recipient_id: String(clinicRecipientId), type: 'percentage', amount: clinicPercent, options: { liable: true, charge_processing_fee: false, charge_remainder_fee: true } },
    ],
  } : undefined;

  // Planless subscription payload (preferred)
  const intervalUnit = (offer?.intervalUnit ? String(offer.intervalUnit).toLowerCase() : (params.interval || 'month'));
  const intervalCount = (offer?.intervalCount && offer.intervalCount > 0) ? Number(offer.intervalCount) : 1;
  const payload: any = {
    customer: providerCustomerId ? { id: providerCustomerId, ...customerCore } : customerCore,
    payment_method: 'credit_card',
    interval: intervalUnit,
    interval_count: intervalCount,
    billing_type: 'prepaid',
    currency: String(currency),
    items: [ { name: String((product as any)?.name || 'Assinatura'), description: 'Assinatura avulsa', quantity: 1, pricing_scheme: { scheme_type: 'unit', price: unitAmount } } ],
    metadata,
    ...(splitBody ? { split: splitBody } : {}),
  };
  if (cardId) payload.card_id = cardId;
  try {
    console.log('[subscribe] Creating subscription', {
      planless: true,
      plan_id: payload?.plan_id,
      amount: payload?.amount,
      has_customer: !!payload?.customer,
      has_card_id: !!payload?.card_id,
      has_split: !!payload?.split,
      split: payload?.split,
    });
  } catch {}

  // Attempt subscription creation with optional split; on specific 404 recipient errors we can fallback (dev safety)
  let subscription: any;
  try {
    subscription = await pagarmeCreateSubscription(payload);
  } catch (e: any) {
    const msg = e?.message || '';
    const status = e?.status || e?.response?.status || null;
    const allowFallback = String(process.env.PAGARME_SPLIT_FALLBACK_ON_RECIPIENT_ERROR || '').toLowerCase() === 'true';
    const isRecipientError = status === 404 || /recipient not found/i.test(String(e?.response?.message || msg));
    try { console.warn('[subscribe] create_subscription failed', { status, message: msg, allowFallback, isRecipientError, hadSplit: !!payload?.split }); } catch {}
    if (allowFallback && isRecipientError && payload?.split) {
      // Remove split and retry once
      const retryPayload = { ...payload } as any;
      delete retryPayload.split;
      try { console.log('[subscribe] retrying without split due to recipient error'); } catch {}
      subscription = await pagarmeCreateSubscription(retryPayload);
    } else {
      throw e;
    }
  }
  const subscriptionId = subscription?.id || subscription?.subscription?.id || null;

  // Persist minimal records for visibility (customer_subscriptions and payment_transactions)
  const DISABLE_PERSIST = String(process.env.SUBSCRIBE_DISABLE_DB_PERSIST || '').toLowerCase() === 'true';
  try {
    if (!DISABLE_PERSIST && subscriptionId && clinic?.id) {
      const subStatus = String(subscription?.status || (subscription as any)?.subscription?.status || 'active');
      let startAt: string | null = (subscription?.start_at || subscription?.startAt || null) as any;
      let curStart: string | null = (subscription?.current_period_start || subscription?.current_period?.start_at || null) as any;
      let curEnd: string | null = (subscription?.current_period_end || subscription?.current_period?.end_at || null) as any;
      
      // Derive interval from Offer or fallback to 'month'
      const intervalUnit = (offer?.intervalUnit ? String(offer.intervalUnit).toLowerCase() : (params.interval ? String(params.interval).toLowerCase() : 'month'));
      const intervalCount = Number(offer?.intervalCount || 1) || 1;
      
      // Calculate period dates when provider omits them
      try {
        if (!startAt) startAt = new Date().toISOString();
        if (!curStart || !curEnd) {
          const base = curStart ? new Date(curStart) : (startAt ? new Date(startAt) : new Date());
          const unitUpper = intervalUnit.toUpperCase();
          const startIso = base.toISOString();
          const end = new Date(base);
          if (unitUpper === 'DAY') end.setDate(end.getDate() + intervalCount);
          else if (unitUpper === 'WEEK') end.setDate(end.getDate() + 7 * intervalCount);
          else if (unitUpper === 'MONTH') end.setMonth(end.getMonth() + intervalCount);
          else if (unitUpper === 'YEAR') end.setFullYear(end.getFullYear() + intervalCount);
          const endIso = end.toISOString();
          if (!curStart) curStart = startIso as any;
          if (!curEnd) curEnd = endIso as any;
        }
      } catch {}
      
      const meta = { 
        buyerName: params.customer?.name || null, 
        buyerEmail: params.customer?.email || null, 
        clinicId: clinic?.id || null, 
        productId: String(product?.id || ''), 
        offerId: String(offer?.id || ''),
        interval: intervalUnit,
        intervalCount: intervalCount
      } as any;
      const merchantRow = await prisma.merchant.findFirst({ where: { clinicId: String(clinic.id) }, select: { id: true } });
      const merchantId = merchantRow?.id || null;
      
      // Resolve or create internal Customer by merchantId + email
      let internalCustomerId: string | null = null;
      try {
        let cust: any = null;
        const customerEmail = String(params.customer?.email || '');
        if (merchantId && customerEmail) {
          try {
            cust = await prisma.customer.findFirst({
              where: { merchantId: merchantId, email: customerEmail },
              select: { id: true }
            });
          } catch {}
          if (cust) {
            // Update existing customer
            try {
              await prisma.customer.update({
                where: { id: cust.id },
                data: {
                  name: params.customer?.name || undefined,
                  phone: params.customer?.phone || undefined,
                  metadata: { clinicId: clinic?.id, productId: product?.id, offerId: offer?.id } as any,
                }
              });
            } catch {}
          } else {
            // Create new customer
            try {
              const colRows: any[] = await prisma.$queryRawUnsafe(
                "SELECT column_name FROM information_schema.columns WHERE table_name = 'customers' AND column_name IN ('merchantId','merchant_id')"
              );
              const colNames = Array.isArray(colRows) ? colRows.map((r: any) => r.column_name) : [];
              const hasCamel = colNames.includes('merchantId');
              const hasSnake = colNames.includes('merchant_id');
              if (hasCamel) {
                cust = await prisma.customer.create({ data: { merchantId: merchantId, name: params.customer?.name, email: customerEmail, phone: params.customer?.phone || null, metadata: { clinicId: clinic?.id, productId: product?.id, offerId: offer?.id } as any } });
              } else if (hasSnake) {
                const id = crypto.randomUUID();
                await prisma.$executeRawUnsafe(
                  `INSERT INTO "customers" ("id", "merchant_id", "name", "email", "phone") VALUES ($1, $2, $3, $4, $5)`,
                  id, merchantId, params.customer?.name, customerEmail, params.customer?.phone || null
                );
                cust = { id };
              } else {
                const id = crypto.randomUUID();
                await prisma.$executeRawUnsafe(
                  `INSERT INTO "customers" ("id", "name", "email", "phone") VALUES ($1, $2, $3, $4)`,
                  id, params.customer?.name, customerEmail, params.customer?.phone || null
                );
                cust = { id };
              }
            } catch {}
          }
        }
        internalCustomerId = cust?.id || null;
      } catch {}
      
      if (merchantId) {
        // Upsert into customer_subscriptions
        const exists: any[] = await prisma.$queryRawUnsafe('SELECT id FROM "customer_subscriptions" WHERE provider_subscription_id = $1 LIMIT 1', String(subscriptionId));
        if (!exists || exists.length === 0) {
          const newId = crypto.randomUUID();
          try {
            // Only INSERT when we have all required fields (merchant_id, customer_id, provider_subscription_id)
            if (merchantId && internalCustomerId && subscriptionId) {
              await prisma.$executeRawUnsafe(
                'INSERT INTO "customer_subscriptions" ("id","merchant_id","customer_id","product_id","offer_id","provider","provider_subscription_id","status","start_at","current_period_start","current_period_end","price_cents","currency","metadata") VALUES ($1,$2,$3,$4,$5,$6::"PaymentProvider",$7,$8::"SubscriptionStatus",$9::timestamp,$10::timestamp,$11::timestamp,$12,$13::"Currency",$14::jsonb)',
                newId,
                String(merchantId),
                String(internalCustomerId),
                String(product?.id || ''),
                String(offer?.id || ''),
                'KRXPAY',
                String(subscriptionId),
                mapStatus(subStatus),
                startAt,
                curStart,
                curEnd,
                unitAmount,
                String(currency),
                JSON.stringify(meta),
              );
            } else {
              // Missing required fields; log and skip INSERT
              try { console.warn('[subscribe][persist] skip customer_subscriptions insert - missing required fields', { hasMerchant: !!merchantId, hasCustomer: !!internalCustomerId, hasSubscription: !!subscriptionId }); } catch {}
            }
          } catch (persistErr: any) {
            try { console.warn('[subscribe][persist] skip customer_subscriptions insert', { message: persistErr?.message }); } catch {}
          }
        } else {
          try {
            await prisma.$executeRawUnsafe(
              `UPDATE customer_subscriptions SET status = $2::"SubscriptionStatus", current_period_start = $3::timestamp, current_period_end = $4::timestamp, updated_at = NOW(), metadata = COALESCE(metadata, '{}'::jsonb) || $5::jsonb WHERE provider_subscription_id = $1`,
              String(subscriptionId), mapStatus(subStatus), curStart, curEnd, JSON.stringify(meta)
            );
          } catch (persistErr: any) {
            try { console.warn('[subscribe][persist] skip customer_subscriptions update', { message: persistErr?.message }); } catch {}
          }
        }
      }
      
      // Create customer_providers link (for Providers tab)
      if (merchantId && internalCustomerId) {
        try {
          const providerCustomerId = subscription?.customer?.id || (subscription as any)?.customer_id || null;
          if (providerCustomerId) {
            const provId = crypto.randomUUID();
            await prisma.$executeRawUnsafe(
              `INSERT INTO customer_providers (id, customer_id, provider, account_id, provider_customer_id, created_at, updated_at)
               VALUES ($1, $2, 'PAGARME'::"PaymentProvider", $3, $4, NOW(), NOW())
               ON CONFLICT (customer_id, provider, account_id) DO UPDATE
               SET provider_customer_id = EXCLUDED.provider_customer_id, updated_at = NOW()`,
              provId,
              String(internalCustomerId),
              String(merchant?.id || ''),
              String(providerCustomerId)
            );
            try { console.log('[subscribe][persist] created/updated customer_providers', { customerId: internalCustomerId, provider: 'PAGARME', providerCustomerId }); } catch {}
          }
        } catch (e: any) {
          try { console.warn('[subscribe][persist] skip customer_providers', { message: e?.message }); } catch {}
        }
      }
      
      // Create customer_payment_methods (for Payment Methods tab)
      if (merchantId && internalCustomerId && params.paymentMethod) {
        try {
          const pm = params.paymentMethod;
          const cardData = subscription?.card || (subscription as any)?.payment_method?.card || pm.card || null;
          if (cardData) {
            const pmId = crypto.randomUUID();
            await prisma.$executeRawUnsafe(
              `INSERT INTO customer_payment_methods (id, customer_id, provider, account_id, provider_payment_method_id, brand, last4, exp_month, exp_year, status, is_default, created_at, updated_at)
               VALUES ($1, $2, 'PAGARME'::"PaymentProvider", $3, $4, $5, $6, $7, $8, 'ACTIVE', true, NOW(), NOW())
               ON CONFLICT (provider, account_id, provider_payment_method_id) DO UPDATE
               SET customer_id = EXCLUDED.customer_id, status = 'ACTIVE', updated_at = NOW()`,
              pmId,
              String(internalCustomerId),
              String(merchant?.id || ''),
              String(cardData.id || pm.card_id || pm.saved_card_id || ''),
              (String(cardData.brand || '').toUpperCase() || 'UNKNOWN'),
              String(cardData.last_four_digits || cardData.last4 || ''),
              (Number(cardData.exp_month || 0) || null),
              (Number(cardData.exp_year || 0) || null)
            );
            try { console.log('[subscribe][persist] created/updated customer_payment_methods', { customerId: internalCustomerId, brand: cardData.brand, last4: cardData.last_four_digits }); } catch {}
          }
        } catch (e: any) {
          try { console.warn('[subscribe][persist] skip customer_payment_methods', { message: e?.message }); } catch {}
        }
      }
      
      // Optionally insert a payment_transactions row (best-effort)
      try {
        const existsRows: any[] = await prisma.$queryRawUnsafe('SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = ' + "'public'" + ' AND table_name = ' + "'payment_transactions'" + ') AS exists');
        const tableExists = Array.isArray(existsRows) && !!(existsRows[0]?.exists || existsRows[0]?.exists === true);
        if (tableExists) {
          const txId = crypto.randomUUID();
          // Resolve doctorId for better visibility
          let doctorId: string | null = clinic?.ownerId ? String(clinic.ownerId) : null;
          let patientProfileId: string | null = null;
          // Try to get patient profile
          if (doctorId && params.customer?.email) {
            try {
              const u = await prisma.user.findUnique({ where: { email: String(params.customer.email) }, select: { id: true } });
              if (u?.id) {
                const prof = await prisma.patientProfile.findUnique({ 
                  where: { doctorId_userId: { doctorId: String(doctorId), userId: String(u.id) } }, 
                  select: { id: true } 
                } as any);
                patientProfileId = prof?.id || null;
              }
            } catch {}
          }
          // Compute split amounts for initial row
          const clinicSplitPercent = Math.max(0, Math.min(100, Number(merchant?.splitPercent || 85)));
          const platformFeeBps = Number(merchant?.platformFeeBps || 0);
          const transactionFeeCents = Number(merchant?.transactionFeeCents || 0);
          const clinicShare = Math.round(unitAmount * (clinicSplitPercent / 100));
          const feePercent = Math.round(unitAmount * (platformFeeBps / 10000));
          const feeFlat = transactionFeeCents;
          const platformFeeTotal = Math.max(0, feePercent + feeFlat);
          const clinicAmountCents = Math.max(0, clinicShare - platformFeeTotal);
          const platformAmountCents = Math.max(0, unitAmount - clinicAmountCents);
          try {
            await prisma.$executeRawUnsafe(
              'INSERT INTO payment_transactions (id, provider, provider_order_id, provider_charge_id, customer_id, doctor_id, patient_profile_id, clinic_id, product_id, amount_cents, clinic_amount_cents, platform_amount_cents, platform_fee_cents, currency, installments, payment_method_type, status, raw_payload, routed_provider, client_name, client_email) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::"Currency",$15,$16,$17,$18::jsonb,$19,$20,$21) ON CONFLICT (provider, provider_order_id) DO NOTHING',
              txId, 'pagarme', String(subscriptionId), null, internalCustomerId, doctorId, patientProfileId, clinic?.id ? String(clinic.id) : null, String(product?.id || ''), unitAmount, clinicAmountCents, platformAmountCents, platformFeeTotal, String(currency), 1, 'credit_card', 'processing', JSON.stringify({ clinicId: clinic?.id, offerId: String(offer?.id || ''), productId: String(product?.id || ''), subscriptionId }), 'KRXPAY', params.customer?.name || null, params.customer?.email || null
            );
            try { console.log('[subscribe][persist] created payment_transactions row', { subscriptionId, status: 'processing', clinicId: clinic?.id }); } catch {}
          } catch (persistErr: any) {
            try { console.warn('[subscribe][persist] skip payment_transactions insert', { message: persistErr?.message }); } catch {}
          }
        }
      } catch {}
    }
  } catch {}

  // Build normalized return
  const createdAt = subscription?.created_at || subscription?.createdAt || new Date().toISOString();
  const currentPeriodStart = subscription?.current_period_start || subscription?.current_period?.start_at || null;
  const currentPeriodEnd = subscription?.current_period_end || subscription?.current_period?.end_at || null;
  return {
    id: String(subscriptionId),
    subscriptionId: String(subscriptionId),
    chargeId: subscription?.latest_charge?.id || (Array.isArray(subscription?.charges) ? subscription.charges?.[0]?.id : undefined) || undefined,
    status: String(subscription?.status || 'active'),
    customerId: String(params.customerId || ''),
    amount: unitAmount,
    currency: String(currency),
    createdAt,
    currentPeriodStart,
    currentPeriodEnd,
    metadata,
    raw: subscription,
  };
}

function mapStatus(s?: string) {
  const v = String(s || '').toLowerCase();
  if (v === 'active') return 'ACTIVE';
  if (v === 'trial' || v === 'trialing') return 'TRIAL';
  if (v === 'past_due' || v === 'incomplete' || v === 'incomplete_expired') return 'PAST_DUE';
  if (v === 'canceled' || v === 'cancelled') return 'CANCELED';
  return 'ACTIVE';
}
