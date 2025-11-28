import { prisma } from '@/lib/prisma'

export async function checkClinicAccess(userId: string, clinicId: string): Promise<boolean> {
  if (!userId || !clinicId) return false
  const membership = await prisma.clinicMember.findFirst({
    where: {
      userId,
      clinicId,
      role: { in: ['OWNER', 'MANAGER'] as any },
      isActive: true,
    },
    select: { id: true },
  }).catch(() => null)
  return !!membership
}
