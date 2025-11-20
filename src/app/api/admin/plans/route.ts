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

    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinicId');

    // Fetch clinic plans (new schema)
    const rawActive = await prisma.clinicPlan.findMany({
      where: { isActive: true },
      orderBy: { monthlyPrice: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        monthlyPrice: true,
        monthlyTxLimit: true,
        features: true,
        tier: true,
      },
    });

    let extra: any[] = [];
    if (clinicId) {
      // Ensure the current clinic plan is present even if inactive
      const currentSub = await prisma.clinicSubscription.findFirst({
        where: { clinicId },
        orderBy: { createdAt: 'desc' },
        include: { plan: true },
      });
      if (currentSub?.plan) {
        extra = [currentSub.plan];
      }
    }

    // Merge active + extra unique by id
    const byId = new Map<string, any>();
    for (const p of rawActive) byId.set(p.id, p);
    for (const p of extra) byId.set(p.id, p);
    const raw = Array.from(byId.values());

    // Map to the shape expected by the admin edit UI
    const plans = raw.map((p) => {
      // Convert features JSON to a simple comma-separated string for preview
      let featuresSummary: string | null = null;
      try {
        const f = (p as any).features || {};
        const keys: string[] = [];
        for (const [k, v] of Object.entries(f)) {
          if (typeof v === 'boolean' && v) keys.push(k);
        }
        featuresSummary = keys.length ? keys.join(', ') : null;
      } catch {
        featuresSummary = null;
      }
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        price: p.monthlyPrice != null ? Number(p.monthlyPrice) : null,
        // Keep the old key name used by the UI for backwards compatibility,
        // but feed it with the new monthly transactions limit value.
        maxDoctors: (p as any).monthlyTxLimit,
        features: featuresSummary,
        tier: p.tier,
      } as any;
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
      price,            // monthlyPrice
      monthlyTxLimit,   // new tx limit
      trialDays,
      tier,             // STARTER | GROWTH | ENTERPRISE
      isActive,
      isPublic,
    } = body;

    if (!name || price === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const created = await prisma.clinicPlan.create({
      data: {
        name,
        description: description ?? null,
        monthlyPrice: parseFloat(price),
        monthlyTxLimit: parseInt(monthlyTxLimit ?? '1000'),
        trialDays: trialDays !== undefined && trialDays !== null ? parseInt(trialDays) : 30,
        tier: tier ?? 'STARTER',
        isActive: isActive !== undefined ? Boolean(isActive) : true,
        isPublic: isPublic !== undefined ? Boolean(isPublic) : true,
      },
    });

    return NextResponse.json({ plan: created }, { status: 201 });
  } catch (error) {
    console.error('Error creating plan:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
 