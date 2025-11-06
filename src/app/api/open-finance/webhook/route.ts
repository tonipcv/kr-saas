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
    return NextResponse.json({ ok: false, error: e?.message || 'Webhook handler error' }, { status: 500 });
  }
}
