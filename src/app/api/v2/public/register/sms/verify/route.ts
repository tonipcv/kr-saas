import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function onlyDigits(s: string) {
  return (s || '').replace(/\D+/g, '');
}

export async function POST(req: NextRequest) {
  try {
    const { phone, code } = await req.json();
    const rawPhone = onlyDigits(phone);
    console.log('[sms/verify] request', { phone, rawPhone, codeLen: (code || '').length });
    if (!rawPhone || !code) {
      console.warn('[sms/verify] invalid params');
      return NextResponse.json({ error: 'Invalid params' }, { status: 400 });
    }

    const token = await prisma.verificationToken.findFirst({
      where: { identifier: rawPhone, token: String(code) },
    });
    if (!token) {
      console.warn('[sms/verify] token not found');
      return NextResponse.json({ error: 'Invalid code' }, { status: 400 });
    }
    if (token.expires && token.expires < new Date()) {
      console.warn('[sms/verify] token expired');
      await prisma.verificationToken.deleteMany({ where: { identifier: rawPhone } });
      return NextResponse.json({ error: 'Code expired' }, { status: 400 });
    }

    await prisma.verificationToken.deleteMany({ where: { identifier: rawPhone } });
    console.log('[sms/verify] success');
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[sms/verify] error', e);
    return NextResponse.json({ error: 'Internal server error', details: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
