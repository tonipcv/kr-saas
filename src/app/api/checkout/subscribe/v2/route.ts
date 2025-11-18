import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PaymentMethod, PaymentProvider, SubscriptionStatus } from '@prisma/client';

// Minimal helpers
function onlyDigits(s: string) { return (s || '').replace(/\D/g, ''); }

// Input shape reference
// {
//   productId: string,
//   offerId?: string,
//   slug?: string,
//   country?: string,
//   currency?: string,
//   buyer: { email: string, name?: string, phone?: string, document?: string, address?: any },
//   payment?: { savedPaymentMethodId?: string, providerPaymentMethodId?: string, method?: 'card' },
//   saveMethod?: boolean,
//   riskSignals?: Record<string, any>
// }

export async function POST(req: Request) {
  try {
    // Temporarily disabled until provider factory is implemented
    return NextResponse.json({ error: 'subscribe v2 disabled' }, { status: 404 });

    const body = await req.json();
    const { productId, offerId, slug, country, currency, buyer, payment, saveMethod } = body || {};

    if (!productId) return NextResponse.json({ error: 'productId is required' }, { status: 400 });
    if (!buyer?.email) return NextResponse.json({ error: 'buyer.email is required' }, { status: 400 });

    // Load product, offer
    const product = await prisma.products.findUnique({ where: { id: String(productId) } });
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    if ((product as any).type !== 'SUBSCRIPTION') {
      return NextResponse.json({ error: 'Product is not SUBSCRIPTION' }, { status: 400 });
    }

    const offer = offerId ? await prisma.offer.findUnique({ where: { id: String(offerId) } }) : null;

    // Resolve clinic and merchant (same logic as existing route)
    let clinic: any = null;
    if (slug) clinic = await prisma.clinic.findFirst({ where: { slug: String(slug) } });
    if (!clinic && (product as any)?.clinicId) clinic = await prisma.clinic.findUnique({ where: { id: (product as any).clinicId } });
    if (!clinic) return NextResponse.json({ error: 'Clinic not found for product' }, { status: 400 });

    const merchant = await prisma.merchant.findUnique({ where: { clinicId: clinic.id } });
    if (!merchant?.id) return NextResponse.json({ error: 'Merchant not found for clinic' }, { status: 400 });

    // Normalize inputs
    const method = PaymentMethod.CARD; // subscriptions require card
    const resolvedCountry = String(country || (clinic.country || 'BR')).toUpperCase();
    const resolvedCurrency = String(currency || (offer as any)?.currency || 'BRL').toUpperCase();

    // Choose provider with hierarchy: Offer.preferredProvider -> PaymentRoutingRule -> active integration (Stripe>first)
    let chosenProvider: PaymentProvider | null = null;
    let accountId: string | null = null;

    if ((offer as any)?.preferredProvider) {
      chosenProvider = (offer as any).preferredProvider as PaymentProvider;
    } else {
      const rule = await prisma.paymentRoutingRule.findFirst({
        where: {
          merchantId: merchant.id,
          isActive: true,
          country: resolvedCountry,
          method,
          OR: [
            { offerId: offer ? String((offer as any).id) : undefined },
            { productId: String(productId) },
            { offerId: null, productId: null },
          ],
        },
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      });
      if (rule) chosenProvider = rule.provider as PaymentProvider;
    }

    // Fallback to merchant integrations
    if (!chosenProvider) {
      const integrations = await prisma.merchantIntegration.findMany({ where: { merchantId: merchant.id, isActive: true } });
      const stripe = integrations.find((i) => i.provider === 'STRIPE');
      const selectedInt = stripe || integrations[0] || null;
      if (!selectedInt) return NextResponse.json({ error: 'No active provider integration for merchant' }, { status: 400 });
      chosenProvider = selectedInt.provider as PaymentProvider;
      accountId = (selectedInt.credentials as any)?.accountId || null;
    } else {
      // If provider chosen by rule/offer, fetch its integration to get accountId
      const integ = await prisma.merchantIntegration.findUnique({ where: { merchantId_provider: { merchantId: merchant.id, provider: chosenProvider } } });
      accountId = integ ? ((integ.credentials as any)?.accountId || null) : null;
    }

    const client = await getProviderClient(merchant.id, chosenProvider);

    // Upsert Customer (by merchant + email OR document)
    const doc = onlyDigits(String(buyer?.document || '')) || null;
    const existing = await prisma.customer.findFirst({
      where: { merchantId: merchant.id, OR: [{ email: String(buyer.email) }, ...(doc ? [{ document: doc }] : [])] },
    });
    const customer = existing
      ? await prisma.customer.update({
          where: { id: existing.id },
          data: { name: buyer?.name || existing.name, phone: buyer?.phone || existing.phone, document: doc || existing.document },
        })
      : await prisma.customer.create({
          data: {
            merchantId: merchant.id,
            name: String(buyer?.name || ''),
            email: String(buyer.email),
            phone: String(buyer?.phone || ''),
            document: doc,
            address: (buyer as any)?.address || undefined,
          },
        });

    // Ensure CustomerProvider (provider customer)
    // Try to find existing CustomerProvider
    let customerProvider = await prisma.customerProvider.findFirst({
      where: { customerId: customer.id, provider: chosenProvider, accountId: accountId || undefined },
    });

    if (!customerProvider) {
      // Create provider customer
      const provCustomer = await client.createCustomer({ email: String(buyer.email), name: buyer?.name, phone: buyer?.phone || undefined, metadata: { merchantId: merchant.id } });
      customerProvider = await prisma.customerProvider.create({
        data: {
          customerId: customer.id,
          provider: chosenProvider,
          accountId: accountId || undefined,
          providerCustomerId: provCustomer.id,
        },
      });
    }

    // Payment method handling (if provided)
    let customerPaymentMethodId: string | null = null;
    if (payment?.savedPaymentMethodId) {
      // Existing vault row
      customerPaymentMethodId = String(payment.savedPaymentMethodId);
    } else if (payment?.providerPaymentMethodId && saveMethod) {
      // Save minimal vault record pointing to a provider-side payment method
      const pm = await prisma.customerPaymentMethod.create({
        data: {
          customerId: customer.id,
          customerProviderId: customerProvider.id,
          provider: chosenProvider,
          accountId: accountId || undefined,
          providerPaymentMethodId: String(payment.providerPaymentMethodId),
          isDefault: true,
          status: 'active',
        },
      });
      customerPaymentMethodId = pm.id;
    }

    // Resolve OfferPrice for the chosen provider/country/currency
    let priceId: string | undefined = undefined;
    let amountMajor: number | undefined = undefined;
    const priceRow = await prisma.offerPrice.findFirst({
      where: {
        offerId: offer ? String((offer as any).id) : undefined,
        country: resolvedCountry,
        currency: resolvedCurrency as any,
        provider: chosenProvider,
        active: true,
      },
    });
    if (priceRow?.externalPriceId) {
      priceId = String(priceRow.externalPriceId);
    } else {
      // fallback to offer priceCents when external price is not registered
      const cents = priceRow?.amountCents ?? (offer ? (offer as any).priceCents : Math.round(Number((product as any).price || 0) * 100));
      amountMajor = (Number(cents || 0) / 100) || undefined;
    }

    // Create subscription at provider (native)
    const trialDays = offer && (offer as any).trialDays ? Number((offer as any).trialDays) : undefined;
    const provSub = await client.createSubscription({
      customerId: customerProvider.providerCustomerId,
      priceId,
      amount: amountMajor,
      currency: resolvedCurrency,
      interval: ((offer as any)?.intervalUnit || 'month').toString().toLowerCase() as any,
      intervalCount: Number((offer as any)?.intervalCount || 1),
      trialDays,
      paymentMethodId: payment?.providerPaymentMethodId,
      metadata: { merchantId: merchant.id, productId: String(productId), offerId: offer ? String((offer as any).id) : '' },
    });

    // Persist CustomerSubscription
    const now = new Date();
    const sub = await prisma.customerSubscription.create({
      data: {
        customerId: customer.id,
        merchantId: merchant.id,
        productId: String(productId),
        offerId: offer ? String((offer as any).id) : undefined,
        provider: chosenProvider,
        accountId: accountId || undefined,
        isNative: true,
        customerProviderId: customerProvider.id,
        providerSubscriptionId: provSub.id,
        status: (trialDays && trialDays > 0) ? SubscriptionStatus.TRIAL : SubscriptionStatus.ACTIVE,
        startAt: now,
        trialEndsAt: trialDays ? new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000) : null,
        currentPeriodStart: now,
        // currentPeriodEnd: provider webhook will update precisely
        priceCents: priceRow?.amountCents ?? (offer ? Number((offer as any).priceCents || 0) : Math.round(Number((product as any).price || 0) * 100)),
        currency: resolvedCurrency as any,
        metadata: { country: country || null },
      },
    });

    // Optionally create an initial PaymentTransaction if there is immediate charge
    // Leave to webhooks for exact amounts; do not risk double-charging.

    return NextResponse.json({ success: true, subscriptionId: sub.id, providerSubscriptionId: provSub.id, provider: chosenProvider });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'subscribe v2 failed' }, { status: 500 });
  }
}
