import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_req: NextRequest) {
  try {
    const rawPlans = await prisma.clinicPlan.findMany({
      where: {
        isActive: true,
        NOT: [{ name: 'Basic' }, { name: 'Free' }]
      },
      orderBy: { monthlyPrice: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        tier: true,
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

    // Map plan name -> Stripe Price env var (configure these in your .env)
    const priceEnvByName: Record<string, string | undefined> = {
      Starter: process.env.STRIPE_PRICE_STARTER,
      Growth: process.env.STRIPE_PRICE_GROWTH,
      Creator: process.env.STRIPE_PRICE_CREATOR,
      Enterprise: process.env.STRIPE_PRICE_ENTERPRISE,
    };

    const plans = rawPlans.map((p) => {
      const isEnterprise = p.name === 'Enterprise';
      const priceId = priceEnvByName[p.name];
      return {
        ...p,
        contactOnly: isEnterprise || p.monthlyPrice === null,
        monthlyPrice: isEnterprise ? (null as any) : p.monthlyPrice,
        // Expose Stripe price so the frontend can start a real checkout
        priceId: isEnterprise ? undefined : priceId,
      } as any;
    });

    return NextResponse.json({ plans });
  } catch (error) {
    console.error('Error fetching public plans:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

