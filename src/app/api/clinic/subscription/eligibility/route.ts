import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Eligible only if the user (as clinic owner) does NOT already have
    // any ACTIVE clinic subscription (regardless of plan tier or trial history).
    const priorActive = await prisma.clinicSubscription.findFirst({
      where: {
        clinic: { ownerId: session.user.id },
        status: 'ACTIVE',
      },
      select: { id: true },
    });

    const eligibleForTrial = !priorActive;
    return NextResponse.json({ eligibleForTrial });
  } catch (error: any) {
    console.error('Eligibility check error:', error?.message);
    return NextResponse.json({ error: 'Failed to check eligibility' }, { status: 500 });
  }
}
