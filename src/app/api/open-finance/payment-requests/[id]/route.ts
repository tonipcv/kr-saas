import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getPaymentRequest } from '@/lib/linaob';
import crypto from 'crypto';

function mapProviderStatus(s: string | null | undefined): 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED' {
  const v = String(s || '').toUpperCase();
  const statusMap: Record<string, 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED'> = {
    CREATED: 'PENDING',
    PENDING: 'PENDING',
    ACCEPTED: 'PROCESSING',
    PROCESSING: 'PROCESSING',
    SETTLED: 'COMPLETED',
    COMPLETED: 'COMPLETED',
    PAID: 'COMPLETED',
    REJECTED: 'REJECTED',
    FAILED: 'REJECTED',
    CANCELLED: 'CANCELLED',
    CANCELED: 'CANCELLED',
    EXPIRED: 'EXPIRED',
  };
  return statusMap[v] || 'PENDING';
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: paymentLinkId } = await params;
  if (!paymentLinkId) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });
  const correlationId = crypto.randomUUID();

  try {
    const t0 = Date.now();
    console.log('[of.payment-status][start]', { correlationId, paymentLinkId });
    // Best-effort fetch local record
    let local: any = null;
    try {
      const rows: any[] = await prisma.$queryRawUnsafe(`SELECT * FROM openbanking_payments WHERE payment_link_id = $1 LIMIT 1`, String(paymentLinkId));
      local = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    } catch {}

    const fwd = (req.headers as any).get?.('x-forwarded-for') || '';
    const clientIp = typeof fwd === 'string' ? fwd.split(',')[0].trim() : undefined;
    const subTenantId = process.env.LINAOB_SUBTENANT_ID || 'lina';

    const res = await getPaymentRequest(paymentLinkId, { subTenantId, clientIp });

    const status = mapProviderStatus(res?.status || res?.data?.status);
    const transactionId: string | null = res?.transactionId || res?.data?.transactionId || res?.paymentId || res?.id || null;
    const amountStr: string | null = res?.amount || res?.data?.amount || null;
    const currency: string | null = res?.currency || res?.data?.currency || null;
    const completedAt: string | null = res?.completedAt || res?.data?.completedAt || null;

    const amountCents = amountStr ? Math.round(Number(amountStr) * 100) : (local?.amount_cents || 0);

    // Update DB status where possible
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE openbanking_payments
           SET status = $2::"PaymentStatusOB",
               transaction_id = COALESCE($3, transaction_id),
               completed_at = CASE WHEN $2::text = 'COMPLETED' THEN COALESCE($4, now()) ELSE completed_at END,
               amount_cents = COALESCE($5, amount_cents),
               currency = COALESCE($6, currency),
               updated_at = now()
         WHERE payment_link_id = $1`,
        String(paymentLinkId),
        status,
        transactionId ? String(transactionId) : null,
        completedAt ? new Date(completedAt) : null,
        Number.isFinite(amountCents) ? Number(amountCents) : null,
        currency ? String(currency) : null,
      );
    } catch (e) {
      console.warn('[open-finance][payment-status] persist warning:', (e as any)?.message);
    }

    const latencyMs = Date.now() - t0;
    console.log('[of.payment-status][success]', { correlationId, paymentLinkId, status, transactionId, latencyMs });
    return NextResponse.json({
      paymentLinkId,
      status,
      amount: amountCents,
      currency: currency || local?.currency || 'BRL',
      transactionId: transactionId || local?.transaction_id || null,
      completedAt: completedAt || (local?.completed_at ? new Date(local.completed_at).toISOString() : null),
      correlationId,
    });
  } catch (e: any) {
    console.error('[of.payment-status][error]', { correlationId, message: e?.message, paymentLinkId });
    return NextResponse.json({ error: e?.message || 'Erro ao consultar status', correlationId }, { status: e?.status || 500 });
  }
}
