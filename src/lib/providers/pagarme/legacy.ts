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
  const product = await prisma.products.findUnique({ where: { id: String(offer.productId) } });
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
  const clinicPercent = Math.max(0, Math.min(100, Number(merchant?.splitPercent || 70)));
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
      const startAt: string | null = (subscription?.start_at || subscription?.startAt || null) as any;
      const curStart: string | null = (subscription?.current_period_start || subscription?.current_period?.start_at || null) as any;
      const curEnd: string | null = (subscription?.current_period_end || subscription?.current_period?.end_at || null) as any;
      const meta = { buyerName: params.customer?.name || null, buyerEmail: params.customer?.email || null, clinicId: clinic?.id || null, productId: String(product?.id || ''), offerId: String(offer?.id || '') } as any;
      const merchantRow = await prisma.merchant.findFirst({ where: { clinicId: String(clinic.id) }, select: { id: true } });
      const merchantId = merchantRow?.id || null;
      if (merchantId) {
        // Upsert into customer_subscriptions
        const exists: any[] = await prisma.$queryRawUnsafe('SELECT id FROM "customer_subscriptions" WHERE provider_subscription_id = $1 LIMIT 1', String(subscriptionId));
        if (!exists || exists.length === 0) {
          const newId = crypto.randomUUID();
          try {
            await prisma.$executeRawUnsafe(
              'INSERT INTO "customer_subscriptions" ("id","merchant_id","product_id","offer_id","provider","provider_subscription_id","status","start_at","current_period_start","current_period_end","price_cents","currency","metadata") VALUES ($1,$2,$3,$4,$5::"PaymentProvider",$6,$7::"SubscriptionStatus",$8::timestamp,$9::timestamp,$10::timestamp,$11,$12::"Currency",$13::jsonb)',
              newId,
              String(merchantId),
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
      // Optionally insert a payment_transactions row (best-effort)
      try {
        const existsRows: any[] = await prisma.$queryRawUnsafe('SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = ' + "'public'" + ' AND table_name = ' + "'payment_transactions'" + ') AS exists');
        const tableExists = Array.isArray(existsRows) && !!(existsRows[0]?.exists || existsRows[0]?.exists === true);
        if (tableExists) {
          const txId = crypto.randomUUID();
          try {
            await prisma.$executeRawUnsafe(
              'INSERT INTO payment_transactions (id, provider, provider_order_id, provider_charge_id, amount_cents, currency, status, metadata) VALUES ($1,$2,$3,$4,$5,$6::"Currency",$7,$8::jsonb)',
              txId, 'pagarme', String(subscriptionId), null, unitAmount, String(currency), 'pending', JSON.stringify({ clinicId: clinic?.id, offerId: String(offer?.id || ''), productId: String(product?.id || '') })
            );
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
