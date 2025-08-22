import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is super admin
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { role: true }
    });

    if (user?.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Fetch all doctor subscriptions from unified_subscriptions and map to frontend shape
    const unified = await prisma.unified_subscriptions.findMany({
      where: { type: 'DOCTOR' },
      include: {
        user_relation: {
          select: { id: true, name: true, email: true }
        },
        subscription_plans: {
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            maxPatients: true,
            maxProtocols: true,
            maxCourses: true,
            maxProducts: true,
            trialDays: true,
            isDefault: true
          }
        }
      },
      orderBy: { start_date: 'desc' }
    });

    const subscriptions = unified.map(u => ({
      id: u.id,
      status: u.status,
      startDate: u.start_date?.toISOString?.() ?? null,
      endDate: u.end_date?.toISOString?.() ?? null,
      trialEndDate: u.trial_end_date?.toISOString?.() ?? null,
      autoRenew: u.auto_renew,
      doctor: u.user_relation ? {
        id: u.user_relation.id,
        name: (u.user_relation as any).name ?? '',
        email: (u.user_relation as any).email ?? ''
      } : undefined,
      plan: u.subscription_plans ? {
        id: u.subscription_plans.id,
        name: u.subscription_plans.name,
        description: u.subscription_plans.description ?? '',
        price: u.subscription_plans.price as unknown as number,
        maxPatients: (u.subscription_plans as any).maxPatients ?? 0,
        maxProtocols: (u.subscription_plans as any).maxProtocols ?? 0,
        maxCourses: (u.subscription_plans as any).maxCourses ?? 0,
        maxProducts: (u.subscription_plans as any).maxProducts ?? 0,
        trialDays: (u.subscription_plans as any).trialDays ?? null,
        isDefault: (u.subscription_plans as any).isDefault ?? false,
      } : undefined,
    }));

    return NextResponse.json({ subscriptions });

  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 