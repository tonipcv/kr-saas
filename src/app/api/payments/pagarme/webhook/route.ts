import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPagarmeWebhookSignature } from '@/lib/pagarme';
import { sendEmail } from '@/lib/email';
import { baseTemplate } from '@/email-templates/layouts/base';

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

    // Transaction events (orders/charges)
    try {
      // Normalize identifiers from various possible payload shapes
      const orderId = event?.data?.id
        || event?.data?.order?.id
        || event?.order?.id
        || event?.object?.id
        || event?.id
        || null;
      const chargeId = event?.data?.charge?.id
        || event?.data?.charges?.[0]?.id
        || event?.charge?.id
        || event?.object?.charge?.id
        || null;

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
      const mapped = statusMap[rawStatus] || (rawStatus ? rawStatus : undefined);
      try {
        console.log('[pagarme][webhook] normalized', { orderId, chargeId, rawStatus, mapped });
      } catch {}

      // Update by provider_order_id if we have it
      if (orderId) {
        try {
          await prisma.$executeRawUnsafe(
            `UPDATE payment_transactions
             SET status = COALESCE($2, status), raw_webhook = $3, updated_at = NOW()
             WHERE provider = 'pagarme' AND provider_order_id = $1`,
            String(orderId),
            mapped || null,
            JSON.stringify(event)
          );
          console.log('[pagarme][webhook] updated by orderId', { orderId, status: mapped || 'unchanged' });
        } catch (e) {
          console.warn('[pagarme][webhook] update by orderId failed', { orderId, err: e instanceof Error ? e.message : e });
        }
      }
      // Update by provider_charge_id if we have it (and set charge id on row)
      if (chargeId) {
        try {
          await prisma.$executeRawUnsafe(
            `UPDATE payment_transactions
             SET provider_charge_id = COALESCE(provider_charge_id, $1), status = COALESCE($2, status), raw_webhook = $3, updated_at = NOW()
             WHERE provider = 'pagarme' AND (provider_charge_id = $1 OR provider_order_id = $4)`,
            String(chargeId),
            mapped || null,
            JSON.stringify(event),
            orderId ? String(orderId) : null
          );
          console.log('[pagarme][webhook] updated by chargeId', { chargeId, orderId, status: mapped || 'unchanged' });
        } catch (e) {
          console.warn('[pagarme][webhook] update by chargeId failed', { chargeId, orderId, err: e instanceof Error ? e.message : e });
        }
      }

      // Email notifications (non-blocking). Only send on terminal states we care about.
      try {
        const isPaid = mapped === 'paid';
        const isCanceled = mapped === 'canceled' || mapped === 'failed' || mapped === 'refused';
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
          txRow = await prisma.paymentTransactions.findFirst({
            where: {
              provider: 'pagarme',
              OR: [
                orderId ? { providerOrderId: String(orderId) } : undefined,
                chargeId ? { providerChargeId: String(chargeId) } : undefined,
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
              select: { userId: true, name: true, patient: { select: { email: true, name: true } } },
            } as any);
            toEmail = prof?.patient?.email || null;
            userName = prof?.patient?.name || prof?.name || undefined;
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
    } catch (e) {
      console.warn('[pagarme][webhook] transaction update skipped:', e instanceof Error ? e.message : e);
    }

    return NextResponse.json({ received: true });
  } catch (e) {
    console.error('[pagarme][webhook] error', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
