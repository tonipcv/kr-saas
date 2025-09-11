import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ClinicRole } from '@prisma/client';
import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const stripe = new Stripe(STRIPE_SECRET_KEY);
const isTestKey = STRIPE_SECRET_KEY.startsWith('sk_test_');

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { planId, priceId: priceIdFromClient, clinicId: clinicIdFromClient, newClinic, trial, clinicName, subdomain } = body || {};
    if (!planId) {
      return NextResponse.json({ error: 'planId is required' }, { status: 400 });
    }

    // Load plan to validate and to map priceId when not provided
    const plan = await prisma.clinicPlan.findUnique({ where: { id: planId } });
    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    if (plan.name === 'Enterprise') {
      return NextResponse.json({ error: 'Enterprise plan requires sales contact' }, { status: 400 });
    }

    // Determine clinicId strategy
    // If this is for a brand new clinic, create a minimal clinic shell first
    let clinicId = clinicIdFromClient as string | undefined;
    if (newClinic === true || newClinic === '1' || (typeof newClinic === 'string' && newClinic.toLowerCase() === 'true')) {
      // Determine name: prefer provided clinicName; else generate unique default
      let finalClinicName = (typeof clinicName === 'string' && clinicName.trim()) ? clinicName.trim() : undefined;
      if (!finalClinicName) {
        const count = await prisma.clinic.count({ where: { ownerId: session.user.id } });
        finalClinicName = count > 0 ? `Nova Clínica ${count + 1}` : 'Nova Clínica';
      }
      // Handle optional subdomain: validate simple pattern and uniqueness
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
          ownerId: session.user.id,
          isActive: true,
          subdomain: finalSubdomain,
        },
        select: { id: true }
      });
      clinicId = created.id;
      // Ensure owner membership exists for compatibility with parts of the app that rely on clinic_members
      try {
        await prisma.clinicMember.create({
          data: {
            clinicId: clinicId,
            userId: session.user.id,
            role: ClinicRole.OWNER,
            isActive: true
          }
        });
      } catch {
        // ignore if membership already exists or table differs in legacy schema
      }
    }
    
    // If not creating a new clinic and no clinicId provided, fallback to user's current clinic
    if (!clinicId) {
      const membership = await prisma.clinicMember.findFirst({
        where: { userId: session.user.id, isActive: true },
        select: { clinicId: true, role: true }
      });
      if (membership?.clinicId) clinicId = membership.clinicId;
      else {
        // Try as owner
        const owned = await prisma.clinic.findFirst({
          where: { ownerId: session.user.id },
          select: { id: true }
        });
        if (owned?.id) clinicId = owned.id;
      }
    }

    if (!clinicId) {
      return NextResponse.json({ error: 'Clinic not found for current user' }, { status: 400 });
    }

    // Figure out Stripe price ID
    // Resolve by plan.tier first (authoritative), then by name (case-insensitive) and aliases
    const normalizedName = (plan.name || '').trim().toLowerCase();
    const normalizedTier = (plan as any).tier ? String((plan as any).tier).trim().toLowerCase() : undefined;

    // Prefer explicit test/live envs based on secret mode, with fallbacks
    const priceEnvByKey: Record<string, string | undefined> = {
      // by tier
      starter: isTestKey ? (process.env.STRIPE_TEST_PRICE_STARTER || process.env.STRIPE_PRICE_STARTER) : (process.env.STRIPE_LIVE_PRICE_STARTER || process.env.STRIPE_PRICE_STARTER),
      growth: isTestKey ? (process.env.STRIPE_TEST_PRICE_GROWTH || process.env.STRIPE_PRICE_GROWTH) : (process.env.STRIPE_LIVE_PRICE_GROWTH || process.env.STRIPE_PRICE_GROWTH),
      enterprise: isTestKey ? (process.env.STRIPE_TEST_PRICE_ENTERPRISE || process.env.STRIPE_PRICE_ENTERPRISE) : (process.env.STRIPE_LIVE_PRICE_ENTERPRISE || process.env.STRIPE_PRICE_ENTERPRISE),
      // by common names/aliases
      creator: isTestKey ? (process.env.STRIPE_TEST_PRICE_CREATOR || process.env.STRIPE_PRICE_CREATOR) : (process.env.STRIPE_LIVE_PRICE_CREATOR || process.env.STRIPE_PRICE_CREATOR),
      basic: isTestKey ? (process.env.STRIPE_TEST_PRICE_STARTER || process.env.STRIPE_PRICE_STARTER) : (process.env.STRIPE_LIVE_PRICE_STARTER || process.env.STRIPE_PRICE_STARTER),
      pro: isTestKey ? (process.env.STRIPE_TEST_PRICE_GROWTH || process.env.STRIPE_PRICE_GROWTH) : (process.env.STRIPE_LIVE_PRICE_GROWTH || process.env.STRIPE_PRICE_GROWTH),
    };

    const fallbackPriceId =
      (normalizedTier && priceEnvByKey[normalizedTier]) ||
      priceEnvByKey[normalizedName];
    const priceId = (priceIdFromClient as string | undefined) || fallbackPriceId;

    if (!priceId) {
      const diag = {
        mode: isTestKey ? 'test' : 'live',
        plan: { id: plan.id, name: plan.name, tier: (plan as any).tier },
        normalizedTier,
        normalizedName,
        expectedEnv: isTestKey
          ? ['STRIPE_TEST_PRICE_STARTER', 'STRIPE_TEST_PRICE_GROWTH', 'STRIPE_TEST_PRICE_CREATOR', 'STRIPE_TEST_PRICE_ENTERPRISE']
          : ['STRIPE_LIVE_PRICE_STARTER', 'STRIPE_LIVE_PRICE_GROWTH', 'STRIPE_LIVE_PRICE_CREATOR', 'STRIPE_LIVE_PRICE_ENTERPRISE'],
      };
      console.warn('Stripe price mapping failed (missing env for current key mode):', diag);
      return NextResponse.json({ error: 'Stripe price not configured for this plan in current mode (test/live)', details: diag }, { status: 400 });
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
      // Load clinic with owner for email/name
      const clinic = await prisma.clinic.findUnique({
        where: { id: clinicId },
        select: { id: true, name: true, owner: { select: { email: true, name: true, id: true } } }
      });

      const customer = await stripe.customers.create({
        name: clinic?.name || undefined,
        email: clinic?.owner?.email || undefined,
        metadata: {
          clinicId,
          ownerId: clinic?.owner?.id || '',
        },
      });
      stripeCustomerId = customer.id;
    }

    // After successful payment, send the user to configure exactly this clinic
    const successUrl = `${process.env.NEXT_PUBLIC_APP_URL}/clinic?setup=1&clinicId=${encodeURIComponent(clinicId)}`;
    const cancelUrl = `${process.env.NEXT_PUBLIC_APP_URL}/clinic/subscription?canceled=1${newClinic ? `&new=1` : ''}`;

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: clinicId,
      subscription_data: trial ? { trial_period_days: 14 } : undefined,
      metadata: {
        clinicId,
        planId,
        planName: plan.name,
        newClinic: newClinic ? 'true' : 'false',
        trial: trial ? 'true' : 'false',
      },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error: any) {
    console.error('Error creating checkout session:', error);
    return NextResponse.json({ error: 'Failed to create checkout session', details: error?.message }, { status: 500 });
  }
}
