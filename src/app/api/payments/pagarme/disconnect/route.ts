import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
    const { clinicId } = await req.json();
    if (!clinicId) return NextResponse.json({ error: 'clinicId é obrigatório' }, { status: 400 });

    const clinicMember = await prisma.clinicMember.findFirst({ where: { clinicId, userId: session.user.id, isActive: true } });
    if (!clinicMember) return NextResponse.json({ error: 'Não autorizado para esta clínica' }, { status: 403 });

    const updated = await prisma.merchant.update({
      where: { clinicId },
      data: { status: 'DISABLED' }
    });

    return NextResponse.json({ success: true, merchant: updated });
  } catch (e: any) {
    console.error('[pagarme][disconnect] error', e);
    return NextResponse.json({ error: e?.message || 'Erro interno do servidor' }, { status: 500 });
  }
}
