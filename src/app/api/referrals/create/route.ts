import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { verifyMobileAuth } from '@/lib/mobile-auth';
import { createReferralEmail } from '@/email-templates/notifications/referral';
import { createCreditEmail } from '@/email-templates/notifications/credit';
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '2525'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  },
  tls: {
    rejectUnauthorized: false
  }
});

// POST - Create new referral
export async function POST(request: NextRequest) {
  try {
    // Try web authentication first
    const session = await getServerSession(authOptions);
    let userId = session?.user?.id;

    // If no web session, try mobile auth
    if (!userId) {
      const mobileUser = await verifyMobileAuth(request);
      if (mobileUser) {
        userId = mobileUser.id;
      }
    }

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify if user is a patient
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { 
        role: true,
        doctorId: true,
        name: true,
        email: true,
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
    });

    if (!user || user.role !== 'PATIENT') {
      return NextResponse.json({ error: 'Access denied. Only patients can create referrals.' }, { status: 403 });
    }

    if (!user.doctorId) {
      return NextResponse.json({ error: 'You need to be linked to a doctor to create referrals.' }, { status: 400 });
    }

    const { name, email, phone, notes } = await request.json();

    // Validations
    if (!name || !email) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
    }

    // Check if email already exists as a user
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return NextResponse.json({ error: 'This person already has an account in the system' }, { status: 400 });
    }

    // Check if there is already a pending referral for this email
    const existingReferral = await prisma.referralLead.findFirst({
      where: {
        email,
        status: { in: ['PENDING', 'CONTACTED'] }
      }
    });

    if (existingReferral) {
      return NextResponse.json({ error: 'There is already a pending referral for this email' }, { status: 400 });
    }

    // Buscar informações do médico e clínica
    const doctor = await prisma.user.findUnique({
      where: { id: user.doctorId },
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
    });

    if (!doctor) {
      return NextResponse.json({ error: 'Doctor not found' }, { status: 404 });
    }

    // Create referral
    const referral = await prisma.referralLead.create({
      data: {
        name,
        email,
        phone: phone || undefined,
        notes: notes || undefined,
        referrerId: userId,
        doctorId: user.doctorId,
        status: 'PENDING',
        source: 'PATIENT_REFERRAL'
      }
    });

    const clinicName = doctor.clinicMemberships?.[0]?.clinic?.name || doctor.name || 'CXLUS';
    const clinicLogo = doctor.clinicMemberships?.[0]?.clinic?.logo || undefined;

    // Send email notification
    try {
      const emailHtml = createReferralEmail({
        referralName: name,
        referrerName: user.name || '',
        doctorName: doctor.name || '',
        clinicName,
        clinicLogo,
        notes: notes || undefined
      });

      await transporter.sendMail({
        from: {
          name: clinicName,
          address: process.env.SMTP_FROM as string
        },
        to: doctor.email,
        subject: `[Cxlus] New Referral - ${name}`,
        html: emailHtml
      });

      // Send credit email to the referring patient
      const creditEmailHtml = createCreditEmail({
        name: user.name || '',
        amount: 1,
        type: 'CONSULTATION_REFERRAL',
        clinicName,
        clinicLogo
      });

      await transporter.sendMail({
        from: {
          name: clinicName,
          address: process.env.SMTP_FROM as string
        },
        to: user.email,
        subject: '[Cxlus] New Referral Credit',
        html: creditEmailHtml
      });

    } catch (emailError) {
      console.error('Error sending referral notification:', emailError);
      // Do not fail referral creation because of email
    }

    return NextResponse.json({
      success: true,
      referral: {
        id: referral.id,
        name: referral.name,
        email: referral.email,
        phone: referral.phone,
        status: referral.status,
        createdAt: referral.createdAt
      },
      message: 'Referral created successfully! The doctor will be notified.'
    });

  } catch (error) {
    console.error('Error creating referral:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
 