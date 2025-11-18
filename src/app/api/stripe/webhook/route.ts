import { NextRequest, NextResponse } from 'next/server';
export const runtime = 'nodejs';
import { prisma } from '@/lib/prisma';
import { emitEvent } from '@/lib/events';
import { EventActor, EventType } from '@prisma/client';
import Stripe from 'stripe';
import crypto from 'crypto';

// Webhook-only usage: we do not call Stripe APIs here. We only verify signatures and process payloads.
// Use a dummy key and match the project's Stripe TypeScript apiVersion to satisfy types.
const stripe = new Stripe('sk_webhook_dummy', {
  apiVersion: '2025-07-30.basil',
});

export async function POST(req: NextRequest) {
  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event | undefined;
  let matchedMerchantId: string | null = null;
  const payload = await req.text();
  // Verify using per-merchant secrets stored in integrations only
  try {
    const integrations = await prisma.merchantIntegration.findMany({
      where: { provider: 'STRIPE' as any, isActive: true },
      select: { merchantId: true, credentials: true },
    });
    for (const integ of integrations) {
      const creds = (integ.credentials || {}) as any;
      const secret = String(creds?.webhookSecret || '');
      if (!secret) continue;
      try {
        event = stripe.webhooks.constructEvent(payload, signature, secret);
        matchedMerchantId = integ.merchantId;
        break;
      } catch {}
    }
  } catch (e) {
    console.error('[stripe][webhook] failed loading integrations for signature verification', e);
  }
  if (!event) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const intentId = String(pi.id);
        const amount = Number(pi.amount || 0);
        const currency = String(pi.currency || '').toUpperCase();
        try {
          if (matchedMerchantId) {
            await prisma.$executeRawUnsafe(
              `UPDATE payment_transactions
                 SET status = 'paid',
                     amount_cents = CASE WHEN amount_cents = 0 OR amount_cents IS NULL THEN $3 ELSE amount_cents END,
                     currency = CASE WHEN currency IS NULL OR currency = '' THEN $4 ELSE currency END,
                     paid_at = COALESCE(paid_at, NOW()),
                     raw_payload = COALESCE(raw_payload, '{}'::jsonb) || jsonb_build_object('pi', $5::text)
               WHERE provider = 'stripe' AND provider_order_id = $1 AND merchant_id = $2`,
              intentId,
              matchedMerchantId,
              amount,
              currency,
              intentId
            );
          }
        } catch (e) {
          console.error('[stripe][webhook] update payment_intent.succeeded failed', e);
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const intentId = String(pi.id);
        const lastError = (pi.last_payment_error?.message || pi.last_payment_error?.code || '').toString();
        try {
          if (matchedMerchantId) {
            await prisma.$executeRawUnsafe(
              `UPDATE payment_transactions
                 SET status = 'failed',
                     raw_payload = COALESCE(raw_payload, '{}'::jsonb) || jsonb_build_object('pi_failed', jsonb_build_object('id', $1::text, 'error', $3::text))
               WHERE provider = 'stripe' AND provider_order_id = $1 AND merchant_id = $2`,
              intentId,
              matchedMerchantId,
              lastError
            );
          }
        } catch (e) {
          console.error('[stripe][webhook] update payment_intent.payment_failed failed', e);
        }
        break;
      }

      case 'charge.succeeded': {
        const ch = event.data.object as Stripe.Charge;
        const chargeId = String(ch.id);
        const intentId = (ch.payment_intent ? String(ch.payment_intent) : '') || '';
        const amount = Number(ch.amount || 0);
        const currency = String(ch.currency || '').toUpperCase();
        const status = ch.paid ? (ch.captured ? 'captured' : 'paid') : 'processing';
        try {
          if (intentId && matchedMerchantId) {
            await prisma.$executeRawUnsafe(
              `UPDATE payment_transactions
                 SET provider_charge_id = $1,
                     status = $4,
                     amount_cents = CASE WHEN amount_cents = 0 OR amount_cents IS NULL THEN $2 ELSE amount_cents END,
                     currency = CASE WHEN currency IS NULL OR currency = '' THEN $3 ELSE currency END,
                     refunded_cents = COALESCE(refunded_cents, 0),
                     raw_payload = COALESCE(raw_payload, '{}'::jsonb) || jsonb_build_object('ch', $5::text)
              WHERE provider = 'stripe' AND provider_order_id = $6 AND merchant_id = $7`,
              chargeId,
              amount,
              currency,
              status,
              chargeId,
              intentId,
              matchedMerchantId
            );
          }
        } catch (e) {
          console.error('[stripe][webhook] update charge.succeeded failed', e);
        }
        break;
      }

      case 'charge.captured': {
        const ch = event.data.object as Stripe.Charge;
        const chargeId = String(ch.id);
        const intentId = (ch.payment_intent ? String(ch.payment_intent) : '') || '';
        try {
          if (intentId && matchedMerchantId) {
            await prisma.$executeRawUnsafe(
              `UPDATE payment_transactions
                 SET status = 'captured', provider_charge_id = COALESCE(provider_charge_id, $1), captured_at = NOW()
              WHERE provider = 'stripe' AND provider_order_id = $2 AND merchant_id = $3`,
              chargeId,
              intentId,
              matchedMerchantId
            );
          }
        } catch (e) {
          console.error('[stripe][webhook] update charge.captured failed', e);
        }
        break;
      }

      case 'charge.refunded': {
        const ch = event.data.object as Stripe.Charge;
        const intentId = (ch.payment_intent ? String(ch.payment_intent) : '') || '';
        const refunded = Number(ch.amount_refunded || 0);
        const total = Number(ch.amount || 0);
        const status = refunded >= total && total > 0 ? 'refunded' : 'paid';
        try {
          if (intentId && matchedMerchantId) {
            await prisma.$executeRawUnsafe(
              `UPDATE payment_transactions
                 SET refunded_cents = $1,
                     status = $2,
                     refund_status = 'refunded',
                     refunded_at = NOW()
              WHERE provider = 'stripe' AND provider_order_id = $3 AND merchant_id = $4`,
              refunded,
              status,
              intentId,
              matchedMerchantId
            );
          }
        } catch (e) {
          console.error('[stripe][webhook] update charge.refunded failed', e);
        }
        break;
      }
      case 'checkout.session.completed': {
        // No-op for webhook-only mode (no API calls). Business plan onboarding can be handled elsewhere.
        break;
      }

      case 'customer.subscription.updated': {
        const sub: any = event.data.object as any;
        const stripeSubscriptionId = String(sub?.id || '');
        const currentPeriodEnd = sub?.current_period_end ? new Date(sub.current_period_end * 1000) : null;
        const currentPeriodStart = sub?.current_period_start ? new Date(sub.current_period_start * 1000) : null;
        const trialEndsAt = sub?.trial_end ? new Date(sub.trial_end * 1000) : null;
        const cancelAt = sub?.cancel_at ? new Date(sub.cancel_at * 1000) : null;
        const canceledAt = sub?.canceled_at ? new Date(sub.canceled_at * 1000) : null;
        const mapStatus = (s?: string) => {
          const v = String(s || '').toLowerCase();
          if (v === 'active') return 'ACTIVE';
          if (v === 'trialing') return 'TRIAL';
          if (v === 'past_due' || v === 'unpaid' || v === 'incomplete' || v === 'incomplete_expired') return 'PAST_DUE';
          if (v === 'canceled') return 'CANCELED';
          return 'ACTIVE';
        };
        const statusVal = mapStatus(sub?.status);

        // Update our internal customer_subscriptions by provider_subscription_id (snake_case)
        try {
          if (matchedMerchantId) {
            await prisma.$executeRawUnsafe(
              `UPDATE "customer_subscriptions" 
                 SET status = $1::"SubscriptionStatus",
                     current_period_start = $2,
                     current_period_end = $3,
                     trial_ends_at = $4,
                     cancel_at = $5,
                     canceled_at = $6,
                     updated_at = NOW()
               WHERE provider_subscription_id = $7 AND merchant_id = $8`,
              statusVal,
              currentPeriodStart,
              currentPeriodEnd,
              trialEndsAt,
              cancelAt,
              canceledAt,
              stripeSubscriptionId,
              matchedMerchantId
            );
          }
        } catch (e) {
          console.error('[stripe][webhook] update customer_subscriptions failed', e);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub: any = event.data.object as any;
        const stripeSubscriptionId = String(sub?.id || '');
        try {
          if (matchedMerchantId) {
            await prisma.$executeRawUnsafe(
              `UPDATE "customer_subscriptions" 
                 SET status = 'CANCELED'::"SubscriptionStatus",
                     canceled_at = NOW(),
                     updated_at = NOW()
               WHERE provider_subscription_id = $1 AND merchant_id = $2`,
              stripeSubscriptionId,
              matchedMerchantId
            );
          }
        } catch (e) {
          console.error('[stripe][webhook] cancel customer_subscriptions failed', e);
        }
        break;
      }

      // Record invoice payments as transactions and link to our customer_subscriptions
      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed':
      case 'invoice.payment_action_required': {
        const inv: any = event.data.object as any;
        const subscriptionId = inv?.subscription ? String(inv.subscription) : '';
        const amount = Number(inv?.amount_paid ?? inv?.amount_due ?? 0);
        const currency = String(inv?.currency || '').toUpperCase();
        const piId = typeof inv?.payment_intent === 'string' ? inv.payment_intent : inv?.payment_intent?.id;
        const chId = typeof inv?.charge === 'string' ? inv.charge : undefined;
        const periodStart = inv?.lines?.data?.[0]?.period?.start ? new Date(inv.lines.data[0].period.start * 1000) : undefined;
        const periodEnd = inv?.lines?.data?.[0]?.period?.end ? new Date(inv.lines.data[0].period.end * 1000) : undefined;

        // Find our subscription row for linkage
        const subRows = await prisma.$queryRawUnsafe<any[]>(
          `SELECT id, merchant_id, customer_id, product_id FROM "customer_subscriptions" WHERE provider_subscription_id = $1 LIMIT 1`,
          subscriptionId
        ).catch(() => []);
        const subRow = Array.isArray(subRows) && subRows[0] ? subRows[0] : null;

        // Derive status
        const paid = event.type === 'invoice.payment_succeeded';
        const status = paid ? 'paid' : (event.type === 'invoice.payment_failed' ? 'failed' : 'processing');

        if (subRow && piId) {
          if (matchedMerchantId && String(subRow.merchant_id) !== String(matchedMerchantId)) {
            // Cross-tenant mismatch; ignore
            break;
          }
          // Upsert payment_transaction by provider+provider_order_id (PI)
          try {
            const existing = await prisma.paymentTransaction.findFirst({ where: { provider: 'stripe', providerOrderId: String(piId) }, select: { id: true } }).catch(() => null);
            if (existing?.id) {
              await prisma.paymentTransaction.update({
                where: { id: existing.id },
                data: {
                  status,
                  status_v2: paid ? 'PAID' as any : undefined,
                  amountCents: amount || undefined,
                  currency: currency || undefined,
                  providerChargeId: chId || undefined,
                  customerSubscriptionId: subRow.id,
                  customerId: subRow.customer_id,
                  merchantId: subRow.merchant_id,
                  productId: subRow.product_id,
                  billingPeriodStart: periodStart,
                  billingPeriodEnd: periodEnd,
                },
              });
            } else {
              await prisma.paymentTransaction.create({
                data: {
                  id: crypto.randomUUID(),
                  provider: 'stripe',
                  providerOrderId: String(piId),
                  providerChargeId: chId || null,
                  doctorId: null,
                  patientProfileId: null,
                  clinicId: null,
                  merchantId: subRow.merchant_id || null,
                  productId: subRow.product_id || null,
                  customerId: subRow.customer_id || null,
                  amountCents: Number(amount || 0),
                  currency: currency || 'USD',
                  installments: null,
                  paymentMethodType: 'card',
                  status,
                  status_v2: paid ? 'PAID' as any : undefined,
                  rawPayload: { invoice_id: inv.id },
                  billingPeriodStart: periodStart,
                  billingPeriodEnd: periodEnd,
                  customerSubscriptionId: subRow.id,
                },
              });
            }
          } catch (e) {
            console.error('[stripe][webhook] upsert payment_transactions (invoice) failed', e);
          }
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
