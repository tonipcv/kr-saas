import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import nodemailer from "nodemailer";
import { createVerificationCodeEmail } from "@/email-templates/auth/verification-code";
import { getDoctorBySlug, getClinicBrandingByDoctorId } from "@/lib/tenant-slug";

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

export async function POST(req: Request) {
  try {
    const { email, slug } = await req.json();

    // Basic validations
    if (!email) {
      return NextResponse.json(
        { message: "Email is required" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Resolve optional tenant branding if slug provided
    let clinicName: string | undefined;
    let clinicLogo: string | undefined;
    if (typeof slug === 'string' && slug.trim()) {
      const doctor = await getDoctorBySlug(slug.trim());
      if (doctor) {
        const branding = await getClinicBrandingByDoctorId(doctor.id);
        clinicName = branding.clinicName;
        clinicLogo = branding.clinicLogo || undefined;
      }
    }

    // Simple retry helper for transient pool timeouts (P2024)
    const withRetry = async <T>(fn: () => Promise<T>, attempts = 3, delayMs = 300): Promise<T> => {
      let lastErr: any;
      for (let i = 0; i < attempts; i++) {
        try { return await fn(); } catch (e: any) {
          lastErr = e;
          // P2024 / pool timeout or ECONNRESET
          if (e?.code === 'P2024' || /Timed out fetching a new connection/i.test(e?.message || '') || e?.code === 'ECONNRESET') {
            if (i < attempts - 1) await new Promise(r => setTimeout(r, delayMs * (i + 1)));
            continue;
          }
          throw e;
        }
      }
      throw lastErr;
    };

    // Check if email already exists (with retry)
    const existingUser = await withRetry(() => prisma.user.findUnique({
      where: { email: normalizedEmail },
    }));

    if (existingUser) {
      // Generate 6-digit verification code for login
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      const codeExpiry = new Date(Date.now() + 3600000); // 1 hour

      // Store the code temporarily
      await withRetry(() => prisma.verificationToken.create({
        data: {
          identifier: normalizedEmail,
          token: verificationCode,
          expires: codeExpiry
        }
      }));

      // Send verification code email
      try {
        await transporter.verify();
        console.log('SMTP connection verified');

        const html = createVerificationCodeEmail({
          code: verificationCode,
          clinicName,
          clinicLogo,
        });

        await transporter.sendMail({
          from: {
            name: 'Zuzz',
            address: process.env.SMTP_FROM as string
          },
          to: normalizedEmail,
          subject: '[Zuzz] Your verification code',
          html
        });

        console.log('Verification email sent successfully');
      } catch (emailError) {
        console.error('Email sending error:', emailError);
        
        // Clean up token if email fails
        await withRetry(() => prisma.verificationToken.deleteMany({
          where: { 
            identifier: normalizedEmail,
            token: verificationCode
          }
        }));
        
        throw emailError;
      }

      return NextResponse.json(
        {
          message: "Email already registered. Verification code sent for login.",
          email: normalizedEmail,
          existingUser: true
        },
        { status: 200 }
      );
    }

    // Generate verification code (6 digits)
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const codeExpiry = new Date(Date.now() + 3600000); // 1 hour

    // Store the code temporarily
    await withRetry(() => prisma.verificationToken.create({
      data: {
        identifier: normalizedEmail,
        token: verificationCode,
        expires: codeExpiry
      }
    }));

    // Send verification code email
    try {
      await transporter.verify();
      console.log('SMTP connection verified');

      const html = createVerificationCodeEmail({
        code: verificationCode,
        clinicName,
        clinicLogo,
      });

      await transporter.sendMail({
        from: {
          name: 'Zuzz',
          address: process.env.SMTP_FROM as string
        },
        to: normalizedEmail,
        subject: '[Zuzz] Your verification code',
        html
      });

      console.log('Verification email sent successfully');
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      
      // Clean up token if email fails
      await withRetry(() => prisma.verificationToken.deleteMany({
        where: { 
          identifier: normalizedEmail,
          token: verificationCode
        }
      }));
      
      throw emailError;
    }

    return NextResponse.json(
      {
        message: "Verification code sent successfully",
        email: normalizedEmail
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Email verification error:", error);
    return NextResponse.json(
      { message: "Failed to send verification code" },
      { status: 500 }
    );
  }
}
