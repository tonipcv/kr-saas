import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMobileAuth, unauthorizedResponse } from '@/lib/mobile-auth';
import { z } from 'zod';
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

const createReferralSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  phone: z.string().nullable(),
  notes: z.string().nullable()
});

// GET /api/mobile/referrals - List user referrals
export async function GET(request: NextRequest) {
  try {
    const user = await requireMobileAuth(request);
    if (!user) {
      return unauthorizedResponse();
    }

    // Fetch user's referrals
    const referrals = await prisma.referralLead.findMany({
      where: {
        referrerId: user.id
      },
      orderBy: {
        createdAt: 'desc'
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        createdAt: true,
        convertedAt: true,
        creditAwarded: true,
        creditValue: true
      }
    });

    return NextResponse.json({
      success: true,
      referrals,
      total: referrals.length
    });
  } catch (error) {
    console.error('Error in GET /api/mobile/referrals:', error);
    
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorizedResponse();
    }
    
    return NextResponse.json(
      { error: 'Error fetching referrals' },
      { status: 500 }
    );
  }
}

// POST /api/mobile/referrals - Create new referral
export async function POST(request: NextRequest) {
  try {
    const user = await requireMobileAuth(request);
    if (!user) {
      return unauthorizedResponse();
    }

    // Verify user is a patient
    const userDetails = await prisma.user.findUnique({
      where: { id: user.id },
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

    if (!userDetails || userDetails.role !== 'PATIENT') {
      return NextResponse.json(
        { error: 'Access denied. Only patients can create referrals.' },
        { status: 403 }
      );
    }

    if (!userDetails.doctorId) {
      return NextResponse.json(
        { error: 'You need to be linked to a doctor to create referrals.' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { name, email, phone, notes } = createReferralSchema.parse(body);

    // Check if the email already exists as a user
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'This person already has an account in the system' },
        { status: 400 }
      );
    }

    // Check if there is already a pending referral for this email
    const existingReferral = await prisma.referralLead.findFirst({
      where: {
        email,
        status: { in: ['PENDING', 'CONTACTED'] }
      }
    });

    if (existingReferral) {
      return NextResponse.json(
        { error: 'There is already a pending referral for this email' },
        { status: 400 }
      );
    }

    // Fetch doctor and clinic information
    const doctor = await prisma.user.findUnique({
      where: { id: userDetails.doctorId },
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
      return NextResponse.json(
        { error: 'Doctor not found' },
        { status: 404 }
      );
    }

    // Create referral
    const referral = await prisma.referralLead.create({
      data: {
        name,
        email,
        phone: phone || undefined,
        notes: notes || undefined,
        referrerId: user.id,
        doctorId: userDetails.doctorId,
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
        referrerName: userDetails.name || '',
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
        name: userDetails.name || '',
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
        to: userDetails.email,
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

  } catch (error: any) {
    console.error('Error in POST /api/mobile/referrals:', error);
    
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorizedResponse();
    }

    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid data', details: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: 'Error creating referral' },
      { status: 500 }
    );
  }
} 