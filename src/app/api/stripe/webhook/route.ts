import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
});

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('Missing STRIPE_WEBHOOK_SECRET');
    return NextResponse.json({ received: true });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const payload = await req.text();
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed.', err?.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const clinicId = (session.client_reference_id as string) || session.metadata?.clinicId;
        const planId = session.metadata?.planId as string | undefined;
        const stripeCustomerId = session.customer as string | null;
        const stripeSubscriptionId = session.subscription as string | null;

        if (!clinicId || !planId || !stripeSubscriptionId) break;

        // Retrieve subscription to get period dates
        const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
        const currentPeriodEnd = new Date((sub.current_period_end || 0) * 1000);
        const currentPeriodStart = new Date();
        const trialEndsAt = sub.trial_end ? new Date(sub.trial_end * 1000) : currentPeriodStart;

        // Upsert clinic subscription
        const existing = await prisma.clinicSubscription.findFirst({
          where: { clinicId },
          orderBy: { createdAt: 'desc' },
        });

        if (existing) {
          await prisma.clinicSubscription.update({
            where: { id: existing.id },
            data: {
              // Ensure plan relation is connected
              plan: { connect: { id: planId } },
              status: 'ACTIVE',
              stripeCustomerId: stripeCustomerId || existing.stripeCustomerId,
              stripeSubscriptionId,
              currentPeriodStart,
              currentPeriodEnd,
              trialEndsAt,
            },
          });
        } else {
          await prisma.clinicSubscription.create({
            data: {
              // Connect both clinic and plan relations explicitly
              clinic: { connect: { id: clinicId } },
              plan: { connect: { id: planId } },
              status: 'ACTIVE',
              startDate: currentPeriodStart,
              trialEndsAt,
              currentPeriodStart,
              currentPeriodEnd,
              stripeCustomerId: stripeCustomerId || undefined,
              stripeSubscriptionId,
            },
          });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const stripeSubscriptionId = sub.id;
        const currentPeriodEnd = new Date((sub.current_period_end || 0) * 1000);
        let status: 'ACTIVE' | 'PAST_DUE' = 'ACTIVE';
        if (sub.status === 'past_due' || sub.status === 'unpaid') status = 'PAST_DUE';

        await prisma.clinicSubscription.updateMany({
          where: { stripeSubscriptionId },
          data: {
            status,
            currentPeriodEnd,
          },
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const stripeSubscriptionId = sub.id;
        await prisma.clinicSubscription.updateMany({
          where: { stripeSubscriptionId },
          data: {
            status: 'CANCELED',
            canceledAt: new Date(),
          },
        });
        break;
      }

      default:
        // Ignore other events for now
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error('Webhook handling error:', err?.message);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}
