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

// POST /api/coupons/redeem
// Body (snake_case): { coupon_id? , code?, redeemed_by_id?, notes? }
// Only DOCTOR can redeem. If code is provided, finds latest coupon for doctor with that code.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return unauthorized();

    const doctorId = session.user.id;
    const me = await prisma.user.findUnique({ where: { id: doctorId }, select: { role: true } });
    if (!me || me.role !== 'DOCTOR') return forbidden('Apenas médicos podem registrar redenções.');

    const body = await req.json().catch(() => null);
    if (!body) return badRequest('JSON inválido');

    const couponId: string | undefined = body.coupon_id ?? undefined;
    const code: string | undefined = body.code ?? undefined;
    const redeemedById: string | undefined = body.redeemed_by_id ?? undefined; // paciente que utilizou
    const notes: string | undefined = body.notes ?? undefined;

    if (!couponId && !code) return badRequest('Informe coupon_id ou code');

    // Locate coupon
    const coupon = await prisma.coupon.findFirst({
      where: couponId
        ? { id: couponId, doctorId }
        : { code: code!, doctorId },
    });
    if (!coupon) return badRequest('Cupom não encontrado para este médico');

    // Create redemption and update coupon status
    const redemption = await prisma.$transaction(async (tx) => {
      const r = await tx.couponRedemption.create({
        data: {
          couponId: coupon.id,
          doctorId,
          redeemedById: redeemedById ?? null,
          notes,
        },
      });

      // Mark as REDEEMED if currently ISSUED
      if (coupon.status !== 'REDEEMED') {
        await tx.coupon.update({
          where: { id: coupon.id },
          data: { status: 'REDEEMED' },
        });
      }

      return r;
    });

    return ok({ redemption });
  } catch (err: any) {
    console.error('POST /api/coupons/redeem error', err);
    return serverError(err?.message || undefined);
  }
}
