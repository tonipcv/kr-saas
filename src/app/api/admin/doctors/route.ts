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

    // Fetch doctors
    const doctors = await prisma.user.findMany({
      where: { role: 'DOCTOR' },
      select: {
        id: true,
        name: true,
        email: true,
        created_at: true
      },
      orderBy: { created_at: 'desc' }
    });

    // Fetch subscriptions separately from unified_subscriptions
    const subscriptions = await prisma.unified_subscriptions.findMany({
      where: {
        type: 'DOCTOR',
        subscriber_id: { in: doctors.map(d => d.id) }
      },
      include: {
        subscription_plans: {
          select: {
            id: true,
            name: true,
            price: true,
            maxPatients: true,
            maxProtocols: true,
            maxCourses: true,
            maxProducts: true,
            trialDays: true,
          }
        }
      }
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

    // Combine data (normalize subscription shape for client rendering)
    const doctorsWithData = doctors.map(doctor => {
      const subscription = subscriptions.find(s => s.subscriber_id === doctor.id);
      const patientCount = patientCounts.find(p => p.doctorId === doctor.id)?.count || 0;

      const normalizedSubscription = subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            startDate: subscription.start_date?.toISOString?.() ?? null,
            endDate: subscription.end_date?.toISOString?.() ?? null,
            trialEndDate: subscription.trial_end_date?.toISOString?.() ?? null,
            plan: subscription.subscription_plans
              ? {
                  id: subscription.subscription_plans.id,
                  name: subscription.subscription_plans.name,
                  price: (subscription.subscription_plans.price as unknown as number) ?? 0,
                  maxPatients: subscription.subscription_plans.maxPatients ?? 0,
                  maxProtocols: subscription.subscription_plans.maxProtocols ?? 0,
                  maxCourses: subscription.subscription_plans.maxCourses ?? 0,
                  maxProducts: subscription.subscription_plans.maxProducts ?? 0,
                  trialDays: subscription.subscription_plans.trialDays ?? 0,
                }
              : null,
          }
        : {
            status: 'ACTIVE',
            startDate: doctor.created_at ? new Date(doctor.created_at as any).toISOString() : null,
            endDate: null,
            trialEndDate: null,
            plan: {
              name: 'Free',
              maxPatients: 50,
              maxProtocols: 10,
              maxCourses: 5,
              maxProducts: 100,
            },
          };

      return {
        ...doctor,
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
    let defaultPlan = await prisma.subscriptionPlan.findFirst({
      where: { name: { equals: 'Free', mode: 'insensitive' } }
    });

    if (!defaultPlan) {
      defaultPlan = await prisma.subscriptionPlan.create({
        data: {
          name: 'Free',
          description: 'Plano gratuito padrão para novos médicos (criado automaticamente)',
          price: 0,
          billingCycle: 'MONTHLY',
          maxDoctors: 1,
          features: 'Auto-created by POST /api/admin/doctors',
          isActive: true,
          maxPatients: 50,
          maxProtocols: 10,
          maxCourses: 5,
          maxProducts: 100,
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
        email_verified: null, // Será verificado quando definir a senha
        reset_token: hashedToken, // Usar o campo resetToken para o convite
        reset_token_expiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 dias para aceitar o convite
      }
    });

    // Criar subscription baseada na seleção (padrão TRIAL)
    const now = new Date();
    const subscriptionData: any = {
      id: crypto.randomUUID(),
      subscriber_id: doctor.id,
      type: 'DOCTOR',
      plan_id: defaultPlan.id,
      status: subscriptionType,
      start_date: now,
      auto_renew: true,
    };

    if (subscriptionType === 'TRIAL') {
      const trialDays = defaultPlan.trialDays || 7; // Default to 7 days if null
      subscriptionData.trial_end_date = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
    } else {
      // ACTIVE Free plan should be non-expiring
      subscriptionData.end_date = null;
    }
    
    await prisma.unified_subscriptions.create({
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
      // Se o email falhar, deletar o médico criado
      await prisma.unified_subscriptions.deleteMany({
        where: { subscriber_id: doctor.id, type: 'DOCTOR' }
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
        email: doctor.email
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