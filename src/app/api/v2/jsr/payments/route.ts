import { NextResponse } from 'next/server';
import { createJSRPayment } from '@/lib/linaob';
import { prisma } from '@/lib/prisma';
import { openFinancePersistEnabled } from '@/lib/config';

export async function POST(req: Request) {
  try {
    const body: any = await req.json().catch(() => ({}));
    const { consentId, assertion, riskSignals } = body || {};

    if (!consentId || !assertion || !riskSignals) {
      return NextResponse.json({ error: 'Missing consentId, assertion or riskSignals' }, { status: 400 });
    }
    // Critical validation for WebAuthn assertion fields
    const hasAuthData = typeof assertion?.authenticatorData === 'string' && assertion.authenticatorData.length > 0;
    const hasClientData = typeof assertion?.clientDataJSON === 'string' && assertion.clientDataJSON.length > 0;
    const hasSignature = typeof assertion?.signature === 'string' && assertion.signature.length > 0;
    if (!hasAuthData || !hasClientData || !hasSignature) {
      return NextResponse.json({ error: 'Missing WebAuthn assertion fields (authenticatorData, clientDataJSON, signature)' }, { status: 400 });
    }

    const xfwd = (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim();
    const realIp = req.headers.get('x-real-ip') || '';
    let clientIp = xfwd || realIp || process.env.LINAOB_CLIENT_IP || '192.168.0.1';
    if (clientIp === '::1' || clientIp === '127.0.0.1' || clientIp === '::ffff:127.0.0.1') clientIp = process.env.LINAOB_CLIENT_IP || '192.168.0.1';

    const subTenantId = process.env.LINAOB_SUBTENANT_ID || 'lina';

    const payload = { consentId, assertion, riskSignals };

    const resp = await createJSRPayment(payload, { subTenantId, clientIp });

    // Persist openbanking_payments (additive-only, feature-flagged)
    try {
      if (openFinancePersistEnabled) {
        const providerPaymentId = (
          (resp && (resp.paymentId || resp.id)) ||
          (resp?.data && (resp.data.paymentId || resp.data.id)) ||
          null
        );
        const status = (
          (resp && resp.status) ||
          (resp?.data && resp.data.status) ||
          null
        );
        const transactionIdentification = (
          (resp && resp.transactionIdentification) ||
          (resp?.data && resp.data.transactionIdentification) ||
          null
        );
        const providerJson = resp ? JSON.stringify(resp) : null;

        // Try UPDATE by provider_payment_id first if available
        let updated = 0;
        if (providerPaymentId) {
          updated = await prisma.$executeRawUnsafe(
            `UPDATE openbanking_payments
               SET consent_id = COALESCE($2, consent_id),
                   transaction_identification = COALESCE($3, transaction_identification),
                   status = COALESCE($4, status),
                   executed_at = COALESCE($5, executed_at),
                   provider_response_json = COALESCE($6::jsonb, provider_response_json),
                   fido_assertion_json = COALESCE($7::jsonb, fido_assertion_json),
                   risk_signals_json = COALESCE($8::jsonb, risk_signals_json),
                   updated_at = now()
             WHERE provider_payment_id = $1`,
            String(providerPaymentId),
            consentId ?? null,
            transactionIdentification ?? null,
            status ?? null,
            new Date(),
            providerJson,
            JSON.stringify(assertion ?? null),
            JSON.stringify(riskSignals ?? null),
          );
        }

        if (!updated || Number(updated) === 0) {
          await prisma.$executeRawUnsafe(
            `INSERT INTO openbanking_payments (
               id, provider_payment_id, consent_id, transaction_identification,
               status, executed_at, provider_response_json,
               fido_assertion_json, risk_signals_json
             ) VALUES (
               gen_random_uuid(), $1, $2, $3,
               $4, $5, $6::jsonb,
               $7::jsonb, $8::jsonb
             )`,
            providerPaymentId ?? null,
            consentId ?? null,
            transactionIdentification ?? null,
            status ?? null,
            new Date(),
            providerJson,
            JSON.stringify(assertion ?? null),
            JSON.stringify(riskSignals ?? null),
          );
        }
      }
    } catch (e: any) {
      console.warn('[jsr.payments] persistence skipped', { error: String(e?.message || e) });
    }

    return NextResponse.json(resp);
  } catch (e: any) {
    const status = Number(e?.status) || 500;
    return NextResponse.json({ error: String(e?.message || e), upstream: e?.responseJson || e?.responseText || null }, { status });
  }
}
