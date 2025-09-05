import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { SubscriptionService } from '@/services/subscription';
import { SubscriptionStatus, PlanTier } from '@/types/subscription';

const subscriptionService = new SubscriptionService();

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Obter todas as subscrições de clínicas
    const subscriptions = await prisma.clinicSubscription.findMany({
      include: {
        plan: true,
        clinic: {
          select: {
            id: true,
            name: true,
            isActive: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({
      subscriptions: subscriptions.map(sub => ({
        id: sub.id,
        clinic: {
          id: sub.clinic.id,
          name: sub.clinic.name,
          isActive: sub.clinic.isActive
        },
        plan: {
          id: sub.plan.id,
          name: sub.plan.name,
          tier: sub.plan.tier,
          price: sub.plan.price
        },
        status: sub.status,
        startDate: sub.startDate,
        endDate: sub.endDate,
        canceledAt: sub.canceledAt,
        currentDoctorsCount: sub.currentDoctorsCount,
        currentPatientsCount: sub.currentPatientsCount,
        createdAt: sub.createdAt,
        updatedAt: sub.updatedAt
      }))
    });
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { clinicId, planId, status = SubscriptionStatus.TRIAL } = body;

    if (!clinicId || !planId) {
      return NextResponse.json(
        { error: 'Clinic ID and Plan ID are required' },
        { status: 400 }
      );
    }

    // Verificar se a clínica existe
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId }
    });

    if (!clinic) {
      return NextResponse.json(
        { error: 'Clinic not found' },
        { status: 404 }
      );
    }

    // Verificar se já existe uma subscrição ativa
    const existingSub = await prisma.clinicSubscription.findFirst({
      where: {
        clinicId,
        status: {
          in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL]
        }
      }
    });

    if (existingSub) {
      return NextResponse.json(
        { error: 'Clinic already has an active subscription' },
        { status: 400 }
      );
    }

    // Criar nova subscrição
    let subscription;
    if (status === SubscriptionStatus.TRIAL) {
      subscription = await subscriptionService.createTrialSubscription(
        clinicId,
        planId
      );
    } else {
      subscription = await prisma.clinicSubscription.create({
        data: {
          id: `cs_${clinicId}-${Date.now()}`,
          clinicId,
          planId,
          status,
          startDate: new Date(),
          currentDoctorsCount: 0,
          currentPatientsCount: 0
        },
        include: {
          plan: true,
          clinic: {
            select: {
              id: true,
              name: true,
              isActive: true
            }
          }
        }
      });
    }

    return NextResponse.json({
      subscription: {
        id: subscription.id,
        clinic: {
          id: subscription.clinic.id,
          name: subscription.clinic.name,
          isActive: subscription.clinic.isActive
        },
        plan: {
          id: subscription.plan.id,
          name: subscription.plan.name,
          tier: subscription.plan.tier,
          price: subscription.plan.price
        },
        status: subscription.status,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        canceledAt: subscription.canceledAt,
        currentDoctorsCount: subscription.currentDoctorsCount,
        currentPatientsCount: subscription.currentPatientsCount,
        createdAt: subscription.createdAt,
        updatedAt: subscription.updatedAt
      }
    });
  } catch (error) {
    console.error('Error creating subscription:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}