import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { verifyMobileAuth } from '@/lib/mobile-auth';

// POST /api/referrals/redemptions/cancel
// Body: { redemptionId: string }
export async function POST(req: Request) {
  try {
    // Auth: web or mobile
    const session = await getServerSession(authOptions);
    let userId = session?.user?.id || null;
    if (!userId) {
      const mobileUser = await verifyMobileAuth(req as any);
      if (mobileUser) userId = mobileUser.id;
    }
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { redemptionId } = await req.json();
    if (!redemptionId) {
      return NextResponse.json({ error: 'redemptionId é obrigatório' }, { status: 400 });
    }

    // Load redemption and ensure it belongs to this user and is PENDING
    const redemption = await prisma.rewardRedemption.findUnique({
      where: { id: redemptionId },
      select: { id: true, userId: true, status: true }
    });

    if (!redemption) {
      return NextResponse.json({ error: 'Resgate não encontrado' }, { status: 404 });
    }
    if (redemption.userId !== userId) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }
    if (redemption.status !== 'PENDING') {
      return NextResponse.json({ error: 'Somente resgates PENDING podem ser cancelados' }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Release reserved credits
      await tx.referralCredit.updateMany({
        where: { usedForRewardId: redemption.id, isUsed: true },
        data: { isUsed: false, usedAt: null, usedForRewardId: null }
      });

      // Release any referral reward code linked (if any)
      await tx.referralRewardCode.updateMany({
        where: { redemptionId: redemption.id },
        data: { status: 'UNUSED', redemptionId: null }
      });

      // Update redemption status to CANCELLED
      const updated = await tx.rewardRedemption.update({
        where: { id: redemption.id },
        data: { status: 'CANCELLED' }
      });

      return updated;
    });

    return NextResponse.json({ success: true, redemption: result, message: 'Resgate cancelado e pontos liberados.' });
  } catch (error: any) {
    console.error('Erro ao cancelar resgate:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno do servidor' }, { status: 500 });
  }
}
