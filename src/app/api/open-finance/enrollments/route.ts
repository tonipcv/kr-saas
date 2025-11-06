import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createEnrollment } from '@/lib/linaob';

export async function POST(req: Request) {
  // Debug variables accessible in catch
  let payload: any = undefined;
  let debugClientIp: string | null = null;
  try {
    const body = await req.json();
    console.log('📥 [enrollments] Recebido body:', (() => { try { return JSON.stringify(body, null, 2); } catch { return '[unserializable]'; } })());
    const { userId: bodyUserId, clinicId, organisationId: bodyOrgId, authorisationServerId: bodyAuthServerId, returnUrl, context } = body || {};
    // Allow overriding redirectUri via env to match provider whitelist during tests
    const redirectOverride = process.env.LINAOB_REDIRECT_URI;
    const redirectUri = redirectOverride || body?.redirectUri || returnUrl;
    console.log('🔗 [enrollments] redirectUri:', { override: redirectOverride, fromBody: body?.redirectUri, returnUrl, final: redirectUri });
    const enrollment = body?.enrollment || {};
    const doc = (enrollment?.document || '').toString().replace(/\D/g, '');
    console.log('📄 [enrollments] Documento:', { original: enrollment?.document, cleaned: doc });
    // Fallbacks for provider-required IDs
    const organisationId = bodyOrgId || process.env.LINAOB_ORGANISATION_ID;
    const authorisationServerId = bodyAuthServerId || process.env.LINAOB_AUTH_SERVER_ID;
    console.log('🆔 [enrollments] IDs:', {
      organisationId,
      authorisationServerId,
      fromEnv: { org: process.env.LINAOB_ORGANISATION_ID, auth: process.env.LINAOB_AUTH_SERVER_ID },
    });
    // Minimal validation aligned to provider flow
    if (!redirectUri || !doc) {
      console.error('❌ [enrollments] Validação falhou:', { redirectUri, doc });
      return NextResponse.json({ error: 'redirectUri e enrollment.document são obrigatórios' }, { status: 400 });
    }
    if (!organisationId || !authorisationServerId) {
      console.error('❌ [enrollments] IDs faltando:', { organisationId, authorisationServerId });
      return NextResponse.json({ error: 'organisationId e authorisationServerId são obrigatórios (defina no body ou via env LINAOB_ORGANISATION_ID/LINAOB_AUTH_SERVER_ID)' }, { status: 400 });
    }

    // Provider expects: organisationId, authorisationServerId, enrollment{}, riskSignals{}, redirectUri
    // Normalize riskSignals
    const rs = body?.riskSignals ? { ...body.riskSignals } : undefined;
    if (rs && rs.userTimeZoneOffset != null) {
      // Ensure format like -03 or +02
      const raw = String(rs.userTimeZoneOffset);
      let sign = '+';
      let num = raw;
      if (raw.startsWith('-')) { sign = '-'; num = raw.slice(1); }
      else if (raw.startsWith('+')) { sign = '+'; num = raw.slice(1); }
      const onlyDigits = num.replace(/[^0-9]/g, '');
      const padded = onlyDigits.padStart(2, '0').slice(-2);
      rs.userTimeZoneOffset = `${sign}${padded}`;
    }

    payload = {
      organisationId,
      authorisationServerId,
      // Support either redirectUri or returnUrl from caller
      redirectUri,
      // Pass through optional fields if provided by FE
      enrollment: body?.enrollment,
      riskSignals: rs,
      context: context || {},
    } as any;
    console.log('📤 [enrollments] Payload para provider:', (() => { try { return JSON.stringify(payload, null, 2); } catch { return '[unserializable]'; } })());

    // Headers: subTenantId and x-client-ip (provider requires a client IP)
    const h = (req.headers as any);
    const envIp = process.env.LINAOB_CLIENT_IP;
    const ipCandidatesRaw: Array<string | null | undefined> = [
      envIp,
      h.get?.('x-forwarded-for'),
      h.get?.('x-real-ip'),
      h.get?.('cf-connecting-ip'),
      h.get?.('x-client-ip'),
    ];
    const firstIp = ipCandidatesRaw
      .map((v) => (typeof v === 'string' ? v.split(',')[0].trim() : ''))
      .find((v) => !!v) || '192.168.0.1';
    const clientIp = firstIp;
    debugClientIp = clientIp;
    const subTenantId = process.env.LINAOB_SUBTENANT_ID || 'lina';
    console.log('🌐 [enrollments] Headers:', {
      subTenantId,
      clientIp,
      candidates: {
        envIp,
        xForwardedFor: h.get?.('x-forwarded-for'),
        xRealIp: h.get?.('x-real-ip'),
        cfConnectingIp: h.get?.('cf-connecting-ip'),
        xClientIp: h.get?.('x-client-ip'),
      },
    });

    console.log('🚀 [enrollments] Chamando createEnrollment...');
    const enr = await createEnrollment(payload, { subTenantId, clientIp });
    console.log('✅ [enrollments] Provider respondeu:', (() => { try { return JSON.stringify(enr, null, 2); } catch { return '[unserializable]'; } })());
    // Support multiple provider response shapes
    const redirectUrl: string | null = (
      enr?.redirectUri ||
      enr?.redirect_url ||
      enr?.authorization_url ||
      enr?.data?.redirectUri ||
      enr?.data?.redirectUrl ||
      enr?.data?.authorization_url ||
      null
    );
    const enrollmentId: string | null = (
      enr?.enrollmentId ||
      enr?.id ||
      enr?.data?.id ||
      null
    );
    console.log('🔍 [enrollments] Extraído:', { redirectUrl, enrollmentId });

    // Persist link row (best-effort; ignore if table/columns are missing)
    let linkId: string | null = null;
    try {
      const link = await prisma.openFinanceLink.create({
        data: {
          userId: String(bodyUserId || enrollment?.externalId || doc || 'unknown-user'),
          clinicId: clinicId ? String(clinicId) : null,
          organisationId: String(organisationId),
          authorisationServerId: String(authorisationServerId),
          enrollmentId: String(enrollmentId || ''),
          status: 'PENDING',
        },
      });
      linkId = link.id;
      console.log('💾 [enrollments] Persistido linkId:', linkId);
    } catch (persistErr: any) {
      console.warn('[open-finance][enrollments] persistence skipped', { message: persistErr?.message });
    }
    const successResponse = { ok: true, linkId, enrollmentId, redirectUrl, providerResponse: enr };
    console.log('✅ [enrollments] Sucesso! Retornando:', (() => { try { return JSON.stringify(successResponse, null, 2); } catch { return '[unserializable]'; } })());
    return NextResponse.json(successResponse);
  } catch (e: any) {
    const status = Number(e?.status) || 500;
    // Build a helpful error payload mirroring the cURL style
    console.error('💥 [enrollments] ERRO:', {
      status,
      message: e?.message,
      stack: (e?.stack ? String(e.stack).split('\n').slice(0, 3).join('\n') : undefined),
      responseJson: e?.responseJson,
      responseText: e?.responseText,
    });
    const errorPayload = {
      ok: false,
      status,
      error: e?.message || 'Erro ao criar enrollment',
      providerResponse: e?.responseJson || e?.responseText || null,
      debug: {
        // Snapshot of the last attempted payload (best-effort; may be undefined if error occurred before it's set)
        payload: (typeof payload !== 'undefined') ? payload : null,
        headersUsed: {
          subTenantId: process?.env?.LINAOB_SUBTENANT_ID || 'lina',
          // We can't access clientIp here if it errored before it's defined; reflect best-effort
          clientIp: debugClientIp,
        },
        env: {
          tokenUrl: process?.env?.LINAOB_OAUTH_TOKEN_URL,
          baseUrl: process?.env?.LINAOB_BASE_URL,
          redirectUri: process?.env?.LINAOB_REDIRECT_URI,
          clientIp: process?.env?.LINAOB_CLIENT_IP,
        },
      },
    };
    try {
      // Log a concise but useful line to server console
      console.error('📤 [enrollments] Retornando erro:', (() => { try { return JSON.stringify(errorPayload, null, 2); } catch { return '[unserializable]'; } })());
    } catch {}
    return NextResponse.json(errorPayload, { status });
  }
}

