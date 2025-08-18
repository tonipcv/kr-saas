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

    // Validações básicas
    if (!name || !email) {
      return NextResponse.json(
        { error: 'Nome e email são obrigatórios' },
        { status: 400 }
      );
    }

    // Validar formato do email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Email inválido' },
        { status: 400 }
      );
    }

    // Resolver médico por ID ou por slug
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
        { error: 'Médico não encontrado' },
        { status: 404 }
      );
    }

    // Verificar se já é paciente existente
    const isExisting = await isExistingPatient(email, resolvedDoctorId as string);
    if (isExisting) {
      console.info('[referrals/submit] Rejecting: email already patient of doctor', {
        email,
        doctorId: resolvedDoctorId,
      });
      return NextResponse.json(
        { error: 'Esta pessoa já é paciente deste médico' },
        { status: 400 }
      );
    }

    // Verificar se já existe indicação pendente
    const existingLead = await prisma.referralLead.findFirst({
      where: {
        email,
        doctorId: resolvedDoctorId as string,
        status: { in: ['PENDING', 'CONTACTED'] }
      }
    });

    if (existingLead) {
      console.info('[referrals/submit] Rejecting: existing pending/contacted lead', {
        email,
        doctorId: resolvedDoctorId,
        leadId: existingLead.id,
        leadStatus: existingLead.status,
      });
      return NextResponse.json(
        { error: 'Já existe uma indicação pendente para este email' },
        { status: 400 }
      );
    }

    // Buscar quem está indicando (se fornecido)
    let referrer = null;
    if (referrerCode) {
      referrer = await getUserByReferralCode(referrerCode);

      // Debug detalhado da resolução do referrer
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
          { error: 'Código de indicação inválido' },
          { status: 400 }
        );
      }

      // Verificar se o referrer é paciente do mesmo médico
      let isReferrerPatientOfDoctor = (referrer as any).doctor_id === resolvedDoctorId;

      // Fallback: se user.doctor_id estiver vazio, verificar via prescrições
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
          { error: 'Código de indicação não válido para este médico' },
          { status: 400 }
        );
      }
    }

    // Gerar código único para esta indicação
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
        { error: 'Erro interno: não foi possível gerar código único' },
        { status: 500 }
      );
    }

    // Criar a indicação
    const referralLead = await prisma.referralLead.create({
      data: {
        name,
        email,
        phone,
        referralCode: leadReferralCode!,
        status: REFERRAL_STATUS.PENDING,
        doctorId: resolvedDoctorId as string,
        referrerId: referrer?.id || null,
        source: 'referral_form',
        // Persistir o referrerCode fornecido para auditoria e eventuais backfills
        customFields: referrerCode ? { referrerCodeProvided: referrerCode } : undefined,
      }
    });

    console.info('[referrals/submit] Lead created', {
      leadId: referralLead.id,
      doctorId: referralLead.doctorId,
      hasReferrer: !!referralLead.referrerId,
      referrerId: referralLead.referrerId || null,
      createdAt: referralLead.createdAt,
    });

    // Enviar notificações
    sendReferralNotification(referralLead.id).catch(error => {
      console.error('Erro ao enviar notificação de indicação:', error instanceof Error ? error.message : 'Erro desconhecido');
    });

    return NextResponse.json({
      success: true,
      message: 'Indicação enviada com sucesso!',
      referralCode: leadReferralCode,
      hasReferrer: !!referrer
    });

  } catch (error) {
    console.error('Erro ao processar indicação:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
} 