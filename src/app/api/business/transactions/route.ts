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

// GET /api/business/transactions?clinicId=...&limit=50&from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return unauthorized();

    const userId = session.user.id;
    const { searchParams } = new URL(req.url);
    const clinicId = searchParams.get('clinicId') || undefined;
    const limit = Math.min(Number(searchParams.get('limit') || 50), 200);
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

    // Optional date filter
    // Note: payment_transactions.created_at is a timestamp
    const clauses: string[] = ['pt.clinic_id = $1'];
    const params: any[] = [clinicId];
    let paramIdx = 2;
    if (from) {
      clauses.push(`pt.created_at >= $${paramIdx++}`);
      params.push(new Date(`${from}T00:00:00`));
    }
    if (to) {
      clauses.push(`pt.created_at <= $${paramIdx++}`);
      params.push(new Date(`${to}T23:59:59`));
    }

    const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const sql = `
      SELECT pt.id,
             pt.provider_order_id,
             pt.provider_charge_id,
             pt.doctor_id,
             d.name AS doctor_name,
             pt.patient_profile_id,
             COALESCE(pp.name, pu.name) AS patient_name,
             pu.email AS patient_email,
             pt.clinic_id,
             c.name AS clinic_name,
             pt.product_id,
             p.name AS product_name,
             pt.amount_cents,
             pt.currency,
             pt.installments,
             pt.payment_method_type,
             pt.status,
             pt.created_at,
             pt.raw_payload
        FROM payment_transactions pt
   LEFT JOIN "User" d ON d.id = pt.doctor_id
   LEFT JOIN patient_profiles pp ON pp.id = pt.patient_profile_id
   LEFT JOIN "User" pu ON pu.id = pp.user_id
   LEFT JOIN clinics c ON c.id = pt.clinic_id
   LEFT JOIN products p ON p.id = pt.product_id
       ${whereSql}
    ORDER BY pt.created_at DESC
       LIMIT ${limit}
    `;

    // Using $queryRawUnsafe with parameter array for dynamic WHERE
    const rows = await prisma.$queryRawUnsafe<any[]>(sql, ...params);

    return ok({ items: rows });
  } catch (err) {
    console.error('GET /api/business/transactions error', err);
    return serverError();
  }
}
