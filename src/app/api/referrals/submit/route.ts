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
import { emitEvent } from '@/lib/events';
import { EventActor, EventType } from '@prisma/client';



export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, phone, doctorId, referrerCode } = body;
    const clinicSlugFromBody: string | undefined = (body.clinic_slug || body.clinicSlug || '').trim() || undefined;
    const rawCustomFields = typeof body.customFields === 'object' && body.customFields ? body.customFields : undefined;
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
      // Permitir duplicados por telefone — porém, se for o MESMO produto, reutilizar o mesmo lead/código
      const productIdFromBody = rawCustomFields?.productId ?? undefined;
      if (productIdFromBody != null) {
        const candidates = await prisma.referralLead.findMany({
          where: {
            phone,
            doctorId: resolvedDoctorId as string,
            status: { in: ['PENDING', 'CONTACTED'] },
          },
          orderBy: { createdAt: 'desc' },
        });
        const sameProduct = candidates.find((l: any) => l?.customFields?.productId === productIdFromBody);
        if (sameProduct) {
          // Merge minimal fields and keep referralCode (coupon)
          const existingCustom = (sameProduct as any).customFields || {};
          const campaign = (rawCustomFields as any)?.campaign || undefined;
          const mergedCustom = {
            ...existingCustom,
            ...(rawCustomFields || {}),
            coupon: {
              ...(existingCustom?.coupon || {}),
              code: sameProduct.referralCode,
              amount: (rawCustomFields as any)?.offer?.amount ?? (rawCustomFields as any)?.productPrice ?? (existingCustom?.coupon?.amount ?? null),
              campaignCoupon: campaign?.coupon ?? (existingCustom?.coupon?.campaignCoupon ?? null),
              discountPercent: typeof campaign?.discountPercent === 'number' ? campaign.discountPercent : (existingCustom?.coupon?.discountPercent ?? null),
            },
            // Expose coupon name as campaign slug for reporting screens
            ...(campaign?.coupon ? { campaignSlug: campaign.coupon } : {}),
          } as any;

          const emailForUpdate = email || sameProduct.email || `lead+${sameProduct.referralCode}@noemail.local`;
          await prisma.referralLead.update({
            where: { id: sameProduct.id },
            data: {
              name: name ?? sameProduct.name,
              email: emailForUpdate,
              phone: phone || sameProduct.phone,
              // keep status as is; update customFields and referrerId if provided
              referrerId: referrerCode ? (await getUserByReferralCode(referrerCode))?.id ?? sameProduct.referrerId : sameProduct.referrerId,
              customFields: mergedCustom,
            },
          });

          return NextResponse.json({
            success: true,
            message: 'Referral updated successfully',
            referralCode: sameProduct.referralCode,
            reused: true,
          });
        }
      }

      // Caso não seja o mesmo produto, apenas logar e permitir criar um novo lead
      existingLead = await prisma.referralLead.findFirst({
        where: {
          phone,
          doctorId: resolvedDoctorId as string,
          status: { in: ['PENDING', 'CONTACTED'] },
        },
        select: { id: true, status: true },
      });
      if (existingLead) {
        console.info('[referrals/submit] Proceeding despite existing lead with same phone (different product or not provided)', {
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

    // Resolve clinicId BEFORE creating the lead (doctor context): prefer clinic_slug, fallback to owner/membership
    let resolvedClinicId: string | null = null;
    if (clinicSlugFromBody) {
      try {
        const clinic = await prisma.clinic.findFirst({
          where: { OR: [{ slug: clinicSlugFromBody }, { subdomain: clinicSlugFromBody }] },
          select: { id: true },
        });
        if (clinic?.id) resolvedClinicId = clinic.id;
      } catch {}
    }
    if (!resolvedClinicId) {
      try {
        const owned = await prisma.clinic.findFirst({ where: { ownerId: resolvedDoctorId as string }, select: { id: true } });
        if (owned?.id) resolvedClinicId = owned.id;
      } catch {}
    }
    if (!resolvedClinicId) {
      try {
        const membership = await prisma.clinicMember.findFirst({ where: { userId: resolvedDoctorId as string, isActive: true }, select: { clinicId: true } });
        if (membership?.clinicId) resolvedClinicId = membership.clinicId;
      } catch {}
    }

    // Criar a indicação
    // Merge provided custom fields with auditing info
    const providedCustom = rawCustomFields;
    const mergedCustomFields = {
      ...(providedCustom || {}),
      ...(referrerCode ? { referrerCodeProvided: referrerCode } : {}),
    } as any;

    // Persist a unique coupon object tied to this lead using the generated referralCode
    // Keep backward compatibility: UI expects customFields.coupon.code and optional amount
    // If campaign exists in provided custom fields, carry its info alongside
    const campaign = (providedCustom as any)?.campaign || undefined;
    (mergedCustomFields as any).coupon = {
      code: undefined as any, // set below once code is generated
      amount: (providedCustom as any)?.offer?.amount ?? (providedCustom as any)?.productPrice ?? null,
      campaignCoupon: campaign?.coupon ?? null,
      discountPercent: typeof campaign?.discountPercent === 'number' ? campaign.discountPercent : null,
    };
    // Also expose the coupon as a top-level campaignSlug so /doctor/referrals can show it as campaign name
    if (campaign?.coupon && !(mergedCustomFields as any).campaignSlug) {
      (mergedCustomFields as any).campaignSlug = campaign.coupon;
    }

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
        clinicId: resolvedClinicId,
        referrerId: referrer?.id || null,
        source: 'referral_form',
        // Persist provided referrerCode and any product context for auditing and UI
        customFields: Object.keys(mergedCustomFields).length
          ? {
              ...mergedCustomFields,
              // finalize coupon code with the generated leadReferralCode for uniqueness
              coupon: {
                ...(mergedCustomFields as any).coupon,
                code: leadReferralCode,
              },
            }
          : { coupon: { code: leadReferralCode, amount: null } },
      }
    });

    console.info('[referrals/submit] Lead created', {
      leadId: referralLead.id,
      doctorId: referralLead.doctorId,
      hasReferrer: !!referralLead.referrerId,
      referrerId: referralLead.referrerId || null,
      createdAt: referralLead.createdAt,
    });

    // Fire analytics (non-blocking)
    try {
      const clinicId = resolvedClinicId;
      if (clinicId) {
        const ua = request.headers.get('user-agent') || undefined;
        const campaignId = (rawCustomFields as any)?.campaign?.id || undefined;
        const couponKey = (rawCustomFields as any)?.campaign?.coupon || undefined;
        const discountPercent = typeof (rawCustomFields as any)?.campaign?.discountPercent === 'number'
          ? (rawCustomFields as any)?.campaign?.discountPercent
          : undefined;
        const price = typeof (rawCustomFields as any)?.offer?.amount === 'number'
          ? (rawCustomFields as any)?.offer?.amount
          : undefined;
        const metadata: Record<string, any> = {
          source: 'referral',
          device: ua,
          // Lead info
          name: (name || undefined),
          email: (email || undefined),
          phone: (phone || undefined),
          // Referral context
          referrer_code: (referrerCode || undefined),
          referrer_id: (referrer as any)?.id || undefined,
          referrer_name: ((referrer as any)?.name as string | null) || undefined,
          referrer_email: ((referrer as any)?.email as string | null) || undefined,
          referral_code: String(referralLead.referralCode || ''),
          // Doctor/clinic context
          doctor_id: resolvedDoctorId || undefined,
          doctor_slug: doctorSlug || undefined,
          clinic_slug: clinicSlugFromBody || undefined,
          // Product context
          product_id: (rawCustomFields as any)?.productId ?? undefined,
          product_name: (rawCustomFields as any)?.productName ?? undefined,
          product_category: (rawCustomFields as any)?.productCategory ?? undefined,
          price,
          coupon: couponKey,
          discount_percent: discountPercent,
        };
        if (typeof campaignId === 'string' && campaignId.trim()) {
          metadata.campaign_id = campaignId.trim();
        }
        await emitEvent({
          eventType: EventType.lead_created,
          actor: EventActor.system,
          clinicId,
          customerId: ((referrer as any)?.id as string | undefined) ?? null,
          metadata,
        });
      }
    } catch (e) {
      console.error('[events] lead_created emit failed', e);
    }

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