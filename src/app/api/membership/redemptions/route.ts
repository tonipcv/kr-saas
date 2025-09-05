import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { recalculateMembershipLevel } from '@/lib/membership';

// POST /api/membership/redemptions
// Body: { patient_id: string, amount: number, description?: string }
// Debits PatientProfile.currentPoints and writes a negative PointsLedger entry scoped to the profile
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const doctorId = session.user.id;
    const { patient_id: patientId, amount, description } = await req.json();

    if (!patientId) return NextResponse.json({ error: 'patient_id é obrigatório' }, { status: 400 });
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return NextResponse.json({ error: 'amount deve ser um número > 0' }, { status: 400 });

    const result = await prisma.$transaction(async (tx) => {
      // Ensure PatientProfile for (doctorId, patientId)
      let patientProfile = await tx.patientProfile.findFirst({
        where: { doctorId, userId: patientId },
        select: { id: true, currentPoints: true, totalPoints: true },
      });
      if (!patientProfile) {
        patientProfile = await tx.patientProfile.create({
          data: { doctorId, userId: patientId },
          select: { id: true, currentPoints: true, totalPoints: true },
        });
      }

      const current = patientProfile.currentPoints || 0;
      const deltaInt = Math.round(amt);
      if (current < deltaInt) {
        throw new Error('Pontos insuficientes para resgate');
      }

      // Ledger negative entry
      await tx.pointsLedger.create({
        data: {
          userId: patientId,
          patientProfileId: patientProfile.id,
          sourceType: 'REDEMPTION',
          sourceId: null,
          amount: new Prisma.Decimal(-deltaInt),
          description: description ?? `Resgate de pontos (${deltaInt})`,
        },
      });

      // Update snapshots
      await tx.patientProfile.update({
        where: { id: patientProfile.id },
        data: { currentPoints: { decrement: deltaInt } },
      });

      await recalculateMembershipLevel(tx, patientProfile.id);

      return { debited: deltaInt, profileId: patientProfile.id };
    });

    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    const msg = error?.message || 'Erro interno do servidor';
    const status = msg.includes('insuficientes') ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
