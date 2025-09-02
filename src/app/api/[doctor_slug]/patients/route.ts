import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantContext, requireDoctorContext } from "@/lib/tenant";

// GET /api/[doctor_slug]/patients
// Lists patients (tenant-scoped) for the doctor
export async function GET(req: NextRequest) {
  try {
    const ctx = await getTenantContext(req);
    await requireDoctorContext(ctx);

    const patients = await prisma.patientProfile.findMany({
      where: { doctorId: ctx.doctorId, isActive: true },
      orderBy: { updatedAt: "desc" },
      select: {
        doctorId: true,
        userId: true,
        name: true,
        phone: true,
        notes: true,
        updatedAt: true,
        patient: {
          select: { id: true, email: true, name: true }
        }
      }
    });

    const data = patients.map(p => ({
      userId: p.userId,
      email: p.patient?.email ?? null,
      name: p.name ?? p.patient?.name ?? null,
      phone: p.phone ?? null,
      notes: p.notes ?? null,
      updatedAt: p.updatedAt,
    }));

    return NextResponse.json({ ok: true, count: data.length, data });
  } catch (err: any) {
    const status = err?.status ?? 500;
    return NextResponse.json({ ok: false, error: err?.message ?? "Internal Error" }, { status });
  }
}

// POST /api/[doctor_slug]/patients
// Creates or updates a patient profile for this doctor
export async function POST(req: NextRequest) {
  try {
    const ctx = await getTenantContext(req);
    await requireDoctorContext(ctx);

    const body = await req.json();
    const { email, name, phone, notes } = body as {
      email?: string;
      name?: string;
      phone?: string;
      notes?: string;
    };

    if (!email) {
      return NextResponse.json({ ok: false, error: "Email is required" }, { status: 400 });
    }

    // Ensure a global user exists for this patient
    const user = await prisma.user.upsert({
      where: { email },
      update: { name: name ?? undefined },
      create: { email, name: name ?? null, role: "PATIENT" },
      select: { id: true }
    });

    // Ensure relationship exists
    await prisma.doctorPatientRelationship.upsert({
      where: { patientId_doctorId: { patientId: user.id, doctorId: ctx.doctorId } },
      update: { isActive: true },
      create: { patientId: user.id, doctorId: ctx.doctorId, isActive: true }
    });

    // Upsert tenant profile
    await prisma.patientProfile.upsert({
      where: { doctorId_userId: { doctorId: ctx.doctorId, userId: user.id } },
      update: { name: name ?? undefined, phone: phone ?? undefined, notes: notes ?? undefined, isActive: true },
      create: { doctorId: ctx.doctorId, userId: user.id, name: name ?? null, phone: phone ?? null, notes: notes ?? null }
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const status = err?.status ?? 500;
    return NextResponse.json({ ok: false, error: err?.message ?? "Internal Error" }, { status });
  }
}
