import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ensureUserHasReferralCode } from '@/lib/referral-utils';
import { verifyMobileAuth } from '@/lib/mobile-auth';

// GET /api/v2/patients/referral
// Returns the doctor linked to the authenticated patient and the patient's referral code.
export async function GET(request: NextRequest) {
  try {
    // Prefer web session, fallback to mobile auth
    const session = await getServerSession(authOptions);
    let userId = session?.user?.id || null;

    if (!userId) {
      const mobileUser = await verifyMobileAuth(request).catch(() => null);
      if (mobileUser) userId = mobileUser.id;
    }

    if (!userId) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    console.debug('[patients/referral] START', {
      hasSession: Boolean(session),
      sessionUserId: session?.user?.id || null,
      sessionRole: session?.user?.role || null,
    });

    // Load patient user with relationships and potential doctor info
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        // Bring a few relationships to decide priority on the app side (when the user is PATIENT)
        patient_relationships: {
          include: {
            doctor: { select: { id: true, name: true, email: true, image: true, doctor_slug: true } }
          },
          orderBy: { createdAt: 'desc' },
          take: 5
        },
      }
    });

    if (!user) {
      return NextResponse.json({ success: false, message: 'Forbidden: only patients' }, { status: 403 });
    }

    // Determine if this user can act as a patient in the current context
    let asPatient = user.role === 'PATIENT';
    let rels = ((user as any)?.patient_relationships as any[]) || [];

    // If not a PATIENT by role, see if this user has any doctor-patient relationship as a patient
    if (!asPatient) {
      const rel = await prisma.doctorPatientRelationship.findFirst({
        where: { patientId: userId },
        include: { doctor: { select: { id: true, name: true, email: true, image: true, doctor_slug: true } } },
        orderBy: { createdAt: 'desc' },
      });
      if (rel) {
        asPatient = true;
        rels = [rel as any];
      }
    }

    if (!asPatient) {
      return NextResponse.json({ success: false, message: 'Forbidden: only patients' }, { status: 403 });
    }

    // Resolve doctor in the following priority:
    // 1) user.doctor_id if present
    // 2) primary + active relationship
    // 3) any active relationship
    // 4) any relationship
    let doctor: { id: string; name: string | null; email: string | null; image: string | null; doctor_slug?: string | null } | null = null;

    if ((user as any)?.doctor_id) {
      console.debug('[patients/referral] user.doctor_id present, will try direct fetch');
      const doc = await prisma.user.findUnique({
        where: { id: (user as any).doctor_id as string },
        select: { id: true, name: true, email: true, image: true, doctor_slug: true }
      });
      if (doc) doctor = doc;
    }

    // rels already computed above
    console.debug('[patients/referral] relationships summary', {
      count: rels.length,
      sample: rels.slice(0, 5).map((r: any) => ({
        isPrimary: r?.isPrimary ?? null,
        isActive: r?.isActive ?? null,
        doctorId: r?.doctor?.id ?? null,
        doctorSlug: r?.doctor?.doctor_slug ?? null,
      })),
    });
    if (!doctor && rels.length) {
      const primaryActive = rels.find((r: any) => r?.isPrimary === true && r?.isActive === true && r?.doctor);
      const active = rels.find((r: any) => r?.isActive === true && r?.doctor);
      const anyRel = rels.find((r: any) => r?.doctor);
      const chosen = primaryActive || active || anyRel || null;
      console.debug('[patients/referral] chosen relationship rule', {
        rule: primaryActive ? 'primary+active' : active ? 'active' : anyRel ? 'any' : 'none',
        chosenDoctorId: chosen?.doctor?.id ?? null,
        chosenDoctorSlug: chosen?.doctor?.doctor_slug ?? null,
      });
      if (chosen?.doctor) {
        doctor = {
          id: chosen.doctor.id,
          name: chosen.doctor.name,
          email: chosen.doctor.email,
          image: chosen.doctor.image,
          doctor_slug: chosen.doctor.doctor_slug,
        };
      }
    }

    // Ensure referral code
    let referralCode: string | null = null;
    try {
      referralCode = await ensureUserHasReferralCode(userId);
    } catch (e) {
      referralCode = (user as any)?.referral_code || null;
    }

    if (!doctor) {
      console.warn('[patients/referral] No doctor resolved for user', { userId });
    } else {
      console.debug('[patients/referral] Resolved doctor for user', { userId, doctorId: doctor.id, doctorSlug: (doctor as any)?.doctor_slug });
    }

    return NextResponse.json({
      success: true,
      data: {
        doctor,
        doctorId: doctor?.id || null,
        doctorName: doctor?.name || null,
        doctorSlug: (doctor as any)?.doctor_slug || null,
        referralCode
      }
    });
  } catch (error) {
    console.error('[patients/referral] error', error instanceof Error ? error.message : String(error ?? 'Unknown error'));
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
