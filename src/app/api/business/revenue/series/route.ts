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

// GET /api/business/revenue/series?clinicId=...&from=YYYY-MM-DD&to=YYYY-MM-DD
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

    // Build WHERE pieces for payment_transactions
    const clauses: string[] = [
      "pt.clinic_id = $1",
      "UPPER(pt.status) = 'PAID'"
    ];
    const params: any[] = [clinicId];
    let idx = 2;
    // Filter by settlement/paid date to reflect when revenue actually occurred
    if (from) { clauses.push(`COALESCE(pt.paid_at, pt.updated_at, pt.created_at) >= $${idx++}`); params.push(new Date(`${from}T00:00:00`)); }
    if (to)   { clauses.push(`COALESCE(pt.paid_at, pt.updated_at, pt.created_at) <= $${idx++}`); params.push(new Date(`${to}T23:59:59`)); }
    const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    // Aggregate daily sum of clinic net cents (fallback to amount_cents - platform_amount_cents)
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT to_char(date_trunc('day', COALESCE(pt.paid_at, pt.updated_at, pt.created_at)), 'YYYY-MM-DD') AS day,
              SUM(COALESCE(pt.clinic_amount_cents, (pt.amount_cents - COALESCE(pt.platform_amount_cents,0))))::bigint AS cents
         FROM payment_transactions pt
        ${whereSql}
     GROUP BY 1
     ORDER BY 1 ASC`,
      ...params
    ).catch(() => []);

    // Series in BRL units (cents / 100)
    const series: Array<[number, number]> = Array.isArray(rows)
      ? rows.map((r) => {
          const t = new Date(`${r.day}T00:00:00`).getTime();
          const cents = typeof r.cents === 'bigint' ? Number(r.cents) : Number(r.cents || 0);
          const v = (Number.isFinite(cents) ? cents : 0) / 100;
          return [t, v];
        })
      : [];

    return ok({ series });
  } catch (err) {
    console.error('GET /api/business/revenue/series error', err);
    return serverError();
  }
}
