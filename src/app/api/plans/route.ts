import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_req: NextRequest) {
  try {
    const rawPlans = await prisma.clinicPlan.findMany({
      where: {
        isActive: true,
        NOT: { name: 'Basic' }
      },
      orderBy: { monthlyPrice: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        monthlyPrice: true,
        baseDoctors: true,
        basePatients: true,
        features: true,
        trialDays: true,
        isActive: true,
        isPublic: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    const plans = rawPlans.map(p => {
      if (p.name === 'Enterprise') {
        return { ...p, monthlyPrice: null as any, contactOnly: true };
      }
      return { ...p, contactOnly: false };
    });

    return NextResponse.json({ plans });
  } catch (error) {
    console.error('Error fetching public plans:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
