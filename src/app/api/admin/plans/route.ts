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

    // Fetch only active plans
    const plans = await prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { price: 'asc' }
    });

    return NextResponse.json({ plans });
  } catch (error) {
    console.error('Error fetching plans:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
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

    const body = await request.json();
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
    } = body;

    if (!name || !description || price === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (isDefault) {
      await prisma.subscriptionPlan.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }

    const created = await prisma.subscriptionPlan.create({
      data: {
        name,
        description,
        price: parseFloat(price),
        maxPatients: parseInt(maxPatients) || 999999,
        maxProtocols: parseInt(maxProtocols) || 999999,
        maxCourses: parseInt(maxCourses) || 999999,
        maxProducts: parseInt(maxProducts) || 999999,
        trialDays: parseInt(trialDays) || null,
        isDefault: Boolean(isDefault),
        referralsMonthlyLimit: referralsMonthlyLimit !== undefined && referralsMonthlyLimit !== null ? parseInt(referralsMonthlyLimit) : null,
        maxRewards: maxRewards !== undefined && maxRewards !== null ? parseInt(maxRewards) : null,
        allowCreditPerPurchase: Boolean(allowCreditPerPurchase),
        allowCampaigns: Boolean(allowCampaigns),
        isActive: true,
      }
    });

    return NextResponse.json({ plan: created }, { status: 201 });
  } catch (error) {
    console.error('Error creating plan:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
 