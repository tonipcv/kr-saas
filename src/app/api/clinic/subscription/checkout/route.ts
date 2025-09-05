import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

// Hardcoded Stripe Price IDs (requested): prefer these over envs
const HARD_CODED_PRICE_BY_KEY: Record<string, string | undefined> = {
  // tiers/names normalized to lowercase
  starter: 'price_1RtWO8AuTHuXpGLf9GCItW8I',
  growth: 'price_1S46a0AuTHuXpGLf3d1vnQmR',
};

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { planId, priceId: priceIdFromClient, clinicId: clinicIdFromClient } = body || {};
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

    // Determine clinicId: use provided or first clinic where user is owner/member
    let clinicId = clinicIdFromClient as string | undefined;
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

    const priceEnvByKey: Record<string, string | undefined> = {
      // by tier
      starter: HARD_CODED_PRICE_BY_KEY.starter || process.env.STRIPE_PRICE_STARTER,
      growth: HARD_CODED_PRICE_BY_KEY.growth || process.env.STRIPE_PRICE_GROWTH,
      enterprise: process.env.STRIPE_PRICE_ENTERPRISE,
      // by common names/aliases
      creator: process.env.STRIPE_PRICE_CREATOR,
      basic: HARD_CODED_PRICE_BY_KEY.starter || process.env.STRIPE_PRICE_STARTER,
      pro: HARD_CODED_PRICE_BY_KEY.growth || process.env.STRIPE_PRICE_GROWTH,
    };

    const fallbackPriceId =
      (normalizedTier && priceEnvByKey[normalizedTier]) ||
      priceEnvByKey[normalizedName];
    const priceId = (priceIdFromClient as string | undefined) || fallbackPriceId;

    if (!priceId) {
      const diag = {
        plan: { id: plan.id, name: plan.name, tier: (plan as any).tier },
        normalizedTier,
        normalizedName,
        envPresent: {
          STRIPE_PRICE_STARTER: Boolean(process.env.STRIPE_PRICE_STARTER),
          STRIPE_PRICE_GROWTH: Boolean(process.env.STRIPE_PRICE_GROWTH),
          STRIPE_PRICE_CREATOR: Boolean(process.env.STRIPE_PRICE_CREATOR),
          STRIPE_PRICE_ENTERPRISE: Boolean(process.env.STRIPE_PRICE_ENTERPRISE),
        },
      };
      console.warn('Stripe price mapping failed:', diag);
      return NextResponse.json({ error: 'Stripe price not configured for this plan', details: diag }, { status: 400 });
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

    const successUrl = `${process.env.NEXT_PUBLIC_APP_URL}/clinic/subscription?success=1`;
    const cancelUrl = `${process.env.NEXT_PUBLIC_APP_URL}/clinic/subscription?canceled=1`;

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: clinicId,
      metadata: {
        clinicId,
        planId,
        planName: plan.name,
      },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error: any) {
    console.error('Error creating checkout session:', error);
    return NextResponse.json({ error: 'Failed to create checkout session', details: error?.message }, { status: 500 });
  }
}
