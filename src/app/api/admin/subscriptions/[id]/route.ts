import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { SubscriptionStatus } from '@/types/subscription';

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

    // Find the subscription
    const subscription = await prisma.clinicSubscription.findUnique({
      where: { id: subscriptionId },
      include: {
        clinic: {
          select: {
            id: true,
            name: true,
            isActive: true,
            owner: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        },
        plan: {
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            maxDoctors: true,
            maxPatients: true,
            tier: true,
            trialDays: true,
            isDefault: true
          }
        }
      }
    });

    if (!subscription) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: subscription.id,
      status: subscription.status,
      clinic: {
        id: subscription.clinic.id,
        name: subscription.clinic.name,
        isActive: subscription.clinic.isActive,
        owner: subscription.clinic.owner
      },
      plan: subscription.plan,
      startDate: subscription.startDate,
      endDate: subscription.currentPeriodEnd,
      trialEndDate: subscription.trialEndsAt,
      autoRenew: true, // Por enquanto, todas as subscrições são auto-renováveis
      stripeCustomerId: subscription.stripeCustomerId,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      currentDoctorsCount: subscription.currentDoctorsCount,
      currentPatientsCount: subscription.currentPatientsCount,
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt
    });

  } catch (error) {
    console.error('Error fetching subscription:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
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
    const { planId, status, endDate, trialEndDate } = body;

    // Validations
    if (!planId || !status) {
      return NextResponse.json({ error: 'Plan and status are required' }, { status: 400 });
    }

    // Check if plan exists
    const plan = await prisma.clinicPlan.findUnique({ where: { id: planId } });

    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 400 });
    }

    // Check if subscription exists
    const existing = await prisma.clinicSubscription.findUnique({ 
      where: { id: subscriptionId },
      include: { clinic: true }
    });

    if (!existing) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    // Prepare update data
    const updateData: any = {
      planId,
      status: status as SubscriptionStatus,
      updatedAt: new Date()
    };

    // Configure dates based on status
    if (status === 'TRIAL') {
      updateData.trialEndsAt = trialEndDate ? new Date(trialEndDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 dias
      updateData.currentPeriodEnd = endDate ? new Date(endDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 dias
    } else if (status === 'ACTIVE') {
      updateData.currentPeriodEnd = endDate ? new Date(endDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 dias
    } else if (status === 'CANCELED') {
      updateData.canceledAt = new Date();
      updateData.currentPeriodEnd = endDate ? new Date(endDate) : existing.currentPeriodEnd;
    }

    // Update subscription
    const updated = await prisma.clinicSubscription.update({
      where: { id: subscriptionId },
      data: updateData,
      include: {
        clinic: {
          select: {
            id: true,
            name: true,
            isActive: true,
            owner: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        },
        plan: {
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            maxDoctors: true,
            maxPatients: true,
            tier: true,
            trialDays: true,
            isDefault: true
          }
        }
      }
    });

    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      clinic: {
        id: updated.clinic.id,
        name: updated.clinic.name,
        isActive: updated.clinic.isActive,
        owner: updated.clinic.owner
      },
      plan: updated.plan,
      startDate: updated.startDate,
      endDate: updated.currentPeriodEnd,
      trialEndDate: updated.trialEndsAt,
      autoRenew: true,
      stripeCustomerId: updated.stripeCustomerId,
      stripeSubscriptionId: updated.stripeSubscriptionId,
      currentDoctorsCount: updated.currentDoctorsCount,
      currentPatientsCount: updated.currentPatientsCount,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt
    });

  } catch (error) {
    console.error('Error updating subscription:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}