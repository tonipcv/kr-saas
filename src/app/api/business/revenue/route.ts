import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function ok(data: any) {
  return NextResponse.json({ success: true, data });
}
function badRequest(message: string) {
  return NextResponse.json({ success: false, message }, { status: 400 });
}
function unauthorized(message = 'Não autorizado') {
  return NextResponse.json({ success: false, message }, { status: 401 });
}
function forbidden(message = 'Acesso negado') {
  return NextResponse.json({ success: false, message }, { status: 403 });
}
function serverError(message = 'Erro interno do servidor') {
  return NextResponse.json({ success: false, message }, { status: 500 });
}

// GET /api/business/revenue?clinicId=...&from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return unauthorized();

    const userId = session.user.id;
    const { searchParams } = new URL(req.url);
    const clinicId = searchParams.get('clinicId') || undefined;
    const from = searchParams.get('from') || undefined;
    const to = searchParams.get('to') || undefined;

    if (!clinicId) return badRequest('clinicId é obrigatório');

    // Verify access to clinic
    const hasAccess = await prisma.clinic.findFirst({
      where: {
        id: clinicId,
        OR: [
          { ownerId: userId },
          { members: { some: { userId, isActive: true } } },
        ],
      },
      select: { id: true },
    });
    if (!hasAccess) return forbidden('Access denied to this clinic');

    // Resolve clinic ownership and active members to include all linked doctors
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { ownerId: true, members: { where: { isActive: true }, select: { userId: true } } },
    });
    const doctorIds: string[] = [];
    if (clinic?.ownerId) doctorIds.push(clinic.ownerId);
    if (clinic?.members?.length) doctorIds.push(...clinic.members.map(m => m.userId));

    // Build where clause: purchases belonging to this clinic via product.clinicId OR doctor linked to clinic
    const dateFilter: any = {};
    if (from) dateFilter.gte = new Date(`${from}T00:00:00`);
    if (to) dateFilter.lte = new Date(`${to}T23:59:59`);

    const where: any = {
      OR: [
        { product: { clinicId } },
        ...(doctorIds.length ? [{ doctorId: { in: doctorIds } }] : []),
      ],
      status: 'COMPLETED',
      ...(from || to ? { createdAt: dateFilter } : {}),
    };

    const [agg, count] = await Promise.all([
      prisma.purchase.aggregate({ _sum: { totalPrice: true }, where }),
      prisma.purchase.count({ where }),
    ]);

    const total = Number(agg?._sum?.totalPrice || 0) || 0;
    const purchasesCount = count || 0;
    const aov = purchasesCount > 0 ? total / purchasesCount : 0;

    if (process.env.NODE_ENV !== 'production') {
      console.log('[revenue][GET] where=', JSON.stringify(where), 'doctorIds=', doctorIds, 'total=', total, 'count=', purchasesCount);
    }

    return ok({ total, purchasesCount, aov });
  } catch (err) {
    console.error('GET /api/business/revenue error', err);
    return serverError();
  }
}
