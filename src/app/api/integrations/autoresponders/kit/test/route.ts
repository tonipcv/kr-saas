import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

async function assertClinicAccess(userId: string, clinicId: string) {
  const clinic = await prisma.clinic.findFirst({
    where: {
      id: clinicId,
      OR: [
        { ownerId: userId },
        { members: { some: { userId, isActive: true } } },
      ],
    },
    select: { id: true },
  });
  if (!clinic) throw new Error('Access denied to clinic');
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { clinicId, apiKey } = await req.json();
    if (!clinicId || !apiKey) return NextResponse.json({ error: 'clinicId and apiKey are required' }, { status: 400 });

    await assertClinicAccess(session.user.id, clinicId);

    const url = 'https://api.kit.com/v4/subscribers?limit=1';
    const res = await fetch(url, { headers: { 'X-Kit-Api-Key': String(apiKey).trim() }, cache: 'no-store' });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return NextResponse.json({ error: 'Invalid API Key or insufficient permissions', details: text }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 });
  }
}
