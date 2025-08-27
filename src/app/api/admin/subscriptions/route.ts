import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
 
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

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only SUPER_ADMIN can create subscriptions
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { role: true }
    });

    if (user?.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body = await request.json();
    const { doctorId, planId, status = 'TRIAL', autoRenew = true, endDate, trialEndDate } = body || {};

    if (!doctorId || !planId) {
      return NextResponse.json({ error: 'doctorId and planId are required' }, { status: 400 });
    }
    if (!['TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    // Validate doctor exists and is DOCTOR
    const doctor = await prisma.user.findUnique({ where: { id: doctorId }, select: { id: true, role: true } });
    if (!doctor || doctor.role !== 'DOCTOR') {
      return NextResponse.json({ error: 'Doctor not found' }, { status: 404 });
    }

    // Validate plan
    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    const now = new Date();
    const data: any = {
      id: crypto.randomUUID(),
      subscriber_id: doctorId,
      type: 'DOCTOR',
      plan_id: planId,
      status,
      start_date: now,
      auto_renew: Boolean(autoRenew),
    };

    if (status === 'TRIAL') {
      if (trialEndDate) data.trial_end_date = new Date(trialEndDate);
      else if (plan.trialDays && plan.trialDays > 0) data.trial_end_date = new Date(now.getTime() + plan.trialDays * 24 * 60 * 60 * 1000);
    } else if (status === 'ACTIVE') {
      data.end_date = endDate ? new Date(endDate) : null;
      data.trial_end_date = null;
    } else {
      data.end_date = null;
      data.trial_end_date = null;
    }

    const created = await prisma.unified_subscriptions.create({
      data,
      include: {
        user_relation: { select: { id: true, name: true, email: true } },
        subscription_plans: { select: { id: true, name: true, price: true } }
      }
    });

    return NextResponse.json({
      success: true,
      subscription: {
        id: created.id,
        status: created.status,
        startDate: created.start_date?.toISOString?.() ?? null,
        endDate: created.end_date?.toISOString?.() ?? null,
        trialEndDate: created.trial_end_date?.toISOString?.() ?? null,
        autoRenew: created.auto_renew,
        doctor: created.user_relation ? {
          id: created.user_relation.id,
          name: (created.user_relation as any).name ?? '',
          email: (created.user_relation as any).email ?? ''
        } : undefined,
        plan: created.subscription_plans ? {
          id: created.subscription_plans.id,
          name: created.subscription_plans.name,
          price: created.subscription_plans.price as unknown as number,
        } : undefined,
      }
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating subscription:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}