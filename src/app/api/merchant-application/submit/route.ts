import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { MerchantOnboardingService } from '@/services/merchant-onboarding';

const service = new MerchantOnboardingService();

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { clinicId } = body || {};

    if (!clinicId) {
      return NextResponse.json({ error: 'clinicId is required' }, { status: 400 });
    }

    // Ensure user has access to the clinic (owner or active member)
    const clinic = await prisma.clinic.findFirst({
      where: {
        id: clinicId,
        isActive: true,
        OR: [
          { ownerId: session.user.id },
          { members: { some: { userId: session.user.id, isActive: true } } },
        ],
      },
      select: { id: true },
    });

    if (!clinic) {
      return NextResponse.json({ error: 'Clinic not found or no access' }, { status: 403 });
    }

    const result = await service.submitApplication({ clinicId });
    if (!result.success) {
      return NextResponse.json({ error: result.message || 'Missing required fields', status: result.status }, { status: 400 });
    }
    return NextResponse.json({ status: result.status || 'UNDER_REVIEW' });
  } catch (error: any) {
    console.error('[merchant-application/submit][POST] error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
