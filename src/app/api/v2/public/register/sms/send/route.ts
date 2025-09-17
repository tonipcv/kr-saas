import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Requires env SMSDEV_KEY
const SMSDEV_ENDPOINT = 'https://api.smsdev.com.br/v1/send';

function onlyDigits(s: string) {
  return (s || '').replace(/\D+/g, '');
}

export async function POST(req: NextRequest) {
  try {
    const { phone, refer } = await req.json();
    const apiKey = process.env.SMSDEV_KEY;
    if (!apiKey) {
      console.error('[sms/send] Missing SMSDEV_KEY');
      return NextResponse.json({ error: 'Missing SMSDEV_KEY' }, { status: 500 });
    }
    const rawPhone = onlyDigits(phone);
    console.log('[sms/send] request', { phone, refer, rawPhone });
    if (!rawPhone) {
      console.warn('[sms/send] invalid phone');
      return NextResponse.json({ error: 'Invalid phone' }, { status: 400 });
    }

    // Generate 6-digit code and set 10-minute expiry
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000);

    // Persist verification token keyed by phone
    await prisma.verificationToken.deleteMany({ where: { identifier: rawPhone } });
    await prisma.verificationToken.create({
      data: {
        identifier: rawPhone,
        token: code,
        expires,
      },
    });

    const msg = `Seu código de verificação: ${code}`;
    const params = new URLSearchParams({
      key: apiKey,
      type: '9',
      number: rawPhone,
      msg,
    });
    if (refer) params.set('refer', String(refer).slice(0, 100));

    const url = `${SMSDEV_ENDPOINT}?${params.toString()}`;
    console.log('[sms/send] provider url', url.replace(apiKey, '***')); // hide key
    const res = await fetch(url, { method: 'GET' });
    const text = await res.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch {}
    console.log('[sms/send] provider response', { status: res.status, body: parsed ?? text });

    // SMSDev returns JSON array string; we won't block on specific content if HTTP 200
    if (!res.ok) {
      return NextResponse.json({ error: 'SMS send failed', providerStatus: res.status, providerBody: parsed ?? text }, { status: 502 });
    }

    return NextResponse.json({ success: true, providerStatus: res.status, providerBody: parsed ?? text });
  } catch (e: any) {
    console.error('[sms/send] error', e);
    return NextResponse.json({ error: 'Internal server error', details: e?.message || String(e) }, { status: 500 });
  }
}
