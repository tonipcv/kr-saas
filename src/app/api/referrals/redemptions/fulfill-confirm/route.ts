import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/referrals/redemptions/fulfill-confirm?token=...&rid=...
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token') || '';
    const rid = searchParams.get('rid') || '';
    if (!token || !rid) {
      return NextResponse.json({ error: 'Token e rid são obrigatórios' }, { status: 400 });
    }

    const identifier = `fulfill-confirm:${rid}`;
    const vt = await prisma.verificationToken.findUnique({ where: { identifier_token: { identifier, token } } });
    // Build base URL for redirects (prefer configured, else derive from headers)
    let rawBaseUrl = process.env.NEXT_PUBLIC_APP_URL as string | undefined;
    if (!rawBaseUrl) {
      const host = (req.headers.get('x-forwarded-host') || req.headers.get('host') || '').trim();
      const proto = (req.headers.get('x-forwarded-proto') || 'http').trim();
      rawBaseUrl = host ? `${proto}://${host}` : 'http://localhost:3000';
    }
    const baseUrl = rawBaseUrl.replace(/\/+$/, '');

    if (!vt || vt.expires < new Date()) {
      return NextResponse.redirect(new URL(`/patient/referrals?confirm_usage=expired`, baseUrl));
    }

    const redemption = await prisma.rewardRedemption.findUnique({ where: { id: rid } });
    if (!redemption) {
      return NextResponse.redirect(new URL(`/patient/referrals?confirm_usage=not_found`, baseUrl));
    }

    if (redemption.status === 'FULFILLED') {
      await prisma.verificationToken.delete({ where: { identifier_token: { identifier, token } } }).catch(() => {});
      return NextResponse.redirect(new URL(`/patient/referrals?confirm_usage=already`, baseUrl));
    }

    if (redemption.status !== 'APPROVED') {
      await prisma.verificationToken.delete({ where: { identifier_token: { identifier, token } } }).catch(() => {});
      return NextResponse.redirect(new URL(`/patient/referrals?confirm_usage=invalid_status`, baseUrl));
    }

    await prisma.$transaction(async (tx) => {
      await tx.rewardRedemption.update({
        where: { id: rid },
        data: { status: 'FULFILLED', fulfilledAt: new Date() }
      });
      await tx.verificationToken.delete({ where: { identifier_token: { identifier, token } } });
    });

    return NextResponse.redirect(new URL(`/patient/referrals?confirm_usage=ok`, baseUrl));
  } catch (error: any) {
    console.error('[fulfill-confirm] error', error?.message, { stack: error?.stack });
    return NextResponse.redirect(new URL(`/patient/referrals?confirm_usage=error`, (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000')));
  }
}
