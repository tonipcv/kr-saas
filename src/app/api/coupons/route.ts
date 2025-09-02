import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function ok(data: any) { return NextResponse.json({ success: true, data }); }
function badRequest(message: string) { return NextResponse.json({ success: false, message }, { status: 400 }); }
function unauthorized(message = 'Não autorizado') { return NextResponse.json({ success: false, message }, { status: 401 }); }
function forbidden(message = 'Acesso negado') { return NextResponse.json({ success: false, message }, { status: 403 }); }
function serverError(message = 'Erro interno do servidor') { return NextResponse.json({ success: false, message }, { status: 500 }); }

// GET /api/coupons?objective=&status=&patient_id=&page=1&page_size=20
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return unauthorized();

    const doctorId = session.user.id;
    const me = await prisma.user.findUnique({ where: { id: doctorId }, select: { role: true } });
    if (!me || me.role !== 'DOCTOR') return forbidden('Apenas médicos podem listar cupons.');

    const { searchParams } = new URL(req.url);
    const objective = searchParams.get('objective') || undefined;
    const status = searchParams.get('status') || undefined;
    const patientId = searchParams.get('patient_id') || undefined;

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('page_size') || '20', 10)));
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const where: any = { doctorId };
    if (objective) where.objective = objective;
    if (status) where.status = status;
    if (patientId) where.patientId = patientId;

    const [items, total] = await Promise.all([
      prisma.coupon.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
        include: {
          patient: { select: { id: true, name: true, email: true } },
          referrer: { select: { id: true, name: true, email: true } },
          product: { select: { id: true, name: true } } as any,
        },
      }),
      prisma.coupon.count({ where }),
    ]);

    return ok({
      items,
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
    });
  } catch (err: any) {
    console.error('GET /api/coupons error', err);
    return serverError(err?.message || undefined);
  }
}

// DELETE /api/coupons
// Filters via query string or JSON body: id, code, objective, patient_id, status
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return unauthorized();

    const doctorId = session.user.id;
    const me = await prisma.user.findUnique({ where: { id: doctorId }, select: { role: true } });
    if (!me || me.role !== 'DOCTOR') return forbidden('Apenas médicos podem excluir cupons.');

    const { searchParams } = new URL(req.url);
    let id = searchParams.get('id') || undefined;
    let code = searchParams.get('code') || undefined;
    let objective = searchParams.get('objective') || undefined;
    let patientId = searchParams.get('patient_id') || undefined;
    let status = searchParams.get('status') || undefined;

    if (!id && !code && !objective && !patientId && !status) {
      try {
        const body = await req.json();
        id = body?.id || id;
        code = body?.code || code;
        objective = body?.objective || objective;
        patientId = body?.patient_id || body?.patientId || patientId;
        status = body?.status || status;
      } catch {}
    }

    if (!id && !code && !objective && !patientId && !status) {
      return badRequest('Forneça ao menos um filtro: id, code, objective, patient_id ou status');
    }

    const where: any = { doctorId };
    if (id) where.id = id;
    if (code) where.code = code;
    if (objective) where.objective = objective;
    if (patientId) where.patientId = patientId;
    if (status) where.status = status;

    const result = await prisma.coupon.deleteMany({ where });
    return ok({ deleted_count: result.count });
  } catch (err: any) {
    console.error('DELETE /api/coupons error', err);
    return serverError(err?.message || undefined);
  }
}
