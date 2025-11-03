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

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { role: true },
    });
    if (user?.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email')?.trim();
    const clinicId = searchParams.get('clinicId')?.trim();

    if (!email && !clinicId) {
      return NextResponse.json({ error: 'Provide email or clinicId' }, { status: 400 });
    }

    const where: any = {};

    if (clinicId) {
      where.id = clinicId;
    } else if (email) {
      // search by owner email or clinic email
      where.OR = [
        { owner: { email } },
        { email },
      ];
    }

    const clinics = await prisma.clinic.findMany({
      where,
      include: {
        owner: { select: { id: true, name: true, email: true } },
        merchant: { select: { recipientId: true, status: true, splitPercent: true, platformFeeBps: true, lastSyncAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const result = clinics.map((c) => ({
      clinicId: c.id,
      clinicName: c.name,
      ownerEmail: c.owner?.email ?? null,
      clinicEmail: c.email ?? null,
      recipientId: (c as any).merchant?.recipientId ?? null,
      merchantStatus: (c as any).merchant?.status ?? null,
      splitPercent: (c as any).merchant?.splitPercent ?? null,
      platformFeeBps: (c as any).merchant?.platformFeeBps ?? null,
      lastSyncAt: (c as any).merchant?.lastSyncAt ?? null,
    }));

    return NextResponse.json({ items: result });
  } catch (error) {
    console.error('Error fetching merchant recipient:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
