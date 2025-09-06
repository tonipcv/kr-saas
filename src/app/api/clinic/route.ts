import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserClinic, ensureDoctorHasClinic } from '@/lib/clinic-utils';
import { prisma } from '@/lib/prisma';
import { SubscriptionStatus } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Não autorizado' },
        { status: 401 }
      );
    }

    // Verificar se é médico
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true }
    });

    // Permitir DOCTOR, ADMIN e SUPER_ADMIN
    if (!user || (user.role !== 'DOCTOR' && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
      return NextResponse.json(
        { error: 'Acesso negado. Apenas médicos ou administradores podem acessar clínicas.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinicId');

    if (clinicId) {
      // Buscar clínica específica
      // Admins têm acesso a qualquer clínica ativa pelo ID; médicos precisam ser owner ou membro
      const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
      const clinic = await prisma.clinic.findFirst({
        where: isAdmin
          ? {
              id: clinicId,
              isActive: true,
            }
          : {
              id: clinicId,
              isActive: true,
              OR: [
                { ownerId: session.user.id },
                {
                  members: {
                    some: {
                      userId: session.user.id,
                      isActive: true,
                    },
                  },
                },
              ],
            },
        include: {
          owner: {
            select: { id: true, name: true, email: true },
          },
          members: {
            where: { isActive: true },
            include: {
              user: {
                select: { id: true, name: true, email: true, role: true },
              },
            },
          },
        },
      });

      if (!clinic) {
        return NextResponse.json(
          { error: 'Clínica não encontrada ou sem acesso' },
          { status: 404 }
        );
      }

      // Buscar subscription
      const subscription = await prisma.clinicSubscription.findFirst({
        where: {
          clinicId: clinic.id,
          status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL] }
        },
        include: { plan: true },
        orderBy: { createdAt: 'desc' }
      });

      const clinicWithSubscription = {
        ...clinic,
        subscription: subscription ? {
          id: subscription.id,
          status: subscription.status,
          maxDoctors: subscription.plan.baseDoctors,
          startDate: subscription.startDate,
          endDate: subscription.currentPeriodEnd,
          trialEndDate: subscription.trialEndsAt,
          plan: {
            name: subscription.plan.name,
            maxPatients: subscription.plan.basePatients,
            maxProtocols: (subscription.plan.features as any)?.maxProtocols ?? null,
            maxCourses: (subscription.plan.features as any)?.maxCourses ?? null,
            maxProducts: (subscription.plan.features as any)?.maxProducts ?? null,
            price: Number(subscription.plan.monthlyPrice) ?? null
          }
        } : null
      };

      return NextResponse.json({ clinic: clinicWithSubscription });
    } else {
      // Sem clinicId fornecido
      if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
        // Admin: retornar a primeira clínica ativa para destravar a UI
        const clinic = await prisma.clinic.findFirst({
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          include: {
            owner: { select: { id: true, name: true, email: true } },
            members: {
              where: { isActive: true },
              include: { user: { select: { id: true, name: true, email: true, role: true } } },
            },
          },
        });

        return NextResponse.json({ clinic: clinic || null });
      }

      // Médico: garantir que tenha clínica (criar automaticamente se necessário)
      const result = await ensureDoctorHasClinic(session.user.id);
      if (!result.success) {
        return NextResponse.json(
          { error: result.message },
          { status: 500 }
        );
      }
      return NextResponse.json({ clinic: result.clinic });
    }

  } catch (error) {
    console.error('Erro ao buscar clínica:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
} 