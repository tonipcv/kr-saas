import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { openFinancePersistEnabled } from '@/lib/config';

// Persists Open Banking consent metadata idempotently (ON CONFLICT consent_id)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const {
      consentId,
      enrollmentId,
      amountCents,
      currency,
      creditorName,
      creditorCpfCnpj,
      productId,
      clinicId,
      status,
      providerResponse,
    } = body || {};

    if (!consentId) return NextResponse.json({ error: 'consentId required' }, { status: 400 });

    if (!openFinancePersistEnabled) {
      return NextResponse.json({ ok: true, skipped: true, consentId }, { status: 200 });
    }

    const providerJson = providerResponse ? JSON.stringify(providerResponse) : null;

    await prisma.$executeRawUnsafe(
      `INSERT INTO openbanking_consents (
         id, consent_id, enrollment_id, amount_cents, currency,
         creditor_name, creditor_cpf_cnpj, product_id, clinic_id, status, provider_response_json
       ) VALUES (
         gen_random_uuid(), $1, $2, $3, $4,
         $5, $6, $7, $8, COALESCE($9, 'AWAITING_AUTHORISATION'), $10::jsonb
       )
       ON CONFLICT (consent_id) DO UPDATE SET
         enrollment_id = COALESCE(EXCLUDED.enrollment_id, openbanking_consents.enrollment_id),
         amount_cents = COALESCE(EXCLUDED.amount_cents, openbanking_consents.amount_cents),
         currency = COALESCE(EXCLUDED.currency, openbanking_consents.currency),
         creditor_name = COALESCE(EXCLUDED.creditor_name, openbanking_consents.creditor_name),
         creditor_cpf_cnpj = COALESCE(EXCLUDED.creditor_cpf_cnpj, openbanking_consents.creditor_cpf_cnpj),
         product_id = COALESCE(EXCLUDED.product_id, openbanking_consents.product_id),
         clinic_id = COALESCE(EXCLUDED.clinic_id, openbanking_consents.clinic_id),
         status = COALESCE(EXCLUDED.status, openbanking_consents.status),
         provider_response_json = COALESCE(EXCLUDED.provider_response_json, openbanking_consents.provider_response_json),
         updated_at = now()`,
      consentId,
      enrollmentId ?? null,
      typeof amountCents === 'number' ? amountCents : null,
      currency ?? null,
      creditorName ?? null,
      creditorCpfCnpj ?? null,
      productId ?? null,
      clinicId ?? null,
      status ?? null,
      providerJson,
    );

    return NextResponse.json({ ok: true, consentId }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'unexpected error' }, { status: 500 });
  }
}
