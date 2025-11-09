import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const { enrollmentId } = await req.json();

    if (!enrollmentId) {
      return NextResponse.json(
        { error: 'enrollmentId é obrigatório' },
        { status: 400 }
      );
    }

    const result = await prisma.openFinanceLink.updateMany({
      where: {
        enrollmentId: String(enrollmentId),
        status: 'PENDING',
      },
      data: {
        status: 'ACTIVE',
        updatedAt: new Date(),
      },
    });

    console.log('[enrollments.activate]', {
      enrollmentId,
      updated: result.count,
    });

    return NextResponse.json({
      ok: true,
      enrollmentId,
      updated: result.count > 0,
    });
  } catch (e: any) {
    console.error('[enrollments.activate] Error:', e);
    return NextResponse.json(
      { error: e?.message || 'Erro ao ativar enrollment' },
      { status: 500 }
    );
  }
}
