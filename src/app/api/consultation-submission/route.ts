import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import nodemailer from 'nodemailer';
import { createConsultationRequestEmail } from '@/email-templates/notifications/consultation-request';
import { createConsultationConfirmationEmail } from '@/email-templates/patient/consultation-confirmation';

// Configurar transporter de email
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});

// POST /api/consultation-submission - Enviar formulário de consulta
export async function POST(request: Request) {
  try {
    const data = await request.json();
    const { 
      formId, 
      doctorId, 
      name, 
      email, 
      whatsapp, 
      age, 
      specialty, 
      message, 
      referralCode 
    } = data;

    // Validar dados obrigatórios
    if (!formId || !doctorId || !name || !email || !whatsapp) {
      return NextResponse.json({ error: 'Dados obrigatórios não preenchidos' }, { status: 400 });
    }

    // Verificar se o formulário existe e está ativo
    const form = await prisma.consultationForm.findUnique({
      where: { 
        id: formId,
        doctorId,
        isActive: true
      },
      include: {
        doctor: {
          include: {
            clinicMemberships: {
              where: { isActive: true },
              include: {
                clinic: {
                  select: {
                    name: true,
                    logo: true
                  }
                }
              },
              take: 1
            }
          }
        }
      }
    });

    if (!form) {
      return NextResponse.json({ error: 'Formulário não encontrado ou inativo' }, { status: 404 });
    }

    // Verificar código de indicação se fornecido
    let referrer = null;
    if (referralCode) {
      referrer = await prisma.user.findUnique({
        where: { referral_code: referralCode }
      });
    }

    // Obter IP e User Agent
    const forwarded = request.headers.get('x-forwarded-for');
    const ipAddress = forwarded ? forwarded.split(',')[0] : request.headers.get('x-real-ip') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Criar submissão
    const submission = await prisma.consultationSubmission.create({
      data: {
        formId,
        doctorId,
        submissionData: {
          name,
          email,
          whatsapp,
          age: age || undefined,
          specialty: specialty || undefined,
          message: message || undefined,
          referralCode: referralCode || undefined,
          ipAddress,
          userAgent
        },
        status: 'NEW'
      }
    });

    const clinicName = form.doctor.clinicMemberships?.[0]?.clinic?.name || form.doctor.name || 'CXLUS';
    const clinicLogo = form.doctor.clinicMemberships?.[0]?.clinic?.logo || undefined;
    const doctorName = form.doctor.name || '';

    // Enviar email para o médico
    try {
      const doctorEmailHtml = createConsultationRequestEmail({
        patientName: name,
        patientEmail: email,
        patientPhone: whatsapp,
        patientAge: age?.toString() || undefined,
        specialty: specialty || undefined,
        message: message || undefined,
        referrerName: referrer?.name || undefined,
        referralCode: referralCode || undefined,
        clinicName,
        clinicLogo,
        doctorName
      });

      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: form.doctor.email!,
        subject: `[Cxlus] New Consultation Request - ${name}`,
        html: doctorEmailHtml
      });
    } catch (emailError) {
      console.error('Erro ao enviar email para o médico:', emailError);
    }

    // Enviar resposta automática se configurada
    if (form.thankYouMessage) {
      try {
        const patientEmailHtml = createConsultationConfirmationEmail({
          patientName: name,
          doctorName,
          specialty: specialty || undefined,
          whatsapp,
          message: form.thankYouMessage,
          clinicName,
          clinicLogo
        });

        await transporter.sendMail({
          from: process.env.SMTP_USER,
          to: email,
          subject: `[Cxlus] Consultation Request Confirmation - ${form.doctor.name}`,
          html: patientEmailHtml
        });
      } catch (emailError) {
        console.error('Erro ao enviar resposta automática:', emailError);
      }
    }

    // Se há código de indicação válido, criar crédito para o indicador
    if (referrer) {
      try {
        await prisma.referralCredit.create({
          data: {
            userId: referrer.id,
            amount: 1,
            type: 'CONSULTATION_REFERRAL'
          }
        });
      } catch (creditError) {
        console.error('Erro ao criar crédito de indicação:', creditError);
      }
    }

    return NextResponse.json({ 
      success: true, 
      submissionId: submission.id,
      message: 'Formulário enviado com sucesso!'
    });

  } catch (error) {
    console.error('Erro ao processar submissão:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
} 