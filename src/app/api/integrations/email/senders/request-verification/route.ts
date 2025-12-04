import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import crypto from 'crypto';

// Native verification email using htps.io infra (via SendPulse SMTP API), no DB.
// Env required:
// - SENDPULSE_CLIENT_ID
// - SENDPULSE_CLIENT_SECRET
// - EMAIL_FROM (verified sender in our SendPulse account)
// - EMAIL_FROM_NAME (e.g., htps.io)
// - EMAIL_VERIFY_SECRET (HMAC secret to sign tokens)

const BASE_URL = 'https://api.sendpulse.com';

function b64url(input: Buffer | string) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function sign(data: object, secret: string) {
  const header = { alg: 'HS256', typ: 'JWT' } as const;
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(data));
  const sig = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `${h}.${p}.${sig}`;
}

async function getAccessToken() {
  const clientId = process.env.SENDPULSE_CLIENT_ID;
  const clientSecret = process.env.SENDPULSE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { error: 'Missing SENDPULSE_CLIENT_ID or SENDPULSE_CLIENT_SECRET in environment' };
  }
  const res = await fetch(`${BASE_URL}/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: json?.error_description || json?.error || `Auth failed (${res.status})` };
  }
  const token = json?.access_token;
  if (!token) return { error: 'No access_token returned by SendPulse' };
  return { token };
}

export async function POST(req: NextRequest) {
  try {
    const { clinicId, email, name } = await req.json();
    if (!clinicId) return NextResponse.json({ error: 'clinicId required' }, { status: 400 });
    if (!email || typeof email !== 'string') return NextResponse.json({ error: 'email required' }, { status: 400 });
    const FROM = process.env.EMAIL_FROM;
    const FROM_NAME = process.env.EMAIL_FROM_NAME || 'htps.io';
    const SECRET = process.env.EMAIL_VERIFY_SECRET;
    if (!FROM || !SECRET) return NextResponse.json({ error: 'Missing EMAIL_FROM or EMAIL_VERIFY_SECRET env' }, { status: 500 });

    // Create a 6-digit code and session token (no DB)
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expSec = Math.floor(Date.now() / 1000) + 15 * 60; // 15 minutes
    const session = sign({ clinicId, email, name: name || null, code, exp: expSec }, SECRET);

    // Compose email
    const subject = 'Confirme seu remetente de email';
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
    const confirmLink = `${baseUrl}/api/integrations/email/senders/confirm?token=${encodeURIComponent(session)}`;
    const text = `Olá${name ? ' ' + name : ''},\n\nSeu código para confirmar o remetente é: ${code}.\nOu acesse: ${confirmLink}\n\nEste código expira em 15 minutos.\n— Equipe htps.io`;
    const html = `<!doctype html><html><head><meta charset="utf-8"/></head><body>
      <div style="max-width:560px;margin:0 auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
        <div style="background:#111827;color:#fff;padding:14px 18px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:600">htps.io</div>
        <div style="padding:18px 18px 8px 18px;font-family:Arial,Helvetica,sans-serif;color:#111827">
          <p style="margin:0 0 12px 0;">Olá${name ? ' ' + name : ''},</p>
          <p style="margin:0 0 16px 0;">Use o código abaixo para confirmar seu remetente de email:</p>
          <div style="font-size:28px;letter-spacing:4px;font-weight:700;background:#f3f4f6;border:1px dashed #d1d5db;border-radius:10px;color:#111827;padding:12px 16px;text-align:center;margin:0 0 12px 0;">${code}</div>
          <p style="margin:0 0 12px 0;">Ou clique no link:</p>
          <p style="margin:0 0 16px 0;"><a href="${confirmLink}" style="color:#2563eb;text-decoration:underline">${confirmLink}</a></p>
          <p style="margin:0 0 12px 0;color:#6b7280">Este código expira em 15 minutos.</p>
          <p style="margin:0 0 0 0;">— Equipe htps.io</p>
        </div>
      </div>
    </body></html>`;

    // Send via SendPulse SMTP API
    const auth = await getAccessToken();
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: 500 });
    const res = await fetch(`${BASE_URL}/smtp/emails`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.token}`,
      },
      body: JSON.stringify({
        email: {
          subject,
          from: { name: FROM_NAME, email: FROM },
          to: [ { email } ],
          html,
          text,
        }
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (process.env.NODE_ENV !== 'production') {
      console.log('[EmailVerify] Sent via SendPulse SMTP API', {
        ok: res.ok,
        status: res.status,
        htmlBytes: Buffer.byteLength(html, 'utf8'),
        textBytes: Buffer.byteLength(text, 'utf8'),
      });
    }
    if (!res.ok) {
      return NextResponse.json({ error: data?.message || data?.error || `SendPulse error (${res.status})`, details: data }, { status: 400 });
    }

    // Optional audit log in DB (no throw if it fails) – store sender_name for nicer From display
    try {
      if (process.env.ENABLE_EMAIL_SENDER_LOG === 'true' && process.env.DATABASE_URL) {
        const pool = new Pool({ connectionString: process.env.DATABASE_URL });
        await pool.query(
          'INSERT INTO email_sender_verification (clinic_id, email, status, sender_name, created_at) VALUES ($1, $2, $3, $4, now())',
          [clinicId, email, 'pending', name || null]
        );
        await pool.end();
      }
    } catch (e) {
      console.warn('[EmailSenderVerification] Audit insert failed (non-blocking):', (e as any)?.message || e);
    }

    return NextResponse.json({ success: true, status: 'pending', sessionToken: session });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500 });
  }
}
