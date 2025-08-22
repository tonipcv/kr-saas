import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const resolvedParams = await params;
    const subscriptionId = resolvedParams.id;

    // Find the subscription from unified_subscriptions (doctor type)
    const u = await prisma.unified_subscriptions.findUnique({
      where: { id: subscriptionId },
      include: {
        user_relation: { select: { id: true, name: true, email: true } },
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
      }
    });

    if (!u || u.type !== 'DOCTOR') {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    const subscription = {
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
    };

    return NextResponse.json({ subscription });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const resolvedParams = await params;
    const subscriptionId = resolvedParams.id;
    const body = await request.json();
    const { planId, status, endDate, trialEndDate, autoRenew } = body;

    // Validations
    if (!planId || !status) {
      return NextResponse.json({ error: 'Plan and status are required' }, { status: 400 });
    }

    // Check if plan exists
    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });

    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 400 });
    }

    // Check if subscription exists in unified_subscriptions
    const existing = await prisma.unified_subscriptions.findUnique({ where: { id: subscriptionId } });

    if (!existing || existing.type !== 'DOCTOR') {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    // Prepare update data
    const updateData: any = {
      plan_id: planId,
      status,
      auto_renew: autoRenew ?? true,
      updated_at: new Date()
    };

    // Configure dates based on status
    if (status === 'TRIAL') {
      if (trialEndDate) {
        updateData.trial_end_date = new Date(trialEndDate);
      }
      updateData.end_date = null;
    } else if (status === 'ACTIVE') {
      if (endDate) {
        updateData.end_date = new Date(endDate);
      }
      updateData.trial_end_date = null;
    } else {
      // For other statuses (SUSPENDED, CANCELLED, EXPIRED)
      updateData.end_date = null;
      updateData.trial_end_date = null;
    }

    // Update the subscription
    const updated = await prisma.unified_subscriptions.update({
      where: { id: subscriptionId },
      data: updateData,
      include: {
        user_relation: { select: { id: true, name: true, email: true } },
        subscription_plans: { select: { id: true, name: true, price: true } }
      }
    });

    const updatedSubscription = {
      id: updated.id,
      status: updated.status,
      startDate: updated.start_date?.toISOString?.() ?? null,
      endDate: updated.end_date?.toISOString?.() ?? null,
      trialEndDate: updated.trial_end_date?.toISOString?.() ?? null,
      autoRenew: updated.auto_renew,
      doctor: updated.user_relation ? {
        id: updated.user_relation.id,
        name: (updated.user_relation as any).name ?? '',
        email: (updated.user_relation as any).email ?? ''
      } : undefined,
      plan: updated.subscription_plans ? {
        id: updated.subscription_plans.id,
        name: updated.subscription_plans.name,
        price: updated.subscription_plans.price as unknown as number,
      } : undefined,
    };

    return NextResponse.json({ 
      success: true, 
      subscription: updatedSubscription,
      message: 'Subscription updated successfully'
    });

  } catch (error) {
    console.error('Error updating subscription:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 