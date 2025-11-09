import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function base64UrlEncode(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return Buffer.from(str, 'binary').toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function createPkce() {
  const random = crypto.getRandomValues(new Uint8Array(32));
  const verifier = base64UrlEncode(random.buffer);
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const challenge = base64UrlEncode(digest);
  return { codeVerifier: verifier, codeChallenge: challenge, method: 'S256' as const };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const { consentId, productId, amountCents, currency = 'BRL', orderRef } = body || {};
    if (!consentId) return NextResponse.json({ error: 'Missing consentId' }, { status: 400 });

    const authEndpoint = process.env.OPEN_BANKING_AUTHORIZATION_ENDPOINT || '';
    const clientId = process.env.OPEN_BANKING_CLIENT_ID || '';
    const redirectUri = process.env.OPEN_BANKING_REDIRECT_URI || '';
    if (!authEndpoint || !clientId || !redirectUri) {
      return NextResponse.json({ error: 'Missing OPEN_BANKING_* envs' }, { status: 500 });
    }

    const state = (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 32);
    const nonce = (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 32);
    const { codeVerifier, codeChallenge, method } = await createPkce();

    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO oauth_states(state, nonce, code_verifier, tenant_id) VALUES ($1, $2, $3, $4)
         ON CONFLICT (state) DO UPDATE SET nonce = EXCLUDED.nonce, code_verifier = EXCLUDED.code_verifier, used_at = NULL`,
        state,
        nonce,
        codeVerifier,
        process.env.LINAOB_SUBTENANT_ID || null
      );
    } catch {}

    // Persist meta so the callback can find consentId and payment info
    try {
      await prisma.oAuthStateMeta.upsert({
        where: { state },
        update: {
          consentId: consentId,
          productId: productId || undefined,
          amountCents: typeof amountCents === 'number' ? amountCents : undefined,
          currency: currency || 'BRL',
          orderRef: orderRef || undefined,
        } as any,
        create: {
          state,
          consentId: consentId,
          productId: productId || undefined,
          amountCents: typeof amountCents === 'number' ? amountCents : undefined,
          currency: currency || 'BRL',
          orderRef: orderRef || undefined,
        } as any,
      });
    } catch {}

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: `openid payments consent:${consentId}`,
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: method,
    });

    const authorizationUrl = `${authEndpoint}?${params.toString()}`;
    const res = NextResponse.json({ authorizationUrl, state });
    try {
      res.cookies.set('ob_state', state, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 600 });
      res.cookies.set('ob_cv', codeVerifier, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 600 });
      res.cookies.set('ob_nonce', nonce, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 600 });
    } catch {}
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
