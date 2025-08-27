import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { 
  generateUniqueReferralCode, 
  isExistingPatient, 
  getUserByReferralCode,
  REFERRAL_STATUS,
  CREDIT_STATUS,
  CREDIT_TYPE
} from '@/lib/referral-utils';
import { sendReferralNotification } from '@/lib/referral-email-service';



export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, phone, doctorId, referrerCode } = body;
    // Accept slug as alternative to doctorId for backward compatibility
    const doctorSlug: string | undefined = body.doctor_slug || body.doctorSlug;

    let resolvedDoctorId: string | null = doctorId || null;

    // Basic validations: require at least one contact method (email or phone)
    if (!email && !phone) {
      return NextResponse.json(
        { error: 'Either email or phone is required' },
        { status: 400 }
      );
    }

    // Validate email format only if provided
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return NextResponse.json(
          { error: 'Invalid email address' },
          { status: 400 }
        );
      }
    }

    // Resolve doctor by ID or slug
    let doctor = null as null | { id: string } & any;
    if (resolvedDoctorId) {
      doctor = await prisma.user.findFirst({
        where: {
          id: resolvedDoctorId,
          role: 'DOCTOR',
        },
      });
    } else if (doctorSlug) {
      doctor = await prisma.user.findFirst({
        where: {
          doctor_slug: doctorSlug,
          role: 'DOCTOR',
        },
      });
      if (doctor) {
        resolvedDoctorId = doctor.id;
      }
    }

    if (!doctor) {
      return NextResponse.json(
        { error: 'Doctor not found' },
        { status: 404 }
      );
    }

    // Verificar se já é paciente existente (somente quando email for informado)
    if (email) {
      const isExisting = await isExistingPatient(email, resolvedDoctorId as string);
      if (isExisting) {
        console.info('[referrals/submit] Rejecting: email already patient of doctor', {
          email,
          doctorId: resolvedDoctorId,
        });
        return NextResponse.json(
          { error: 'This person is already a patient of this doctor' },
          { status: 400 }
        );
      }
    }

    // Verificar se já existe indicação pendente
    // Regra: se email foi informado, impedimos duplicado por email; se só phone foi informado, permitimos duplicados
    let existingLead = null as any;
    if (email) {
      existingLead = await prisma.referralLead.findFirst({
        where: {
          email,
          doctorId: resolvedDoctorId as string,
          status: { in: ['PENDING', 'CONTACTED'] },
        },
      });
      if (existingLead) {
        console.info('[referrals/submit] Rejecting: existing pending/contacted lead (email)', {
          email,
          doctorId: resolvedDoctorId,
          leadId: existingLead.id,
          leadStatus: existingLead.status,
        });
        return NextResponse.json(
          { error: 'There is already a pending referral for this email' },
          { status: 400 }
        );
      }
    } else if (phone) {
      // Permitir duplicados por telefone — apenas logar para auditoria
      existingLead = await prisma.referralLead.findFirst({
        where: {
          phone,
          doctorId: resolvedDoctorId as string,
          status: { in: ['PENDING', 'CONTACTED'] },
        },
        select: { id: true, status: true },
      });
      if (existingLead) {
        console.info('[referrals/submit] Proceeding despite existing lead with same phone', {
          phone,
          doctorId: resolvedDoctorId,
          leadId: existingLead.id,
          leadStatus: existingLead.status,
        });
      }
    }

    // Buscar quem está indicando (se fornecido)
    let referrer = null;
    if (referrerCode) {
      referrer = await getUserByReferralCode(referrerCode);

      // Detailed debug for referrer resolution
      console.info('[referrals/submit] Referrer resolution attempt', {
        doctorSlug: doctorSlug || null,
        providedDoctorId: doctorId || null,
        resolvedDoctorId,
        referrerCode,
        referrerFound: !!referrer,
        referrerId: (referrer as any)?.id || null,
        referrerDoctorId: (referrer as any)?.doctor_id || null,
      });
      
      if (!referrer) {
        console.warn('[referrals/submit] Rejecting: invalid referral code', { referrerCode });
        return NextResponse.json(
          { error: 'Invalid referral code' },
          { status: 400 }
        );
      }

      // Verificar se o referrer é paciente do mesmo médico
      let isReferrerPatientOfDoctor = (referrer as any).doctor_id === resolvedDoctorId;

      // Fallback: if user.doctor_id is empty, check via prescriptions
      if (!isReferrerPatientOfDoctor && !(referrer as any).doctor_id) {
        const linkViaPrescription = await prisma.protocolPrescription.findFirst({
          where: {
            user_id: (referrer as any).id,
            OR: [
              { prescribed_by: resolvedDoctorId as string },
              { protocol: { doctor_id: resolvedDoctorId as string } },
            ],
          },
          select: { id: true, protocol_id: true, prescribed_by: true },
        });
        isReferrerPatientOfDoctor = !!linkViaPrescription;
        console.info('[referrals/submit] Referrer fallback check via prescriptions', {
          referrerId: (referrer as any).id,
          resolvedDoctorId,
          linkedByPrescription: !!linkViaPrescription,
          prescriptionDoctor: linkViaPrescription?.prescribed_by || null,
        });

        // Second fallback: explicit doctor-patient relationship
        if (!isReferrerPatientOfDoctor) {
          const rel = await prisma.doctorPatientRelationship.findFirst({
            where: {
              patientId: (referrer as any).id,
              doctorId: resolvedDoctorId as string,
              isActive: true,
            },
            select: { id: true, isActive: true, isPrimary: true },
          });
          isReferrerPatientOfDoctor = !!rel;
          console.info('[referrals/submit] Referrer fallback check via relationships', {
            referrerId: (referrer as any).id,
            resolvedDoctorId,
            linkedByRelationship: !!rel,
          });
        }
      }

      if (!isReferrerPatientOfDoctor) {
        console.warn('[referrals/submit] Referrer doctor mismatch', {
          expectedDoctorId: resolvedDoctorId,
          referrerDoctorId: (referrer as any).doctor_id || null,
          referrerId: (referrer as any).id,
        });
        return NextResponse.json(
          { error: 'Referral code is not valid for this doctor' },
          { status: 400 }
        );
      }
    }

    // Generate unique code for this referral
    let leadReferralCode;
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 10) {
      leadReferralCode = generateUniqueReferralCode();
      
      const existing = await prisma.referralLead.findFirst({
        where: { referralCode: leadReferralCode }
      });
      
      if (!existing) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      return NextResponse.json(
        { error: 'Internal error: could not generate a unique code' },
        { status: 500 }
      );
    }

    // Criar a indicação
    // Merge provided custom fields with auditing info
    const providedCustom = typeof body.customFields === 'object' && body.customFields ? body.customFields : undefined;
    const mergedCustomFields = {
      ...(providedCustom || {}),
      ...(referrerCode ? { referrerCodeProvided: referrerCode } : {}),
    } as any;

    // Prisma schema requires email (non-null). If not provided, synthesize a unique placeholder to satisfy constraints.
    const emailToSave = email || `lead+${leadReferralCode}@noemail.local`;
    if (!email) {
      (mergedCustomFields as any).emailSynthesized = true;
    }

    const referralLead = await prisma.referralLead.create({
      data: {
        name,
        email: emailToSave,
        phone,
        referralCode: leadReferralCode!,
        status: REFERRAL_STATUS.PENDING,
        doctorId: resolvedDoctorId as string,
        referrerId: referrer?.id || null,
        source: 'referral_form',
        // Persist provided referrerCode and any product context for auditing and UI
        customFields: Object.keys(mergedCustomFields).length ? mergedCustomFields : undefined,
      }
    });

    console.info('[referrals/submit] Lead created', {
      leadId: referralLead.id,
      doctorId: referralLead.doctorId,
      hasReferrer: !!referralLead.referrerId,
      referrerId: referralLead.referrerId || null,
      createdAt: referralLead.createdAt,
    });

    // Send notifications
    sendReferralNotification(referralLead.id).catch(error => {
      console.error('Error sending referral notification:', error instanceof Error ? error.message : 'Unknown error');
    });

    return NextResponse.json({
      success: true,
      message: 'Referral submitted successfully!',
      referralCode: leadReferralCode,
      hasReferrer: !!referrer
    });

  } catch (error) {
    console.error('Error processing referral:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 