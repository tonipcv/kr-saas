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

    // Resolve doctor by slug
    const doctor = await prisma.user.findFirst({
      where: { doctor_slug: slug, role: 'DOCTOR' },
      select: { id: true },
    });
    if (!doctor) {
      return NextResponse.json({ success: false, message: 'Doctor not found for slug' }, { status: 404 });
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
