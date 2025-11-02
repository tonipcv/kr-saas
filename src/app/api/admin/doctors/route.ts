import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { createDoctorInvitationEmail } from '@/email-templates/doctor/invitation';

// Configuração do transporter de email
if (!process.env.SMTP_HOST || !process.env.SMTP_PORT || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD || !process.env.SMTP_FROM) {
  throw new Error('Missing SMTP configuration environment variables');
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: 465,
  secure: true, // use SSL
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is super admin
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { role: true }
    });

    if (user?.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Fetch doctors with their clinics and subscriptions
    const doctors = await prisma.user.findMany({
      where: { role: 'DOCTOR' },
      select: {
        id: true,
        name: true,
        email: true,
        created_at: true,
        clinic_memberships: {
          where: { isActive: true },
          select: {
            role: true,
            clinic: {
              select: {
                id: true,
                name: true,
                subscriptions: {
                  where: {
                    status: { in: ['ACTIVE', 'TRIAL'] }
                  },
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                  include: {
                    plan: {
                      select: {
                        id: true,
                        name: true,
                        monthlyPrice: true,
                        baseDoctors: true,
                        basePatients: true,
                        tier: true,
                        trialDays: true
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      orderBy: { created_at: 'desc' }
    });

    // Fetch patient counts per doctor (using doctor_id field)
    const patientCounts = await Promise.all(
      doctors.map(async (doctor) => ({
        doctorId: doctor.id,
        count: await prisma.user.count({
          where: { 
            role: 'PATIENT',
            doctor_id: doctor.id
          }
        })
      }))
    );

    // Combine data
    const doctorsWithData = doctors.map(doctor => {
      const patientCount = patientCounts.find(p => p.doctorId === doctor.id)?.count || 0;
      const activeClinic = (doctor as any).clinic_memberships?.[0]?.clinic; // Pegar a primeira clínica ativa
      const subscription = activeClinic?.subscriptions[0]; // Pegar a subscrição mais recente

      const normalizedSubscription = subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            startDate: subscription.startDate.toISOString(),
            endDate: subscription.currentPeriodEnd.toISOString(),
            trialEndDate: subscription.trialEndsAt?.toISOString() ?? null,
            plan: subscription.plan
              ? {
                  id: subscription.plan.id,
                  name: subscription.plan.name,
                  price: (subscription.plan as any).monthlyPrice ?? 0,
                  maxDoctors: (subscription.plan as any).baseDoctors ?? 0,
                  maxPatients: (subscription.plan as any).basePatients ?? 0,
                  tier: subscription.plan.tier,
                  trialDays: subscription.plan.trialDays ?? 0,
                }
              : null,
          }
        : {
            status: 'ACTIVE',
            startDate: (doctor as any).created_at.toISOString(),
            endDate: null,
            trialEndDate: null,
            plan: {
              name: 'Free',
              maxDoctors: 1,
              maxPatients: 200,
              tier: 'STARTER'
            },
          };

      return {
        id: doctor.id,
        name: doctor.name,
        email: doctor.email,
        createdAt: (doctor as any).created_at,
        clinic: activeClinic
          ? {
              id: activeClinic.id,
              name: activeClinic.name,
              role: (doctor as any).clinic_memberships?.[0]?.role
            }
          : null,
        subscription: normalizedSubscription,
        patientCount,
      };
    });

    return NextResponse.json({ 
      doctors: doctorsWithData
    });

  } catch (error) {
    console.error('Error fetching doctors:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verificar se é super admin
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { role: true }
    });

    if (user?.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body = await request.json();
    const { name, email, subscriptionType = 'ACTIVE' } = body;

    // Validações
    if (!name || !email) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
    }

    // Validar tipo de subscription (padrão é TRIAL)
    if (!['TRIAL', 'ACTIVE'].includes(subscriptionType)) {
      return NextResponse.json({ error: 'Invalid subscription type' }, { status: 400 });
    }

    // Verificar se o email já existe
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return NextResponse.json({ error: 'This email is already in use' }, { status: 400 });
    }

    // Buscar (ou criar) plano Free como padrão
    let defaultPlan = await prisma.clinicPlan.findFirst({
      where: { name: { equals: 'Free', mode: 'insensitive' } }
    });

    if (!defaultPlan) {
      defaultPlan = await prisma.clinicPlan.create({
        data: {
          name: 'Free',
          description: 'Plano gratuito padrão para novas clínicas (criado automaticamente)',
          price: 0,
          tier: 'STARTER',
          maxDoctors: 1,
          maxPatients: 200,
          features: 'Auto-created by POST /api/admin/doctors',
          isActive: true,
          isDefault: true,
          trialDays: 0,
        },
      });
    }

    // Gerar token para definir senha
    const inviteToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(inviteToken)
      .digest("hex");

    // Criar o médico sem senha (será definida via convite)
    const doctor = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name,
        email,
        role: 'DOCTOR',
        emailVerified: null, // Será verificado quando definir a senha
        resetToken: hashedToken, // Usar o campo resetToken para o convite
        resetTokenExpiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 dias para aceitar o convite
      }
    });

    // Criar clínica pessoal para o médico
    const clinic = await prisma.clinic.create({
      data: {
        id: crypto.randomUUID(),
        name: `${name} - Personal Clinic`,
        ownerId: doctor.id,
        isActive: true
      }
    });

    // Criar membro da clínica
    await prisma.clinicMember.create({
      data: {
        clinicId: clinic.id,
        userId: doctor.id,
        role: 'OWNER',
        isActive: true
      }
    });

    // Criar subscription baseada na seleção (padrão TRIAL)
    const now = new Date();
    const subscriptionData: any = {
      id: `cs_${crypto.randomUUID()}`,
      clinicId: clinic.id,
      planId: defaultPlan.id,
      status: subscriptionType,
      startDate: now,
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), // 30 dias
      currentDoctorsCount: 1,
      currentPatientsCount: 0
    };

    if (subscriptionType === 'TRIAL') {
      const trialDays = defaultPlan.trialDays || 7; // Default to 7 days if null
      subscriptionData.trialEndsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
    }
    
    await prisma.clinicSubscription.create({
      data: subscriptionData
    });

    // Enviar email de convite
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
                   process.env.NEXTAUTH_URL || 
                   'http://localhost:3000';
    
    const inviteUrl = `${baseUrl}/auth/set-password?token=${inviteToken}`;
    const trialDays = defaultPlan.trialDays || 7; // For email template

    try {
      await transporter.verify();
      console.log('SMTP connection verified');

      const emailHtml = createDoctorInvitationEmail({
        name,
        inviteUrl,
        subscriptionType,
        trialDays,
        clinicName: 'Zuzz'
      });

      await transporter.sendMail({
        from: {
          name: 'Zuzz',
          address: process.env.SMTP_FROM as string
        },
        to: email,
        subject: '[Zuzz] Convite - Configure sua senha',
        html: emailHtml
      });
      console.log('Invite email sent successfully to:', email);
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      // Se o email falhar, deletar tudo que foi criado
      await prisma.clinicSubscription.deleteMany({
        where: { clinicId: clinic.id }
      });
      await prisma.clinicMember.deleteMany({
        where: { clinicId: clinic.id }
      });
      await prisma.clinic.delete({
        where: { id: clinic.id }
      });
      await prisma.user.delete({
        where: { id: doctor.id }
      });
      throw new Error('Error sending invite email');
    }

    return NextResponse.json({ 
      success: true, 
      doctor: {
        id: doctor.id,
        name: doctor.name,
        email: doctor.email,
        clinic: {
          id: clinic.id,
          name: clinic.name
        }
      },
      message: 'Doctor created successfully and invite sent by email'
    });

  } catch (error) {
    console.error('Error creating doctor:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    }, { status: 500 });
  }
}