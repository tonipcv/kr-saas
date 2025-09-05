import { PrismaClient, Prisma } from '@prisma/client';

// Recalculate membership level for a patient profile based on totalPoints
// Picks the active MembershipLevel with the highest minPoints <= totalPoints
export async function recalculateMembershipLevel(
  tx: Prisma.TransactionClient,
  patientProfileId: string
) {
  // Load current totalPoints and clinic context
  const profile = await tx.patientProfile.findUnique({
    where: { id: patientProfileId },
    select: { 
      id: true, 
      totalPoints: true,
      doctorId: true
    }
  });
  if (!profile) return;

  const total = profile.totalPoints || 0;

  // Get doctor's clinic
  const doctorClinic = await tx.clinicMember.findFirst({
    where: { 
      userId: profile.doctorId,
      isActive: true
    },
    select: { clinicId: true }
  });

  if (!doctorClinic) return;

  // Find appropriate level for this clinic
  const level = await tx.membershipLevel.findFirst({
    where: { 
      clinicId: doctorClinic.clinicId,
      isActive: true, 
      minPoints: { lte: total } 
    },
    orderBy: { minPoints: 'desc' },
    select: { id: true }
  });

  await tx.patientProfile.update({
    where: { id: patientProfileId },
    data: { membershipLevelId: level?.id ?? null }
  });
}
