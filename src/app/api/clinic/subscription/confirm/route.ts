import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import Stripe from 'stripe';
import { SubscriptionStatus } from '@prisma/client';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const stripe = new Stripe(STRIPE_SECRET_KEY);

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const sessionId = url.searchParams.get('session_id');
    if (!sessionId) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
    }

    // Retrieve Checkout Session and subscription
    const checkout = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['subscription'] });
    if (!checkout) return NextResponse.json({ error: 'Checkout session not found' }, { status: 404 });

    const clinicId = String(checkout.client_reference_id || '');
    if (!clinicId) return NextResponse.json({ error: 'Missing clinic reference in session' }, { status: 400 });

    // Ensure user has access to this clinic (owner or active member)
    const clinicAccess = await prisma.clinic.findFirst({
      where: {
        id: clinicId,
        isActive: true,
        OR: [
          { ownerId: session.user.id },
          { members: { some: { userId: session.user.id, isActive: true } } },
        ],
      },
      select: { id: true },
    });
    if (!clinicAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const meta = (checkout.metadata || {}) as any;
    const planId = String(meta.planId || '');
    if (!planId) {
      return NextResponse.json({ error: 'PlanId missing in session metadata' }, { status: 400 });
    }

    const plan = await prisma.clinicPlan.findUnique({ where: { id: planId }, select: { id: true, trialDays: true } });
    if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });

    const subObj = checkout.subscription as Stripe.Subscription | null;
    const subAny = subObj as any;

    // Derive status and period dates
    const stripeStatus = String(subAny?.status || '');
    const mapStatus = (s?: string) => {
      const v = String(s || '').toLowerCase();
      if (v === 'active') return SubscriptionStatus.ACTIVE;
      if (v === 'trialing') return SubscriptionStatus.TRIAL;
      if (v === 'past_due' || v === 'unpaid') return SubscriptionStatus.PAST_DUE;
      if (v === 'incomplete' || v === 'incomplete_expired') return SubscriptionStatus.PENDING;
      if (v === 'canceled') return SubscriptionStatus.CANCELED;
      return SubscriptionStatus.PENDING;
    };
    const statusVal = mapStatus(stripeStatus);

    const currentPeriodStart = subAny?.current_period_start ? new Date(Number(subAny.current_period_start) * 1000) : new Date();
    const currentPeriodEnd = subAny?.current_period_end ? new Date(Number(subAny.current_period_end) * 1000) : new Date();
    let trialEndsAt = subAny?.trial_end ? new Date(Number(subAny.trial_end) * 1000) : null;
    if (!trialEndsAt) {
      // Ensure a non-null value if the DB column is NOT NULL
      trialEndsAt = currentPeriodEnd || currentPeriodStart || new Date();
    }

    const stripeCustomerId = typeof checkout.customer === 'string' ? checkout.customer : (checkout.customer as any)?.id;
    const stripeSubscriptionId = subAny?.id || null;

    // Upsert clinic subscription
    const existing = await prisma.clinicSubscription.findFirst({
      where: { clinicId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    if (existing?.id) {
      await prisma.clinicSubscription.update({
        where: { id: existing.id },
        data: {
          planId: plan.id,
          status: statusVal,
          currentPeriodStart,
          currentPeriodEnd,
          trialEndsAt: trialEndsAt,
          stripeCustomerId: stripeCustomerId || undefined,
          stripeSubscriptionId: stripeSubscriptionId || undefined,
        },
      });
    } else {
      await prisma.clinicSubscription.create({
        data: {
          clinicId,
          planId: plan.id,
          status: statusVal,
          startDate: new Date(),
          currentPeriodStart,
          currentPeriodEnd,
          trialEndsAt: trialEndsAt,
          stripeCustomerId: stripeCustomerId || undefined,
          stripeSubscriptionId: stripeSubscriptionId || undefined,
        },
      });
    }

    return NextResponse.json({ ok: true, clinicId, status: statusVal });
  } catch (error: any) {
    console.error('[clinic/subscription/confirm] error', error);
    return NextResponse.json({ error: 'Failed to confirm subscription', details: error?.message }, { status: 500 });
  }
}
