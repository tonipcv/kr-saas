import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const code: string = body?.code || '';
    const stateFromBody: string | undefined = body?.state;
    if (!code) {
      console.error('[oauth.callback] Missing authorization code', { bodyKeys: Object.keys(body || {}) });
      return NextResponse.json({ error: 'Missing code' }, { status: 400 });
    }

    const tokenEndpoint = process.env.OPEN_BANKING_TOKEN_ENDPOINT || '';
    const clientId = process.env.OPEN_BANKING_CLIENT_ID || '';
    const clientSecret = process.env.OPEN_BANKING_CLIENT_SECRET || '';
    const redirectUri = process.env.OPEN_BANKING_REDIRECT_URI || '';
    if (!tokenEndpoint || !clientId || !redirectUri) {
      console.error('[oauth.callback] Missing OPEN_BANKING_* envs', {
        hasTokenEndpoint: !!tokenEndpoint,
        hasClientId: !!clientId,
        hasRedirectUri: !!redirectUri,
      });
      return NextResponse.json({ error: 'Missing OPEN_BANKING envs' }, { status: 500 });
    }

    const cookiesIn = (req as any).cookies ?? undefined; // Next runtime lacks easy cookie read on edge vs node; we fallback to header parsing below
    const cookieHeader = (req.headers as any).get?.('cookie') || '';
    const cookieMap = new Map<string, string>();
    try {
      cookieHeader.split(/;\s*/).forEach((p: string) => {
        if (!p) return; const idx = p.indexOf('='); if (idx === -1) return; const k = decodeURIComponent(p.slice(0, idx)); const v = decodeURIComponent(p.slice(idx + 1)); cookieMap.set(k, v);
      });
    } catch (e: any) {
      console.error('[oauth.callback] Failed to persist OAuthToken', { error: String(e?.message || e) });
    }
    const stateCookie = cookieMap.get('ob_state');
    let codeVerifier = cookieMap.get('ob_cv');

    if (stateFromBody && stateCookie && stateFromBody !== stateCookie) {
      console.error('[oauth.callback] State mismatch', { stateFromBody, stateCookie });
      return NextResponse.json({ error: 'Invalid state' }, { status: 400 });
    }
    // Determine which state to use for DB fallback
    const effectiveState = stateCookie || stateFromBody || null;
    if (!codeVerifier && effectiveState) {
      try {
        const rows = await prisma.$queryRawUnsafe<{ code_verifier: string | null }[]>(
          'SELECT code_verifier FROM oauth_states WHERE state = $1 LIMIT 1',
          effectiveState
        );
        const dbCv = rows && rows[0] ? rows[0].code_verifier : null;
        if (dbCv) {
          console.warn('[oauth.callback] Recovered code_verifier from DB using state (ignoring used_at)');
          codeVerifier = dbCv;
        }
      } catch (e: any) {
        console.error('[oauth.callback] Failed to lookup code_verifier by state', { error: String(e?.message || e) });
      }
    }
    const usingClientSecretFallback = !codeVerifier && !!clientSecret;
    if (!codeVerifier && !usingClientSecretFallback) {
      console.error('[oauth.callback] Missing code_verifier (no cookie, no DB fallback)', { hasStateCookie: !!stateCookie, hasStateBody: !!stateFromBody });
      return NextResponse.json({ error: 'Missing code_verifier (PKCE)' }, { status: 400 });
    }

    const form = new URLSearchParams();
    form.set('grant_type', 'authorization_code');
    form.set('code', code);
    form.set('redirect_uri', redirectUri);
    form.set('client_id', clientId);
    if (usingClientSecretFallback) {
      console.warn('[oauth.callback] Proceeding with client_secret fallback (no PKCE)');
      form.set('client_secret', clientSecret);
    } else {
      form.set('code_verifier', codeVerifier as string);
    }

    const resp = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      cache: 'no-store',
    });

    const text = await resp.text();
    let json: any = {}; try { json = JSON.parse(text); } catch {}
    if (!resp.ok) {
      console.error('[oauth.callback] Token exchange failed', {
        tokenEndpoint,
        status: resp.status,
        stateCookie,
        hasCode: !!code,
        hasCodeVerifier: !!codeVerifier,
        response: (typeof json === 'object' && json) ? json : (text || ''),
      });
      return NextResponse.json({ error: 'Token exchange failed', provider: json || text, statusCode: resp.status }, { status: resp.status || 500 });
    }

    // Persist token record (optional, without linking to consent explicitly)
    try {
      const expiresAt = json?.expires_in ? new Date(Date.now() + Number(json.expires_in) * 1000) : null;
      await prisma.oAuthToken.create({
        data: {
          tenantId: process.env.LINAOB_SUBTENANT_ID || null,
          provider: 'mockbank',
          accessToken: json?.access_token,
          refreshToken: json?.refresh_token || null,
          scope: json?.scope || null,
          expiresAt: expiresAt || undefined,
        },
      });
    } catch {}

    // If scope contains consent:..., update PaymentConsent to AUTHORIZED
    try {
      const scopeStr: string = json?.scope || '';
      const m = scopeStr.match(/consent:([^\s]+)/);
      const consentId = m?.[1];
      if (consentId) {
        await prisma.paymentConsent.upsert({
          where: { consentId },
          update: { status: 'AUTHORIZED' },
          create: { consentId, status: 'AUTHORIZED', tenantId: process.env.LINAOB_SUBTENANT_ID || null },
        });
      }
    } catch {}

    const res = NextResponse.json({ ok: true, tokens: { token_type: json.token_type, expires_in: json.expires_in, scope: json.scope } });
    try {
      res.cookies.set('ob_token', JSON.stringify(json), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: Number(json.expires_in || 3600) });
      // Invalidate single-use state and PKCE
      res.cookies.set('ob_state', '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
      res.cookies.set('ob_cv', '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
      res.cookies.set('ob_nonce', '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
    } catch (e: any) {
      console.error('[oauth.callback] Failed to set cookies / cleanup state cookies', { error: String(e?.message || e) });
    }
    return res;
  } catch (e: any) {
    console.error('[oauth.callback] Unexpected error', { error: String(e?.message || e) });
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
