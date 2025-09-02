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

// GET /api/coupons/metrics?date_from=...&date_to=...&objective=...&campaign_id=...
// Only doctor can query their metrics
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return unauthorized();

    const doctorId = session.user.id;
    const me = await prisma.user.findUnique({ where: { id: doctorId }, select: { role: true } });
    if (!me || me.role !== 'DOCTOR') return forbidden('Apenas médicos podem consultar métricas.');

    const { searchParams } = new URL(req.url);
    const dateFromRaw = searchParams.get('date_from');
    const dateToRaw = searchParams.get('date_to');
    const objective = searchParams.get('objective') || undefined;
    const campaignId = searchParams.get('campaign_id') || undefined;

    let dateFrom: Date | undefined;
    let dateTo: Date | undefined;
    if (dateFromRaw) {
      const d = new Date(dateFromRaw);
      if (Number.isNaN(d.getTime())) return badRequest('date_from inválido');
      dateFrom = d;
    }
    if (dateToRaw) {
      const d = new Date(dateToRaw);
      if (Number.isNaN(d.getTime())) return badRequest('date_to inválido');
      dateTo = d;
    }

    const couponWhere: any = { doctorId };
    const redemptionWhere: any = { doctorId };

    if (objective) couponWhere.objective = objective;
    if (campaignId) couponWhere.campaignId = campaignId;

    if (dateFrom || dateTo) {
      couponWhere.createdAt = {} as any;
      if (dateFrom) couponWhere.createdAt.gte = dateFrom;
      if (dateTo) couponWhere.createdAt.lte = dateTo;

      redemptionWhere.redeemedAt = {} as any;
      if (dateFrom) redemptionWhere.redeemedAt.gte = dateFrom;
      if (dateTo) redemptionWhere.redeemedAt.lte = dateTo;
    }

    const [issued, redeemed] = await Promise.all([
      prisma.coupon.count({ where: couponWhere }),
      prisma.couponRedemption.count({ where: redemptionWhere }),
    ]);

    const redemptionRate = issued > 0 ? redeemed / issued : 0;

    return ok({ issued, redeemed, redemption_rate: redemptionRate });
  } catch (err: any) {
    console.error('GET /api/coupons/metrics error', err);
    return serverError(err?.message || undefined);
  }
}
