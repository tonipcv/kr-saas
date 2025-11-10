import { NextRequest, NextResponse } from 'next/server';
import { createJSRConsent } from '@/lib/linaob';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { enrollmentId, organisationId: bodyOrgId, authorisationServerId: bodyAuthId, payment } = body || {};

    // Resolve IDs similarly to /api/open-finance/enrollments
    let organisationId = bodyOrgId || process.env.LINAOB_ORGANISATION_ID;
    let authorisationServerId = bodyAuthId || process.env.LINAOB_AUTH_SERVER_ID;
    if (process.env.LINAOB_FORCE_ENV_IDS === 'true' && process.env.LINAOB_ORGANISATION_ID && process.env.LINAOB_AUTH_SERVER_ID) {
      organisationId = process.env.LINAOB_ORGANISATION_ID;
      authorisationServerId = process.env.LINAOB_AUTH_SERVER_ID;
      console.warn('[jsr.consents] Forçando IDs via LINAOB_FORCE_ENV_IDS', { organisationId, authorisationServerId });
    }

    console.log('[jsr.consents] Criando consent JSR', {
      enrollmentId,
      organisationId,
      authorisationServerId,
      paymentValue: payment?.value,
    });

    const payload = {
      payment: {
        details: payment?.details,
        externalId: payment?.externalId,
        value: payment?.value,
        cpfCnpj: payment?.cpfCnpj,
        redirectUri: process.env.LINAOB_REDIRECT_URI,
        creditor: payment?.creditor,
      },
      organisationId,
      authorisationServerId,
      enrollmentId,
      fidoSignOptions: { platform: 'BROWSER' },
    };

    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || undefined;
    const subTenantId = process.env.LINAOB_SUBTENANT_ID || 'lina';
    const data = await createJSRConsent(payload, { clientIp, subTenantId });

    console.log('[jsr.consents] Resposta do provider:', {
      status: 200,
      ok: true,
      hasData: !!data,
    });

    const pr = data?.data || data || {};
    return NextResponse.json({
      ok: true,
      paymentRequestId: pr.paymentRequestId || pr.payment_request_id || pr.id,
      consentId: pr.consentId || pr.consent_id,
      publicKey: pr.publicKey || pr.public_key || pr.PublicKey,
    });
  } catch (e: any) {
    console.error('[jsr.consents] Erro:', e);
    return NextResponse.json({ error: e?.message || 'Erro ao criar consent' }, { status: 500 });
  }
}
