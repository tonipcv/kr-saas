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

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { role: true }
    });

    if (user?.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { id: planId } = await params;

    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: planId }
    });

    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    return NextResponse.json({ plan });
  } catch (error) {
    console.error('Error fetching plan:', error);
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

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { role: true }
    });

    if (user?.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { id: planId } = await params;
    const {
      name,
      description,
      price,
      maxPatients,
      maxProtocols,
      maxCourses,
      maxProducts,
      trialDays,
      isDefault,
      referralsMonthlyLimit,
      maxRewards,
      allowCreditPerPurchase,
      allowCampaigns
    } = await request.json();

    if (!name || !description || price === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (isDefault) {
      await prisma.subscriptionPlan.updateMany({
        where: { isDefault: true },
        data: { isDefault: false }
      });
    }

    const updatedPlan = await prisma.subscriptionPlan.update({
      where: { id: planId },
      data: {
        name,
        description,
        price: parseFloat(price),
        maxPatients: parseInt(maxPatients) || 999999,
        maxProtocols: parseInt(maxProtocols) || 999999,
        maxCourses: parseInt(maxCourses) || 999999,
        maxProducts: parseInt(maxProducts) || 999999,
        trialDays: parseInt(trialDays) || null,
        isDefault,
        referralsMonthlyLimit: referralsMonthlyLimit !== undefined && referralsMonthlyLimit !== null ? parseInt(referralsMonthlyLimit) : null,
        maxRewards: maxRewards !== undefined && maxRewards !== null ? parseInt(maxRewards) : null,
        allowCreditPerPurchase: Boolean(allowCreditPerPurchase),
        allowCampaigns: Boolean(allowCampaigns)
      }
    });

    return NextResponse.json({ plan: updatedPlan });
  } catch (error) {
    console.error('Error updating plan:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { role: true }
    });

    if (user?.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { id: planId } = await params;

    const updated = await prisma.subscriptionPlan.update({
      where: { id: planId },
      data: { isActive: false }
    });

    return NextResponse.json({ success: true, plan: updated });
  } catch (error) {
    console.error('Error deleting plan:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}