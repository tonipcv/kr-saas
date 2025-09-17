import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { emitEvent } from '@/lib/events';
import { EventActor, EventType } from '@prisma/client';

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

    const redemption = await prisma.rewardRedemption.findUnique({
      where: { id: rid },
      include: {
        user: { select: { id: true } },
        reward: { select: { id: true, doctorId: true, clinicId: true } },
      }
    });
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

    // Emit analytics (non-blocking): reward_redeemed and points_spent
    try {
      // Resolve clinicId: prefer reward.clinicId; otherwise from doctor ownership/membership
      let clinicId: string | null = (redemption as any)?.reward?.clinicId ?? null;
      const doctorId: string | null = (redemption as any)?.reward?.doctorId ?? null;
      if (!clinicId && doctorId) {
        try {
          const owned = await prisma.clinic.findFirst({ where: { ownerId: doctorId }, select: { id: true } });
          if (owned?.id) clinicId = owned.id;
        } catch {}
        if (!clinicId) {
          try {
            const membership = await prisma.clinicMember.findFirst({ where: { userId: doctorId, isActive: true }, select: { clinicId: true } });
            if (membership?.clinicId) clinicId = membership.clinicId;
          } catch {}
        }
      }
      if (clinicId) {
        const customerId: string | null = (redemption as any)?.user?.id ?? null;
        // reward_redeemed
        await emitEvent({
          eventType: EventType.reward_redeemed,
          actor: EventActor.customer,
          clinicId,
          customerId: customerId ?? undefined,
          metadata: { reward_id: (redemption as any)?.reward?.id || rid },
        });
        // points_spent (reflects consumption on fulfillment)
        try {
          const rd = await prisma.rewardRedemption.findUnique({ where: { id: rid }, select: { creditsUsed: true } });
          const value = rd ? Number((rd as any).creditsUsed) : null;
          await emitEvent({
            eventType: EventType.points_spent,
            actor: EventActor.customer,
            clinicId,
            customerId: customerId ?? undefined,
            metadata: { value, usage: 'gift' },
          });
        } catch {}
      }
    } catch (e) {
      console.error('[events] reward_redeemed/points_spent emit failed', e);
    }

    return NextResponse.redirect(new URL(`/patient/referrals?confirm_usage=ok`, baseUrl));
  } catch (error: any) {
    console.error('[fulfill-confirm] error', error?.message, { stack: error?.stack });
    return NextResponse.redirect(new URL(`/patient/referrals?confirm_usage=error`, (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000')));
  }
}
