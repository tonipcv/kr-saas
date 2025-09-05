import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Buscar a clínica do médico
    const clinic = await prisma.clinic.findFirst({
      where: {
        ownerId: session.user.id,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    });

    if (!clinic) {
      return NextResponse.json({ error: 'Nenhuma clínica encontrada' }, { status: 404 });
    }

    return NextResponse.json({ clinic });
  } catch (e: any) {
    console.error('[clinics/current][GET] error', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}
