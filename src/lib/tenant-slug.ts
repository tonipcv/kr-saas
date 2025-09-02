import { prisma } from '@/lib/prisma';

export async function getDoctorBySlug(slug: string) {
  return prisma.user.findFirst({
    where: { doctor_slug: slug },
    select: { id: true, name: true, doctor_slug: true, email: true },
  });
}

export async function getDoctorSlugByDoctorId(doctorId: string): Promise<string | null> {
  // Try owned clinic first
  const owned = await prisma.clinic.findFirst({
    where: { ownerId: doctorId, isActive: true },
    select: { slug: true },
  });
  if (owned?.slug) return owned.slug;

  // Fallback to membership clinic
  const membership = await prisma.clinicMember.findFirst({
    where: { userId: doctorId, isActive: true },
    include: { clinic: { select: { slug: true } } },
  });
  if (membership?.clinic?.slug) return membership.clinic.slug;

  // As a last resort, if the user has a doctor_slug, use it (older schema compat)
  const doctor = await prisma.user.findUnique({
    where: { id: doctorId },
    select: { doctor_slug: true },
  });
  return doctor?.doctor_slug ?? null;
}

export async function getClinicBrandingByDoctorId(doctorId: string): Promise<{ clinicName: string; clinicLogo?: string | null; doctorName?: string | null; }>{
  // Prefer owned clinic branding
  const owned = await prisma.clinic.findFirst({
    where: { ownerId: doctorId, isActive: true },
    select: { name: true, logo: true },
  });
  if (owned) {
    const doctor = await prisma.user.findUnique({ where: { id: doctorId }, select: { name: true } });
    return { clinicName: owned.name, clinicLogo: owned.logo, doctorName: doctor?.name ?? null };
  }

  // Fallback to membership clinic branding
  const membership = await prisma.clinicMember.findFirst({
    where: { userId: doctorId, isActive: true },
    include: { clinic: { select: { name: true, logo: true } } },
  });
  if (membership?.clinic) {
    const doctor = await prisma.user.findUnique({ where: { id: doctorId }, select: { name: true } });
    return { clinicName: membership.clinic.name, clinicLogo: membership.clinic.logo, doctorName: doctor?.name ?? null };
  }

  // Default
  const doctor = await prisma.user.findUnique({ where: { id: doctorId }, select: { name: true } });
  return { clinicName: 'Your Healthcare Provider', clinicLogo: null, doctorName: doctor?.name ?? null };
}
