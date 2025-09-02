import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type TenantContext = {
  doctorSlug: string;
  doctorId: string;
  userId: string | null;
  role: string | null;
};

function extractSlugFromUrl(req: NextRequest): string | null {
  try {
    const url = new URL(req.url);
    const [first] = url.pathname.split("/").filter(Boolean);
    return first || null;
  } catch {
    return null;
  }
}

export async function getTenantContext(req: NextRequest): Promise<TenantContext> {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role ?? null;
  const userId = session?.user?.id ?? null;

  const slug = extractSlugFromUrl(req);
  if (!slug) {
    throw Object.assign(new Error("Missing doctor slug in path"), { status: 400 });
  }

  const doctor = await prisma.user.findFirst({
    where: { doctor_slug: slug },
    select: { id: true, doctor_slug: true, role: true },
  });
  if (!doctor) {
    throw Object.assign(new Error("Doctor not found for slug"), { status: 404 });
  }

  return {
    doctorSlug: slug,
    doctorId: doctor.id,
    userId,
    role,
  };
}

export async function requireDoctorContext(ctx: TenantContext) {
  if (ctx.role !== "DOCTOR" || !ctx.userId || ctx.userId !== ctx.doctorId) {
    throw Object.assign(new Error("Forbidden: requires doctor"), { status: 403 });
  }
}

export async function requireDoctorMembership(ctx: TenantContext) {
  if (!ctx.userId) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }
  if (ctx.role === "DOCTOR" && ctx.userId === ctx.doctorId) return; // owner doctor

  // Patient must have active relationship with doctor
  const rel = await prisma.doctorPatientRelationship.findFirst({
    where: { doctorId: ctx.doctorId, patientId: ctx.userId, isActive: true },
    select: { id: true },
  });
  if (!rel) {
    throw Object.assign(new Error("Forbidden: no relationship with doctor"), { status: 403 });
  }
}
