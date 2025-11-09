import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { validateIdToken } from '@/lib/jwks';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const { code, idToken, state, tenantId, platform, error: asError, error_description } = body || {};

    // If AS returned an error (cancel/denied/timeout), persist as failed and short-circuit
    if (asError && state) {
      try {
        const meta = await prisma.oAuthStateMeta.findUnique({ where: { state } }).catch(() => null as any);
        const productId = meta?.productId || null;
        const amountCents = typeof meta?.amountCents === 'number' ? meta.amountCents : null;
        const currency = (meta?.currency as string) || 'BRL';
        const deterministicId = `${state}:${productId || 'na'}`;
        await prisma.paymentTransaction.upsert({
          where: { id: deterministicId },
          update: {
            status: 'failed',
            rawPayload: { state, error: asError, error_description } as any,
          },
          create: {
            id: deterministicId,
            provider: 'open_banking',
            providerOrderId: state,
            paymentMethodType: 'pix_ob',
            amountCents: amountCents ?? 0,
            currency,
            productId: productId || undefined,
            status: 'failed',
            rawPayload: { state, error: asError, error_description } as any,
          },
        });
      } catch (e) {
        console.warn('[oauth.validate] could not persist failed PaymentTransaction', { error: String((e as any)?.message || e) });
      }
      try { await prisma.$executeRawUnsafe('UPDATE oauth_states SET used_at = now() WHERE state = $1 AND used_at IS NULL', state); } catch {}
      return NextResponse.json({ message: 'Authorization server error', error: asError, error_description }, { status: 400 });
    }

    if (!code || !state) {
      return NextResponse.json(
        { message: 'Missing required fields', error: 'Bad Request' },
        { status: 400 }
      );
    }

    // Validate state from DB
    let stateRecord: { state: string; nonce: string | null; code_verifier?: string | null } | null = null;
    // Try to read code_verifier from cookie if present (to persist in fallback)
    const cookieHeader = (req.headers as any).get?.('cookie') || '';
    let obCvFromCookie: string | null = null;
    try {
      cookieHeader.split(/;\s*/).forEach((p: string) => {
        if (!p) return; const idx = p.indexOf('='); if (idx === -1) return; const k = decodeURIComponent(p.slice(0, idx)); const v = decodeURIComponent(p.slice(idx + 1));
        if (k === 'ob_cv') obCvFromCookie = v;
      });
    } catch {}
    const stateRow = await prisma.$queryRawUnsafe<{ state: string; nonce: string | null; code_verifier: string | null }[]>(
      'SELECT state, nonce, code_verifier FROM oauth_states WHERE state = $1 AND used_at IS NULL LIMIT 1',
      state
    );
    if (stateRow && stateRow[0]) {
      stateRecord = stateRow[0];
    }
    // If state exists but code_verifier is missing, and we have obCvFromCookie, update it
    if (stateRecord && !stateRecord.code_verifier && obCvFromCookie) {
      try {
        await prisma.$executeRawUnsafe(
          'UPDATE oauth_states SET code_verifier = $2 WHERE state = $1 AND code_verifier IS NULL',
          state,
          obCvFromCookie
        );
        stateRecord.code_verifier = obCvFromCookie;
      } catch (e: any) {
        console.warn('[oauth.validate] could not backfill code_verifier for state', { error: String(e?.message || e) });
      }
    }
    if (!stateRecord) {
      console.warn('[oauth.validate] state not found in oauth_states', { incomingState: state, hasObCvCookie: !!obCvFromCookie });
      // Only attempt to backfill when we actually have obCvFromCookie
      if (obCvFromCookie) {
        try {
          await prisma.$executeRawUnsafe(
            `INSERT INTO oauth_states(state, nonce, code_verifier, tenant_id) VALUES ($1, NULL, $2, $3)
             ON CONFLICT (state) DO UPDATE SET code_verifier = COALESCE(oauth_states.code_verifier, EXCLUDED.code_verifier), used_at = NULL`,
            state,
            obCvFromCookie,
            process.env.LINAOB_TENANT_ID || null
          );
        } catch (e: any) {
          console.error('[oauth.validate] fallback insert failed', { error: String(e?.message || e) });
        }
        const retryRow = await prisma.$queryRawUnsafe<{ state: string; nonce: string | null; code_verifier: string | null }[]>(
          'SELECT state, nonce, code_verifier FROM oauth_states WHERE state = $1 AND used_at IS NULL LIMIT 1',
          state
        );
        if (retryRow && retryRow[0]) {
          stateRecord = retryRow[0];
        }
      }
      if (!stateRecord) {
        console.error('[oauth.validate] state not found or used', {
          incomingState: state,
          note: 'No matching row in oauth_states or already used',
        });
        return NextResponse.json({ message: 'Unknown or already used state', error: 'Invalid state' }, { status: 400 });
      }
    }

    // Validate id_token if provided (support skipping JWKS in dev)
    const skipJwks = process.env.NODE_ENV !== 'production' || process.env.SKIP_JWKS === 'true';
    if (idToken) {
      if (skipJwks) {
        try {
          const { payload } = await (async () => {
            const { decodeJwt } = await import('@/lib/jwks');
            return { payload: decodeJwt(idToken).payload } as any;
          })();
          const now = Math.floor(Date.now() / 1000);
          if (typeof payload.exp === 'number' && payload.exp < now) throw new Error('id_token expired (skipJWKS)');
          if (stateRecord?.nonce && payload.nonce && payload.nonce !== stateRecord.nonce) throw new Error('nonce mismatch (skipJWKS)');
          console.warn('[oauth.validate] Skipping JWKS signature validation (dev mode)');
        } catch (e: any) {
          console.error('[oauth.validate] id_token basic checks failed (skipJWKS)', { error: String(e?.message || e) });
          return NextResponse.json({ message: 'Invalid id_token (basic)', error: String(e?.message || e) }, { status: 401 });
        }
      } else {
        const jwksUri = process.env.OPEN_BANKING_JWKS_URI || 'https://auth.mockbank.poc.raidiam.io/.well-known/jwks.json';
        const expectedIssuer = process.env.OPEN_BANKING_ISSUER || 'https://auth.mockbank.poc.raidiam.io';
        const expectedAudience = process.env.OPEN_BANKING_CLIENT_ID || undefined;
        try {
          await validateIdToken(idToken, {
            jwksUri,
            expectedIssuer,
            expectedAudience,
            expectedNonce: stateRecord?.nonce || undefined,
          });
        } catch (e: any) {
          console.error('[oauth.validate] id_token validation failed', {
            error: String(e?.message || e),
            issuer: expectedIssuer,
            audience: expectedAudience,
            jwksUri,
            hasNonceInDB: !!(stateRecord && stateRecord.nonce),
          });
          return NextResponse.json({ message: 'Invalid id_token', error: String(e?.message || e) }, { status: 401 });
        }
      }
    }

    // Helper: persist PaymentTransaction idempotently using context from oauth_state_meta
    const persistPaymentTransaction = async () => {
      try {
        // Guard: if there's already a persisted Open Banking transaction (e.g., via /payments/execute), skip
        const existing = await prisma.paymentTransaction.findFirst({
          where: {
            provider: 'open_banking',
            OR: [
              { providerOrderId: state },
              { id: { startsWith: 'ob:' } }, // execute path uses id = `ob:${consentId}`
            ],
          },
        });
        if (existing) return;

        const meta = await prisma.oAuthStateMeta.findUnique({ where: { state } }).catch(() => null as any);
        const productId = meta?.productId || null;
        const amountCents = typeof meta?.amountCents === 'number' ? meta.amountCents : null;
        const currency = (meta?.currency as string) || 'BRL';
        const orderRef = (meta?.orderRef as string) || null;
        const deterministicId = `${state}:${productId || 'na'}`;
        await prisma.paymentTransaction.upsert({
          where: { id: deterministicId },
          update: {
            status: 'paid',
            rawPayload: {
              state,
              orderRef,
              productId,
              amountCents,
              currency,
              note: skipJwks ? 'dev-skip-jwks' : 'validated',
            } as any,
          },
          create: {
            id: deterministicId,
            provider: 'open_banking',
            providerOrderId: state,
            paymentMethodType: 'pix_ob',
            amountCents: amountCents ?? 0,
            currency,
            productId: productId || undefined,
            status: 'paid',
            rawPayload: {
              state,
              orderRef,
              productId,
              amountCents,
              currency,
              note: skipJwks ? 'dev-skip-jwks' : 'validated',
            } as any,
          },
        });
      } catch (e) {
        console.warn('[oauth.validate] could not persist PaymentTransaction', { error: String((e as any)?.message || e) });
      }
    };

    // In development, bypass external provider call entirely
    if (skipJwks) {
      // Do NOT mark state as used here; let the callback/token step read code_verifier first
      await persistPaymentTransaction();
      const meta = await prisma.oAuthStateMeta.findUnique({ where: { state } }).catch(() => null as any);
      return NextResponse.json({
        message: 'OAuth callback validated (dev mode); provider call skipped',
        data: { dev: true },
        meta: meta ? {
          state,
          consentId: meta.consentId || null,
          productId: meta.productId || null,
          amountCents: typeof meta.amountCents === 'number' ? meta.amountCents : null,
          currency: meta.currency || 'BRL',
          orderRef: meta.orderRef || null,
        } : null,
      });
    }

    // Optional external call (kept for compatibility)
    const baseUrl = process.env.MOCKBANK_BASE_URL || 'https://matls-api.mockbank.poc.raidiam.io';
    const enrollmentId = process.env.OPEN_BANKING_ENROLLMENT_ID || 'urn:raidiambank:84a00567-76d8-44d9-a9a8-d257d4c7ba8a';
    const url = `${baseUrl}/open-banking/enrollments/v2/enrollments/${encodeURIComponent(enrollmentId)}/fido-registration-options`;

    await persistPaymentTransaction();
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-fapi-interaction-id': crypto.randomUUID(),
      },
      body: JSON.stringify({
        data: {
          platform: (platform || 'BROWSER'),
          tenantId: tenantId || null,
          state,
          code,
          idToken,
        },
      }),
      cache: 'no-store',
    });

    const text = await resp.text();
    let result: any = {};
    try { result = JSON.parse(text); } catch {}

    if (!resp.ok) {
      console.error('[oauth.validate] external provider call failed', {
        url,
        status: resp.status,
        response: result || text,
      });
      return NextResponse.json(
        { message: 'Error validating callback', error: result || text, statusCode: resp.status },
        { status: resp.status || 500 }
      );
    }

    // Mark state as used
    try {
      await prisma.$executeRawUnsafe('UPDATE oauth_states SET used_at = now() WHERE state = $1 AND used_at IS NULL', state);
    } catch {}

    const meta = await prisma.oAuthStateMeta.findUnique({ where: { state } }).catch(() => null as any);
    return NextResponse.json({
      message: 'OAuth callback validated successfully',
      data: result,
      stateExists: !!stateRecord,
      hasCodeVerifier: !!(stateRecord && stateRecord.code_verifier),
      meta: meta ? {
        state,
        consentId: meta.consentId || null,
        productId: meta.productId || null,
        amountCents: typeof meta.amountCents === 'number' ? meta.amountCents : null,
        currency: meta.currency || 'BRL',
        orderRef: meta.orderRef || null,
      } : null,
    });
  } catch (error: any) {
    console.error('[oauth.validate] unexpected exception', {
      error: String(error?.message || error),
      stack: error?.stack ? String(error.stack).split('\n').slice(0, 5) : undefined,
    });
    return NextResponse.json(
      { message: 'Internal Server Error', error: String(error?.message || error) },
      { status: 500 }
    );
  }
}
