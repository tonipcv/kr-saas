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

    // Load minimal user info (avoid selecting enum-like columns)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        doctor_id: true,
        referral_code: true,
      }
    });

    if (!user) {
      return NextResponse.json({ success: false, message: 'Forbidden: only patients' }, { status: 403 });
    }

    // Determine if this user can act as a patient in the current context
    let asPatient = user.role === 'PATIENT';
    // Use PatientProfile as the canonical patient->doctor linkage in this schema
    const profiles = await prisma.patientProfile.findMany({
      where: { userId: userId },
      include: {
        doctor: { select: { id: true, name: true, email: true, image: true, doctor_slug: true } }
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    });
    const rels = profiles as any[];
    if (profiles.length > 0) asPatient = true;

    if (!asPatient) {
      // Be tolerant in mixed-role contexts: return success with nulls
      return NextResponse.json({ success: true, data: { doctor: null, doctorId: null, doctorName: null, doctorSlug: null, referralCode: null } });
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
      // Prefer active profiles, else most recent
      const active = rels.find((r: any) => r?.isActive === true && r?.doctor);
      const anyRel = rels[0];
      const chosen = active || anyRel || null;
      console.debug('[patients/referral] chosen relationship rule', {
        rule: active ? 'active' : anyRel ? 'any' : 'none',
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
