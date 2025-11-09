import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const tokenEndpoint = process.env.OPEN_BANKING_TOKEN_ENDPOINT || '';
    const clientId = process.env.OPEN_BANKING_CLIENT_ID || '';
    if (!tokenEndpoint || !clientId) {
      return NextResponse.json({ error: 'Missing OPEN_BANKING envs' }, { status: 500 });
    }

    const cookieHeader = (req.headers as any).get?.('cookie') || '';
    const cookieMap = new Map<string, string>();
    try {
      cookieHeader.split(/;\s*/).forEach((p: string) => {
        if (!p) return; const idx = p.indexOf('='); if (idx === -1) return; const k = decodeURIComponent(p.slice(0, idx)); const v = decodeURIComponent(p.slice(idx + 1)); cookieMap.set(k, v);
      });
    } catch {}
    const tokenJson = cookieMap.get('ob_token');
    if (!tokenJson) return NextResponse.json({ error: 'Missing token' }, { status: 401 });

    let token: any = null; try { token = JSON.parse(tokenJson); } catch {}
    const refreshToken: string | undefined = token?.refresh_token;
    if (!refreshToken) return NextResponse.json({ error: 'No refresh_token' }, { status: 400 });

    const form = new URLSearchParams();
    form.set('grant_type', 'refresh_token');
    form.set('refresh_token', refreshToken);
    form.set('client_id', clientId);

    const resp = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      cache: 'no-store',
    });

    const text = await resp.text();
    let json: any = {}; try { json = JSON.parse(text); } catch {}
    if (!resp.ok) {
      return NextResponse.json({ error: 'Refresh failed', provider: json || text, statusCode: resp.status }, { status: resp.status || 500 });
    }

    const merged = { ...token, ...json };
    const res = NextResponse.json({ ok: true, tokens: { token_type: merged.token_type, expires_in: merged.expires_in, scope: merged.scope } });
    try {
      res.cookies.set('ob_token', JSON.stringify(merged), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: Number(merged.expires_in || 3600) });
    } catch {}
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
