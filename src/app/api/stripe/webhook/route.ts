import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { emitEvent } from '@/lib/events';
import { EventActor, EventType } from '@prisma/client';
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

        // Emit events (non-blocking)
        try {
          if (clinicId) {
            // Membership started on first activation
            await emitEvent({
              eventId: event.id,
              eventType: EventType.membership_started,
              actor: EventActor.system,
              clinicId,
              metadata: {
                plan_id: planId || null,
                tier: 'basic',
                price: (session.amount_total ?? 0) / 100,
                duration: null,
              },
            });
            // Also record a billing event
            await emitEvent({
              eventType: EventType.subscription_billed,
              actor: EventActor.system,
              clinicId,
              metadata: { plan_id: planId || null, amount: (session.amount_total ?? 0) / 100, status: 'paid' },
            });
          }
        } catch (e) {
          console.error('[events] stripe checkout.session.completed emit failed', e);
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

        // Emit a billing-related event to reflect status change
        try {
          // Find clinicId by subscription
          const subRow = await prisma.clinicSubscription.findFirst({ where: { stripeSubscriptionId }, select: { clinicId: true, planId: true } });
          if (subRow?.clinicId) {
            await emitEvent({
              eventId: event.id,
              eventType: EventType.subscription_billed,
              actor: EventActor.system,
              clinicId: subRow.clinicId,
              metadata: { plan_id: subRow.planId, amount: null, status: sub.status },
            });
          }
        } catch (e) {
          console.error('[events] stripe customer.subscription.updated emit failed', e);
        }
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

        // Emit cancellation
        try {
          const subRow = await prisma.clinicSubscription.findFirst({ where: { stripeSubscriptionId }, select: { clinicId: true, planId: true } });
          if (subRow?.clinicId) {
            await emitEvent({
              eventId: event.id,
              eventType: EventType.subscription_canceled,
              actor: EventActor.system,
              clinicId: subRow.clinicId,
              metadata: { reason: 'no_value', plan_id: subRow.planId },
            });
          }
        } catch (e) {
          console.error('[events] stripe customer.subscription.deleted emit failed', e);
        }
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
