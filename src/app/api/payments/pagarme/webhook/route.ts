import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPagarmeWebhookSignature, pagarmeUpdateCharge, pagarmeGetOrder } from '@/lib/payments/pagarme/sdk';
import { sendEmail } from '@/lib/email';
import { baseTemplate } from '@/email-templates/layouts/base';
import crypto from 'crypto';
import { onPaymentTransactionStatusChanged, onPaymentTransactionCreated } from '@/lib/webhooks/emit-updated';
import { normalizeProviderStatus } from '@/lib/payments/status-map';

export async function GET() {
  // Health check endpoint; webhooks must POST
  return NextResponse.json({ ok: true, method: 'GET', note: 'Use POST for Pagar.me webhooks' });
}

export async function POST(req: Request) {
  let hookId: string | null = null;
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-pagarme-signature')
      || req.headers.get('x-hub-signature-256')
      || req.headers.get('x-hub-signature')
      || undefined;

    const secretConfigured = !!process.env.PAGARME_WEBHOOK_SECRET;
    if (secretConfigured) {
      const ok = verifyPagarmeWebhookSignature(rawBody, signature || undefined);
      if (!ok) {
        return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
      }
    } else {
      // Dev/Test mode: accept webhook without signature validation
      console.warn('[pagarme][webhook] No PAGARME_WEBHOOK_SECRET configured; skipping signature verification. Do not use this in production.');
    }

    const event = JSON.parse(rawBody || '{}');
    const type = String(event?.type || event?.event || '');
    const typeLower = type.toLowerCase();
    hookId = event?.id ? String(event.id) : null;
    const initialStatus: string | null = (event?.data?.status || event?.status || null) ? String(event?.data?.status || event?.status) : null;
    try {
      if (hookId) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO webhook_events (provider, hook_id, provider_event_id, type, status, raw)
           VALUES ('pagarme', $1, $1, $2, $3, $4::jsonb)
           ON CONFLICT (provider, hook_id) DO NOTHING`,
          String(hookId),
          String(type),
          initialStatus,
          JSON.stringify(event)
        );
      }
    } catch {}
    try {
      // High-level audit log (no sensitive data)
      const basic = {
        type,
        has_signature: !!signature,
        received_at: new Date().toISOString(),
      };
      console.log('[pagarme][webhook] received', basic);
    } catch {}

    // If async processing is enabled, enqueue (signal via next_retry_at) and return 200.
    const ASYNC = String(process.env.WEBHOOK_ASYNC || '').toLowerCase() === 'true';
    if (ASYNC && hookId) {
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE webhook_events SET next_retry_at = NOW() WHERE provider = 'pagarme' AND hook_id = $1`,
          String(hookId)
        );
      } catch {}
      return NextResponse.json({ received: true, enqueued: true });
    }

    // Example handlers (adjust to actual Pagar.me event schema)
    if (type.includes('recipient')) {
      const recipientId = event?.data?.id || event?.recipient?.id || event?.object?.id;
      const remoteStatus = event?.data?.status || event?.recipient?.status || event?.object?.status || '';
      if (recipientId) {
        const merchant = await prisma.merchant.findFirst({ where: { recipientId } });
        if (merchant) {
          const normalized: 'ACTIVE' | 'PENDING' | 'REJECTED' = remoteStatus === 'active' ? 'ACTIVE' : remoteStatus === 'rejected' ? 'REJECTED' : 'PENDING';
          await prisma.merchant.update({
            where: { clinicId: merchant.clinicId },
            data: { status: normalized, lastSyncAt: new Date() }
          });
        }
      }
    }

    // Subscription split via charge.created webhook
    if (typeLower === 'charge.created') {
      try {
        const chargeIdForSplit = event?.data?.id || event?.id || null;
        const chargeData = event?.data || {};
        const metadata = chargeData?.metadata || {};
        const subscriptionIdInCharge = metadata?.subscriptionId || chargeData?.subscription?.id || null;
        const clinicIdInMeta = metadata?.clinicId || null;
        
        const ENABLE_SPLIT = String(process.env.PAGARME_ENABLE_SPLIT || '').toLowerCase() === 'true';
        const platformRecipientId = String(process.env.PLATFORM_RECIPIENT_ID || process.env.PAGARME_PLATFORM_RECIPIENT_ID || '').trim() || null;
        
        // Fallback: resolve clinicId and split percent via internal DB when metadata lacks it
        let resolvedClinicId: string | null = clinicIdInMeta;
        let resolvedSplitPercent: number | null = null;
        if (!resolvedClinicId && subscriptionIdInCharge) {
          try {
            const subRows = await prisma.$queryRawUnsafe<any[]>(
              `SELECT cs.merchant_id, cs.product_id, cs.offer_id, m.recipient_id, m.split_percent, p.clinic_id
                 FROM customer_subscriptions cs
                 LEFT JOIN merchants m ON m.id = cs.merchant_id
                 LEFT JOIN products p ON p.id = cs.product_id
                WHERE cs.provider_subscription_id = $1
                LIMIT 1`,
              String(subscriptionIdInCharge)
            );
            const r = subRows?.[0] || null;
            if (r) {
              resolvedClinicId = r.clinic_id || null;
              resolvedSplitPercent = (r.split_percent != null) ? Number(r.split_percent) : null;
            }
          } catch {}
        }

        if (ENABLE_SPLIT && subscriptionIdInCharge && chargeIdForSplit && (clinicIdInMeta || resolvedClinicId) && platformRecipientId) {
          // Lookup clinic merchant to get recipientId and splitPercent
          const merchant = await prisma.merchant.findFirst({
            where: { clinicId: String(clinicIdInMeta || resolvedClinicId) },
            select: { recipientId: true, splitPercent: true },
          });
          
          if (merchant?.recipientId) {
            const totalCents = Number(chargeData?.amount || 0);
            if (totalCents > 0) {
              const clinicPercent = Math.max(0, Math.min(100, Number((resolvedSplitPercent != null ? resolvedSplitPercent : merchant.splitPercent) || 85)));
              const clinicAmount = Math.round(totalCents * clinicPercent / 100);
              const platformAmount = totalCents - clinicAmount;
              
              const splitRules = [
                {
                  recipient_id: String(platformRecipientId),
                  amount: platformAmount,
                  type: 'flat',
                  liable: true,
                  charge_processing_fee: true,
                  charge_remainder_fee: true,
                },
                {
                  recipient_id: String(merchant.recipientId),
                  amount: clinicAmount,
                  type: 'flat',
                  liable: false,
                  charge_processing_fee: false,
                },
              ];
              
              console.log('[pagarme][webhook][charge.created] applying split to subscription charge', {
                chargeId: chargeIdForSplit,
                subscriptionId: subscriptionIdInCharge,
                clinicId: clinicIdInMeta || resolvedClinicId,
                platformAmount,
                clinicAmount,
              });
              
              await pagarmeUpdateCharge(String(chargeIdForSplit), { split: splitRules });
            }
          }
        }
      } catch (e) {
        console.warn('[pagarme][webhook][charge.created] subscription split application failed:', e instanceof Error ? e.message : e);
      }
    }

    // Transaction events (orders/charges)
    try {
      // Normalize identifiers from various possible payload shapes
      let orderId = event?.data?.order?.id
        || event?.order?.id
        || event?.object?.order?.id
        || null;
      // For order.* events, data.id is the order id. For charge.* it is the charge id.
      if (!orderId && typeLower.startsWith('order')) {
        orderId = event?.data?.id || event?.id || null;
      }
      // Subscription id support (use as orderId fallback for storage)
      const subscriptionId = event?.data?.subscription?.id
        || event?.subscription?.id
        || event?.object?.subscription_id
        || event?.data?.subscription_id
        || null;
      if (!orderId && subscriptionId) orderId = subscriptionId;
      let chargeId = event?.data?.charge?.id
        || event?.data?.charges?.[0]?.id
        || event?.charge?.id
        || event?.object?.charge?.id
        || null;
      // For charge.* events, prefer data.id as charge id when missing
      if (!chargeId && typeLower.startsWith('charge')) {
        chargeId = event?.data?.id || event?.id || null;
      }
      // Guard: never treat a charge id as order id
      if (orderId && String(orderId).startsWith('ch_')) {
        orderId = null;
      }

      // Remediation: if in the past we stored provider_order_id with a charge id, fix it now
      if (orderId && chargeId) {
        try {
          await prisma.$executeRawUnsafe(
            `UPDATE payment_transactions
               SET provider_order_id = $2,
                   provider_charge_id = COALESCE(provider_charge_id, $1),
                   raw_payload = $3::jsonb
             WHERE provider = 'pagarme'
               AND provider_order_id = $1`,
            String(chargeId),
            String(orderId),
            JSON.stringify(event)
          );
        } catch (e) {
          console.warn('[pagarme][webhook] remediation order_id<-charge_id fix failed:', e instanceof Error ? e.message : e);
        }
      }

      try {
        if (hookId) {
          await prisma.$executeRawUnsafe(
            `UPDATE webhook_events
               SET resource_order_id = COALESCE(resource_order_id, $1),
                   resource_charge_id = COALESCE(resource_charge_id, $2)
             WHERE provider = 'pagarme' AND hook_id = $3`,
            orderId ? String(orderId) : null,
            chargeId ? String(chargeId) : null,
            String(hookId)
          );
        }
      } catch {}

      // Status mapping (centralized)
      const rawStatus = (event?.data?.status
        || event?.data?.order?.status
        || event?.order?.status
        || event?.status
        || '').toString();
      const isPaidEvent = typeLower.includes('order.paid') || typeLower.includes('charge.paid') || typeLower.includes('invoice.paid');
      
      // Use centralized normalizer
      let mapped: string | undefined;
      let internalStatus: string | undefined;
      if (rawStatus && rawStatus !== 'active') {
        // For paid events, force 'paid' status
        const statusToNormalize = isPaidEvent ? 'paid' : rawStatus;
        const normalized = normalizeProviderStatus('PAGARME', statusToNormalize);
        mapped = normalized.legacy;
        internalStatus = normalized.internal;
      }
      
      try {
        console.log('[pagarme][webhook] normalized', { orderId, chargeId, rawStatus, mapped, internalStatus, type, isPaidEvent });
      } catch {}

      // Anti-downgrade is now handled atomically in SQL CASE

      // Extract method and installments when available
      const chargeObj = event?.data?.charge || (Array.isArray(event?.data?.charges) ? event?.data?.charges?.[0] : null) || event?.charge || null;
      const lastTx = chargeObj?.last_transaction || event?.data?.transaction || null;
      // CRITICAL: extract payment_method carefully to avoid overwriting pix with credit_card
      // Priority: last_transaction.payment_method > charge.payment_method (only when we have transaction)
      const paymentMethodRaw: string | null = lastTx?.payment_method || (lastTx ? chargeObj?.payment_method : null) || null;
      const paymentMethodType: string | null = paymentMethodRaw ? String(paymentMethodRaw).toLowerCase() : null;
      try {
        console.log('[pagarme][webhook] payment_method extraction', { 
          type, 
          orderId, 
          chargeId, 
          hasLastTx: !!lastTx, 
          txMethod: lastTx?.payment_method || null,
          chargeMethod: chargeObj?.payment_method || null,
          final: paymentMethodType 
        });
      } catch {}
      const installmentsVal: number | null = (() => {
        const raw = lastTx?.installments ?? event?.data?.installments ?? null;
        const n = Number(raw);
        return Number.isFinite(n) && n > 0 ? n : null;
      })();

      // Placeholder status to use when we need to upsert a row for non-terminal events
      const placeholderStatus: string = (() => {
        if (mapped) return mapped;
        if (rawStatus === 'processing' || rawStatus === 'pending') return rawStatus;
        return 'processing';
      })();

      // Compute split amounts (best-effort) to persist clinic/platform shares when possible (hybrid fees)
      let splitClinicAmount: number | null = null;
      let splitPlatformAmount: number | null = null;
      let splitPlatformFeeCents: number | null = null;
      try {
        const eventAmountCentsForSplit = Number(
          event?.data?.amount
          || event?.data?.order?.amount
          || event?.order?.amount
          || event?.data?.charge?.amount
          || event?.data?.charges?.[0]?.amount
          || 0
        ) || 0;
        if (eventAmountCentsForSplit > 0) {
          const orderMeta0 = event?.data?.metadata || event?.data?.order?.metadata || event?.order?.metadata || event?.metadata || {};
          const clinicId0: string | null = orderMeta0?.clinicId || null;
          let clinicSplitPercent = 70;
          let platformFeeBps = 0;
          let transactionFeeCents = 0;
          if (clinicId0) {
            try {
              const m = await prisma.merchant.findFirst({ where: { clinicId: String(clinicId0) }, select: { splitPercent: true, platformFeeBps: true, transactionFeeCents: true } });
              if (m && m.splitPercent != null) clinicSplitPercent = Math.max(0, Math.min(100, Number(m.splitPercent)));
              if (m && m.platformFeeBps != null) platformFeeBps = Math.max(0, Number(m.platformFeeBps));
              if (m && m.transactionFeeCents != null) transactionFeeCents = Math.max(0, Number(m.transactionFeeCents));
            } catch {}
          }
          const clinicShare = Math.round(eventAmountCentsForSplit * (clinicSplitPercent / 100));
          const feePercent = Math.round(eventAmountCentsForSplit * (platformFeeBps / 10000));
          const feeFlat = transactionFeeCents;
          const platformFeeTotal = Math.max(0, feePercent + feeFlat);
          const clinic = Math.max(0, clinicShare - platformFeeTotal);
          const platform = Math.max(0, eventAmountCentsForSplit - clinic);
          splitClinicAmount = clinic;
          splitPlatformAmount = platform;
          splitPlatformFeeCents = platformFeeTotal;
        }
      } catch {}

      // Update by provider_order_id; create if not exists (webhooks may arrive before checkout/create)
      if (orderId) {
        try {
          const result = await prisma.$executeRawUnsafe(
            `UPDATE payment_transactions
             SET status = CASE
                            WHEN ($2::text) IS NULL THEN status
                            WHEN status = 'pending' AND ($2::text) IN ('processing','paid','refunded','canceled','failed','underpaid','overpaid','chargedback') THEN ($2::text)
                            WHEN status = 'processing' AND ($2::text) IN ('paid','refunded','canceled','failed','underpaid','overpaid','chargedback') THEN ($2::text)
                            WHEN status = 'paid' AND ($2::text) IN ('refunded','canceled','failed','chargedback') THEN ($2::text)
                            WHEN status = 'refunded' AND ($2::text) IN ('canceled','failed') THEN ($2::text)
                            WHEN status = 'canceled' AND ($2::text) = 'failed' THEN ($2::text)
                            ELSE status
                          END,
                 status_v2 = COALESCE($9::"PaymentStatus", status_v2),
                 provider_v2 = COALESCE(provider_v2, 'PAGARME'::"PaymentProvider"),
                 raw_payload = $3::jsonb,
                 payment_method_type = COALESCE($4::text, payment_method_type),
                 installments = COALESCE($5::int, installments),
                 clinic_amount_cents = COALESCE(clinic_amount_cents, $6::bigint),
                 platform_amount_cents = COALESCE(platform_amount_cents, $7::bigint),
                 platform_fee_cents = COALESCE(platform_fee_cents, $8::bigint),
                 paid_at = CASE WHEN ($2::text) = 'paid' THEN COALESCE(paid_at, NOW()) ELSE paid_at END,
                 updated_at = NOW()
             WHERE provider = 'pagarme' AND provider_order_id = $1`,
            String(orderId),
            mapped || null,
            JSON.stringify(event),
            paymentMethodType,
            installmentsVal,
            splitClinicAmount,
            splitPlatformAmount,
            splitPlatformFeeCents,
            internalStatus || null
          );
          // If UPDATE affected 0 rows, INSERT a placeholder row for webhooks that arrive early
          if (result === 0) {
            const webhookTxId = `wh_${orderId}_${Date.now()}`;
            try {
              const webhookAmountCents = Number(
                event?.data?.amount
                || event?.data?.order?.amount
                || event?.order?.amount
                || event?.data?.charge?.amount
                || event?.data?.charges?.[0]?.amount
                || 0
              ) || 0;
              await prisma.$executeRawUnsafe(
                `INSERT INTO payment_transactions (id, provider, provider_order_id, status, payment_method_type, installments, amount_cents, clinic_amount_cents, platform_amount_cents, platform_fee_cents, currency, raw_payload, created_at, routed_provider, provider_v2, status_v2)
                 VALUES ($1, 'pagarme', $2, $3::text, $4::text, $5::int, $6, $7, $8, $9, 'BRL', $10::jsonb, NOW(), 'KRXPAY', 'PAGARME'::"PaymentProvider", CASE WHEN $3 = 'paid' THEN 'SUCCEEDED'::"PaymentStatus" WHEN $3 IN ('processing','pending') THEN 'PROCESSING'::"PaymentStatus" ELSE 'PROCESSING'::"PaymentStatus" END)
                 ON CONFLICT DO NOTHING`,
                webhookTxId,
                String(orderId),
                placeholderStatus,
                paymentMethodType,
                installmentsVal,
                webhookAmountCents,
                splitClinicAmount,
                splitPlatformAmount,
                splitPlatformFeeCents,
                JSON.stringify(event)
              );
              console.log('[pagarme][webhook] created early row by orderId', { orderId, status: placeholderStatus });
              
              // Emit webhook: payment.transaction.created
              try {
                await onPaymentTransactionCreated(webhookTxId);
                console.log('[pagarme][webhook] ✅ webhook emitted for early transaction', { txId: webhookTxId, orderId });
              } catch (e) {
                console.warn('[pagarme][webhook] ⚠️ webhook emission failed (non-blocking)', e instanceof Error ? e.message : e);
              }
            } catch {}
          } else {
            console.log('[pagarme][webhook] updated by orderId', { orderId, status: mapped || 'unchanged', affectedRows: result });
            
            // Emit outbound webhook event
            if (result > 0 && mapped) {
              try {
                const tx = await prisma.paymentTransaction.findFirst({
                  where: { provider: 'pagarme', providerOrderId: String(orderId) },
                  select: { id: true, clinicId: true, status_v2: true }
                });
                if (tx?.clinicId && tx?.status_v2) {
                  await onPaymentTransactionStatusChanged(tx.id, String(tx.status_v2));
                }
              } catch (e) {
                console.warn('[pagarme][webhook] outbound event emission failed (non-blocking)', e instanceof Error ? e.message : e);
              }
            }
          }
        } catch (e) {
          console.warn('[pagarme][webhook] update by orderId failed', { orderId, err: e instanceof Error ? e.message : e });
        }
      }

      // Update by provider_charge_id if we have it (and set charge id on row)
      if (chargeId) {
        try {
          const result2 = await prisma.$executeRawUnsafe(
            `UPDATE payment_transactions
             SET provider_charge_id = COALESCE(provider_charge_id, $1),
                 status = CASE
                            WHEN ($2::text) IS NULL THEN status
                            WHEN status = 'pending' AND ($2::text) IN ('processing','paid','refunded','canceled','failed','underpaid','overpaid','chargedback') THEN ($2::text)
                            WHEN status = 'processing' AND ($2::text) IN ('paid','refunded','canceled','failed','underpaid','overpaid','chargedback') THEN ($2::text)
                            WHEN status = 'paid' AND ($2::text) IN ('refunded','canceled','failed','chargedback') THEN ($2::text)
                            WHEN status = 'refunded' AND ($2::text) IN ('canceled','failed') THEN ($2::text)
                            WHEN status = 'canceled' AND ($2::text) = 'failed' THEN ($2::text)
                            ELSE status
                          END,
                 status_v2 = COALESCE($10::"PaymentStatus", status_v2),
                 provider_v2 = COALESCE(provider_v2, 'PAGARME'::"PaymentProvider"),
                 raw_payload = $3::jsonb,
                 payment_method_type = COALESCE($5::text, payment_method_type),
                 installments = COALESCE($6::int, installments),
                 clinic_amount_cents = COALESCE(clinic_amount_cents, $7::bigint),
                 platform_amount_cents = COALESCE(platform_amount_cents, $8::bigint),
                 platform_fee_cents = COALESCE(platform_fee_cents, $9::bigint),
                 paid_at = CASE WHEN ($2::text) = 'paid' THEN COALESCE(paid_at, NOW()) ELSE paid_at END,
                 updated_at = NOW()
             WHERE provider = 'pagarme' AND (provider_charge_id = $1 OR provider_order_id = $4)`,
            String(chargeId),
            mapped || null,
            JSON.stringify(event),
            orderId ? String(orderId) : null,
            paymentMethodType,
            installmentsVal,
            splitClinicAmount,
            splitPlatformAmount,
            splitPlatformFeeCents,
            internalStatus || null
          );
          if (result2 === 0 && !orderId) {
            // No row matched; create placeholder by charge id to ensure visibility in listings
            const webhookTxId2 = `wh_${chargeId}_${Date.now()}`;
            try {
              const webhookAmountCents2 = Number(
                event?.data?.amount
                || event?.data?.order?.amount
                || event?.order?.amount
                || event?.data?.charge?.amount
                || event?.data?.charges?.[0]?.amount
                || 0
              ) || 0;
              await prisma.$executeRawUnsafe(
                `INSERT INTO payment_transactions (id, provider, provider_charge_id, status, payment_method_type, installments, amount_cents, clinic_amount_cents, platform_amount_cents, platform_fee_cents, currency, raw_payload, created_at, routed_provider, provider_v2, status_v2)
                 VALUES ($1, 'pagarme', $2, $3::text, $4::text, $5::int, $6, $7, $8, $9, 'BRL', $10::jsonb, NOW(), 'KRXPAY', 'PAGARME'::"PaymentProvider", CASE WHEN $3 = 'paid' THEN 'SUCCEEDED'::"PaymentStatus" WHEN $3 IN ('processing','pending') THEN 'PROCESSING'::"PaymentStatus" ELSE 'PROCESSING'::"PaymentStatus" END)
                 ON CONFLICT DO NOTHING`,
                webhookTxId2,
                String(chargeId),
                placeholderStatus,
                paymentMethodType,
                installmentsVal,
                webhookAmountCents2,
                splitClinicAmount,
                splitPlatformAmount,
                splitPlatformFeeCents,
                JSON.stringify(event)
              );
              console.log('[pagarme][webhook] created early row by chargeId', { chargeId, status: placeholderStatus });
              
              // Emit webhook: payment.transaction.created
              try {
                await onPaymentTransactionCreated(webhookTxId2);
                console.log('[pagarme][webhook] ✅ webhook emitted for early transaction', { txId: webhookTxId2, chargeId });
              } catch (e) {
                console.warn('[pagarme][webhook] ⚠️ webhook emission failed (non-blocking)', e instanceof Error ? e.message : e);
              }
            } catch {}
          } else {
            console.log('[pagarme][webhook] updated by chargeId', { chargeId, orderId, status: mapped || 'unchanged', affectedRows: result2 });
            
            // Emit outbound webhook event
            if (result2 > 0 && mapped) {
              try {
                const tx = await prisma.paymentTransaction.findFirst({
                  where: { provider: 'pagarme', providerChargeId: String(chargeId) },
                  select: { id: true, clinicId: true, status_v2: true }
                });
                if (tx?.clinicId && tx?.status_v2) {
                  await onPaymentTransactionStatusChanged(tx.id, String(tx.status_v2));
                }
              } catch (e) {
                console.warn('[pagarme][webhook] outbound event emission failed (non-blocking)', e instanceof Error ? e.message : e);
              }
            }
          }
        } catch (e) {
          console.warn('[pagarme][webhook] update by chargeId failed', { chargeId, orderId, err: e instanceof Error ? e.message : e });
        }
      }

      // Activate subscriptions when payment confirms (charge/order paid)
      if (mapped === 'paid' && (orderId || subscriptionId)) {
        try {
          const subIdToActivate = subscriptionId || orderId;
          if (subIdToActivate) {
            // Find subscription by provider_subscription_id OR metadata->>'pagarmeOrderId'
            const subRows: any[] = await prisma.$queryRawUnsafe(
              `SELECT id, product_id, offer_id, start_at, provider_subscription_id FROM customer_subscriptions 
               WHERE (provider_subscription_id = $1 OR metadata->>'pagarmeOrderId' = $1) AND status != 'ACTIVE' LIMIT 1`,
              String(subIdToActivate)
            );
            if (subRows && subRows.length > 0) {
              const subRow = subRows[0];
              // Calculate period dates from payment confirmation
              const paidAt = new Date();
              let periodStart = paidAt;
              let periodEnd = new Date(paidAt);
              
              // Get interval from offer or product
              let intervalUnit = 'MONTH';
              let intervalCount = 1;
              try {
                if (subRow.offer_id) {
                  const offer = await prisma.offer.findUnique({ where: { id: String(subRow.offer_id) }, select: { intervalUnit: true, intervalCount: true } });
                  if (offer?.intervalUnit) intervalUnit = String(offer.intervalUnit).toUpperCase();
                  if (offer?.intervalCount) intervalCount = Number(offer.intervalCount) || 1;
                } else if (subRow.product_id) {
                  const product = await prisma.product.findUnique({ where: { id: String(subRow.product_id) }, select: { interval: true, intervalCount: true } } as any);
                  if ((product as any)?.interval) intervalUnit = String((product as any).interval).toUpperCase();
                  if ((product as any)?.intervalCount) intervalCount = Number((product as any).intervalCount) || 1;
                }
              } catch {}
              
              // Calculate end date based on interval
              if (intervalUnit === 'DAY') periodEnd.setDate(periodEnd.getDate() + intervalCount);
              else if (intervalUnit === 'WEEK') periodEnd.setDate(periodEnd.getDate() + 7 * intervalCount);
              else if (intervalUnit === 'MONTH') periodEnd.setMonth(periodEnd.getMonth() + intervalCount);
              else if (intervalUnit === 'YEAR') periodEnd.setFullYear(periodEnd.getFullYear() + intervalCount);
              
              await prisma.$executeRawUnsafe(
                `UPDATE customer_subscriptions 
                 SET status = 'ACTIVE'::"SubscriptionStatus",
                     current_period_start = $2::timestamp,
                     current_period_end = $3::timestamp,
                     start_at = COALESCE(start_at, $2::timestamp),
                     updated_at = NOW()
                 WHERE id = $1`,
                String(subRow.id),
                periodStart,
                periodEnd
              );
              console.log('[pagarme][webhook] activated subscription', { subscriptionId: subRow.id, providerSubId: subRow.provider_subscription_id, orderId: subIdToActivate, periodStart, periodEnd, interval: intervalUnit, count: intervalCount });
            }
          }
        } catch (e) {
          console.warn('[pagarme][webhook] subscription activation failed:', e instanceof Error ? e.message : e);
        }
      }

      // Email notifications (non-blocking). Only send on terminal states we care about.
      try {
        let isPaid = mapped === 'paid';
        const isCanceled = mapped === 'canceled' || mapped === 'failed' || mapped === 'refused';
        const isRefunded = type.includes('refunded') || mapped === 'refunded';

        // SAFEGUARD: For PIX, verify paid by refetching order to confirm settlement
        if (isPaid && (paymentMethodType === 'pix' || typeLower.includes('pix'))) {
          try {
            if (orderId) {
              const ord = await pagarmeGetOrder(String(orderId)).catch(() => null as any);
              const ch = Array.isArray(ord?.charges) ? ord.charges[0] : null;
              const paidAmount = Number(ch?.paid_amount || 0);
              const amount = Number(ch?.amount || 0);
              const tx = ch?.last_transaction || null;
              const txStatus = (tx?.status || '').toString().toLowerCase();
              const verified = (paidAmount >= amount && amount > 0) || txStatus === 'paid';
              console.log('[pagarme][webhook] pix paid verification', { orderId, paidAmount, amount, txStatus, verified });
              if (!verified) {
                // Downgrade to pending if provider doesn't confirm settlement
                isPaid = false;
                mapped = 'pending';
                try {
                  await prisma.$executeRawUnsafe(
                    `UPDATE payment_transactions
                       SET status = 'pending'
                     WHERE provider = 'pagarme' AND provider_order_id = $1`,
                    String(orderId)
                  );
                } catch {}
              }
            }
          } catch {}
        }

        if (!isPaid && !isCanceled) {
          return NextResponse.json({ received: true });
        }

        // Try to extract metadata and customer from webhook
        const payloadCustomerEmail: string | null =
          event?.data?.customer?.email || event?.customer?.email || event?.object?.customer?.email || null;
        const orderMeta = event?.data?.metadata || event?.data?.order?.metadata || event?.order?.metadata || event?.metadata || {};
        const metaClinicId: string | null = orderMeta?.clinicId || null;
        const metaBuyerEmail: string | null = orderMeta?.buyerEmail || null;
        const metaProductId: string | null = orderMeta?.productId || null;

        // Lookup transaction row to enrich context and fallback identifiers
        let txRow: any = null;
        try {
          txRow = await prisma.paymentTransaction.findFirst({
            where: {
              provider: 'pagarme',
              OR: [
                orderId ? { providerOrderId: String(orderId) } : undefined,
                // providerChargeId is not present in Prisma model; fallback added below
              ].filter(Boolean) as any,
            },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              amountCents: true,
              currency: true,
              clinicId: true,
              patientProfileId: true,
              productId: true,
              status: true,
            },
          } as any);
        } catch {}
        // Fallback: if not found via Prisma (no providerChargeId field), try raw select by provider_charge_id
        if (!txRow && chargeId) {
          try {
            const rows = await prisma.$queryRawUnsafe<any[]>(
              `SELECT id, amount_cents, currency, clinic_id, patient_profile_id, product_id, status
                 FROM payment_transactions
                WHERE provider = 'pagarme' AND provider_charge_id = $1
             ORDER BY created_at DESC
                LIMIT 1`,
              String(chargeId)
            );
            const r = rows?.[0];
            if (r) {
              txRow = {
                id: r.id,
                amountCents: Number(r.amount_cents || 0),
                currency: r.currency,
                clinicId: r.clinic_id,
                patientProfileId: r.patient_profile_id,
                productId: r.product_id,
                status: r.status,
              };
            }
          } catch {}
        }

        // Resolve clinic context
        const clinicId: string | null = metaClinicId || txRow?.clinicId || null;
        let clinicName = 'Zuzz';
        try {
          if (clinicId) {
            const c = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { name: true } });
            if (c?.name) clinicName = c.name;
          }
        } catch {}

        // Resolve user email/name
        let toEmail: string | null = payloadCustomerEmail || metaBuyerEmail || null;
        let userName: string | undefined;
        if (!toEmail && txRow?.patientProfileId) {
          try {
            const prof = await prisma.patientProfile.findUnique({
              where: { id: txRow.patientProfileId },
              select: { userId: true, name: true },
            } as any);
            if (prof?.userId) {
              const u = await prisma.user.findUnique({ where: { id: prof.userId }, select: { email: true, name: true } });
              toEmail = u?.email || null;
              userName = u?.name || prof?.name || undefined;
            }
          } catch {}
        }

        if (!toEmail) {
          console.warn('[pagarme][webhook][email] no recipient email resolved, skipping');
          return NextResponse.json({ received: true });
        }

        // Build email content
        const amountCents = Number(txRow?.amountCents || 0);
        const currency = (txRow?.currency as any) || 'BRL';
        const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(v / 100);
        let productName: string | null = null;
        try {
          const pid = metaProductId || txRow?.productId || null;
          if (pid) {
            const p = await prisma.product.findUnique({ where: { id: String(pid) }, select: { name: true } });
            productName = p?.name || null;
          }
        } catch {}

        const itemsHtml = productName ? `<tr><td style="padding:6px 0;">${productName}</td><td style=\"padding:6px 0; text-align:right;\">1x</td></tr>` : '';
        const customerNameText = userName ? `Olá ${userName},` : 'Olá,';

        if (isPaid) {
          const content = `
            <div style="font-size:16px; color:#111;">
              <p style="font-size:20px; font-weight:600; margin:0 0 12px;">Pagamento confirmado</p>
              <p style="margin:0 0 16px;">${customerNameText} recebemos o seu pagamento.</p>
              ${itemsHtml ? `<table style=\"width:100%; font-size:14px; border-collapse:collapse;\">${itemsHtml}</table>` : ''}
              <p style="margin-top:12px; font-weight:600;">Total: <span>${fmt(amountCents)}</span></p>
            </div>`;
          const html = baseTemplate({ content, clinicName });
          await sendEmail({ to: toEmail, subject: `[${clinicName}] Pagamento confirmado`, html }).catch(() => {});
          // Best-effort backfill of PaymentTransaction and Payment Customer/Method when missing
          try {
            // If no txRow was found earlier, attempt to insert one now
            const alreadyHadTx = !!txRow?.id;
            // Infer some fields from event
            const eventAmountCents = Number(
              event?.data?.amount
              || event?.data?.order?.amount
              || event?.order?.amount
              || event?.data?.charge?.amount
              || event?.data?.charges?.[0]?.amount
              || 0
            ) || 0;
            // Re-resolve product/clinic/doctor in case not present
            let backfillProductId: string | null = metaProductId || txRow?.productId || null;
            if (!backfillProductId) {
              try {
                const lineItems = event?.data?.items || event?.data?.order?.items || event?.order?.items || [];
                const code = Array.isArray(lineItems) && lineItems[0]?.code ? String(lineItems[0].code) : null;
                if (code) {
                  const prod = await prisma.product.findFirst({ where: { OR: [ { id: code }, { sku: code } ] }, select: { id: true } } as any);
                  backfillProductId = prod?.id || null;
                }
              } catch {}
            }
            let backfillClinicId: string | null = clinicId;
            let backfillDoctorId: string | null = null;
            if (!backfillDoctorId && backfillProductId) {
              try {
                const prod = await prisma.product.findUnique({ where: { id: String(backfillProductId) }, select: { doctorId: true, clinicId: true } });
                backfillDoctorId = prod?.doctorId || null;
                if (!backfillClinicId && prod?.clinicId) backfillClinicId = prod.clinicId;
              } catch {}
            }
            if (!backfillDoctorId && backfillClinicId) {
              try {
                const c = await prisma.clinic.findUnique({ where: { id: backfillClinicId }, select: { ownerId: true } });
                backfillDoctorId = c?.ownerId || null;
              } catch {}
            }
            // Resolve patientProfile by buyer email when possible
            let backfillProfileId: string | null = txRow?.patientProfileId || null;
            if (!backfillProfileId && (payloadCustomerEmail || metaBuyerEmail) && backfillDoctorId) {
              try {
                const u = await prisma.user.findUnique({ where: { email: String(payloadCustomerEmail || metaBuyerEmail) }, select: { id: true } });
                if (u?.id) {
                  const prof = await prisma.patientProfile.findUnique({ where: { doctorId_userId: { doctorId: String(backfillDoctorId), userId: String(u.id) } }, select: { id: true } } as any);
                  backfillProfileId = prof?.id || null;
                }
              } catch {}
            }
            // Insert/Update PaymentTransaction if missing (defensive against duplicates)
            if (!alreadyHadTx && backfillDoctorId && backfillProfileId) {
              try {
                // 1) Try to reconcile with a recent 'processing' row lacking order/charge
                try {
                  const updatedRows = await prisma.$queryRawUnsafe<any[]>(
                    `WITH candidate AS (
                       SELECT id FROM payment_transactions
                        WHERE provider = 'pagarme'
                          AND clinic_id = $1
                          AND patient_profile_id = $2
                          AND ($3::text IS NULL OR product_id = $3)
                          AND status = 'processing'
                          AND provider_order_id IS NULL
                          AND created_at >= NOW() - INTERVAL '45 minutes'
                        ORDER BY created_at DESC
                        LIMIT 1
                    )
                    UPDATE payment_transactions pt
                       SET provider_order_id = COALESCE(pt.provider_order_id, $4),
                           provider_charge_id = COALESCE(pt.provider_charge_id, $5),
                           status = 'paid',
                           raw_payload = $6::jsonb
                      FROM candidate c
                     WHERE pt.id = c.id
                 RETURNING pt.id`,
                    backfillClinicId ? String(backfillClinicId) : null,
                    String(backfillProfileId),
                    backfillProductId ? String(backfillProductId) : null,
                    orderId ? String(orderId) : null,
                    chargeId ? String(chargeId) : null,
                    JSON.stringify(event)
                  ).catch(() => []);
                  if (updatedRows && updatedRows.length > 0) {
                    try { console.log('[pagarme][webhook] reconciled into existing processing payment_transaction', { id: updatedRows[0]?.id }); } catch {}
                    // We reconciled; skip insert path entirely
                    throw new Error('__RECONCILED__');
                  }
                } catch (reconErr: any) {
                  if (reconErr?.message === '__RECONCILED__') {
                    // short-circuit outer try to skip insert attempt
                    throw reconErr;
                  }
                }
                // First, try to find any existing row by order or charge via raw SQL
                const existsRows = await prisma.$queryRawUnsafe<any[]>(
                  `SELECT id FROM payment_transactions
                     WHERE provider = 'pagarme'
                       AND (provider_order_id = $1 OR provider_charge_id = $2)
                     LIMIT 1`,
                  orderId ? String(orderId) : null,
                  chargeId ? String(chargeId) : null
                ).catch(() => []);
                const exists = !!(existsRows && existsRows[0]?.id);
                if (!exists) {
                  const txId = crypto.randomUUID();
                  // Try to use a conflict target if DB has unique indexes; fallback will still work without them
                  await prisma.$executeRawUnsafe(
                    `INSERT INTO payment_transactions (id, provider, provider_order_id, provider_charge_id, doctor_id, patient_profile_id, clinic_id, product_id, amount_cents, clinic_amount_cents, platform_amount_cents, platform_fee_cents, currency, installments, payment_method_type, status, raw_payload, routed_provider)
                     VALUES ($1, 'pagarme', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'BRL', $12, $13, 'paid', $14::jsonb, 'KRXPAY')`,
                    txId,
                    orderId ? String(orderId) : null,
                    chargeId ? String(chargeId) : null,
                    String(backfillDoctorId),
                    String(backfillProfileId),
                    backfillClinicId ? String(backfillClinicId) : null,
                    backfillProductId ? String(backfillProductId) : null,
                    eventAmountCents,
                    splitClinicAmount,
                    splitPlatformAmount,
                    splitPlatformFeeCents,
                    installmentsVal || 1,
                    paymentMethodType || 'credit_card',
                    JSON.stringify(event)
                  );
                  try { console.log('[pagarme][webhook] backfilled payment_transactions'); } catch {}
                  
                  // Emit webhook: payment.transaction.created (backfill case)
                  try {
                    await onPaymentTransactionCreated(txId);
                    console.log('[pagarme][webhook] ✅ webhook emitted for backfilled transaction', { txId, orderId, chargeId });
                  } catch (e) {
                    console.warn('[pagarme][webhook] ⚠️ webhook emission failed (non-blocking)', e instanceof Error ? e.message : e);
                  }
                } else {
                  try { console.log('[pagarme][webhook] skip backfill; transaction already exists for order/charge'); } catch {}
                }
              } catch (e) {
                if (e instanceof Error && e.message === '__RECONCILED__') {
                  // Already handled via reconciliation; do nothing
                } else {
                  console.warn('[pagarme][webhook] backfill payment_transactions failed:', e instanceof Error ? e.message : e);
                }
              }
            }
            // Mirror to Business Client data model (unified tables only)
            try {
              const pgCustomerId = event?.data?.customer?.id || event?.customer?.id || null;
              const ch = event?.data?.charge || (Array.isArray(event?.data?.charges) ? event?.data?.charges?.[0] : null) || event?.charge || null;
              const txo = ch?.last_transaction || event?.data?.transaction || null;
              const cardObj = txo?.card || ch?.card || null;
              const pgCardId = cardObj?.id || null;
              
              // MIRROR to Business Client tables (customer_providers, customer_payment_methods, payment_transactions.customer_id)
              try {
                const buyerEmailStr = String(event?.data?.customer?.email || orderMeta?.buyerEmail || '');
                let unifiedCustomerId: string | null = null;
                let merchantRowId: string | null = null;
                
                if (buyerEmailStr && backfillClinicId) {
                  const merchantRow = await prisma.merchant.findFirst({ where: { clinicId: String(backfillClinicId) }, select: { id: true } });
                  if (merchantRow?.id) {
                    merchantRowId = merchantRow.id;
                    const cust = await prisma.customer.findFirst({ where: { merchantId: String(merchantRow.id), email: buyerEmailStr }, select: { id: true } });
                    unifiedCustomerId = cust?.id || null;
                  }
                }
                
                if (unifiedCustomerId && merchantRowId) {
                  // Upsert customer_providers
                  if (pgCustomerId) {
                    const rowsCP = await prisma.$queryRawUnsafe<any[]>(
                      `SELECT id FROM customer_providers WHERE customer_id = $1 AND provider = 'PAGARME' AND account_id = $2 LIMIT 1`,
                      String(unifiedCustomerId), String(merchantRowId)
                    ).catch(() => []);
                    
                    if (rowsCP && rowsCP.length > 0) {
                      await prisma.$executeRawUnsafe(
                        `UPDATE customer_providers SET provider_customer_id = $2, updated_at = NOW() WHERE id = $1`,
                        String(rowsCP[0].id), String(pgCustomerId)
                      );
                    } else {
                      await prisma.$executeRawUnsafe(
                        `INSERT INTO customer_providers (id, customer_id, provider, account_id, provider_customer_id, created_at, updated_at)
                         VALUES (gen_random_uuid(), $1, 'PAGARME'::"PaymentProvider", $2, $3, NOW(), NOW())`,
                        String(unifiedCustomerId), String(merchantRowId), String(pgCustomerId)
                      );
                    }
                  }
                  
                  // Upsert customer_payment_methods
                  if (pgCardId && cardObj) {
                    const brand = cardObj?.brand || null;
                    const last4 = cardObj?.last_four_digits || cardObj?.last4 || null;
                    const expMonth = cardObj?.exp_month || null;
                    const expYear = cardObj?.exp_year || null;
                    
                    const rowsPM = await prisma.$queryRawUnsafe<any[]>(
                      `SELECT id FROM customer_payment_methods 
                       WHERE customer_id = $1 AND provider = 'PAGARME' AND account_id = $2 AND last4 = $3 
                       ORDER BY created_at DESC LIMIT 1`,
                      String(unifiedCustomerId), String(merchantRowId), String(last4 || '')
                    ).catch(() => []);
                    
                    if (rowsPM && rowsPM.length > 0) {
                      await prisma.$executeRawUnsafe(
                        `UPDATE customer_payment_methods SET brand = $2, exp_month = $3, exp_year = $4, status = 'ACTIVE', updated_at = NOW() WHERE id = $1`,
                        String(rowsPM[0].id), brand, expMonth, expYear
                      );
                    } else {
                      await prisma.$executeRawUnsafe(
                        `INSERT INTO customer_payment_methods (id, customer_id, provider, account_id, brand, last4, exp_month, exp_year, status, is_default, created_at, updated_at)
                         VALUES (gen_random_uuid(), $1, 'PAGARME'::"PaymentProvider", $2, $3, $4, $5, $6, 'ACTIVE', true, NOW(), NOW())`,
                        String(unifiedCustomerId), String(merchantRowId), brand, last4, expMonth, expYear
                      );
                    }
                  }
                  
                  // Link payment_transactions to customer_id
                  if (orderId) {
                    await prisma.$executeRawUnsafe(
                      `UPDATE payment_transactions SET customer_id = $2, updated_at = NOW() 
                       WHERE provider = 'pagarme' AND provider_order_id = $1 AND customer_id IS NULL`,
                      String(orderId), String(unifiedCustomerId)
                    );
                  }
                  
                  try { console.log('[pagarme][webhook] ✅ Mirrored to Business Client tables', { customerId: unifiedCustomerId, orderId }); } catch {}
                }
              } catch (e) {
                console.warn('[pagarme][webhook] mirror to business tables failed (non-fatal):', e instanceof Error ? e.message : e);
              }
            } catch (e) {
              console.warn('[pagarme][webhook] backfill PC/PM failed:', e instanceof Error ? e.message : e);
            }
          } catch (e) {
            console.warn('[pagarme][webhook] paid backfill block failed:', e instanceof Error ? e.message : e);
          }
          // Create Purchase for paid transactions (PIX or card async approval)
          try {
            const pid = metaProductId || txRow?.productId || null;
            const oid = orderId ? String(orderId) : null;
            const subMonthsMeta = (() => {
              const raw = (orderMeta?.subscriptionPeriodMonths ?? event?.data?.metadata?.subscriptionPeriodMonths ?? null);
              const n = Number(raw);
              return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
            })();
            const validUntilDate = (() => {
              if (!subMonthsMeta) return null;
              const d = new Date();
              d.setMonth(d.getMonth() + subMonthsMeta);
              return d;
            })();
            if (pid && oid) {
              const existing = await prisma.purchase.findFirst({ where: { externalIdempotencyKey: oid } });
              if (!existing) {
                // Resolve doctorId and clinicId from product/clinic
                let doctorId: string | null = null;
                let resolvedClinicId: string | null = clinicId;
                try {
                  const prod = await prisma.product.findUnique({ where: { id: String(pid) }, select: { doctorId: true, clinicId: true } });
                  doctorId = prod?.doctorId || null;
                  if (!resolvedClinicId && prod?.clinicId) resolvedClinicId = prod.clinicId;
                } catch {}
                if (!doctorId && resolvedClinicId) {
                  try {
                    const c = await prisma.clinic.findUnique({ where: { id: resolvedClinicId }, select: { ownerId: true } });
                    doctorId = c?.ownerId || null;
                  } catch {}
                }
                // Resolve patient userId from patientProfile
                let userId: string | null = null;
                if (txRow?.patientProfileId) {
                  try {
                    const prof = await prisma.patientProfile.findUnique({ where: { id: txRow.patientProfileId }, select: { userId: true } } as any);
                    userId = prof?.userId || null;
                  } catch {}
                }
                // If still no userId, try to find/create by buyer email and upsert patient profile
                try {
                  if (!userId && resolvedClinicId && doctorId) {
                    const buyerEmail = payloadCustomerEmail || metaBuyerEmail || null;
                    if (buyerEmail) {
                      const existingUser = await prisma.user.findUnique({ where: { email: String(buyerEmail) }, select: { id: true } });
                      if (existingUser?.id) {
                        userId = existingUser.id;
                      } else {
                        const newUser = await prisma.user.create({
                          data: {
                            id: crypto.randomUUID(),
                            email: String(buyerEmail),
                            name: userName || null,
                            role: 'PATIENT',
                            is_active: true,
                          } as any,
                          select: { id: true }
                        } as any);
                        userId = newUser.id;
                      }
                      // Ensure per-doctor PatientProfile exists for this clinic's doctor
                      if (userId && doctorId) {
                        await prisma.patientProfile.upsert({
                          where: { doctorId_userId: { doctorId: String(doctorId), userId: String(userId) } },
                          create: { doctorId: String(doctorId), userId: String(userId), name: userName || null, isActive: true },
                          update: { isActive: true },
                        } as any);
                      }
                    }
                  }
                } catch (e) {
                  console.warn('[pagarme][webhook] ensure user/profile failed:', e instanceof Error ? e.message : e);
                }
                if (doctorId && userId) {
                  const priceCents = Number(txRow?.amountCents || 0);
                  const price = priceCents / 100;
                  const notes = (subMonthsMeta && validUntilDate)
                    ? `Subscription access: ${subMonthsMeta} months; valid_until=${validUntilDate.toISOString().slice(0,10)}`
                    : 'Created via Pagar.me webhook (paid)';
                  await prisma.purchase.create({
                    data: {
                      userId: String(userId),
                      doctorId: String(doctorId),
                      productId: String(pid),
                      quantity: 1,
                      unitPrice: price as any,
                      totalPrice: price as any,
                      pointsAwarded: 0 as any,
                      status: 'COMPLETED',
                      externalIdempotencyKey: oid,
                      notes
                    }
                  } as any);
                }
              }
            }
          } catch (e) {
            console.warn('[pagarme][webhook] create Purchase failed:', e instanceof Error ? e.message : e);
          }
        } else if (isCanceled) {
          const content = `
            <div style="font-size:16px; color:#111;">
              <p style="font-size:20px; font-weight:600; margin:0 0 12px;">Pagamento não concluído</p>
              <p style="margin:0 0 16px;">${customerNameText} sua tentativa de pagamento foi cancelada ou não foi concluída.</p>
              <p style="margin-top:12px;">Você pode tentar novamente em nosso site. Se precisar de ajuda, responda este e-mail.</p>
            </div>`;
          const html = baseTemplate({ content, clinicName });
          await sendEmail({ to: toEmail, subject: `[${clinicName}] Pagamento cancelado`, html }).catch(() => {});
        }
      } catch (e) {
        console.warn('[pagarme][webhook][email] send failed (non-fatal):', e instanceof Error ? e.message : e);
      }
      // Update Purchase status for canceled/failed/refunded events (idempotent)
      try {
        const oid = orderId ? String(orderId) : null;
        if (oid) {
          const lowerType = (type || '').toLowerCase();
          let newStatus: 'CANCELED' | 'REFUNDED' | null = null;
          if (lowerType.includes('refunded')) newStatus = 'REFUNDED';
          else if (lowerType.includes('canceled') || lowerType.includes('cancelled') || lowerType.includes('payment_failed') || lowerType.includes('failed')) newStatus = 'CANCELED';
          if (newStatus) {
            await prisma.purchase.updateMany({
              where: { externalIdempotencyKey: oid },
              data: { status: newStatus }
            } as any);
            try { console.log('[pagarme][webhook] updated purchase status', { oid, newStatus }); } catch {}
          }
        }
      } catch (e) {
        console.warn('[pagarme][webhook] purchase status update failed:', e instanceof Error ? e.message : e);
      }
    } catch (e) {
      console.warn('[pagarme][webhook] transaction update skipped:', e instanceof Error ? e.message : e);
    }

    return NextResponse.json({ received: true });
  } catch (e) {
    console.error('[pagarme][webhook] processing error', e);
    
    // CRITICAL: Mesmo com erro, SEMPRE retorna 200 para evitar reenvios duplicados
    // Marca webhook para retry via worker
    if (hookId) {
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE webhook_events 
           SET next_retry_at = NOW(), 
               processing_error = $2,
               is_retryable = true
           WHERE provider = 'pagarme' AND hook_id = $1`,
          String(hookId),
          String(e instanceof Error ? e.message : 'Unknown error').substring(0, 5000)
        );
      } catch {}
    }
    
    return NextResponse.json({ received: true, will_retry: true }, { status: 200 });
  }
}
