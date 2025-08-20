import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendRewardApprovedNotification } from '@/lib/referral-email-service';

// GET /api/referrals/rewards/confirm?token=...&rid=...
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');
    const rid = searchParams.get('rid');

    if (!token || !rid) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    const identifier = `reward-confirm:${rid}`;

    const stored = await prisma.verificationToken.findFirst({
      where: { identifier, token }
    });

    if (!stored) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
    }

    if (stored.expires < new Date()) {
      // cleanup expired
      await prisma.verificationToken.deleteMany({ where: { identifier } }).catch(() => {});
      return NextResponse.json({ error: 'Expired token' }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const redemption = await tx.rewardRedemption.findUnique({
        where: { id: rid },
        include: { reward: { select: { id: true, doctorId: true, title: true } } }
      });

      if (!redemption) throw new Error('Redemption not found');
      if (redemption.status !== 'PENDING') throw new Error('Redemption is not pending');

      // If there is already a code reserved for this redemption, use it; otherwise, select an UNUSED one
      let codeValue = '';
      let reserved = await tx.referralRewardCode.findFirst({
        where: { redemptionId: redemption.id },
        orderBy: { createdAt: 'asc' }
      });

      if (!reserved) {
        const candidate = await tx.referralRewardCode.findFirst({
          where: { rewardId: redemption.rewardId, status: 'UNUSED' },
          orderBy: { createdAt: 'asc' }
        });
        if (!candidate) throw new Error('No codes available for this reward');

        const updateCode = await tx.referralRewardCode.updateMany({
          where: { id: candidate.id, status: 'UNUSED' },
          data: { status: 'USED', redemptionId: redemption.id }
        });
        if (updateCode.count !== 1) throw new Error('Failed to reserve code. Please try again.');

        reserved = await tx.referralRewardCode.findUnique({ where: { id: candidate.id } });
      }

      codeValue = reserved?.code || '';

      // Verify reserved credits
      const needed = Number(redemption.creditsUsed);
      const creditsAgg = await tx.referralCredit.aggregate({
        _sum: { amount: true },
        where: { userId: redemption.userId, isUsed: true, usedForRewardId: redemption.id }
      });
      const reservedTotal = Number(creditsAgg._sum.amount || 0);
      if (reservedTotal < needed) throw new Error('Insufficient reserved credits');

      const approved = await tx.rewardRedemption.update({
        where: { id: redemption.id },
        data: { status: 'APPROVED', uniqueCode: codeValue, fulfilledAt: new Date() },
        include: { user: { select: { id: true, name: true, email: true } }, reward: { select: { title: true } } }
      });

      // Limpar token após uso
      await tx.verificationToken.deleteMany({ where: { identifier } });

      return approved;
    });

    // Send email with the approved code
    try {
      await sendRewardApprovedNotification(result.id);
    } catch (err) {
      console.error('Failed to send approval notification after confirmation:', err);
    }

    // Redirecionar para a página do paciente
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return NextResponse.redirect(`${baseUrl}/patient/referrals?confirmed=1`);
  } catch (error: any) {
    const message = error?.message || 'Internal server error';
    return NextResponse.json({ error: message }, { status: message.includes('codes available') ? 400 : 500 });
  }
}
