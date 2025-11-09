import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { openFinancePersistEnabled } from '@/lib/config';
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
    let organisationId = bodyOrgId || process.env.LINAOB_ORGANISATION_ID;
    let authorisationServerId = bodyAuthServerId || process.env.LINAOB_AUTH_SERVER_ID;
    console.log('🆔 [enrollments] IDs:', {
      organisationId,
      authorisationServerId,
      fromEnv: { org: process.env.LINAOB_ORGANISATION_ID, auth: process.env.LINAOB_AUTH_SERVER_ID },
    });
    // Optional test mode: force env IDs regardless of FE selection
    if (process.env.LINAOB_FORCE_ENV_IDS === 'true' && process.env.LINAOB_ORGANISATION_ID && process.env.LINAOB_AUTH_SERVER_ID) {
      organisationId = process.env.LINAOB_ORGANISATION_ID;
      authorisationServerId = process.env.LINAOB_AUTH_SERVER_ID;
      console.warn('🧪 [enrollments] Forçando IDs de teste via LINAOB_FORCE_ENV_IDS', { organisationId, authorisationServerId });
    }
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
      const raw = String(rs.userTimeZoneOffset);
      let sign = '+';
      let num = raw;
      if (raw.startsWith('-')) { sign = '-'; num = raw.slice(1); }
      else if (raw.startsWith('+')) { sign = '+'; num = raw.slice(1); }
      const onlyDigits = num.replace(/[^0-9]/g, '');
      const padded = onlyDigits.padStart(2, '0').slice(-2);
      rs.userTimeZoneOffset = `${sign}${padded}`;
    }
    if (rs && typeof rs.osVersion === 'string' && rs.osVersion.length > 50) {
      const ua = rs.osVersion as string;
      let version = '14';
      let m: RegExpMatchArray | null = null;
      if (ua.includes('Mac OS X')) { m = ua.match(/Mac OS X (\d+[._]\d+(?:[._]\d+)?)/); if (m) version = m[1].replace(/_/g, '.'); }
      else if (ua.includes('Windows NT')) { m = ua.match(/Windows NT (\d+\.\d+)/); if (m) version = m[1]; }
      else if (ua.includes('Android')) { m = ua.match(/Android (\d+(?:\.\d+)?)/); if (m) version = m[1]; }
      else if (ua.includes('iPhone OS') || ua.includes('iPad')) { m = ua.match(/OS (\d+[._]\d+(?:[._]\d+)?)/); if (m) version = m[1].replace(/_/g, '.'); }
      rs.osVersion = version;
    }
    if (rs && typeof rs.isRootedDevice === 'undefined') rs.isRootedDevice = false;
    if (rs && typeof rs.elapsedTimeSinceBoot === 'undefined') rs.elapsedTimeSinceBoot = Date.now();
    if (rs && typeof rs.screenBrightness === 'undefined') rs.screenBrightness = 1;
    if (rs && 'ipAddress' in rs) { try { delete (rs as any).ipAddress; } catch {} }

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

    // Keep IP only in header; provider may reject ipAddress inside riskSignals
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
    let enr: any;
    let fallbackUsed = false;
    try {
      enr = await createEnrollment(payload, { subTenantId, clientIp });
    } catch (err: any) {
      const msg = String(err?.message || '');
      const text = String(err?.responseText || '');
      const code = Number(err?.status || 0);
      const detail = String(err?.responseJson?.errors?.[0]?.detail || '');
      const envOrg = process.env.LINAOB_ORGANISATION_ID;
      const envAuth = process.env.LINAOB_AUTH_SERVER_ID;
      const usedEnvPair = payload.organisationId === envOrg && payload.authorisationServerId === envAuth;
      const looksPairIssue = /Organisation not found/i.test(detail) || /invalid_scope/i.test(text) || code === 404 || code === 424;
      if (!usedEnvPair && envOrg && envAuth && looksPairIssue) {
        console.warn('[enrollments] provider error; retrying with env pair', { code, msg, detail, original: { org: payload.organisationId, auth: payload.authorisationServerId }, env: { org: envOrg, auth: envAuth } });
        const retryPayload = { ...payload, organisationId: envOrg, authorisationServerId: envAuth } as any;
        try {
          enr = await createEnrollment(retryPayload, { subTenantId, clientIp });
          fallbackUsed = true;
        } catch (err2: any) {
          throw err2;
        }
      } else {
        // For invalid_scope, convert to 400 for clarity
        if (/invalid_scope/i.test(text)) {
          const e400: any = new Error('invalid_scope from AS: check registered scopes and redirectUri');
          e400.status = 400;
          e400.responseText = text;
          e400.responseJson = err?.responseJson;
          throw e400;
        }
        throw err;
      }
    }
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
    // Persist EnrollmentContext (best-effort, additive-only, feature-flagged)
    try {
      if (openFinancePersistEnabled && enrollmentId) {
        const envOrg = process.env.LINAOB_ORGANISATION_ID || null;
        const envAuth = process.env.LINAOB_AUTH_SERVER_ID || null;
        const effectiveOrgId = fallbackUsed && envOrg ? envOrg : String(organisationId);
        const effectiveAuthId = fallbackUsed && envAuth ? envAuth : String(authorisationServerId);
        const userIdForCtx = String(bodyUserId || enrollment?.externalId || doc || '' || undefined) || null;
        const clinicIdStr = clinicId ? String(clinicId) : null;
        const payerEmail = (enrollment?.email ? String(enrollment.email) : null);
        const payerName = (enrollment?.name ? String(enrollment.name) : null);
        const payerDoc = doc || null;
        const providerJson = enr ? JSON.stringify(enr) : null;

        // UPDATE first
        const updCount = await prisma.$executeRawUnsafe(
          `UPDATE enrollment_contexts
             SET clinic_id = COALESCE($2, clinic_id),
                 payer_email = COALESCE($3, payer_email),
                 payer_document = COALESCE($4, payer_document),
                 payer_name = COALESCE($5, payer_name),
                 provider_response_json = COALESCE($6::jsonb, provider_response_json),
                 status = COALESCE(status, 'PENDING'),
                 updated_at = now()
           WHERE enrollment_id = $1`,
          String(enrollmentId),
          clinicIdStr,
          payerEmail,
          payerDoc,
          payerName,
          providerJson,
        );

        if (!updCount || Number(updCount) === 0) {
          // UPSERT by (user_id, organisation_id) to avoid unique constraint violations when a row already exists for this pair
          await prisma.$executeRawUnsafe(
            `INSERT INTO enrollment_contexts (
               id, user_id, session_id, enrollment_id,
               organisation_id, authorisation_server_id, fallback_used,
               clinic_id, payer_email, payer_document, payer_name, status, provider_response_json
             ) VALUES (
               gen_random_uuid(), $1, NULL, $2,
               $3, $4, $5,
               $6, $7, $8, $9, 'PENDING', $10::jsonb
             )
             ON CONFLICT (user_id, organisation_id)
             DO UPDATE SET
               enrollment_id = EXCLUDED.enrollment_id,
               authorisation_server_id = EXCLUDED.authorisation_server_id,
               fallback_used = EXCLUDED.fallback_used,
               clinic_id = COALESCE(EXCLUDED.clinic_id, enrollment_contexts.clinic_id),
               payer_email = COALESCE(EXCLUDED.payer_email, enrollment_contexts.payer_email),
               payer_document = COALESCE(EXCLUDED.payer_document, enrollment_contexts.payer_document),
               payer_name = COALESCE(EXCLUDED.payer_name, enrollment_contexts.payer_name),
               provider_response_json = COALESCE(EXCLUDED.provider_response_json, enrollment_contexts.provider_response_json),
               status = COALESCE(enrollment_contexts.status, 'PENDING'),
               updated_at = now()`,
            userIdForCtx,
            String(enrollmentId),
            effectiveOrgId,
            effectiveAuthId,
            !!fallbackUsed,
            clinicIdStr,
            payerEmail,
            payerDoc,
            payerName,
            providerJson,
          );
        }
      }
    } catch (e: any) {
      console.warn('[enrollments] Could not persist EnrollmentContext', { error: String(e?.message || e) });
    }

    // Persist OAuth state from redirectUrl (so /api/v2/oauth/authorization-endpoint/validate can verify)
    if (redirectUrl) {
      try {
        const u = new URL(redirectUrl);
        const stateParam = u.searchParams.get('state');
        if (stateParam) {
          await prisma.$executeRawUnsafe(
            `INSERT INTO oauth_states(state, nonce, code_verifier, tenant_id) VALUES ($1, NULL, NULL, $2)
             ON CONFLICT (state) DO UPDATE SET used_at = NULL`,
            stateParam,
            process.env.LINAOB_TENANT_ID || null
          );
          try {
            await prisma.$executeRawUnsafe(
              `INSERT INTO oauth_state_meta(state, organisation_id, authorisation_server_id, product_id, amount_cents, currency, order_ref)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               ON CONFLICT (state) DO UPDATE SET
                 organisation_id = EXCLUDED.organisation_id,
                 authorisation_server_id = EXCLUDED.authorisation_server_id,
                 product_id = EXCLUDED.product_id,
                 amount_cents = EXCLUDED.amount_cents,
                 currency = EXCLUDED.currency,
                 order_ref = EXCLUDED.order_ref`,
              stateParam,
              organisationId || null,
              authorisationServerId || null,
              (body?.context?.productId as string) || null,
              (typeof body?.context?.amountCents === 'number' ? body.context.amountCents : null),
              (body?.context?.currency as string) || null,
              (body?.context?.orderRef as string) || null
            );
          } catch {}
        }
      } catch (e) {
        console.warn('[open-finance][enrollments] could not persist oauth state from redirectUrl', { message: (e as any)?.message });
      }
    }

    const successResponse = { ok: true, linkId, enrollmentId, redirectUrl, providerResponse: enr, fallbackUsed };
    console.log('✅ [enrollments] Sucesso! Retornando:', (() => { try { return JSON.stringify(successResponse, null, 2); } catch { return '[unserializable]'; } })());
    return NextResponse.json(successResponse);
  } catch (e: any) {
    const derivedStatus = Number(e?.status) || Number(e?.responseJson?.errors?.[0]?.code) || 0;
    const status = derivedStatus && derivedStatus >= 100 ? derivedStatus : 500;
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
        lastAttemptedIds: payload ? { organisationId: payload.organisationId, authorisationServerId: payload.authorisationServerId } : null,
      },
    };
    try {
      // Log a concise but useful line to server console
      console.error('📤 [enrollments] Retornando erro:', (() => { try { return JSON.stringify(errorPayload, null, 2); } catch { return '[unserializable]'; } })());
    } catch {}
    return NextResponse.json(errorPayload, { status });
  }
}

