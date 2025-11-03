import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPagarmeWebhookSignature, pagarmeUpdateCharge } from '@/lib/pagarme';
import { pagarmeGetOrder } from '@/lib/pagarme';
import { sendEmail } from '@/lib/email';
import { baseTemplate } from '@/email-templates/layouts/base';
import crypto from 'crypto';

export async function GET() {
  // Health check endpoint; webhooks must POST
  return NextResponse.json({ ok: true, method: 'GET', note: 'Use POST for Pagar.me webhooks' });
}

export async function POST(req: Request) {
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
    try {
      // High-level audit log (no sensitive data)
      const basic = {
        type,
        has_signature: !!signature,
        received_at: new Date().toISOString(),
      };
      console.log('[pagarme][webhook] received', basic);
    } catch {}

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
        
        if (ENABLE_SPLIT && subscriptionIdInCharge && chargeIdForSplit && clinicIdInMeta && platformRecipientId) {
          // Lookup clinic merchant to get recipientId and splitPercent
          const merchant = await prisma.merchant.findFirst({
            where: { clinicId: String(clinicIdInMeta) },
            select: { recipientId: true, splitPercent: true },
          });
          
          if (merchant?.recipientId) {
            const totalCents = Number(chargeData?.amount || 0);
            if (totalCents > 0) {
              const clinicPercent = Math.max(0, Math.min(100, Number(merchant.splitPercent || 70)));
              const clinicAmount = Math.round(totalCents * clinicPercent / 100);
              const platformAmount = totalCents - clinicAmount;
              
              const splitRules = [
                {
                  recipient_id: String(platformRecipientId),
                  amount: platformAmount,
                  type: 'flat',
                  liable: true,
                  charge_processing_fee: true,
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
                clinicId: clinicIdInMeta,
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

      // Status mapping
      const rawStatus = (event?.data?.status
        || event?.data?.order?.status
        || event?.order?.status
        || event?.status
        || '').toString().toLowerCase();
      const statusMap: Record<string, string> = {
        paid: 'paid',
        approved: 'paid',
        captured: 'paid',
        canceled: 'canceled',
        cancelled: 'canceled',
        refused: 'refused',
        failed: 'failed',
        processing: 'processing',
        pending: 'pending',
      };
      const mappedRaw = statusMap[rawStatus] || (rawStatus ? rawStatus : undefined);
      const isPaidEvent = typeLower.includes('order.paid') || typeLower.includes('charge.paid');
      // Only allow 'paid' transition on explicit paid events; keep other terminals (canceled/failed/refunded)
      let mapped = (mappedRaw === 'paid' && !isPaidEvent) ? undefined : mappedRaw;
      // Do not persist 'active' into payment_transactions; it's an item lifecycle, not payment state
      if (mapped === 'active') mapped = undefined;
      try {
        console.log('[pagarme][webhook] normalized', { orderId, chargeId, rawStatus, mapped, type });
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

      // Update by provider_order_id; create if not exists (webhooks may arrive before checkout/create)
      if (orderId) {
        try {
          const result = await prisma.$executeRawUnsafe(
            `UPDATE payment_transactions
             SET status = CASE
                            WHEN ($2::text) IS NULL THEN status
                            WHEN status = 'pending' AND ($2::text) IN ('processing','paid','refunded','canceled','failed') THEN ($2::text)
                            WHEN status = 'processing' AND ($2::text) IN ('paid','refunded','canceled','failed') THEN ($2::text)
                            WHEN status = 'paid' AND ($2::text) IN ('refunded','canceled','failed') THEN ($2::text)
                            WHEN status = 'refunded' AND ($2::text) IN ('canceled','failed') THEN ($2::text)
                            WHEN status = 'canceled' AND ($2::text) = 'failed' THEN ($2::text)
                            ELSE status
                          END,
                 raw_payload = $3::jsonb,
                 payment_method_type = COALESCE($4::text, payment_method_type),
                 installments = COALESCE($5::int, installments)
             WHERE provider = 'pagarme' AND provider_order_id = $1`,
            String(orderId),
            mapped || null,
            JSON.stringify(event),
            paymentMethodType,
            installmentsVal
          );
          // If UPDATE affected 0 rows, INSERT a placeholder row for webhooks that arrive early
          if (result === 0 && mapped) {
            const webhookTxId = `wh_${orderId}_${Date.now()}`;
            try {
              await prisma.$executeRawUnsafe(
                `INSERT INTO payment_transactions (id, provider, provider_order_id, status, payment_method_type, installments, amount_cents, currency, raw_payload, created_at)
                 VALUES ($1, 'pagarme', $2, $3::text, $4::text, $5::int, 0, 'BRL', $6::jsonb, NOW())
                 ON CONFLICT DO NOTHING`,
                webhookTxId,
                String(orderId),
                mapped,
                paymentMethodType,
                installmentsVal,
                JSON.stringify(event)
              );
              console.log('[pagarme][webhook] created early row by orderId', { orderId, status: mapped });
            } catch {}
          } else {
            console.log('[pagarme][webhook] updated by orderId', { orderId, status: mapped || 'unchanged', affected: result });
          }
        } catch (e) {
          console.warn('[pagarme][webhook] update by orderId failed', { orderId, err: e instanceof Error ? e.message : e });
        }
      }
      // Update by provider_charge_id if we have it (and set charge id on row)
      if (chargeId) {
        try {
          await prisma.$executeRawUnsafe(
            `UPDATE payment_transactions
             SET provider_charge_id = COALESCE(provider_charge_id, $1),
                 status = CASE
                            WHEN ($2::text) IS NULL THEN status
                            WHEN status = 'pending' AND ($2::text) IN ('processing','paid','refunded','canceled','failed') THEN ($2::text)
                            WHEN status = 'processing' AND ($2::text) IN ('paid','refunded','canceled','failed') THEN ($2::text)
                            WHEN status = 'paid' AND ($2::text) IN ('refunded','canceled','failed') THEN ($2::text)
                            WHEN status = 'refunded' AND ($2::text) IN ('canceled','failed') THEN ($2::text)
                            WHEN status = 'canceled' AND ($2::text) = 'failed' THEN ($2::text)
                            ELSE status
                          END,
                 raw_payload = $3::jsonb,
                 payment_method_type = COALESCE($5::text, payment_method_type),
                 installments = COALESCE($6::int, installments)
             WHERE provider = 'pagarme' AND (provider_charge_id = $1 OR provider_order_id = $4)`,
            String(chargeId),
            mapped || null,
            JSON.stringify(event),
            orderId ? String(orderId) : null,
            paymentMethodType,
            installmentsVal
          );
          console.log('[pagarme][webhook] updated by chargeId', { chargeId, orderId, status: mapped || 'unchanged' });
        } catch (e) {
          console.warn('[pagarme][webhook] update by chargeId failed', { chargeId, orderId, err: e instanceof Error ? e.message : e });
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
            const p = await prisma.products.findUnique({ where: { id: String(pid) }, select: { name: true } });
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
                  const prod = await prisma.products.findFirst({ where: { OR: [ { id: code }, { sku: code } ] }, select: { id: true } } as any);
                  backfillProductId = prod?.id || null;
                }
              } catch {}
            }
            let backfillClinicId: string | null = clinicId;
            let backfillDoctorId: string | null = null;
            if (!backfillDoctorId && backfillProductId) {
              try {
                const prod = await prisma.products.findUnique({ where: { id: String(backfillProductId) }, select: { doctorId: true, clinicId: true } });
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
                    `INSERT INTO payment_transactions (id, provider, provider_order_id, provider_charge_id, doctor_id, patient_profile_id, clinic_id, product_id, amount_cents, currency, installments, payment_method_type, status, raw_payload)
                     VALUES ($1, 'pagarme', $2, $3, $4, $5, $6, $7, $8, 'BRL', $9, $10, 'paid', $11::jsonb)`,
                    txId,
                    orderId ? String(orderId) : null,
                    chargeId ? String(chargeId) : null,
                    String(backfillDoctorId),
                    String(backfillProfileId),
                    backfillClinicId ? String(backfillClinicId) : null,
                    backfillProductId ? String(backfillProductId) : null,
                    Number(eventAmountCents || 0),
                    installmentsVal,
                    paymentMethodType,
                    JSON.stringify(event)
                  );
                  try { console.log('[pagarme][webhook] backfilled payment_transactions'); } catch {}
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
            // Upsert PaymentCustomer/PaymentMethod if provider ids present
            try {
              const pgCustomerId = event?.data?.customer?.id || event?.customer?.id || null;
              const ch = event?.data?.charge || (Array.isArray(event?.data?.charges) ? event?.data?.charges?.[0] : null) || event?.charge || null;
              const txo = ch?.last_transaction || event?.data?.transaction || null;
              const cardObj = txo?.card || ch?.card || null;
              const pgCardId = cardObj?.id || null;
              if (pgCustomerId && backfillDoctorId && backfillProfileId) {
                const pcId = crypto.randomUUID();
                await prisma.$executeRawUnsafe(
                  `INSERT INTO payment_customers (id, provider, provider_customer_id, doctor_id, patient_profile_id, clinic_id)
                   VALUES ($1, 'pagarme', $2, $3, $4, $5)
                   ON CONFLICT (doctor_id, patient_profile_id, provider)
                   DO UPDATE SET provider_customer_id = EXCLUDED.provider_customer_id`,
                  pcId,
                  String(pgCustomerId),
                  String(backfillDoctorId),
                  String(backfillProfileId),
                  backfillClinicId ? String(backfillClinicId) : null
                );
              }
              if (pgCardId && backfillDoctorId && backfillProfileId) {
                // lookup payment_customer id we just ensured
                const rows = await prisma.$queryRawUnsafe<any[]>(
                  `SELECT id FROM payment_customers WHERE doctor_id = $1 AND patient_profile_id = $2 AND provider = 'pagarme' LIMIT 1`,
                  String(backfillDoctorId), String(backfillProfileId)
                ).catch(() => []);
                const paymentCustomerId = rows?.[0]?.id || null;
                if (paymentCustomerId) {
                  const pmId = crypto.randomUUID();
                  await prisma.$executeRawUnsafe(
                    `INSERT INTO payment_methods (id, payment_customer_id, provider_card_id, brand, last4, exp_month, exp_year, is_default, status)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE')
                     ON CONFLICT (payment_customer_id, provider_card_id)
                     DO UPDATE SET brand = EXCLUDED.brand, last4 = EXCLUDED.last4, exp_month = EXCLUDED.exp_month, exp_year = EXCLUDED.exp_year`,
                    pmId,
                    String(paymentCustomerId),
                    String(pgCardId),
                    cardObj?.brand || null,
                    cardObj?.last_four_digits || cardObj?.last4 || null,
                    cardObj?.exp_month || null,
                    cardObj?.exp_year || null,
                    true
                  );
                }
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
                  const prod = await prisma.products.findUnique({ where: { id: String(pid) }, select: { doctorId: true, clinicId: true } });
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
    console.error('[pagarme][webhook] error', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
