import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getEnrollment } from '@/lib/linaob';

export async function POST(req: Request) {
  try {
    let body: any = await req.json().catch(() => ({} as any));
    const tokenUrl = process.env.LINAOB_OAUTH_TOKEN_URL || '';
    const clientId = process.env.LINAOB_CLIENT_ID || '';
    const clientSecret = process.env.LINAOB_CLIENT_SECRET || '';
    const epmBase = process.env.LINAOB_EPM_BASE_URL || process.env.LINAOB_BASE_URL || '';
    const subTenantId = process.env.LINAOB_SUBTENANT_ID || 'lina';
    if (!tokenUrl || !clientId || !clientSecret || !epmBase) {
      return NextResponse.json({ error: 'Missing LINAOB_* envs' }, { status: 500 });
    }

    // 1) client_credentials token
    const tokenResp = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    if (!tokenResp.ok) {
      const t = await tokenResp.text().catch(() => '');
      console.error('[consents] Token request failed', {
        tokenUrl,
        status: tokenResp.status,
        response: t,
        clientIdPresent: !!clientId,
      });
      return NextResponse.json({ error: 'Failed to get client token', detail: t, statusCode: tokenResp.status }, { status: 502 });
    }
    const tokenJson = await tokenResp.json();
    const accessToken = tokenJson?.access_token as string;

    // 2) create consent at LINA EPM JSR (v1)
    const xfwd = ((req.headers as any).get?.('x-forwarded-for') || '').split(',')[0]?.trim();
    const realIp = (req.headers as any).get?.('x-real-ip') || '';
    let clientIp = xfwd || realIp || process.env.LINAOB_CLIENT_IP || '192.168.0.1';
    if (clientIp === '::1' || clientIp === '127.0.0.1' || clientIp === '::ffff:127.0.0.1') {
      clientIp = process.env.LINAOB_CLIENT_IP || '192.168.0.1';
    }
    const base = epmBase.replace(/\/$/, '');
    const hasApiV1 = /\/api\/v1$/i.test(base);
    const path = hasApiV1 ? '/jsr/consents' : '/api/v1/jsr/consents';
    const url = `${base}${path}`;
    // Force redirectUri to allowed domain from env (required by subTenant allowlist)
    const envRedirect = process.env.LINAOB_REDIRECT_URI;
    if (!envRedirect) {
      console.error('[consents] Missing LINAOB_REDIRECT_URI in environment');
      return NextResponse.json({ error: 'Missing LINAOB_REDIRECT_URI in environment' }, { status: 500 });
    }
    if (typeof body !== 'object' || body === null) {
      body = {} as any;
    }
    if (!body.payment || typeof body.payment !== 'object') {
      (body as any).payment = {};
    }
    (body as any).payment.redirectUri = envRedirect;
    console.log('[consents] Using redirectUri from env:', envRedirect);

    // Helper to perform consent request
    const doConsent = async (payload: any) => {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'x-client-ip': String(clientIp),
          'subTenantId': subTenantId,
        },
        body: JSON.stringify(payload || {}),
      });
      const text = await resp.text();
      let json: any = {}; try { json = JSON.parse(text); } catch {}
      return { resp, text, json } as const;
    };

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    // If enrollmentId is missing, try to recover from EnrollmentContext by userId (latest)
    if ((!body?.enrollmentId || typeof body.enrollmentId !== 'string') && body?.userId) {
      try {
        const ctx = await prisma.enrollmentContext.findFirst({
          where: { userId: String(body.userId) },
          orderBy: { createdAt: 'desc' },
        });
        if (ctx) {
          (body as any).enrollmentId = ctx.enrollmentId;
          (body as any).organisationId = ctx.organisationId;
          (body as any).authorisationServerId = ctx.authorisationServerId;
          console.warn('[consents] Using EnrollmentContext (DB) for enrollmentId/org/auth');
        }
      } catch {}
    }

    // If we have enrollmentId, try to load its persisted context (org/auth and fallbackUsed)
    let fallbackUsed = false;
    if (body?.enrollmentId && typeof body.enrollmentId === 'string') {
      try {
        const ctx = await prisma.enrollmentContext.findFirst({
          where: { enrollmentId: String(body.enrollmentId) },
          orderBy: { createdAt: 'desc' },
        });
        if (ctx) {
          fallbackUsed = !!ctx.fallbackUsed;
          (body as any).organisationId = ctx.organisationId;
          (body as any).authorisationServerId = ctx.authorisationServerId;
          console.log('[consents] Using EnrollmentContext by enrollmentId for org/auth', { fallbackUsed });
        }
      } catch {}
    }

    // Auto-enroll if requested and enrollmentId missing
    const wantsAuto = Boolean((body as any)?.autoEnroll) && (body as any)?.enrollmentRequest;
    if ((!body?.enrollmentId || typeof body.enrollmentId !== 'string') && wantsAuto) {
      try {
        const enrollRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/open-finance/enrollments`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify((body as any).enrollmentRequest), cache: 'no-store'
        });
        const enrollTxt = await enrollRes.text();
        let enrollJson: any = {}; try { enrollJson = JSON.parse(enrollTxt); } catch {}
        if (enrollRes.ok) {
          const newId = enrollJson?.enrollmentId || enrollJson?.providerResponse?.data?.id;
          if (newId) {
            (body as any).enrollmentId = newId;
            console.log('[consents] Auto-enroll succeeded, enrollmentId=', newId);
          }
        } else {
          console.warn('[consents] Auto-enroll failed', { status: enrollRes.status, enrollJson: enrollJson || enrollTxt });
        }
      } catch (e: any) {
        console.warn('[consents] Auto-enroll exception', { error: String(e?.message || e) });
      }
    }

    // Normalize IDs: if client didn't provide org/auth IDs, default to env pair (helps when enrollment fallback used env)
    if (!body.organisationId || !body.authorisationServerId) {
      const envOrg = process.env.LINAOB_ORGANISATION_ID || process.env.LINAOB_ORG_ID || undefined;
      const envAuth = process.env.LINAOB_AUTHORIZATION_SERVER_ID || process.env.LINAOB_AUTHORISATION_SERVER_ID || undefined;
      if (envOrg && envAuth) {
        if (!body.organisationId) body.organisationId = envOrg as any;
        if (!body.authorisationServerId) body.authorisationServerId = envAuth as any;
        console.warn('[consents] Defaulting organisationId/authorisationServerId to env pair');
      }
    }

    // If enrollment was created using env fallback, force env IDs on first attempt to avoid mismatches
    if (fallbackUsed) {
      const envOrg = process.env.LINAOB_ORGANISATION_ID || process.env.LINAOB_ORG_ID;
      const envAuth = process.env.LINAOB_AUTHORIZATION_SERVER_ID || process.env.LINAOB_AUTHORISATION_SERVER_ID;
      if (envOrg && envAuth) {
        (body as any).organisationId = envOrg;
        (body as any).authorisationServerId = envAuth;
        console.warn('[consents] Forcing env org/auth IDs because enrollment used fallback env pair');
      }
    }

    // Readiness poll: ensure AS has the vínculo ready before attempting consent
    if (body?.enrollmentId && typeof body.enrollmentId === 'string') {
      const pollDelays = [500, 1000, 1500];
      for (const d of pollDelays) {
        try {
          await new Promise((r) => setTimeout(r, d));
          await getEnrollment(String(body.enrollmentId), { subTenantId, clientIp });
          break; // if call doesn't throw, proceed
        } catch (_) {
          // continue polling
        }
      }
    }

    // Small initial delay to reduce immediate token bursts at AS
    await sleep(2500);
    // First attempt
    let { resp: consentResp, text: rawText, json: cj } = await doConsent(body);
    if (!consentResp.ok) {
      const up = cj || rawText;
      const upStr = typeof up === 'string' ? up : JSON.stringify(up);
      const vinculoInvalid = upStr?.toLowerCase().includes('vínculo inválido') || upStr?.toLowerCase().includes('vinculo invalido') || (cj?.errors || []).some((e: any) => String(e?.detail || '').toLowerCase().includes('vínculo'));
      const status424 = consentResp.status === 424 || upStr?.includes('status code 424');
      const status429 = consentResp.status === 429 || upStr?.includes('status code 429');
      const has429Error = status429 || (Array.isArray(cj?.errors) && cj.errors.some((e: any) => String(e?.code) === '429'));
      const fido422 = Array.isArray(cj?.errors) && cj.errors.some((e: any) => String(e?.code) === '422' && String(e?.detail || '').includes('/fido-sign-options'));

      // If invalid vinculo and autoEnroll requested, try to re-enroll and retry once
      if (vinculoInvalid && wantsAuto) {
        try {
          const enrollRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/open-finance/enrollments`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify((body as any).enrollmentRequest), cache: 'no-store'
          });
          const enrollTxt = await enrollRes.text();
          let enrollJson: any = {}; try { enrollJson = JSON.parse(enrollTxt); } catch {}
          if (enrollRes.ok) {
            const newId = enrollJson?.enrollmentId || enrollJson?.providerResponse?.data?.id;
            if (newId) {
              (body as any).enrollmentId = newId;
              console.log('[consents] Auto-enroll (retry) succeeded, enrollmentId=', newId);
              ({ resp: consentResp, text: rawText, json: cj } = await doConsent(body));
            }
          } else {
            console.warn('[consents] Auto-enroll (retry) failed', { status: enrollRes.status, enrollJson: enrollJson || enrollTxt });
          }
        } catch (e: any) {
          console.warn('[consents] Auto-enroll (retry) exception', { error: String(e?.message || e) });
        }
      }

      if (!consentResp.ok) {
        // Exponential backoff on 429/424 token-related issues
        if (status424 || has429Error) {
          const delays = [800, 1600, 3200];
          for (const d of delays) {
            await sleep(d);
            ({ resp: consentResp, text: rawText, json: cj } = await doConsent(body));
            if (consentResp.ok) break;
            const up2 = cj || rawText; const up2Str = typeof up2 === 'string' ? up2 : JSON.stringify(up2);
            const still429 = consentResp.status === 429 || up2Str?.includes('status code 429') || (Array.isArray(cj?.errors) && cj.errors.some((e: any) => String(e?.code) === '429'));
            const still424 = consentResp.status === 424 || up2Str?.includes('status code 424');
            if (!(still429 || still424)) break;
          }
        }
      }
      if (!consentResp.ok && fido422) {
        // Additional settling time specifically for FIDO sign options vinculo/setup propagation
        const moreDelays = [1500, 3000];
        for (const d of moreDelays) {
          await sleep(d);
          ({ resp: consentResp, text: rawText, json: cj } = await doConsent(body));
          if (consentResp.ok) break;
        }
      }
      if (!consentResp.ok) {
        // Retry once with env org/auth IDs in case enrollment was created with env pair
        const envOrg = process.env.LINAOB_ORGANISATION_ID || process.env.LINAOB_ORG_ID;
        const envAuth = process.env.LINAOB_AUTHORIZATION_SERVER_ID || process.env.LINAOB_AUTHORISATION_SERVER_ID;
        const canRetryWithEnv = (status424 || vinculoInvalid) && envOrg && envAuth && (body?.organisationId !== envOrg || body?.authorisationServerId !== envAuth);
        if (canRetryWithEnv) {
          const retryPayload = { ...(body || {}) } as any;
          retryPayload.organisationId = envOrg;
          retryPayload.authorisationServerId = envAuth;
          console.warn('[consents] Retrying consent with env org/auth IDs due to 424/vinculo', { envOrg, envAuth });
          ({ resp: consentResp, text: rawText, json: cj } = await doConsent(retryPayload));
        }
      }
      if (!consentResp.ok) {
        console.error('[consents] Upstream EPM consent error', {
          url,
          status: consentResp.status,
          headers: { 'x-client-ip': String(clientIp), subTenantId },
          requestBodyKeys: Object.keys(body || {}),
          upstream: cj || rawText,
          upstreamErrors: (cj?.errors || []).map((e: any) => ({ code: e?.code, title: e?.title, detail: e?.detail })).slice(0, 5),
        });
        // Map vinculo inválido or FIDO vinculo/setup propagation to 400 for clearer client handling
        if (vinculoInvalid || fido422) {
          return NextResponse.json({ error: 'Enrollment invalid or expired. Recreate enrollment and retry.', upstream: { status: consentResp.status, url, response: cj || rawText } }, { status: 400 });
        }
        return NextResponse.json({ error: 'Failed to create consent', upstream: { status: consentResp.status, url, response: cj || rawText } }, { status: 502 });
      }
    }
    console.log('[consents] Consent created OK', { url, status: consentResp.status, hasData: !!(cj?.data) });
    const data = cj?.data || cj;
    const consentId = data?.consentId || data?.ConsentId || data?.id;
    const status = data?.status || data?.Status;
    if (!consentId) return NextResponse.json({ error: 'Missing consentId in provider response' }, { status: 502 });

    // 3) persist minimal consent locally (idempotent)
    try {
      await prisma.paymentConsent.upsert({
        where: { consentId },
        update: { status: status || null },
        create: { consentId, status: status || null, tenantId: process.env.LINAOB_SUBTENANT_ID || null },
      });
    } catch {}

    return NextResponse.json({ consentId, status });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
