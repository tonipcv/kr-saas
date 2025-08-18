import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

// Unified JSON response helpers
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

// GET /api/purchases
// Doctors: list their created purchases; optional filter by patient (patient_id)
// Patients: list their own purchases
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return unauthorized();

    const userId = session.user.id;

    // Determine role
    const me = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!me) return unauthorized();

    const { searchParams } = new URL(req.url);
    const patientId = searchParams.get('patient_id') || undefined;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('page_size') || '20', 10)));
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    let where: any = {};

    if (me.role === 'DOCTOR') {
      where = { doctorId: userId };
      if (patientId) where.userId = patientId;
    } else {
      // patient can only see their own purchases
      where = { userId };
    }

    const [items, total] = await Promise.all([
      prisma.purchase.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          product: { select: { id: true, name: true, price: true, creditsPerUnit: true } },
          user: { select: { id: true, name: true, email: true } },
          doctor: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.purchase.count({ where }),
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
  } catch (err) {
    console.error('GET /api/purchases error', err);
    return serverError();
  }
}

// POST /api/purchases
// Body (snake_case): { patient_id, product_id, quantity?, notes?, idempotency_key? }
// Creates Purchase and corresponding PointsLedger in a transaction
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return unauthorized();

    const doctorId = session.user.id;

    // Ensure doctor role to create purchases
    const me = await prisma.user.findUnique({ where: { id: doctorId }, select: { role: true } });
    if (!me || me.role !== 'DOCTOR') return forbidden('Apenas médicos podem registrar compras.');

    const body = await req.json().catch(() => null);
    if (!body) return badRequest('JSON inválido');

    const patientId: string | undefined = body.patient_id;
    const productId: string | undefined = body.product_id;
    const quantityRaw = body.quantity ?? 1;
    const notes: string | undefined = body.notes ?? undefined;
    const idempotencyKey: string | undefined = body.idempotency_key ?? undefined;

    if (!patientId) return badRequest('patient_id é obrigatório');
    if (!productId) return badRequest('product_id é obrigatório');

    const quantity = Number(quantityRaw);
    if (!Number.isFinite(quantity) || quantity < 1) return badRequest('quantity inválido');

    // Optionally, enforce idempotency per key
    if (idempotencyKey) {
      const existing = await prisma.purchase.findFirst({ where: { externalIdempotencyKey: idempotencyKey } });
      if (existing) return ok({ purchase: existing, idempotent: true });
    }

    // Fetch product for price and credits per unit
    const product = await prisma.products.findUnique({ where: { id: productId }, select: { id: true, price: true, creditsPerUnit: true } });
    if (!product) return badRequest('Produto não encontrado');

    // Monetary and points as Decimal
    const unitPrice = new Prisma.Decimal(product.price);
    const creditsPerUnit = new Prisma.Decimal(product.creditsPerUnit);

    const qty = new Prisma.Decimal(quantity);
    const totalPrice = unitPrice.mul(qty);
    const pointsAwarded = creditsPerUnit.mul(qty);

    const result = await prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.create({
        data: {
          userId: patientId,
          doctorId,
          productId,
          quantity,
          unitPrice,
          totalPrice,
          pointsAwarded,
          status: 'COMPLETED',
          externalIdempotencyKey: idempotencyKey,
          notes,
        },
      });

      await tx.pointsLedger.create({
        data: {
          userId: patientId,
          sourceType: 'PURCHASE',
          sourceId: purchase.id,
          amount: pointsAwarded,
          description: `Pontos por compra do produto ${product.id} (qtd ${quantity})`,
        },
      });

      // Create a referral credit so the balance is visible and redeemable in the referrals dashboard
      await tx.referralCredit.create({
        data: {
          userId: patientId,
          amount: pointsAwarded,
          type: 'PURCHASE',
          description: `Créditos por compra do produto ${product.id} (qtd ${quantity})`,
        },
      });

      return purchase;
    });

    return ok({ purchase: result });
  } catch (err: any) {
    console.error('POST /api/purchases error', err);
    return serverError(err?.message || undefined);
  }
}
