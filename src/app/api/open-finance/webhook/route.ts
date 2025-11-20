import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function verifySecret(req: Request) {
  const configured = process.env.OPEN_FINANCE_WEBHOOK_SECRET || '';
  if (!configured) return true; // allow in dev if not set
  const got = req.headers.get('x-open-finance-signature') || req.headers.get('x-webhook-secret') || '';
  return got && got === configured;
}

export async function GET() {
  return NextResponse.json({ ok: true, method: 'GET', note: 'Use POST for Open Finance webhooks' });
}

export async function POST(req: Request) {
  try {
    if (!verifySecret(req)) return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
    const event = await req.json().catch(() => ({}));
    const type: string = String(event?.type || event?.event || '').toLowerCase();
    const eventId: string = String(event?.id || event?.data?.id || `obwh_${Date.now()}`);

    // CRITICAL: Persist webhook BEFORE processing (idempotent)
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO webhook_events (provider, hook_id, provider_event_id, type, status, raw, processed, retry_count, max_retries, is_retryable)
         VALUES ('openfinance', $1, $1, $2, NULL, $3::jsonb, false, 0, 3, true)
         ON CONFLICT (provider, hook_id) DO NOTHING`,
        eventId,
        type,
        JSON.stringify(event)
      );
    } catch {}

    // Update OpenFinanceLink status on enrollment events
    if (type.includes('enrollment') || type.includes('enrol')) {
      const enrollmentId: string | null = event?.data?.enrollmentId || event?.enrollmentId || event?.id || null;
      const statusRaw: string = String(event?.data?.status || event?.status || '').toUpperCase();
      if (enrollmentId) {
        await prisma.openFinanceLink.updateMany({
          where: { enrollmentId: String(enrollmentId) },
          data: { status: statusRaw || 'PENDING', updatedAt: new Date() },
        });
      }
    }

    // Update OpenFinanceConsent and PaymentTransaction on recurring payments/consent events
    if (type.includes('recurring')) {
      const consentId: string | null = event?.data?.consentId || event?.consentId || null;
      const contractId: string | null = event?.data?.contractId || event?.contractId || null;
      const statusRaw: string = String(event?.data?.status || event?.status || '').toLowerCase();
      if (consentId || contractId) {
        await prisma.openFinanceConsent.updateMany({
          where: { OR: [ consentId ? { consentId: String(consentId) } : undefined, contractId ? { contractId: String(contractId) } : undefined ].filter(Boolean) as any },
          data: { status: statusRaw.toUpperCase() || 'ACTIVE', updatedAt: new Date() },
        });
      }

      // If webhook contains a recurring payment id, try to reconcile a PaymentTransaction
      const recurringPaymentId: string | null = event?.data?.id || event?.id || null;
      const mappedStatus = (() => {
        if (statusRaw === 'paid' || statusRaw === 'approved' || statusRaw === 'captured') return 'paid';
        if (statusRaw === 'canceled' || statusRaw === 'cancelled') return 'canceled';
        if (statusRaw === 'failed' || statusRaw === 'refused') return 'failed';
        if (statusRaw === 'processing' || statusRaw === 'pending') return statusRaw;
        return undefined;
      })();
      if (recurringPaymentId && mappedStatus) {
        try {
          await prisma.$executeRawUnsafe(
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
                   status_v2 = CASE
                                 WHEN ($2::text) = 'paid' THEN 'SUCCEEDED'::"PaymentStatus"
                                 WHEN ($2::text) = 'processing' THEN 'PROCESSING'::"PaymentStatus"
                                 WHEN ($2::text) = 'pending' THEN 'PROCESSING'::"PaymentStatus"
                                 WHEN ($2::text) = 'failed' THEN 'FAILED'::"PaymentStatus"
                                 WHEN ($2::text) = 'canceled' THEN 'CANCELED'::"PaymentStatus"
                                 WHEN ($2::text) = 'refunded' THEN 'REFUNDED'::"PaymentStatus"
                                 ELSE status_v2
                               END,
                   provider_v2 = COALESCE(provider_v2, 'OPENFINANCE'::"PaymentProvider"),
                   raw_payload = $3::jsonb
             WHERE provider = 'LINA_OB' AND provider_order_id = $1`,
            String(recurringPaymentId),
            mappedStatus,
            JSON.stringify(event)
          );
        } catch {}
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[open-finance][webhook] processing error', e);
    
    // CRITICAL: Mesmo com erro, SEMPRE retorna 200 para evitar reenvios duplicados
    // Marca webhook para retry via worker
    const eventId = String(e?.eventId || `obwh_${Date.now()}`);
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE webhook_events 
         SET next_retry_at = NOW(), 
             processing_error = $2,
             is_retryable = true
         WHERE provider = 'openfinance' AND hook_id = $1`,
        eventId,
        String(e?.message || 'Unknown error').substring(0, 5000)
      );
    } catch {}
    
    return NextResponse.json({ ok: true, will_retry: true }, { status: 200 });
  }
}
