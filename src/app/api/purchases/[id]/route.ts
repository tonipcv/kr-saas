import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { recalculateMembershipLevel } from '@/lib/membership';
import { emitEvent } from '@/lib/events';
import { EventActor, EventType } from '@prisma/client';

function ok(data: any) { return NextResponse.json({ success: true, data }); }

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return unauthorized();
    const doctorId = session.user.id;
    const { id } = await params;
    if (!id) return badRequest('Missing purchase id');

    const body = await req.json().catch(() => ({}));
    const newQuantity = body?.quantity as number | undefined; // optional
    const newNotes = (body?.notes ?? undefined) as string | undefined; // optional
    if (newQuantity !== undefined && (!Number.isFinite(newQuantity) || newQuantity < 1)) {
      return badRequest('quantity inválido');
    }

    // Load purchase with relations
    const purchase = await prisma.purchase.findUnique({
      where: { id },
      include: { product: { select: { id: true, name: true, creditsPerUnit: true, clinicId: true } }, user: { select: { id: true } } }
    });
    if (!purchase) return badRequest('Compra não encontrada');
    if (purchase.doctorId !== doctorId) return forbidden('Você não pode editar esta compra');

    const before = { ...purchase } as any;

    const result = await prisma.$transaction(async (tx) => {
      let updated = purchase;
      let changed = false;

      // If quantity changed, adjust pointsAwarded, totalPrice, unitPrice stays same
      if (newQuantity !== undefined && newQuantity !== purchase.quantity) {
        changed = true;
        const qty = new Prisma.Decimal(newQuantity);
        const unit = new Prisma.Decimal(purchase.unitPrice);
        const creditsPerUnit = new Prisma.Decimal(purchase.product?.creditsPerUnit || 0);
        const newTotal = unit.mul(qty);
        const newPoints = creditsPerUnit.mul(qty);

        // Update purchase
        updated = await tx.purchase.update({
          where: { id: purchase.id },
          data: { quantity: newQuantity, totalPrice: newTotal, pointsAwarded: newPoints, notes: newNotes ?? purchase.notes },
        });

        // Update ledger: delete old and create new with new amount
        await tx.pointsLedger.deleteMany({ where: { sourceType: 'PURCHASE', sourceId: purchase.id } });
        const profile = await tx.patientProfile.findFirst({ where: { doctorId, userId: purchase.userId }, select: { id: true } });
        if (profile) {
          // Recompute snapshots from delta: remove old, add new
          const oldPts = Math.round(Number(purchase.pointsAwarded || 0));
          const newPts = Math.round(Number(newPoints));
          const diff = newPts - oldPts;
          await tx.patientProfile.update({
            where: { id: profile.id },
            data: {
              totalPoints: { increment: Math.max(0, diff) },
              currentPoints: { increment: diff },
            },
          });
          // Recreate ledger with new amount
          await tx.pointsLedger.create({
            data: {
              userId: purchase.userId,
              patientProfileId: profile.id,
              sourceType: 'PURCHASE',
              sourceId: purchase.id,
              amount: newPoints,
              description: `Pontos por compra (ajuste): ${newQuantity}x ${purchase.product?.name ?? purchase.productId}`,
            },
          });
          await recalculateMembershipLevel(tx as unknown as Prisma.TransactionClient, profile.id);
        }
      }

      // If only notes changed
      if (newNotes !== undefined && newNotes !== (changed ? (updated.notes ?? null) : (purchase.notes ?? null))) {
        changed = true;
        updated = await tx.purchase.update({ where: { id: purchase.id }, data: { notes: newNotes } });
      }

      return updated;
    });

    // Emit audit event
    let clinicId: string | null = purchase.product?.clinicId || null;
    if (!clinicId) {
      try {
        const owned = await prisma.clinic.findFirst({ where: { ownerId: doctorId }, select: { id: true } });
        if (owned?.id) clinicId = owned.id;
      } catch {}
      if (!clinicId) {
        try {
          const membership = await prisma.clinicMember.findFirst({ where: { userId: doctorId, isActive: true }, select: { clinicId: true } });
          if (membership?.clinicId) clinicId = membership.clinicId;
        } catch {}
      }
    }

    try {
      if (clinicId) {
        await emitEvent({
          eventType: EventType.config_changed,
          actor: EventActor.clinic,
          clinicId,
          customerId: purchase.userId,
          timestamp: new Date() as any,
          metadata: {
            field_changed: 'purchase_updated_manual',
            old_value: {
              id: before.id,
              quantity: before.quantity,
              totalPrice: before.totalPrice,
              pointsAwarded: before.pointsAwarded,
              notes: before.notes,
            },
            new_value: {
              id: result.id,
              quantity: result.quantity,
              totalPrice: result.totalPrice,
              pointsAwarded: result.pointsAwarded,
              notes: result.notes,
            },
          },
        });
      }
    } catch (e) {
      console.error('[events] purchase_updated emit failed', e);
    }

    return ok({ purchase: result });
  } catch (err: any) {
    console.error('PATCH /api/purchases/[id] error', err);
    return serverError(err?.message || undefined);
  }
}
function badRequest(message: string) { return NextResponse.json({ success: false, message }, { status: 400 }); }
function unauthorized(message = 'Não autorizado') { return NextResponse.json({ success: false, message }, { status: 401 }); }
function forbidden(message = 'Acesso negado') { return NextResponse.json({ success: false, message }, { status: 403 }); }
function serverError(message = 'Erro interno do servidor') { return NextResponse.json({ success: false, message }, { status: 500 }); }

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return unauthorized();
    const doctorId = session.user.id;
    const { id } = await params;
    if (!id) return badRequest('Missing purchase id');

    // Load purchase and validate ownership
    const purchase = await prisma.purchase.findUnique({
      where: { id },
      include: { product: { select: { id: true, name: true, clinicId: true } }, user: { select: { id: true, name: true, email: true } } }
    });
    if (!purchase) return badRequest('Compra não encontrada');
    if (purchase.doctorId !== doctorId) return forbidden('Você não pode apagar esta compra');

    const result = await prisma.$transaction(async (tx) => {
      // Revert points ledger entries linked to this purchase
      const ledgers = await tx.pointsLedger.findMany({ where: { sourceType: 'PURCHASE', sourceId: purchase.id } });
      let revert = 0;
      for (const l of ledgers) {
        revert += Number(l.amount || 0);
      }

      // Fetch or create patient profile for adjustment
      const profile = await tx.patientProfile.findFirst({ where: { doctorId, userId: purchase.userId }, select: { id: true } });

      if (profile) {
        // Decrement snapshots using rounded integer points
        const deltaInt = Math.round(revert);
        await tx.patientProfile.update({
          where: { id: profile.id },
          data: {
            totalPoints: { decrement: Math.max(0, deltaInt) },
            currentPoints: { decrement: deltaInt },
          },
        });
      }

      // Delete ledgers
      if (ledgers.length > 0) {
        await tx.pointsLedger.deleteMany({ where: { sourceType: 'PURCHASE', sourceId: purchase.id } });
      }

      // Delete purchase
      await tx.purchase.delete({ where: { id: purchase.id } });

      // Recalculate membership level if we had a profile
      if (profile) {
        await recalculateMembershipLevel(tx as unknown as Prisma.TransactionClient, profile.id);
      }

      return { revertedPoints: revert, profileId: profile?.id || null };
    });

    // Delete related events: purchase_made and points_earned for this purchase
    try {
      await prisma.event.deleteMany({
        where: {
          OR: [
            { eventId: `purchase_${id}` },
            { eventId: `points_${id}` },
            // Fallback for older events without eventId but with metadata link
            // @ts-expect-error Prisma JSON path filter typed loosely here
            { metadata: { path: ['purchase_id'], equals: id } as any },
            // @ts-expect-error see above
            { metadata: { path: ['source_id'], equals: id } as any },
          ],
        },
      });
    } catch (e) {
      console.error('[events] failed to delete related events for purchase', id, e);
    }

    // Resolve clinicId for event
    let clinicId: string | null = purchase.product?.clinicId || null;
    if (!clinicId) {
      try {
        const owned = await prisma.clinic.findFirst({ where: { ownerId: doctorId }, select: { id: true } });
        if (owned?.id) clinicId = owned.id;
      } catch {}
      if (!clinicId) {
        try {
          const membership = await prisma.clinicMember.findFirst({ where: { userId: doctorId, isActive: true }, select: { clinicId: true } });
          if (membership?.clinicId) clinicId = membership.clinicId;
        } catch {}
      }
    }

    // Emit audit event (config_changed) with full snapshot in old_value
    try {
      if (clinicId) {
        await emitEvent({
          eventType: EventType.config_changed,
          actor: EventActor.clinic,
          clinicId,
          customerId: purchase.userId,
          timestamp: new Date() as any,
          metadata: {
            field_changed: 'purchase_deleted_manual',
            old_value: {
              purchase: {
                id: purchase.id,
                userId: purchase.userId,
                doctorId: purchase.doctorId,
                productId: purchase.productId,
                quantity: purchase.quantity,
                unitPrice: purchase.unitPrice,
                totalPrice: purchase.totalPrice,
                pointsAwarded: purchase.pointsAwarded,
                createdAt: purchase.createdAt,
                notes: purchase.notes,
                productName: purchase.product?.name || null,
              },
              reverted_points: result.revertedPoints,
            },
            new_value: null,
          },
        });
      }
    } catch (e) {
      console.error('[events] purchase_deleted emit failed', e);
    }

    return ok({ id, deleted: true });
  } catch (err: any) {
    console.error('DELETE /api/purchases/[id] error', err);
    return serverError(err?.message || undefined);
  }
}
