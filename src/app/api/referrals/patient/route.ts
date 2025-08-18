import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getUserCreditsBalance, ensureUserHasReferralCode } from '@/lib/referral-utils';
import { verifyMobileAuth } from '@/lib/mobile-auth';

// GET - Dashboard do paciente (créditos, indicações, recompensas)
export async function GET(request: NextRequest) {
  try {
    // Tentar autenticação web primeiro
    const session = await getServerSession(authOptions);
    let userId = session?.user?.id;

    // Se não há sessão web, tentar autenticação mobile
    if (!userId) {
      const mobileUser = await verifyMobileAuth(request);
      if (mobileUser) {
        userId = mobileUser.id;
      }
    }
    
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Verificar se é paciente
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { 
        role: true,
        doctor_id: true,
        referral_code: true
      }
    });

    if (!user || user.role !== 'PATIENT') {
      return NextResponse.json({ error: 'Acesso negado. Apenas pacientes podem acessar esta funcionalidade.' }, { status: 403 });
    }

    // Garantir que o usuário tenha um código de indicação
    let referralCode;
    try {
      referralCode = await ensureUserHasReferralCode(userId);
      
    } catch (referralError) {
      console.error('Erro ao gerar código de indicação:', referralError instanceof Error ? referralError.message : String(referralError));
      // Se falhar, usar o código existente do usuário ou null
      referralCode = (user as any)?.referral_code || null;
    }

    // Buscar saldo de créditos atual
    const creditsBalance = await getUserCreditsBalance(userId);

    // Buscar histórico de créditos
    const creditsHistory = await prisma.referralCredit.findMany({
      where: { userId: userId },
      include: {
        referral_leads: {
          select: { name: true, email: true, status: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    // Buscar indicações feitas pelo usuário
    const referralsMade = await prisma.referralLead.findMany({
      where: { referrerId: userId },
      include: {
        doctor: {
          select: { id: true, name: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    // Resolver médico do paciente (para header e rewards)
    // 1) Tentar via user.doctor_id
    // 2) Fallback: relacionamento primário+ativo, senão ativo, senão qualquer
    let resolvedDoctor: { id: string; name: string | null; email: string | null; image: string | null; doctor_slug?: string | null } | null = null;
    if ((user as any)?.doctor_id) {
      const doc = await prisma.user.findUnique({
        where: { id: (user as any).doctor_id as string },
        select: { id: true, name: true, email: true, image: true, doctor_slug: true }
      });
      if (doc) resolvedDoctor = doc as any;
    }
    if (!resolvedDoctor) {
      const rels = await prisma.doctorPatientRelationship.findMany({
        where: { patientId: userId },
        include: { doctor: { select: { id: true, name: true, email: true, image: true, doctor_slug: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
      const primaryActive = rels.find(r => (r as any)?.isPrimary && (r as any)?.isActive && (r as any)?.doctor);
      const active = rels.find(r => (r as any)?.isActive && (r as any)?.doctor);
      const anyRel = rels.find(r => (r as any)?.doctor);
      const chosen: any = primaryActive || active || anyRel || null;
      if (chosen?.doctor) {
        resolvedDoctor = {
          id: chosen.doctor.id,
          name: chosen.doctor.name,
          email: chosen.doctor.email,
          image: chosen.doctor.image as any,
          doctor_slug: (chosen.doctor as any)?.doctor_slug || null,
        };
      }
    }
    const doctorInfo: { id: string; name: string | null; email: string | null; image: string | null } | null = resolvedDoctor
      ? { id: resolvedDoctor.id, name: resolvedDoctor.name, email: resolvedDoctor.email, image: resolvedDoctor.image as any }
      : null;

    // Buscar recompensas disponíveis (do médico resolvido para o paciente)
    let availableRewards: any[] = [];
    const resolvedDoctorId = (resolvedDoctor as any)?.id || (user as any)?.doctor_id || null;
    if (resolvedDoctorId) {
      availableRewards = await prisma.referralReward.findMany({
        where: {
          doctorId: resolvedDoctorId,
          isActive: true
        },
        include: {
          // Incluir apenas resgates aprovados/entregues para não bloquear por pendentes
          redemptions: {
            where: { status: { in: ['APPROVED', 'FULFILLED'] } },
            select: { id: true }
          }
        },
        orderBy: { costInCredits: 'asc' }
      });
    }

    // Buscar histórico de resgates
    const redemptionsHistory = await prisma.rewardRedemption.findMany({
      where: { userId: userId },
      include: {
        reward: {
          select: { title: true, description: true, costInCredits: true }
        }
      },
      orderBy: { redeemedAt: 'desc' },
      take: 10
    });

    // Estatísticas
    const stats = {
      totalReferrals: referralsMade.length,
      convertedReferrals: referralsMade.filter(r => r.status === 'CONVERTED').length,
      totalCreditsEarned: creditsHistory.reduce((sum, credit: any) => sum + Number(credit.amount), 0),
      totalCreditsUsed: redemptionsHistory.reduce((sum, redemption: any) => sum + Number(redemption.creditsUsed), 0),
      currentBalance: creditsBalance
    };

    return NextResponse.json({
      stats,
      creditsBalance,
      creditsHistory: creditsHistory.map((credit: any) => ({
        id: credit.id,
        amount: Number(credit.amount),
        type: credit.type,
        createdAt: credit.createdAt,
        lead: credit.referral_leads ? {
          name: credit.referral_leads.name,
          email: credit.referral_leads.email,
          status: credit.referral_leads.status
        } : null
      })),
      referralsMade: referralsMade.map((referral: any) => ({
        id: referral.id,
        name: referral.name,
        email: referral.email,
        status: referral.status,
        createdAt: referral.createdAt,
        doctor: referral.doctor,
        credits: (creditsHistory as any[]).filter((c: any) => c.referralLeadId === referral.id).map((c: any) => ({
          id: c.id,
          amount: Number(c.amount),
          status: c.isUsed ? 'USED' : 'AVAILABLE'
        }))
      })),
      availableRewards: availableRewards.map((reward: any) => ({
        id: reward.id,
        title: reward.title,
        description: reward.description,
        creditsRequired: Number(reward.costInCredits),
        maxRedemptions: reward.maxRedemptions,
        currentRedemptions: Array.isArray((reward as any).redemptions) ? (reward as any).redemptions.length : 0,
        isActive: reward.isActive
      })),
      redemptionsHistory: redemptionsHistory.map((redemption: any) => ({
        id: redemption.id,
        creditsUsed: Number(redemption.creditsUsed),
        status: redemption.status,
        redeemedAt: redemption.redeemedAt,
        uniqueCode: redemption.uniqueCode || null,
        reward: {
          title: redemption.reward.title,
          description: redemption.reward.description,
          creditsRequired: Number(redemption.reward.costInCredits)
        }
      })),
      doctorId: resolvedDoctorId,
      doctorName: doctorInfo?.name || null,
      doctor: doctorInfo,
      doctorSlug: (resolvedDoctor as any)?.doctor_slug || null,
      referralCode: referralCode
    });

  } catch (error) {
    console.error('Erro ao buscar dados do paciente:', error instanceof Error ? error.message : String(error));
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

// POST - Resgatar recompensa
export async function POST(req: NextRequest) {
  try {
    // Tentar autenticação web primeiro
    const session = await getServerSession(authOptions);
    let userId = session?.user?.id;

    // Se não há sessão web, tentar autenticação mobile
    if (!userId) {
      const mobileUser = await verifyMobileAuth(req);
      if (mobileUser) {
        userId = mobileUser.id;
      }
    }
    
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Verificar se é paciente
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    });

    if (!user || user.role !== 'PATIENT') {
      return NextResponse.json({ error: 'Acesso negado. Apenas pacientes podem resgatar recompensas.' }, { status: 403 });
    }

    const { rewardId } = await req.json();

    if (!rewardId) {
      return NextResponse.json(
        { error: 'ID da recompensa é obrigatório' },
        { status: 400 }
      );
    }

    // Buscar a recompensa
    const reward = await prisma.referralReward.findUnique({
      where: { id: rewardId },
      include: {
        _count: {
          select: { redemptions: true }
        }
      }
    });

    if (!reward) {
      return NextResponse.json(
        { error: 'Recompensa não encontrada' },
        { status: 404 }
      );
    }

    if (!(reward as any).isActive) {
      return NextResponse.json(
        { error: 'Recompensa não está ativa' },
        { status: 400 }
      );
    }

    // Verificar se atingiu o limite
    if ((reward as any).maxRedemptions && reward._count.redemptions >= (reward as any).maxRedemptions) {
      return NextResponse.json(
        { error: 'Limite de resgates atingido para esta recompensa' },
        { status: 400 }
      );
    }

    // Verificar se o usuário tem créditos suficientes
    const creditsBalance = await getUserCreditsBalance(userId);
    if (creditsBalance < Number((reward as any).costInCredits)) {
      return NextResponse.json(
        { error: `Créditos insuficientes. Você tem ${creditsBalance}, mas precisa de ${Number((reward as any).costInCredits)}` },
        { status: 400 }
      );
    }

    // Verificar se o usuário já resgatou esta recompensa recentemente
    // Removido cooldown de 24h: múltiplos resgates podem ser feitos, desde que haja pontos e disponibilidade

    // Criar o resgate e reservar créditos em uma transação
    const result = await prisma.$transaction(async (tx) => {
      // Criar o resgate PENDING
      const redemption = await tx.rewardRedemption.create({
        data: {
          userId: userId,
          rewardId: rewardId,
          creditsUsed: (reward as any).costInCredits,
          status: 'PENDING'
        }
      });

      // Selecionar créditos disponíveis (não usados)
      const availableCredits = await tx.referralCredit.findMany({
        where: { userId: userId, isUsed: false },
        orderBy: { createdAt: 'asc' }
      });

      let needed = Number((reward as any).costInCredits);
      let reserved = 0;

      for (const credit of availableCredits) {
        if (reserved >= needed) break;
        // Marcar crédito como usado e vincular ao resgate
        await tx.referralCredit.update({
          where: { id: credit.id },
          data: {
            isUsed: true,
            usedAt: new Date(),
            usedForRewardId: redemption.id
          }
        });
        reserved += Number(credit.amount);
      }

      if (reserved < needed) {
        // Reverter criação caso não tenha conseguido reservar o suficiente (condição de corrida)
        throw new Error('Créditos insuficientes no momento do resgate. Tente novamente.');
      }

      // Não incrementar currentRedemptions em PENDING; disponibilidade é baseada em APPROVED/FULFILLED
      return redemption;
    });

    return NextResponse.json({
      success: true,
      redemption: result,
      message: 'Recompensa resgatada com sucesso! Seus pontos foram reservados. Aguarde a confirmação do seu médico.'
    });

  } catch (error) {
    console.error('Erro ao resgatar recompensa:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
} 