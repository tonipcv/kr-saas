import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { MerchantStatus } from '@prisma/client';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
    const { clinicId } = await req.json();
    if (!clinicId) return NextResponse.json({ error: 'clinicId é obrigatório' }, { status: 400 });

    // Authorize owner OR active member
    const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { id: true, ownerId: true, isActive: true } });
    if (!clinic) {
      return NextResponse.json({ error: 'Clínica não encontrada', details: { clinicId } }, { status: 404 });
    }
    const isOwner = clinic.ownerId === session.user.id;
    let isActiveMember = false;
    if (!isOwner) {
      const member = await prisma.clinicMember.findFirst({ where: { clinicId, userId: session.user.id, isActive: true }, select: { id: true } });
      isActiveMember = Boolean(member);
    }
    if (!isOwner && !isActiveMember) {
      return NextResponse.json({ error: 'Não autorizado para esta clínica', details: { clinicId, userId: session.user.id, isOwner, isActiveMember } }, { status: 403 });
    }

    const merchant = await prisma.merchant.upsert({
      where: { clinicId },
      update: { status: MerchantStatus.PENDING },
      create: { clinicId, status: MerchantStatus.PENDING },
      select: { clinicId: true, status: true, recipientId: true, splitPercent: true, platformFeeBps: true, lastSyncAt: true },
    });

    return NextResponse.json({ success: true, merchant });
  } catch (e) {
    console.error('[pagarme][onboard] error', e);
    return NextResponse.json({ error: 'Erro interno do servidor', message: (e as any)?.message || null }, { status: 500 });
  }
}
