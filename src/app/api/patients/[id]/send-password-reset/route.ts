import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { getDoctorSlugByDoctorId, getClinicBrandingByDoctorId } from '@/lib/tenant-slug';
import { createResetPasswordEmail } from '@/email-templates/auth/reset-password';
import { createSetPasswordEmail } from '@/email-templates/auth/set-password';

// SMTP transporter configuration (Pulse)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false, // true for port 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  },
  tls: {
    rejectUnauthorized: false // For local development
  }
});

// Helper to send email depending on whether it's first invite or reset
async function sendPatientAccessEmail({
  email,
  resetUrl,
  clinicName,
  clinicLogo,
  doctorName,
  isFirstInvite,
}: { email: string; resetUrl: string; clinicName: string; clinicLogo?: string | null; doctorName?: string | null; isFirstInvite: boolean; }) {
  const html = isFirstInvite
    ? createSetPasswordEmail({
        name: '',
        email,
        resetUrl,
        doctorName: doctorName || undefined,
        clinicName,
        clinicLogo: clinicLogo || undefined,
        isExistingClient: false,
        expiryHours: 24,
      })
    : createResetPasswordEmail({
        name: '',
        resetUrl,
        expiryHours: 1,
        clinicName,
        clinicLogo: clinicLogo || undefined,
        doctorName: doctorName || undefined,
      });

  const subject = isFirstInvite
    ? `[${clinicName}] Welcome — set your password`
    : `[${clinicName}] Password reset instructions`;

  const info = await transporter.sendMail({
    from: { name: clinicName, address: process.env.SMTP_FROM as string },
    to: email,
    subject,
    html,
  });
  console.log('Email sent via SMTP Pulse:', info.messageId);
  return true;
}

// Usando a nova sintaxe do Next.js para rotas dinâmicas
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the doctor's ID from the session user's email
    const doctor = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true }
    });

    if (!doctor || doctor.role !== 'DOCTOR') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Safely obtain the patient ID (await params per Next.js requirement)
    const { id: patientId } = await params;

    // Check if doctor has access to this patient
    const relationship = await prisma.doctorPatientRelationship.findFirst({
      where: {
        doctorId: doctor.id,
        patientId: patientId,
        isActive: true
      },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    if (!relationship || !relationship.patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    const patient = relationship.patient;

    // Generate secure token and persist (hash + expiry)
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    await prisma.user.update({
      where: { id: patient.id },
      data: {
        reset_token: hashedToken,
        reset_token_expiry: new Date(Date.now() + 3600000), // 1 hour
      },
    });

    // Resolve base URL, doctor slug and branding
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const doctorSlug = await getDoctorSlugByDoctorId(doctor.id);
    const branding = await getClinicBrandingByDoctorId(doctor.id);
    const resetUrl = doctorSlug
      ? `${baseUrl}/${doctorSlug}/set-password?token=${resetToken}`
      : `${baseUrl}/auth/set-password?token=${resetToken}`; // fallback

    // Determine if this is the first invite: treat users without password as first-time
    const patientAccount = await prisma.user.findUnique({ where: { id: patient.id }, select: { password: true, email_verified: true } });
    const isFirstInvite = !patientAccount?.password;

    console.log(`Sending ${isFirstInvite ? 'welcome invite' : 'password reset'} email to ${patient.email}`);

    const emailSent = await sendPatientAccessEmail({
      email: patient.email,
      resetUrl,
      clinicName: branding.clinicName,
      clinicLogo: branding.clinicLogo || undefined,
      doctorName: branding.doctorName || undefined,
      isFirstInvite,
    });
    
    console.log(`Email sent: ${emailSent}`);
    
    return NextResponse.json({
      message: isFirstInvite ? 'Invitation email sent successfully' : 'Password reset email sent successfully',
      resetUrl: resetUrl // For testing purposes
    });

  } catch (error) {
    console.error('Error sending password reset email:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 