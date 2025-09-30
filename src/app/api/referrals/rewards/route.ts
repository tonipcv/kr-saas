import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canCreateReward } from '@/lib/subscription';
import { emitEvent } from '@/lib/events';
import { EventActor, EventType } from '@prisma/client';

// GET - Listar recompensas do médico
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const clinicId = searchParams.get('clinicId');

    if (!clinicId) {
      return NextResponse.json({ rewards: [] });
    }

    // Verify user has access to this clinic
    const clinicMember = await prisma.clinicMember.findFirst({
      where: {
        clinicId: clinicId,
        userId: session.user.id,
        isActive: true,
      },
    });

    if (!clinicMember) {
      return NextResponse.json({ error: 'Não autorizado para esta clínica' }, { status: 403 });
    }

    const rewards = await prisma.referralReward.findMany({
      where: {
        doctorId: session.user.id,
        clinicId: clinicId,
      },
      include: {
        redemptions: {
          include: {
            user: {
              select: { id: true, name: true, email: true }
            }
          }
        },
        _count: {
          select: { redemptions: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Fetch codesAvailable per reward (UNUSED codes)
    const codesAvailableMap: Record<string, number> = {};
    await Promise.all(
      rewards.map(async (r: any) => {
        const count = await prisma.referralRewardCode.count({
          where: { rewardId: r.id, status: 'UNUSED' }
        });
        codesAvailableMap[r.id] = count;
      })
    );

    // Normalize to UI shape expected on doctor/rewards page
    const normalized = rewards.map((r: any) => {
      const toNum = (v: any) => (v?.toNumber ? v.toNumber() : (typeof v === 'string' ? parseFloat(v) : Number(v || 0)));
      return {
        id: r.id,
        title: r.title,
        description: r.description,
        imageUrl: r.imageUrl || null,
        // UI expects creditsRequired; backend stores costInCredits/value as Decimal
        creditsRequired: toNum(r.costInCredits) || toNum(r.value) || 0,
        maxRedemptions: r.maxRedemptions ?? null,
        currentRedemptions: r._count?.redemptions ?? 0,
        isActive: !!r.isActive,
        createdAt: r.createdAt,
        codesAvailable: codesAvailableMap[r.id] ?? 0,
        redemptions: (r.redemptions || []).map((rd: any) => ({
          id: rd.id,
          status: rd.status,
          redeemedAt: rd.redeemedAt,
          user: rd.user ? { id: rd.user.id, name: rd.user.name, email: rd.user.email } : { id: '', name: '', email: '' }
        })),
      };
    });

    return NextResponse.json({ rewards: normalized });

  } catch (error) {
    console.error('Erro ao buscar recompensas:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

// POST - Criar nova recompensa
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Debug: request context
    const startTs = Date.now();
    console.debug('[rewards][POST] start', {
      userId: session.user.id,
      url: req.url,
    });

    const { title, description, creditsRequired, maxRedemptions, imageUrl, clinicId } = await req.json();
    console.debug('[rewards][POST] body', {
      title,
      hasDescription: !!description,
      creditsRequired,
      maxRedemptions,
      hasImageUrl: !!imageUrl,
      clinicId,
    });

    if (!title || !description || !creditsRequired || !clinicId) {
      return NextResponse.json(
        { error: 'Título, descrição, créditos necessários e clínica são obrigatórios' },
        { status: 400 }
      );
    }

    // Verify user has access to this clinic
    const clinicMember = await prisma.clinicMember.findFirst({
      where: {
        clinicId: clinicId,
        userId: session.user.id,
        isActive: true,
      },
    });

    if (!clinicMember) {
      return NextResponse.json({ error: 'Não autorizado para esta clínica' }, { status: 403 });
    }

    if (creditsRequired < 1) {
      return NextResponse.json(
        { error: 'Créditos necessários deve ser maior que 0' },
        { status: 400 }
      );
    }

    // Enforce plan limit for creating rewards
    const limitCheck = await canCreateReward(session.user.id);
    console.debug('[rewards][POST] canCreateReward()', {
      allowed: limitCheck.allowed,
      message: limitCheck.message || null,
    });
    if (!limitCheck.allowed) {
      console.warn('[rewards][POST] blocked by plan/limits', {
        userId: session.user.id,
        reason: limitCheck.message || 'not allowed',
      });
      return NextResponse.json(
        { error: limitCheck.message || 'Seu plano não permite criar mais rewards' },
        { status: 403 }
      );
    }

    const reward = await prisma.referralReward.create({
      data: {
        title,
        description,
        // Keep both fields in sync; schema requires `value` and we use `costInCredits` in UI
        costInCredits: creditsRequired,
        value: creditsRequired,
        maxRedemptions: maxRedemptions || null,
        imageUrl: imageUrl || null,
        doctorId: session.user.id,
        clinicId: clinicId,
      }
    });

    console.debug('[rewards][POST] created', {
      rewardId: reward.id,
      durationMs: Date.now() - startTs,
    });

    // Emit analytics: reward_created (non-blocking)
    try {
      await emitEvent({
        eventType: EventType.reward_created,
        actor: EventActor.clinic,
        clinicId,
        metadata: {
          reward_id: reward.id,
          type: 'points',
          rules: { creditsRequired },
        },
      });
    } catch (e) {
      console.error('[events] reward_created emit failed', e);
    }

    return NextResponse.json({ reward });

  } catch (error) {
    console.error('Erro ao criar recompensa:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

// PUT - Atualizar recompensa
export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const rewardId = searchParams.get('rewardId');

    if (!rewardId) {
      return NextResponse.json(
        { error: 'ID da recompensa é obrigatório' },
        { status: 400 }
      );
    }

    const { title, description, creditsRequired, maxRedemptions, imageUrl, isActive, clinicId } = await req.json();

    if (!title || !description || !creditsRequired || !clinicId) {
      return NextResponse.json(
        { error: 'Título, descrição, créditos necessários e clínica são obrigatórios' },
        { status: 400 }
      );
    }

    // Verify user has access to this clinic
    const clinicMember = await prisma.clinicMember.findFirst({
      where: {
        clinicId: clinicId,
        userId: session.user.id,
        isActive: true,
      },
    });

    if (!clinicMember) {
      return NextResponse.json({ error: 'Não autorizado para esta clínica' }, { status: 403 });
    }

    // Verificar se a recompensa pertence ao médico
    const existingReward = await prisma.referralReward.findFirst({
      where: {
        id: rewardId,
        doctorId: session.user.id,
        clinicId: clinicId,
      }
    });

    if (!existingReward) {
      return NextResponse.json(
        { error: 'Recompensa não encontrada' },
        { status: 404 }
      );
    }

    const reward = await prisma.referralReward.update({
      where: { id: rewardId },
      data: {
        title,
        description,
        // Keep both fields in sync on update as well
        costInCredits: creditsRequired,
        value: creditsRequired,
        maxRedemptions: maxRedemptions || null,
        imageUrl: imageUrl || null,
        isActive: isActive ?? true,
        clinicId: clinicId,
      }
    });

    return NextResponse.json({ reward });

  } catch (error) {
    console.error('Erro ao atualizar recompensa:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

// DELETE - Deletar recompensa
export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const rewardId = searchParams.get('rewardId');
    const clinicId = searchParams.get('clinicId');

    if (!rewardId || !clinicId) {
      return NextResponse.json(
        { error: 'ID da recompensa e clínica são obrigatórios' },
        { status: 400 }
      );
    }

    // Verify user has access to this clinic
    const clinicMember = await prisma.clinicMember.findFirst({
      where: {
        clinicId: clinicId,
        userId: session.user.id,
        isActive: true,
      },
    });

    if (!clinicMember) {
      return NextResponse.json({ error: 'Não autorizado para esta clínica' }, { status: 403 });
    }

    // Verificar se a recompensa pertence ao médico e clínica
    const existingReward = await prisma.referralReward.findFirst({
      where: {
        id: rewardId,
        doctorId: session.user.id,
        clinicId: clinicId,
      },
      include: {
        _count: {
          select: { redemptions: true }
        }
      }
    });

    if (!existingReward) {
      return NextResponse.json(
        { error: 'Recompensa não encontrada' },
        { status: 404 }
      );
    }

    // Verificar se há resgates pendentes
    const pendingRedemptions = await prisma.rewardRedemption.count({
      where: {
        rewardId,
        status: { in: ['PENDING', 'APPROVED'] }
      }
    });

    if (pendingRedemptions > 0) {
      return NextResponse.json(
        { error: 'Não é possível deletar recompensa com resgates pendentes' },
        { status: 400 }
      );
    }

    await prisma.referralReward.delete({
      where: { id: rewardId }
    });

    return NextResponse.json({ 
      success: true 
    });

  } catch (error) {
    console.error('Erro ao deletar recompensa:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}