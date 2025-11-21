import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { recalculateMembershipLevel } from '@/lib/membership';
import { emitEvent } from '@/lib/events';
import { EventActor, EventType } from '@prisma/client';

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
    const clinicId = searchParams.get('clinicId') || undefined;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('page_size') || '20', 10)));
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    // If clinicId is provided, verify access
    if (clinicId) {
      const hasAccess = await prisma.clinic.findFirst({
        where: {
          id: clinicId,
          OR: [
            { ownerId: userId },
            {
              members: {
                some: {
                  userId: userId,
                  isActive: true
                }
              }
            }
          ]
        }
      });

      if (!hasAccess) {
        return forbidden('Access denied to this clinic');
      }
    }

    let where: any = {};

    if (me.role === 'DOCTOR') {
      // If clinicId provided (and access already verified), show all purchases for that clinic
      if (clinicId) {
        where = {
          OR: [
            { product: { clinicId } },
            // Also include purchases from doctors who own this clinic (for products without clinicId)
            { doctor: { owned_clinics: { some: { id: clinicId } } } },
          ],
          ...(patientId && { userId: patientId }),
        };
      } else {
        // Default: doctor-scoped
        where = {
          doctorId: userId,
          ...(patientId && { userId: patientId }),
        };
      }
    } else {
      // patient can only see their own purchases
      where = { userId };
    }

    let [items, total] = await Promise.all([
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

    if (process.env.NODE_ENV !== 'production') {
      console.log('[purchases][GET] where=', JSON.stringify(where), 'returned=', items.length, 'total=', total);
    }

    // Fallback: if clinicId provided and nothing returned, try broader OR filter
    if (me.role === 'DOCTOR' && clinicId && items.length === 0) {
      const fallbackWhere = {
        OR: [
          { product: { clinicId } },
          { doctor: { owned_clinics: { some: { id: clinicId } } } },
        ],
        ...(patientId && { userId: patientId }),
      } as const;
      [items, total] = await Promise.all([
        prisma.purchase.findMany({
          where: fallbackWhere as any,
          orderBy: { createdAt: 'desc' },
          skip,
          take,
          include: {
            product: { select: { id: true, name: true, price: true, creditsPerUnit: true } },
            user: { select: { id: true, name: true, email: true } },
            doctor: { select: { id: true, name: true, email: true } },
          },
        }),
        prisma.purchase.count({ where: fallbackWhere as any }),
      ]);
      if (process.env.NODE_ENV !== 'production') {
        console.log('[purchases][GET][fallback] where=', JSON.stringify(fallbackWhere), 'returned=', items.length, 'total=', total);
      }
    }

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
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, price: true, creditsPerUnit: true, category: true, productCategory: { select: { name: true } }, clinicId: true }
    });
    if (!product) return badRequest('Produto não encontrado');

    // Monetary and points as Decimal
    const unitPrice = new Prisma.Decimal(product.price);
    const creditsPerUnit = new Prisma.Decimal(product.creditsPerUnit);

    const qty = new Prisma.Decimal(quantity);
    const totalPrice = unitPrice.mul(qty);
    const pointsAwarded = creditsPerUnit.mul(qty);

    const result = await prisma.$transaction(async (tx) => {
      // Ensure PatientProfile for this (doctorId, patientId)
      let patientProfile = await tx.patientProfile.findFirst({
        where: { doctorId, userId: patientId },
        select: { id: true, totalPoints: true, currentPoints: true },
      });
      if (!patientProfile) {
        patientProfile = await tx.patientProfile.create({
          data: { doctorId, userId: patientId },
          select: { id: true, totalPoints: true, currentPoints: true },
        });
      }

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

      // Create ledger entry scoped to patient profile
      await tx.pointsLedger.create({
        data: {
          userId: patientId,
          patientProfileId: patientProfile.id,
          sourceType: 'PURCHASE',
          sourceId: purchase.id,
          amount: pointsAwarded,
          description: `Pontos por compra: ${quantity}x ${product.name ?? product.id}`,
        },
      });

      // Update PatientProfile snapshots (convert Decimal to integer points)
      const delta = Number(pointsAwarded);
      const deltaInt = Math.round(delta);
      await tx.patientProfile.update({
        where: { id: patientProfile.id },
        data: {
          totalPoints: { increment: Math.max(0, deltaInt) },
          currentPoints: { increment: deltaInt },
        },
      });

      // Recalculate level based on updated totalPoints
      await recalculateMembershipLevel(tx, patientProfile.id);

      return purchase;
    });

    // Fire analytics: points_earned and purchase_made (non-blocking)
    try {
      // Resolve clinicId: prefer product's clinic, then fall back to doctor ownership or membership
      let clinicId: string | null = product.clinicId || null;
      try {
        if (!clinicId) {
          const owned = await prisma.clinic.findFirst({ where: { ownerId: doctorId }, select: { id: true } });
          if (owned?.id) clinicId = owned.id;
        }
      } catch {}
      if (!clinicId) {
        try {
          const membership = await prisma.clinicMember.findFirst({ where: { userId: doctorId, isActive: true }, select: { clinicId: true } });
          if (membership?.clinicId) clinicId = membership.clinicId;
        } catch {}
      }

      if (clinicId) {
        // points_earned: mirror the ledger entry
        try {
          const pts = Number(pointsAwarded);
          await emitEvent({
            eventId: `points_${result.id}`,
            eventType: EventType.points_earned,
            actor: EventActor.customer,
            clinicId,
            customerId: result.userId,
            timestamp: result.createdAt as any,
            metadata: { value: pts, source: 'purchase', source_id: result.id },
          });
        } catch {}

        const value = Number(result.totalPrice);
        const categoria = String(
          (product as any)?.category || (product as any)?.productCategory?.name || 'outros'
        );
        const eventPayload = {
          eventId: `purchase_${result.id}`,
          eventType: EventType.purchase_made,
          actor: EventActor.clinic,
          clinicId,
          customerId: result.userId,
          timestamp: result.createdAt as any,
          metadata: {
            value,
            currency: 'BRL',
            items: [
              {
                name: product.name ?? product.id,
                categoria,
                qty: quantity,
                price: Number(unitPrice),
              },
            ],
            channel: 'online',
            purchase_id: result.id,
            idempotency_key: idempotencyKey || null,
          },
        } as const;
        console.log('[events] Emitting purchase_made', JSON.stringify(eventPayload));
        await emitEvent({
          eventId: `purchase_${result.id}`,
          eventType: EventType.purchase_made,
          actor: EventActor.clinic,
          clinicId,
          customerId: result.userId,
          timestamp: result.createdAt as any,
          metadata: {
            value,
            currency: 'BRL',
            items: [
              { name: product.name ?? product.id, categoria, qty: quantity, price: Number(unitPrice) }
            ],
            channel: 'online',
            purchase_id: result.id,
            idempotency_key: idempotencyKey || null,
          }
        });
      }
    } catch (e) {
      console.error('[events] purchase_made emit failed', e);
    }

    return ok({ purchase: result });
  } catch (err: any) {
    console.error('POST /api/purchases error', err);
    return serverError(err?.message || undefined);
  }
}
