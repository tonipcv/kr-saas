import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const clinicId = searchParams.get('clinicId');
    if (!clinicId) {
      return NextResponse.json({ error: 'clinicId é obrigatório' }, { status: 400 });
    }

    // Verify user is a member of clinic
    const clinicMember = await prisma.clinicMember.findFirst({
      where: { clinicId, userId: session.user.id, isActive: true },
    });
    if (!clinicMember) {
      return NextResponse.json({ error: 'Não autorizado para esta clínica' }, { status: 403 });
    }

    const merchant = await prisma.merchant.findUnique({
      where: { clinicId },
      select: { status: true, recipientId: true, splitPercent: true, platformFeeBps: true, lastSyncAt: true },
    });
    if (!merchant) {
      return NextResponse.json({
        connected: false,
        status: 'PENDING',
        recipientId: null,
        splitPercent: 100,
        platformFeeBps: 0,
        lastSyncAt: null,
      });
    }

    return NextResponse.json({
      connected: !!merchant.recipientId && merchant.status !== 'DISABLED',
      status: merchant.status,
      recipientId: merchant.recipientId,
      splitPercent: merchant.splitPercent,
      platformFeeBps: merchant.platformFeeBps,
      lastSyncAt: merchant.lastSyncAt ? merchant.lastSyncAt.toISOString() : null,
    });
  } catch (e) {
    console.error('[pagarme][status] error', e);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
