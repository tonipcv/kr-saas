import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createRecurringPayment } from '@/lib/linaob';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      consentId,
      contractId,
      linkId,
      amountCents,
      metadata,
      // Optional context for PaymentTransaction association
      doctorId,
      patientProfileId,
      clinicId,
      productId,
    } = body || {};

    if (!consentId && !contractId && !linkId) {
      return NextResponse.json({ error: 'consentId, contractId ou linkId é obrigatório' }, { status: 400 });
    }
    if (!amountCents || Number(amountCents) <= 0) {
      return NextResponse.json({ error: 'amountCents inválido' }, { status: 400 });
    }

    const payload: any = {
      consentId,
      contractId,
      linkId,
      amount: Number(amountCents),
      metadata: metadata || {},
    };

    const res = await createRecurringPayment(payload);

    const recurringPaymentId: string | null = res?.id || res?.recurringPaymentId || null;
    const status: string = String(res?.status || 'processing').toLowerCase();

    // Insert PaymentTransaction (provider = LINA_OB)
    const txId = crypto.randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO payment_transactions (id, provider, provider_order_id, doctor_id, patient_profile_id, clinic_id, product_id, amount_cents, currency, installments, payment_method_type, status, raw_payload)
       VALUES ($1, 'LINA_OB', $2, $3, $4, $5, $6, $7, 'BRL', $8, $9, $10, $11::jsonb)
       ON CONFLICT DO NOTHING`,
      txId,
      recurringPaymentId ? String(recurringPaymentId) : null,
      doctorId ? String(doctorId) : null,
      patientProfileId ? String(patientProfileId) : null,
      clinicId ? String(clinicId) : null,
      productId ? String(productId) : null,
      Number(amountCents),
      1,
      'pix',
      status === 'paid' ? 'paid' : (status === 'failed' || status === 'canceled' ? status : 'processing'),
      JSON.stringify({ request: payload, response: res })
    );

    return NextResponse.json({ ok: true, recurringPaymentId, providerResponse: res });
  } catch (e: any) {
    const status = Number(e?.status) || 500;
    return NextResponse.json({ ok: false, error: e?.message || 'Erro ao criar pagamento recorrente', response: e?.responseJson || e?.responseText }, { status });
  }
}
