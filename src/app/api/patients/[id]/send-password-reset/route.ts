import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import nodemailer from 'nodemailer';

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

// Helper to send password reset email
async function sendPasswordResetEmail(email: string, token: string) {
  try {
    const resetUrl = `${process.env.NEXTAUTH_URL}/auth/set-password?token=${token}`;
    
    const mailOptions = {
      from: `"Zuzz" <${process.env.SMTP_FROM}>`,
      to: email,
      subject: 'Password Reset',
      html: `
        <p>You requested a password reset for your Zuzz account.</p>
        <p>Click the link below to set a new password:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>If you did not request this reset, please ignore this email.</p>
      `
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent via SMTP Pulse:', info.messageId);
    return true;
    
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}

// Usando a nova sintaxe do Next.js para rotas dinâmicas
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
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

    // Safely obtain the patient ID
    const patientId = params.id;

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

    // For now, just return a success message
    // TODO: Implement actual email sending functionality
    // Generate a simple token for password reset
    const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    
    // In a real implementation, you would persist this token with an expiration
    
    const resetUrl = `${process.env.NEXTAUTH_URL}/auth/set-password?token=${token}`;
    
    console.log(`Sending password reset email to ${patient.email}`);
    
    const emailSent = await sendPasswordResetEmail(
      patient.email,
      token
    );
    
    console.log(`Email sent: ${emailSent}`);
    
    return NextResponse.json({
      message: 'Password reset email sent successfully',
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