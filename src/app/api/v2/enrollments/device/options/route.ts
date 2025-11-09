import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body: any = await req.json().catch(() => ({} as any));
    console.log('[device.options][in]', {
      keys: Object.keys(body || {}),
      state: body?.state ? String(body.state).slice(0, 16) + '…' : null,
      hasCode: !!body?.code,
      hasIdToken: !!body?.idToken,
      platform: body?.platform,
      tenantId: body?.tenantId,
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
    console.log('[device.options][token]', { url: tokenUrl, ok: tokenResp.ok, status: tokenResp.status });
    if (!tokenResp.ok) {
      const t = await tokenResp.text().catch(() => '');
      console.error('[device.options][token][fail]', { status: tokenResp.status, detail: t?.slice?.(0, 300) });
      return NextResponse.json({ error: 'Failed to get client token', detail: t, statusCode: tokenResp.status }, { status: 502 });
    }
    const tokenJson = await tokenResp.json();
    const accessToken = tokenJson?.access_token as string;

    const base = epmBase.replace(/\/$/, '');
    const hasApiV1 = /\/api\/v1$/i.test(base);
    const path = hasApiV1 ? '/jsr/enrollments/device/options' : '/api/v1/jsr/enrollments/device/options';
    const url = `${base}${path}`;

    const xfwd = ((req.headers as any).get?.('x-forwarded-for') || '').split(',')[0]?.trim();
    const realIp = (req.headers as any).get?.('x-real-ip') || '';
    let clientIp = xfwd || realIp || process.env.LINAOB_CLIENT_IP || '192.168.0.1';
    if (clientIp === '::1' || clientIp === '127.0.0.1' || clientIp === '::ffff:127.0.0.1') clientIp = process.env.LINAOB_CLIENT_IP || '192.168.0.1';

    console.log('[device.options][upstream]', { url, hasApiV1, base });
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
    console.log('[device.options][resp]', { status: resp.status, ok: resp.ok, bodyLen: text?.length || 0 });
    if (!resp.ok) {
      console.error('[device.options][fail]', { status: resp.status, url, body: (json || text)?.toString?.().slice?.(0, 500) });
      return NextResponse.json({ error: 'Failed to get device options', upstream: { status: resp.status, url, response: json || text } }, { status: 502 });
    }
    return NextResponse.json(json);
  } catch (e: any) {
    console.error('[device.options][unexpected]', { error: String(e?.message || e) });
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
