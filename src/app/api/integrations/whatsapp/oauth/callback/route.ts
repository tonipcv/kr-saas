import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { encryptSecret } from '@/lib/crypto';

function parseState(state: string | null) {
  if (!state) return null;
  try {
    const json = Buffer.from(state, 'base64url').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const GRAPH_BASE = process.env.WHATSAPP_GRAPH_BASE || 'https://graph.facebook.com';
    const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v20.0';
    const FB_APP_ID = process.env.FB_APP_ID || '';
    const FB_APP_SECRET = process.env.FB_APP_SECRET || '';
    const FB_REDIRECT_URI = process.env.FB_REDIRECT_URI || '';
    if (!FB_APP_ID || !FB_APP_SECRET || !FB_REDIRECT_URI) {
      return NextResponse.json({ error: 'Missing FB app env vars' }, { status: 500 });
    }

    const currentUrl = new URL(req.url);
    const { searchParams } = currentUrl;
    const origin = `${currentUrl.protocol}//${currentUrl.host}`;
    const code = searchParams.get('code');
    const stateRaw = searchParams.get('state');
    const st = parseState(stateRaw);
    if (!code || !st?.clinicId) {
      return NextResponse.json({ error: 'Invalid callback params' }, { status: 400 });
    }

    // Exchange code for access_token
    const tokenUrl = `${GRAPH_BASE}/${GRAPH_VERSION}/oauth/access_token?client_id=${encodeURIComponent(FB_APP_ID)}&client_secret=${encodeURIComponent(FB_APP_SECRET)}&redirect_uri=${encodeURIComponent(FB_REDIRECT_URI)}&code=${encodeURIComponent(code)}`;
    const tokenRes = await fetch(tokenUrl, { method: 'GET', cache: 'no-store' });
    if (!tokenRes.ok) {
      const text = await tokenRes.text().catch(() => '');
      const destPath = st.returnTo || '/doctor/integrations';
      const dest = new URL(destPath, origin);
      dest.searchParams.set('wa_oauth', 'error');
      dest.searchParams.set('reason', text);
      return NextResponse.redirect(dest.toString());
    }
    const tokenData = await tokenRes.json();
    const accessToken = tokenData?.access_token as string | undefined;
    if (!accessToken) {
      const destPath = st.returnTo || '/doctor/integrations';
      const dest = new URL(destPath, origin);
      dest.searchParams.set('wa_oauth', 'error');
      dest.searchParams.set('reason', 'no_token');
      return NextResponse.redirect(dest.toString());
    }

    // Store temporary token in clinic_integrations as WHATSAPP_TMP for the clinic
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS clinic_integrations (
        id TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
        clinic_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        api_key_enc TEXT NOT NULL,
        iv TEXT NOT NULL,
        instance_id TEXT,
        phone TEXT,
        status TEXT,
        last_seen_at TIMESTAMPTZ,
        waba_id TEXT,
        meta JSONB,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    const enc = encryptSecret(accessToken);
    await prisma.$executeRawUnsafe(
      `INSERT INTO clinic_integrations (clinic_id, provider, api_key_enc, iv, status, updated_at)
       VALUES ($1, 'WHATSAPP_TMP', $2, $3, 'CONNECTED', now())
       ON CONFLICT (clinic_id, provider)
       DO UPDATE SET api_key_enc = EXCLUDED.api_key_enc, iv = EXCLUDED.iv, status = EXCLUDED.status, updated_at = now()`,
      st.clinicId,
      enc.cipherText,
      enc.iv,
    );

    {
      const destPath = st.returnTo || '/doctor/integrations';
      const dest = new URL(destPath, origin);
      dest.searchParams.set('wa_oauth', 'ok');
      return NextResponse.redirect(dest.toString());
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
  }
}
