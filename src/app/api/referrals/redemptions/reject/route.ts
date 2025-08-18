import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sendRewardRejectedNotification } from '@/lib/referral-email-service';
import { Decimal } from '@prisma/client/runtime/library';

// POST /api/referrals/redemptions/reject
// Body: { redemptionId: string, reason?: string }
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { redemptionId, reason } = await req.json();
    if (!redemptionId) {
      return NextResponse.json({ error: 'redemptionId é obrigatório' }, { status: 400 });
    }

    // Load redemption and ensure it belongs to a reward owned by this doctor and is PENDING
    const redemption = await prisma.rewardRedemption.findUnique({
      where: { id: redemptionId },
      include: { reward: { select: { id: true, doctorId: true } } }
    });

    if (!redemption) {
      return NextResponse.json({ error: 'Resgate não encontrado' }, { status: 404 });
    }

    if (redemption.status !== 'PENDING') {
      return NextResponse.json({ error: 'Somente resgates PENDING podem ser rejeitados' }, { status: 400 });
    }

    if ((redemption as any).reward.doctorId !== session.user.id) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    // Rejection transaction:
    // - Set status to REJECTED, store optional reason in notes
    // - Decrement reward.currentRedemptions (floor at 0)
    // - Release reserved credits (we no longer create refund credits because points were reserved at creation)
    const result = await prisma.$transaction(async (tx) => {
      // Safety: revert any credits that might have been marked as used for this redemption
      await tx.referralCredit.updateMany({
        where: { usedForRewardId: redemption.id, isUsed: true },
        data: { isUsed: false, usedAt: null, usedForRewardId: null }
      });

      // Safety: release any referral reward code linked to this redemption
      await tx.referralRewardCode.updateMany({
        where: { redemptionId: redemption.id },
        data: { status: 'UNUSED', redemptionId: null }
      });

      const updated = await tx.rewardRedemption.update({
        where: { id: redemption.id },
        data: {
          status: 'REJECTED',
          notes: reason ?? null,
          fulfilledAt: new Date(), // Registrar data da rejeição
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          reward: { select: { id: true, title: true, currentRedemptions: true } }
        }
      });

      // Decrement reward counter safely
      const currentCount = Number((updated.reward as any).currentRedemptions || 0);
      if (currentCount > 0) {
        await tx.referralReward.update({
          where: { id: updated.reward.id },
          data: { currentRedemptions: { decrement: 1 } }
        });
      }

      // Como os créditos foram apenas reservados na criação, não criamos crédito extra aqui
      return updated;
    });

    // Notify patient about rejection
    try {
      await sendRewardRejectedNotification(result.id, reason);
    } catch (notifyErr) {
      console.error('Erro ao enviar notificação de rejeição:', notifyErr);
    }

    return NextResponse.json({ success: true, redemption: result });
  } catch (error: any) {
    console.error('Erro ao rejeitar resgate:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno do servidor' }, { status: 500 });
  }
}
