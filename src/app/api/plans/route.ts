import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_req: NextRequest) {
  try {
    const rawPlans = await prisma.clinicPlan.findMany({
      where: {
        isActive: true,
        NOT: [{ name: 'Basic' }, { name: 'Free' }],
      },
      orderBy: { monthlyPrice: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        tier: true,
        monthlyPrice: true,
        monthlyTxLimit: true,
        features: true,
        trialDays: true,
        requireCard: true,
        isActive: true,
        isPublic: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Map plan name -> Stripe Price env var (configure these in your .env)
    const priceEnvByName: Record<string, string | undefined> = {
      Starter: process.env.STRIPE_PRICE_STARTER,
      Growth: process.env.STRIPE_PRICE_GROWTH,
      Creator: process.env.STRIPE_PRICE_CREATOR,
      Enterprise: process.env.STRIPE_PRICE_ENTERPRISE,
    };

    // Ensure there's an Enterprise custom plan if DB doesn't have one
    const hasEnterprise = rawPlans.some((p) => String(p.name).toLowerCase() === 'enterprise');
    const augmented = [...rawPlans];
    if (!hasEnterprise) {
      augmented.push({
        id: 'virtual-enterprise',
        name: 'Enterprise',
        description: 'Tailored solution for high-volume clinics. Custom pricing and limits.',
        tier: 'ENTERPRISE' as any,
        monthlyPrice: null as any,
        monthlyTxLimit: 10001 as any, // represent > 10k
        features: {},
        trialDays: 0 as any,
        requireCard: false as any,
        isActive: true as any,
        isPublic: true as any,
        createdAt: new Date() as any,
        updatedAt: new Date() as any,
      } as any);
    }

    const plans = augmented.map((p) => {
      const isEnterprise = p.name === 'Enterprise';
      const priceId = priceEnvByName[p.name];
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        tier: p.tier,
        monthlyPrice: isEnterprise ? (null as any) : p.monthlyPrice,
        monthlyTxLimit: (p as any).monthlyTxLimit,
        features: p.features,
        trialDays: p.trialDays,
        requireCard: (p as any).requireCard,
        isActive: p.isActive,
        isPublic: p.isPublic,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        contactOnly: isEnterprise || p.monthlyPrice === null,
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

