import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import crypto from 'crypto';

function b64urlDecode(input: string) {
  input = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = input.length % 4;
  if (pad) input += '='.repeat(4 - pad);
  return Buffer.from(input, 'base64').toString();
}

function verify(token: string, secret: string): { valid: boolean; payload?: any; reason?: string } {
  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false, reason: 'invalid token format' };
  const [h, p, s] = parts;
  const sig = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  if (sig !== s) return { valid: false, reason: 'invalid signature' };
  try {
    const payload = JSON.parse(b64urlDecode(p));
    if (payload?.exp && Math.floor(Date.now() / 1000) > Number(payload.exp)) {
      return { valid: false, reason: 'token expired' };
    }
    return { valid: true, payload };
  } catch (e: any) {
    return { valid: false, reason: 'invalid payload' };
  }
}

export async function GET(req: NextRequest) {
  // Confirmation via link for humans: show friendly HTML and set a short-lived cookie to signal verification
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || '';
  const code = url.searchParams.get('code') || undefined;
  const secret = process.env.EMAIL_VERIFY_SECRET;
  if (!secret) return new Response('Missing EMAIL_VERIFY_SECRET env', { status: 500 });
  const v = verify(token, secret);
  if (!v.valid) return new Response(`<h2>Confirmação inválida</h2><p>${v.reason || 'Token inválido'}</p>`, { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  if (code && v.payload?.code && code !== String(v.payload.code)) {
    return new Response(`<h2>Código incorreto</h2><p>Verifique o código informado.</p>`, { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
  // Set cookie with hash of token (no PII) valid for 20 min
  const hash = crypto.createHash('sha256').update(token).digest('hex').slice(0, 24);
  const body = `<h2>Remetente confirmado</h2><p>O endereço ${v.payload?.email || ''} foi verificado com sucesso. Você pode fechar esta aba.</p>`;
  const res = new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  const expires = new Date(Date.now() + 20 * 60 * 1000);
  const isProd = process.env.NODE_ENV === 'production';
  res.headers.append('Set-Cookie', `email_verified_hash=${hash}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires.toUTCString()}; ${isProd ? 'Secure;' : ''}`);

  // Optional DB update (non-blocking) to mark verified
  try {
    if (process.env.ENABLE_EMAIL_SENDER_LOG === 'true' && process.env.DATABASE_URL && v.payload?.clinicId && v.payload?.email) {
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      await pool.query(
        `WITH last_row AS (
           SELECT id FROM email_sender_verification
           WHERE clinic_id = $1 AND lower(email) = lower($2)
           ORDER BY created_at DESC
           LIMIT 1
         )
         UPDATE email_sender_verification SET status = 'verified'
         WHERE id IN (SELECT id FROM last_row)`,
        [String(v.payload.clinicId), String(v.payload.email)]
      );
      await pool.end();
    }
  } catch (e) {
    console.warn('[EmailSenderVerification] GET confirm: update failed (non-blocking):', (e as any)?.message || e);
  }
  return res;
}

export async function POST(req: NextRequest) {
  // Programmatic confirmation: UI pode enviar token + code e receber JSON
  try {
    const { token, code } = await req.json();
    const secret = process.env.EMAIL_VERIFY_SECRET;
    if (!secret) return NextResponse.json({ error: 'Missing EMAIL_VERIFY_SECRET env' }, { status: 500 });
    if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });
    const v = verify(token, secret);
    if (!v.valid) return NextResponse.json({ error: v.reason || 'invalid token' }, { status: 400 });
    if (code && v.payload?.code && String(code) !== String(v.payload.code)) {
      return NextResponse.json({ error: 'invalid code' }, { status: 400 });
    }
    // Optional DB update (non-blocking) to mark verified
    try {
      if (process.env.ENABLE_EMAIL_SENDER_LOG === 'true' && process.env.DATABASE_URL && v.payload?.clinicId && v.payload?.email) {
        const pool = new Pool({ connectionString: process.env.DATABASE_URL });
        await pool.query(
          `WITH last_row AS (
             SELECT id FROM email_sender_verification
             WHERE clinic_id = $1 AND lower(email) = lower($2)
             ORDER BY created_at DESC
             LIMIT 1
           )
           UPDATE email_sender_verification SET status = 'verified'
           WHERE id IN (SELECT id FROM last_row)`,
          [String(v.payload.clinicId), String(v.payload.email)]
        );
        await pool.end();
      }
    } catch (e) {
      console.warn('[EmailSenderVerification] POST confirm: update failed (non-blocking):', (e as any)?.message || e);
    }
    return NextResponse.json({ success: true, status: 'VERIFIED', email: v.payload?.email || null });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500 });
  }
}
