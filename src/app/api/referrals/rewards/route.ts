import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canCreateReward } from '@/lib/subscription';

// GET - Listar recompensas do médico
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const rewards = await prisma.referralReward.findMany({
      where: {
        doctorId: session.user.id
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

    const { title, description, creditsRequired, maxRedemptions, imageUrl } = await req.json();

    if (!title || !description || !creditsRequired) {
      return NextResponse.json(
        { error: 'Título, descrição e créditos necessários são obrigatórios' },
        { status: 400 }
      );
    }

    if (creditsRequired < 1) {
      return NextResponse.json(
        { error: 'Créditos necessários deve ser maior que 0' },
        { status: 400 }
      );
    }

    // Enforce plan limit for creating rewards
    const limitCheck = await canCreateReward(session.user.id);
    if (!limitCheck.allowed) {
      return NextResponse.json(
        { error: limitCheck.message || 'Seu plano não permite criar mais rewards' },
        { status: 403 }
      );
    }

    const reward = await prisma.referralReward.create({
      data: {
        doctorId: session.user.id,
        title,
        description,
        imageUrl: imageUrl || null,
        value: parseInt(creditsRequired),
        costInCredits: parseInt(creditsRequired),
        maxRedemptions: maxRedemptions ? parseInt(maxRedemptions) : null,
        isActive: true
      }
    });

    return NextResponse.json({ 
      success: true, 
      reward 
    });

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

    const { rewardId, title, description, creditsRequired, maxRedemptions, isActive, imageUrl } = await req.json();

    if (!rewardId) {
      return NextResponse.json(
        { error: 'ID da recompensa é obrigatório' },
        { status: 400 }
      );
    }

    // Verificar se a recompensa pertence ao médico
    const existingReward = await prisma.referralReward.findFirst({
      where: {
        id: rewardId,
        doctorId: session.user.id
      }
    });

    if (!existingReward) {
      return NextResponse.json(
        { error: 'Recompensa não encontrada' },
        { status: 404 }
      );
    }

    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl || null;
    if (creditsRequired !== undefined) {
      updateData.value = parseInt(creditsRequired);
      updateData.costInCredits = parseInt(creditsRequired);
    }
    if (maxRedemptions !== undefined) updateData.maxRedemptions = maxRedemptions ? parseInt(maxRedemptions) : null;
    if (isActive !== undefined) updateData.isActive = isActive;

    const reward = await prisma.referralReward.update({
      where: { id: rewardId },
      data: updateData
    });

    return NextResponse.json({ 
      success: true, 
      reward 
    });

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

    if (!rewardId) {
      return NextResponse.json(
        { error: 'ID da recompensa é obrigatório' },
        { status: 400 }
      );
    }

    // Verificar se a recompensa pertence ao médico
    const existingReward = await prisma.referralReward.findFirst({
      where: {
        id: rewardId,
        doctorId: session.user.id
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