import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sendRewardApprovedNotification } from '@/lib/referral-email-service';

// POST /api/referrals/redemptions/approve
// Body: { redemptionId: string }
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { redemptionId } = await req.json();
    if (!redemptionId) {
      return NextResponse.json({ error: 'redemptionId é obrigatório' }, { status: 400 });
    }

    // Load redemption and ensure it belongs to a reward owned by this doctor and is PENDING
    const redemption = await prisma.rewardRedemption.findUnique({
      where: { id: redemptionId },
      include: { reward: { select: { id: true, doctorId: true, title: true } } }
    });

    if (!redemption) {
      return NextResponse.json({ error: 'Resgate não encontrado' }, { status: 404 });
    }

    if (redemption.status !== 'PENDING') {
      return NextResponse.json({ error: 'Somente resgates PENDING podem ser aprovados' }, { status: 400 });
    }

    if ((redemption as any).reward.doctorId !== session.user.id) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    // Execute approval inside a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Step 1-2: Select an UNUSED code from pool for this reward
      const candidate = await tx.referralRewardCode.findFirst({
        where: { rewardId: redemption.rewardId, status: 'UNUSED' },
        orderBy: { createdAt: 'asc' },
      });

      if (!candidate) {
        throw new Error('Não há códigos disponíveis para esta recompensa');
      }

      // Step 3: Mark code as USED and associate to redemption atomically (optimistic concurrency by status check)
      const updateCode = await tx.referralRewardCode.updateMany({
        where: { id: candidate.id, status: 'UNUSED' },
        data: { status: 'USED', redemptionId: redemption.id },
      });

      if (updateCode.count !== 1) {
        throw new Error('Falha ao reservar código. Tente novamente.');
      }

      // Reload the code to get the string
      const usedCode = await tx.referralRewardCode.findUnique({ where: { id: candidate.id } });
      const codeValue = usedCode?.code || '';

      // Step 4: Validate that credits were reserved at creation (no extra consumption here)
      const needed = Number(redemption.creditsUsed);
      const reserved = await tx.referralCredit.aggregate({
        _sum: { amount: true },
        where: { userId: redemption.userId, isUsed: true, usedForRewardId: redemption.id }
      });
      const reservedTotal = Number(reserved._sum.amount || 0);
      if (reservedTotal < needed) {
        throw new Error('Créditos reservados insuficientes para aprovar este resgate');
      }

      // Step 5-6: Update redemption with code and status APPROVED
      const approved = await tx.rewardRedemption.update({
        where: { id: redemption.id },
        data: {
          status: 'APPROVED',
          uniqueCode: codeValue,
          fulfilledAt: new Date(),
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          reward: { select: { title: true } }
        }
      });

      return approved;
    });

    // Step 6: Notify patient with the code
    try {
      await sendRewardApprovedNotification(result.id);
    } catch (notifyErr) {
      console.error('Erro ao enviar notificação de aprovação:', notifyErr);
    }

    return NextResponse.json({ success: true, redemption: result });
  } catch (error: any) {
    const message = error?.message || 'Erro interno do servidor';
    const status = message.includes('códigos disponíveis') || message.includes('reservar código') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
