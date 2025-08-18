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
      return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 });
    }

    const identifier = `reward-confirm:${rid}`;

    const stored = await prisma.verificationToken.findFirst({
      where: { identifier, token }
    });

    if (!stored) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 400 });
    }

    if (stored.expires < new Date()) {
      // cleanup expired
      await prisma.verificationToken.deleteMany({ where: { identifier } }).catch(() => {});
      return NextResponse.json({ error: 'Token expirado' }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const redemption = await tx.rewardRedemption.findUnique({
        where: { id: rid },
        include: { reward: { select: { id: true, doctorId: true, title: true } } }
      });

      if (!redemption) throw new Error('Resgate não encontrado');
      if (redemption.status !== 'PENDING') throw new Error('Resgate não está pendente');

      // Se já há um código reservado para este resgate, usar ele; caso contrário, selecionar um UNUSED
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
        if (!candidate) throw new Error('Não há códigos disponíveis para esta recompensa');

        const updateCode = await tx.referralRewardCode.updateMany({
          where: { id: candidate.id, status: 'UNUSED' },
          data: { status: 'USED', redemptionId: redemption.id }
        });
        if (updateCode.count !== 1) throw new Error('Falha ao reservar código. Tente novamente.');

        reserved = await tx.referralRewardCode.findUnique({ where: { id: candidate.id } });
      }

      codeValue = reserved?.code || '';

      // Verificar créditos reservados
      const needed = Number(redemption.creditsUsed);
      const creditsAgg = await tx.referralCredit.aggregate({
        _sum: { amount: true },
        where: { userId: redemption.userId, isUsed: true, usedForRewardId: redemption.id }
      });
      const reservedTotal = Number(creditsAgg._sum.amount || 0);
      if (reservedTotal < needed) throw new Error('Créditos reservados insuficientes');

      const approved = await tx.rewardRedemption.update({
        where: { id: redemption.id },
        data: { status: 'APPROVED', uniqueCode: codeValue, fulfilledAt: new Date() },
        include: { user: { select: { id: true, name: true, email: true } }, reward: { select: { title: true } } }
      });

      // Limpar token após uso
      await tx.verificationToken.deleteMany({ where: { identifier } });

      return approved;
    });

    // Enviar e-mail com o código aprovado
    try {
      await sendRewardApprovedNotification(result.id);
    } catch (err) {
      console.error('Falha ao enviar notificação de aprovação após confirmação:', err);
    }

    // Redirecionar para a página do paciente
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return NextResponse.redirect(`${baseUrl}/patient/referrals?confirmed=1`);
  } catch (error: any) {
    const message = error?.message || 'Erro interno do servidor';
    return NextResponse.json({ error: message }, { status: message.includes('códigos disponíveis') ? 400 : 500 });
  }
}
