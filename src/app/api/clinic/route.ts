import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserClinic, ensureDoctorHasClinic } from '@/lib/clinic-utils';
import { prisma } from '@/lib/prisma';
import { SubscriptionStatus } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinicId');
    console.debug('[api/clinic][GET] start', {
      hasSession: Boolean(session),
      userId: session?.user?.id || null,
      clinicId,
      url: request.url,
    });
    
    if (!session?.user?.id) {
      console.warn('[api/clinic][GET] unauthorized: missing user id');
      return NextResponse.json(
        { error: 'Não autorizado', details: { hint: 'Faça login para acessar informações da clínica.' } },
        { status: 401 }
      );
    }

    // Verificar se é médico
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true }
    });
    console.debug('[api/clinic][GET] user role resolved', { role: user?.role || null });

    // Permitir DOCTOR, ADMIN e SUPER_ADMIN
    if (!user || (user.role !== 'DOCTOR' && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
      console.warn('[api/clinic][GET] forbidden: invalid role', { role: user?.role || null, userId: session.user.id });
      return NextResponse.json(
        { error: 'Acesso negado. Apenas médicos ou administradores podem acessar clínicas.', details: { userRole: user?.role || null } },
        { status: 403 }
      );
    }

    if (clinicId) {
      // Buscar clínica específica
      // Admins têm acesso a qualquer clínica ativa pelo ID; médicos precisam ser owner ou membro
      const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
      console.debug('[api/clinic][GET] fetching clinic by id', { clinicId, isAdmin });
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
        // Diagnostics for missing/forbidden clinic access
        console.warn('[api/clinic][GET] clinic not found or no access', { clinicId, isAdmin, userId: session.user.id, role: user.role });
        const [ownedCount, memberCount] = await Promise.all([
          prisma.clinic.count({ where: { ownerId: session.user.id, isActive: true } }).catch(() => 0),
          prisma.clinicMember.count({ where: { userId: session.user.id, isActive: true } }).catch(() => 0),
        ]);
        return NextResponse.json(
          { 
            error: 'Clínica não encontrada ou sem acesso',
            details: {
              clinicId,
              isAdmin,
              userId: session.user.id,
              userRole: user.role,
              ownedClinics: ownedCount,
              memberClinics: memberCount,
              hint: isAdmin ? 'Verifique se o ID está correto.' : 'Você precisa ser owner ou membro ativo desta clínica.'
            }
          },
          { status: 404 }
        );
      }

      // Buscar subscription
      let subscription = null as any;
      try {
        console.debug('[api/clinic][GET] loading subscription', { clinicId: clinic.id });
        subscription = await prisma.clinicSubscription.findFirst({
          where: {
            clinicId: clinic.id,
            status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL] }
          },
          include: { plan: true },
          orderBy: { createdAt: 'desc' }
        });
      } catch (e: any) {
        console.error('[api/clinic][GET] subscription load error', { clinicId: clinic.id, message: e?.message, code: e?.code, stack: e?.stack });
        return NextResponse.json(
          { error: 'Falha ao carregar subscription', details: { clinicId: clinic.id, message: e?.message || null, code: e?.code || null } },
          { status: 500 }
        );
      }

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
        console.debug('[api/clinic][GET] admin fetching first active clinic');
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

        return NextResponse.json({ clinic: clinic || null, details: clinic ? undefined : { hint: 'Nenhuma clínica ativa encontrada.' } });
      }

      // Médico: garantir que tenha clínica (criar automaticamente se necessário)
      console.debug('[api/clinic][GET] ensureDoctorHasClinic', { userId: session.user.id });
      const result = await ensureDoctorHasClinic(session.user.id);
      if (!result.success) {
        console.error('[api/clinic][GET] ensureDoctorHasClinic failed', { userId: session.user.id, message: result.message });
        return NextResponse.json(
          { error: result.message || 'Falha ao garantir clínica para o médico', details: { userId: session.user.id } },
          { status: 500 }
        );
      }
      return NextResponse.json({ clinic: result.clinic });
    }

  } catch (error: any) {
    console.error('Erro ao buscar clínica:', { message: error?.message, code: error?.code, stack: error?.stack, name: error?.name, meta: error?.meta });
    return NextResponse.json(
      { 
        error: 'Erro interno do servidor',
        message: error?.message || null,
        code: error?.code || null,
        details: { name: error?.name || null, meta: error?.meta || null, stack: process.env.NODE_ENV !== 'production' ? (error?.stack || null) : undefined }
      },
      { status: 500 }
    );
  }
} 