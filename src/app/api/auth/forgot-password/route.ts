import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { createResetPasswordEmail } from "@/email-templates/auth/reset-password";
import { getDoctorBySlug, getClinicBrandingByDoctorId } from "@/lib/tenant-slug";

if (!process.env.SMTP_HOST || !process.env.SMTP_PORT || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD || !process.env.SMTP_FROM) {
  throw new Error('Missing SMTP configuration environment variables');
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  },
  tls: {
    rejectUnauthorized: false
  }
});

export async function POST(req: Request) {
  try {
    const { email, slug } = await req.json();

    if (!email) {
      return NextResponse.json(
        { message: "Email is required" },
        { status: 400 }
      );
    }

    console.log('Looking up user:', email, slug ? `(slug: ${slug})` : '');
    // Check if user exists (select only safe fields to avoid legacy enum conversions)
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        clinic_memberships: {
          where: { isActive: true },
          select: {
            clinic: {
              select: {
                name: true,
                logo: true,
                email: true,
              }
            }
          },
          take: 1,
        }
      }
    });

    if (!user) {
      console.log('User not found:', email);
      // Return success even if user doesn't exist for security
      return NextResponse.json(
        { message: "If an account exists, you will receive a password reset email" },
        { status: 200 }
      );
    }

    console.log('Generating reset token');
    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    console.log('Updating user with reset token');
    // Save reset token
    await prisma.user.update({
      where: { email },
      data: {
        reset_token: hashedToken,
        reset_token_expiry: new Date(Date.now() + 3600000), // 1 hour from now
      },
      select: { id: true },
    });

    // Get base URL from environment variables
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
                   process.env.NEXTAUTH_URL || 
                   'http://localhost:3000';
    
    let resetUrl = `${baseUrl}/auth/reset-password?token=${resetToken}`;
    let clinicName = 'Your Healthcare Provider';
    let clinicLogo: string | undefined;

    // If a tenant slug was provided, try to scope URL and branding
    if (typeof slug === 'string' && slug.trim().length > 0) {
      const doctor = await getDoctorBySlug(slug.trim());
      if (doctor) {
        // Verify patient relationship via PatientProfile (tenant-scoped)
        const rel = await prisma.patientProfile.findFirst({
          where: { doctorId: doctor.id, userId: user.id, isActive: true },
          select: { id: true },
        });
        if (rel) {
          resetUrl = `${baseUrl}/${slug.trim()}/reset-password?token=${resetToken}`;
          const branding = await getClinicBrandingByDoctorId(doctor.id);
          clinicName = branding.clinicName || clinicName;
          clinicLogo = branding.clinicLogo || clinicLogo;
        }
      }
    }
    console.log('Reset URL generated:', resetUrl);

    // If no tenant branding resolved, fallback to user's first active clinic membership
    const clinicMemberships = (user as any).clinic_memberships || [];
    if (!clinicLogo && clinicName === 'Your Healthcare Provider') {
      clinicName = clinicMemberships[0]?.clinic?.name || clinicName;
      clinicLogo = clinicMemberships[0]?.clinic?.logo || clinicLogo;
    }

    console.log('Attempting to send email');
    try {
      await transporter.verify();
      console.log('SMTP connection verified');

      const emailHtml = createResetPasswordEmail({
        name: user.name || '',
        resetUrl,
        expiryHours: 1, // Token expires in 1 hour
        clinicName,
        clinicLogo: clinicLogo || undefined,
        doctorName: undefined,
      });

      await transporter.sendMail({
        from: {
          name: clinicName,
          address: process.env.SMTP_FROM as string
        },
        to: email,
        subject: `[Zuzz] Password Reset Request - ${clinicName}`,
        html: emailHtml
      });

      console.log('Email sent successfully');
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      throw emailError;
    }

    return NextResponse.json(
      { message: "If an account exists, you will receive a password reset email" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Password reset error details:", {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    
    return NextResponse.json(
      { 
        message: "Something went wrong",
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 