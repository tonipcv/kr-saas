import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ClinicRole } from '@prisma/client';
import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const stripe = new Stripe(STRIPE_SECRET_KEY);
const isTestKey = STRIPE_SECRET_KEY.startsWith('sk_test_');

async function buildCheckoutUrl(args: {
  req: NextRequest,
  sessionUserId: string,
  planId: string,
  priceIdFromClient?: string,
  clinicIdFromClient?: string,
  newClinic?: boolean | string,
  trial?: boolean | string,
  clinicName?: string,
  subdomain?: string,
}): Promise<string> {
  const { req, sessionUserId, planId, priceIdFromClient, clinicIdFromClient, newClinic, trial, clinicName, subdomain } = args;
  // Load plan to validate and to map priceId when not provided
  const plan = await prisma.clinicPlan.findUnique({ where: { id: planId } });
  if (!plan) {
    throw new Error('Plan not found');
  }
  if (plan.name === 'Enterprise') {
    throw new Error('Enterprise plan requires sales contact');
  }

  // Determine clinicId strategy
  let clinicId = clinicIdFromClient as string | undefined;
  if (newClinic === true || newClinic === '1' || (typeof newClinic === 'string' && newClinic.toLowerCase() === 'true')) {
    let finalClinicName = (typeof clinicName === 'string' && clinicName.trim()) ? clinicName.trim() : undefined;
    if (!finalClinicName) {
      const count = await prisma.clinic.count({ where: { ownerId: sessionUserId } });
      finalClinicName = count > 0 ? `Nova Clínica ${count + 1}` : 'Nova Clínica';
    }
    let finalSubdomain: string | null = null;
    if (typeof subdomain === 'string' && subdomain.trim()) {
      const rawSub = subdomain.trim().toLowerCase();
      const valid = /^[a-z0-9-]{3,63}$/.test(rawSub) && !rawSub.startsWith('-') && !rawSub.endsWith('-');
      if (valid) {
        const conflict = await prisma.clinic.findFirst({
          where: { OR: [{ subdomain: rawSub }, { slug: rawSub }] },
          select: { id: true },
        });
        if (!conflict) {
          finalSubdomain = rawSub;
        }
      }
    }

    const created = await prisma.clinic.create({
      data: {
        name: finalClinicName,
        ownerId: sessionUserId,
        isActive: true,
        subdomain: finalSubdomain,
      },
      select: { id: true }
    });
    clinicId = created.id;
    try {
      await prisma.clinicMember.create({
        data: { clinicId, userId: sessionUserId, role: ClinicRole.OWNER, isActive: true }
      });
    } catch {}
  }
  if (!clinicId) {
    const membership = await prisma.clinicMember.findFirst({
      where: { userId: sessionUserId, isActive: true },
      select: { clinicId: true }
    });
    if (membership?.clinicId) clinicId = membership.clinicId;
    else {
      const owned = await prisma.clinic.findFirst({ where: { ownerId: sessionUserId }, select: { id: true } });
      if (owned?.id) clinicId = owned.id;
    }
  }
  if (!clinicId) throw new Error('Clinic not found for current user');

  // Resolve Stripe price ID
  const normalizedName = (plan.name || '').trim().toLowerCase();
  const normalizedTier = (plan as any).tier ? String((plan as any).tier).trim().toLowerCase() : undefined;
  const priceEnvByKey: Record<string, string | undefined> = {
    starter: isTestKey ? (process.env.STRIPE_TEST_PRICE_STARTER || process.env.STRIPE_PRICE_STARTER) : (process.env.STRIPE_LIVE_PRICE_STARTER || process.env.STRIPE_PRICE_STARTER),
    growth: isTestKey ? (process.env.STRIPE_TEST_PRICE_GROWTH || process.env.STRIPE_PRICE_GROWTH) : (process.env.STRIPE_LIVE_PRICE_GROWTH || process.env.STRIPE_PRICE_GROWTH),
    enterprise: isTestKey ? (process.env.STRIPE_TEST_PRICE_ENTERPRISE || process.env.STRIPE_PRICE_ENTERPRISE) : (process.env.STRIPE_LIVE_PRICE_ENTERPRISE || process.env.STRIPE_PRICE_ENTERPRISE),
    creator: isTestKey ? (process.env.STRIPE_TEST_PRICE_CREATOR || process.env.STRIPE_PRICE_CREATOR) : (process.env.STRIPE_LIVE_PRICE_CREATOR || process.env.STRIPE_PRICE_CREATOR),
    basic: isTestKey ? (process.env.STRIPE_TEST_PRICE_STARTER || process.env.STRIPE_PRICE_STARTER) : (process.env.STRIPE_LIVE_PRICE_STARTER || process.env.STRIPE_PRICE_STARTER),
    pro: isTestKey ? (process.env.STRIPE_TEST_PRICE_GROWTH || process.env.STRIPE_PRICE_GROWTH) : (process.env.STRIPE_LIVE_PRICE_GROWTH || process.env.STRIPE_PRICE_GROWTH),
  };
  const fallbackPriceId = (normalizedTier && priceEnvByKey[normalizedTier]) || priceEnvByKey[normalizedName];
  const priceId = (priceIdFromClient as string | undefined) || fallbackPriceId;
  if (!priceId) {
    throw new Error('Stripe price not configured for this plan in current mode (test/live)');
  }

  // Get or create Stripe customer tied to clinic
  let stripeCustomerId: string | null = null;
  const latestSub = await prisma.clinicSubscription.findFirst({
    where: { clinicId },
    orderBy: { createdAt: 'desc' },
    select: { stripeCustomerId: true }
  });
  stripeCustomerId = latestSub?.stripeCustomerId || null;
  if (!stripeCustomerId) {
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { id: true, name: true, owner: { select: { email: true, name: true, id: true } } }
    });
    const customer = await stripe.customers.create({
      name: clinic?.name || undefined,
      email: clinic?.owner?.email || undefined,
      metadata: { clinicId, ownerId: clinic?.owner?.id || '' },
    });
    stripeCustomerId = customer.id;
  }

  const appBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, '');
  const successUrl = `${appBaseUrl}/clinic/subscription/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${appBaseUrl}/clinic/subscription?canceled=1${newClinic ? `&new=1` : ''}`;

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: stripeCustomerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: clinicId,
    subscription_data: (trial === true || (typeof trial === 'string' && trial.toLowerCase() === 'true')) ? { trial_period_days: 14 } : undefined,
    metadata: {
      clinicId,
      planId,
      planName: plan.name,
      newClinic: (newClinic === true || (typeof newClinic === 'string' && newClinic.toLowerCase() === 'true')) ? 'true' : 'false',
      trial: (trial === true || (typeof trial === 'string' && trial.toLowerCase() === 'true')) ? 'true' : 'false',
    },
  });

  if (!checkoutSession.url) throw new Error('Stripe did not return a checkout URL');
  return checkoutSession.url;
}

