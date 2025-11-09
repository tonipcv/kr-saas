import { NextResponse } from 'next/server';

export async function POST(
  req: Request,
  { params }: { params: { consentId: string } }
) {
  try {
    const body: any = await req.json().catch(() => ({} as any));
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
    if (!tokenResp.ok) {
      const t = await tokenResp.text().catch(() => '');
      return NextResponse.json({ error: 'Failed to get client token', detail: t, statusCode: tokenResp.status }, { status: 502 });
    }
    const tokenJson = await tokenResp.json();
    const accessToken = tokenJson?.access_token as string;

    const base = epmBase.replace(/\/$/, '');
    const hasApiV1 = /\/api\/v1$/i.test(base);
    const path = hasApiV1 ? `/jsr/consents/${encodeURIComponent(params.consentId)}/fido-sign-options` : `/api/v1/jsr/consents/${encodeURIComponent(params.consentId)}/fido-sign-options`;
    const url = `${base}${path}`;

    const xfwd = ((req.headers as any).get?.('x-forwarded-for') || '').split(',')[0]?.trim();
    const realIp = (req.headers as any).get?.('x-real-ip') || '';
    let clientIp = xfwd || realIp || process.env.LINAOB_CLIENT_IP || '192.168.0.1';
    if (clientIp === '::1' || clientIp === '127.0.0.1' || clientIp === '::ffff:127.0.0.1') clientIp = process.env.LINAOB_CLIENT_IP || '192.168.0.1';

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'x-client-ip': String(clientIp),
        'subTenantId': subTenantId,
      },
      body: JSON.stringify(body || {}),
    });
    const text = await resp.text();
    let json: any = {}; try { json = JSON.parse(text); } catch {}
    if (!resp.ok) {
      return NextResponse.json({ error: 'Failed to get fido sign options', upstream: { status: resp.status, url, response: json || text } }, { status: 502 });
    }
    return NextResponse.json(json);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
