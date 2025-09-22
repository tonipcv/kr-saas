import { NextRequest, NextResponse } from 'next/server';
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
    return { valid: true, payload };
  } catch (e: any) {
    return { valid: false, reason: 'invalid payload' };
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || '';
  const secret = process.env.EMAIL_VERIFY_SECRET;
  if (!secret) return NextResponse.json({ error: 'Missing EMAIL_VERIFY_SECRET env' }, { status: 500 });
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });
  const v = verify(token, secret);
  if (!v.valid) return NextResponse.json({ status: 'INVALID', reason: v.reason || 'invalid token' }, { status: 200 });

  // Expired?
  if (v.payload?.exp && Math.floor(Date.now() / 1000) > Number(v.payload.exp)) {
    return NextResponse.json({ status: 'EXPIRED' });
  }

  // If user clicked confirmation link, our GET /confirm set a short cookie with a hash of the token
  const hash = crypto.createHash('sha256').update(token).digest('hex').slice(0, 24);
  const cookie = req.headers.get('cookie') || '';
  const seen = cookie.split(';').some(c => c.trim().startsWith(`email_verified_hash=${hash}`));
  if (seen) return NextResponse.json({ status: 'VERIFIED', email: v.payload?.email || null });

  return NextResponse.json({ status: 'PENDING' });
}