export async function POST(req: NextRequest) {
  try {
    console.log('[CHECKOUT API] Request received');
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      console.log('[CHECKOUT API] Unauthorized - no session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log('[CHECKOUT API] User authenticated:', session.user.id);

    const body = await req.json();
    console.log('[CHECKOUT API] Request body:', body);
    const { planId, priceId: priceIdFromClient, clinicId: clinicIdFromClient, newClinic, trial, clinicName, subdomain } = body || {};
    if (!planId) {
      console.log('[CHECKOUT API] Missing planId');
      return NextResponse.json({ error: 'planId is required' }, { status: 400 });
    }
    const url = await buildCheckoutUrl({
      req,
      sessionUserId: session.user.id,
      planId,
      priceIdFromClient,
      clinicIdFromClient,
      newClinic,
      trial,
      clinicName,
      subdomain,
    });
    console.log('[CHECKOUT API] Stripe session URL (POST):', url);
    return NextResponse.json({ url });
  } catch (error: any) {
    console.error('[CHECKOUT API] Error creating checkout session:', error);
    return NextResponse.json({ error: 'Failed to create checkout session', details: error?.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    console.log('[CHECKOUT API][GET] Request received');
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      console.log('[CHECKOUT API][GET] Unauthorized - no session');
      return NextResponse.redirect(new URL('/auth/signin', req.nextUrl), 302);
    }
    const url = new URL(req.url);
    const planId = url.searchParams.get('planId') || undefined;
    if (!planId) return NextResponse.json({ error: 'planId is required' }, { status: 400 });
    const priceIdFromClient = url.searchParams.get('priceId') || undefined;
    const clinicIdFromClient = url.searchParams.get('clinicId') || undefined;
    const newClinic = url.searchParams.get('newClinic') || undefined;
    const trial = url.searchParams.get('trial') || undefined;
    const clinicName = url.searchParams.get('clinicName') || undefined;
    const subdomain = url.searchParams.get('subdomain') || undefined;

    const checkoutUrl = await buildCheckoutUrl({
      req,
      sessionUserId: session.user.id,
      planId,
      priceIdFromClient,
      clinicIdFromClient,
      newClinic,
      trial,
      clinicName,
      subdomain,
    });
    console.log('[CHECKOUT API][GET] Redirecting to Stripe URL:', checkoutUrl);
    return NextResponse.redirect(checkoutUrl, 303);
  } catch (error: any) {
    console.error('[CHECKOUT API][GET] Error:', error);
    return NextResponse.json({ error: 'Failed to create checkout session', details: error?.message }, { status: 500 });
  }
}
