import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST /api/v2/patient/is-member-by-email/[slug]
// Body: { email: string }
// Returns { success: boolean, isMember: boolean }
export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } | Promise<{ slug: string }> }
) {
  try {
    const { slug } = await Promise.resolve(params as any);
    if (!slug) {
      return NextResponse.json({ success: false, message: 'Missing slug' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email) {
      return NextResponse.json({ success: false, message: 'Missing email' }, { status: 400 });
    }

    // Resolve clinic by slug OR subdomain via raw SQL
    let clinic: { id: string; ownerId: string | null } | null = null;
    try {
      const rows = await prisma.$queryRaw<{ id: string; ownerId: string | null }[]>`
        SELECT id, "ownerId" FROM clinics WHERE slug = ${slug} OR "subdomain" = ${slug} LIMIT 1
      `;
      clinic = rows && rows[0] ? rows[0] : null;
    } catch {}

    // Pick a doctor for this clinic: owner if DOCTOR, else a member DOCTOR
    let doctor: { id: string } | null = null;
    if (clinic?.ownerId) {
      const ownerDoc = await prisma.user.findFirst({ where: { id: clinic.ownerId, role: 'DOCTOR' } as any, select: { id: true } });
      if (ownerDoc) doctor = ownerDoc as any;
    }
    if (!doctor && clinic) {
      const member = await prisma.clinicMember.findFirst({
        where: { clinicId: clinic.id, isActive: true, user: { role: 'DOCTOR' } } as any,
        include: { user: { select: { id: true } } },
      });
      if (member?.user) doctor = member.user as any;
    }

    // Backward-compatibility: if no clinic or doctor from clinic, try resolving by doctor slug directly
    if (!doctor) {
      const doc = await prisma.user.findFirst({ where: { doctor_slug: slug, role: 'DOCTOR' } as any, select: { id: true } });
      if (doc) doctor = doc as any;
    }

    if (!doctor) {
      return NextResponse.json({ success: false, message: 'Doctor/Clinic not found for identifier' }, { status: 404 });
    }

    // Find patient by email
    const patient = await prisma.user.findFirst({
      where: { email },
      select: { id: true, role: true, doctor_id: true },
    });
    if (!patient || patient.role !== 'PATIENT') {
      return NextResponse.json({ success: true, isMember: false });
    }

    if (patient.doctor_id === doctor.id) {
      return NextResponse.json({ success: true, isMember: true });
    }

    const relationship = await prisma.doctorPatientRelationship.findFirst({
      where: { doctorId: doctor.id, patientId: patient.id },
      select: { id: true },
    });

    return NextResponse.json({ success: true, isMember: Boolean(relationship) });
  } catch (error) {
    console.error('is-member-by-email error', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
