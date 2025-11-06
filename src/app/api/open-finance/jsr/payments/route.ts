import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createJSRPayment } from '@/lib/linaob';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      paymentRequestId,
      enrollmentId,
      fidoAssertion,
      riskSignals,
      // Optional context to enrich PaymentTransaction
      doctorId,
      patientProfileId,
      clinicId,
      productId,
      amountCents,
      metadata,
    } = body || {};

    if (!paymentRequestId || !enrollmentId || !fidoAssertion) {
      return NextResponse.json({ ok: false, error: 'paymentRequestId, enrollmentId e fidoAssertion são obrigatórios' }, { status: 400 });
    }

    const fwd = (req.headers as any).get?.('x-forwarded-for') || '';
    const clientIp = typeof fwd === 'string' ? fwd.split(',')[0].trim() : undefined;
    const subTenantId = process.env.LINAOB_SUBTENANT_ID || 'lina';

    const payload: any = {
      paymentRequestId,
      enrollmentId,
      fidoAssertion,
      riskSignals,
    };

    const res = await createJSRPayment(payload, { subTenantId, clientIp });

    const recurringPaymentId: string | null = res?.id || res?.paymentId || res?.recurringPaymentId || null;
    const status: string = String(res?.status || 'processing').toLowerCase();
    const effectiveAmountCents = Number(amountCents ?? Math.round(Number(res?.amount || 0) * 100) || 0);

    const txId = crypto.randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO payment_transactions (id, provider, provider_order_id, doctor_id, patient_profile_id, clinic_id, product_id, amount_cents, currency, installments, payment_method_type, status, raw_payload)
       VALUES ($1, 'LINA_OB', $2, $3, $4, $5, $6, $7, 'BRL', 1, 'pix', $8, $9::jsonb)
       ON CONFLICT DO NOTHING`,
      txId,
      recurringPaymentId ? String(recurringPaymentId) : null,
      doctorId ? String(doctorId) : null,
      patientProfileId ? String(patientProfileId) : null,
      clinicId ? String(clinicId) : null,
      productId ? String(productId) : null,
      effectiveAmountCents,
      status === 'paid' ? 'paid' : (status === 'failed' || status === 'canceled' ? status : 'processing'),
      JSON.stringify({ request: payload, response: res, metadata: metadata || {} })
    );

    return NextResponse.json({ ok: true, paymentId: recurringPaymentId, providerResponse: res });
  } catch (e: any) {
    const status = Number(e?.status) || 500;
    return NextResponse.json({ ok: false, error: e?.message || 'Erro ao criar pagamento JSR', response: e?.responseJson || e?.responseText }, { status });
  }
}
