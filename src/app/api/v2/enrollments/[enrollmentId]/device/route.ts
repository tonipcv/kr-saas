import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { openFinancePersistEnabled } from '@/lib/config';

export async function POST(
  req: Request,
  { params }: { params: { enrollmentId: string } }
) {
  try {
    const body: any = await req.json().catch(() => ({} as any));
    console.log('[device.register][in]', {
      enrollmentId: params?.enrollmentId,
      bodyKeys: Object.keys(body || {}),
      hasResponse: !!body?.response,
      respKeys: body?.response ? Object.keys(body.response) : [],
    });
    const tokenUrl = process.env.LINAOB_OAUTH_TOKEN_URL || '';
    const clientId = process.env.LINAOB_CLIENT_ID || '';
    const clientSecret = process.env.LINAOB_CLIENT_SECRET || '';
    const epmBase = process.env.LINAOB_EPM_BASE_URL || process.env.LINAOB_BASE_URL || '';
    const subTenantId = process.env.LINAOB_SUBTENANT_ID || 'lina';
    if (!tokenUrl || !clientId || !clientSecret || !epmBase) {
      return NextResponse.json({ error: 'Missing LINAOB_* envs' }, { status: 500 });
    }

    const tokenResp = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
    });
    console.log('[device.register][token]', { url: tokenUrl, ok: tokenResp.ok, status: tokenResp.status });
    if (!tokenResp.ok) {
      const t = await tokenResp.text().catch(() => '');
      console.error('[device.register][token][fail]', { status: tokenResp.status, detail: t?.slice?.(0, 300) });
      return NextResponse.json({ error: 'Failed to get client token', detail: t, statusCode: tokenResp.status }, { status: 502 });
    }
    const tokenJson = await tokenResp.json();
    const accessToken = tokenJson?.access_token as string;

    const base = epmBase.replace(/\/$/, '');
    const hasApiV1 = /\/api\/v1$/i.test(base);
    const path = hasApiV1 ? `/jsr/enrollments/${encodeURIComponent(params.enrollmentId)}/device` : `/api/v1/jsr/enrollments/${encodeURIComponent(params.enrollmentId)}/device`;
    const url = `${base}${path}`;

    const xfwd = ((req.headers as any).get?.('x-forwarded-for') || '').split(',')[0]?.trim();
    const realIp = (req.headers as any).get?.('x-real-ip') || '';
    let clientIp = xfwd || realIp || process.env.LINAOB_CLIENT_IP || '192.168.0.1';
    if (clientIp === '::1' || clientIp === '127.0.0.1' || clientIp === '::ffff:127.0.0.1') clientIp = process.env.LINAOB_CLIENT_IP || '192.168.0.1';

    console.log('[device.register][upstream]', { url, hasApiV1, base });
    const payloadStr = JSON.stringify(body || {});
    console.log('[device.register][payload.meta]', { length: payloadStr.length, hasId: !!body?.id, hasRawId: !!body?.rawId });
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'x-client-ip': String(clientIp),
        'subTenantId': subTenantId,
      },
      body: payloadStr,
    });
    const text = await resp.text();
    let json: any = {}; try { json = JSON.parse(text); } catch {}
    console.log('[device.register][resp]', { status: resp.status, ok: resp.ok, bodyLen: text?.length || 0 });
    if (!resp.ok) {
      console.error('[device.register][fail]', { status: resp.status, url, body: (json || text)?.toString?.().slice?.(0, 500) });
      return NextResponse.json({ error: 'Failed to register device', upstream: { status: resp.status, url, response: json || text } }, { status: 502 });
    }
    // Persistence: mark deviceRegistered/authorised after successful provider call
    try {
      if (openFinancePersistEnabled) {
        const enrollmentId = String(params.enrollmentId);
        const deviceBindingJson = JSON.stringify({ upstream: json });
        const updated = await prisma.$executeRawUnsafe(
          `UPDATE enrollment_contexts
             SET status = 'AUTHORISED',
                 device_registered = TRUE,
                 device_binding_json = COALESCE($2::jsonb, device_binding_json),
                 updated_at = now()
           WHERE enrollment_id = $1`,
          enrollmentId,
          deviceBindingJson,
        );
        console.log('[device.register][db.update]', { affected: Number(updated) || 0 });
        if (!updated || Number(updated) === 0) {
          // Insert fallback to avoid missing rows
          try {
            await prisma.$executeRawUnsafe(
              `INSERT INTO enrollment_contexts (
                 id, user_id, session_id, enrollment_id,
                 organisation_id, authorisation_server_id, fallback_used,
                 clinic_id, payer_email, payer_document, payer_name,
                 status, device_registered, device_binding_json
               ) VALUES (
                 gen_random_uuid(), NULL, NULL, $1,
                 NULL, NULL, TRUE,
                 NULL, NULL, NULL, NULL,
                 'AUTHORISED', TRUE, $2::jsonb
               )`,
              enrollmentId,
              deviceBindingJson,
            );
            console.log('[device.register][db.insert] inserted fallback row');
          } catch (e: any) {
            console.warn('[device.register][db.insert][skip]', { error: String(e?.message || e) });
          }
        }
      }
    } catch (e: any) {
      console.warn('[enrollments.device] persistence skipped', { error: String(e?.message || e) });
    }

    return NextResponse.json(json);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
