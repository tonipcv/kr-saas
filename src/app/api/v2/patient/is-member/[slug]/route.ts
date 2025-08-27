import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/v2/patient/is-member/[slug]
// Returns { success: boolean, isMember: boolean } for the currently logged-in user against the doctor for the slug
export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { slug } = params;
    if (!slug) {
      return NextResponse.json({ success: false, message: 'Missing slug' }, { status: 400 });
    }

    // Resolve doctor by slug
    const doctor = await prisma.user.findFirst({
      where: {
        doctor_slug: slug,
        role: 'DOCTOR',
        is_active: true,
      },
      select: { id: true },
    });

    if (!doctor) {
      return NextResponse.json({ success: false, message: 'Doctor not found for slug' }, { status: 404 });
    }

    const userId = session.user.id;

    // Direct association: patient's doctor_id equals this doctor
    const patient = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, doctor_id: true },
    });

    if (!patient) {
      return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
    }

    if (patient.role !== 'PATIENT') {
      // Non-patients are not considered members; return false but success true
      return NextResponse.json({ success: true, isMember: false });
    }

    if (patient.doctor_id === doctor.id) {
      return NextResponse.json({ success: true, isMember: true });
    }

    // Relationship table check
    const relationship = await prisma.doctorPatientRelationship.findFirst({
      where: {
        doctorId: doctor.id,
        patientId: userId,
      },
      select: { id: true },
    });

    return NextResponse.json({ success: true, isMember: Boolean(relationship) });
  } catch (error) {
    console.error('is-member error', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
