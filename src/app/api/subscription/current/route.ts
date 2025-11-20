import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { SubscriptionService } from '@/services/subscription';
import { mapLegacyToNewSubscription } from '@/types/subscription';

const subscriptionService = new SubscriptionService();

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Obter clínica do usuário atual
    const clinicMember = await prisma.clinicMember.findFirst({
      where: { userId: session.user.id },
      include: { clinic: true }
    });

    if (!clinicMember) {
      return NextResponse.json({ error: 'No clinic found' }, { status: 404 });
    }

    // Obter subscrição da clínica
    let subscriptionResponse = await subscriptionService.getSubscriptionUsage(
      clinicMember.clinicId
    );

    // Fallback: tentar legacy unified_subscriptions e mapear
    if (!subscriptionResponse) {
      const rows: any[] = await prisma.$queryRawUnsafe(
        `SELECT us.*, to_jsonb(sp) AS subscription_plans
         FROM unified_subscriptions us
         JOIN subscription_plans sp ON sp.id = us.plan_id
         WHERE us.type = 'CLINIC' AND us.subscriber_id = $1
         ORDER BY us.created_at DESC
         LIMIT 1`,
        clinicMember.clinicId
      );

      const legacySub = rows && rows[0] ? rows[0] : null;

      if (legacySub) {
        const mapped = mapLegacyToNewSubscription(legacySub);
        subscriptionResponse = {
          subscription: mapped,
          usage: {
            doctors: { current: mapped.currentDoctorsCount || 0, limit: mapped.plan.maxDoctors },
            patients: { current: mapped.currentPatientsCount || 0, limit: mapped.plan.maxPatients }
          }
        } as any;
      }
    }

    if (!subscriptionResponse) {
      return NextResponse.json({ error: 'No subscription found' }, { status: 404 });
    }

    // Adaptar resposta para o formato esperado por useSubscription (SubscriptionStatus)
    const { subscription, usage } = subscriptionResponse as any;
    const status: string = String(subscription.status || '').toUpperCase();
    // Try best-effort to resolve plan name from either joined plan or legacy map
    const planName: string | undefined =
      (subscription?.plan && subscription.plan.name) ||
      subscription?.name || // when cp.* was merged into row
      undefined;
    const isTrial = status === 'TRIAL';
    const isActive = status === 'ACTIVE' || isTrial;
    const daysRemaining = 0; // Pode ser calculado se trial_ends_at estiver disponível

    const txUsage = (usage as any)?.transactions || { current: 0, limit: 0 };

    const responseBody = {
      isActive,
      isTrial,
      isExpired: status === 'EXPIRED',
      daysRemaining,
      limits: {
        // Deprecated legacy fields kept for compatibility
        maxPatients: 0,
        maxProtocols: 0,
        maxCourses: 0,
        maxProducts: 0,
        // New
        maxTransactions: Number(txUsage.limit || 0),
      },
      planName,
      status
    };

    return NextResponse.json(responseBody);
  } catch (error) {
    console.error('Error fetching subscription:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Endpoint temporário para compatibilidade com o modelo antigo
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { clinicId } = body;

    if (!clinicId) {
      return NextResponse.json(
        { error: 'Clinic ID is required' },
        { status: 400 }
      );
    }

    // Verificar se o usuário tem acesso à clínica
    const clinicMember = await prisma.clinicMember.findFirst({
      where: {
        userId: session.user.id,
        clinicId
      }
    });

    if (!clinicMember) {
      return NextResponse.json(
        { error: 'User not associated with clinic' },
        { status: 403 }
      );
    }

    // Obter subscrição no novo formato
    const subscriptionResponse = await subscriptionService.getSubscriptionUsage(
      clinicId
    );

    if (!subscriptionResponse) {
      // Tentar obter do modelo antigo para migração
      const legacySub = await prisma.unified_subscriptions.findFirst({
        where: { type: 'CLINIC', subscriber_id: clinicId },
        include: { subscription_plans: true }
      });

      if (legacySub) {
        // Converter e criar nova subscrição
        const newSub = mapLegacyToNewSubscription(legacySub);
        const created = await prisma.clinicSubscription.create({
          data: {
            ...newSub,
            clinicId: newSub.clinicId,
            planId: newSub.planId
          },
          include: { plan: true }
        });

        // Retornar no novo formato
        return NextResponse.json({
          subscription: created,
          usage: {
            doctors: {
              current: created.currentDoctorsCount,
              limit: created.plan.maxDoctors
            },
            patients: {
              current: created.currentPatientsCount,
              limit: created.plan.maxPatients
            }
          }
        });
      }

      return NextResponse.json(
        { error: 'No subscription found' },
        { status: 404 }
      );
    }

    return NextResponse.json(subscriptionResponse);
  } catch (error) {
    console.error('Error handling subscription:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}