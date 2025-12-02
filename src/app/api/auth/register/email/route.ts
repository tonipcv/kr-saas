import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createVerificationCodeEmail } from "@/email-templates/auth/verification-code";
import { getDoctorBySlug, getClinicBrandingByDoctorId } from "@/lib/tenant-slug";
import { sendEmail } from "@/lib/email";

// SMTP config is validated inside sendEmail(); optional RESEND fallback may be enabled by env.

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

    // Feature flags for email behavior
    const emailDisabled = process.env.SMTP_DISABLED === 'true';
    const fallbackAllowed = process.env.RETURN_VERIFICATION_CODE === 'true' || process.env.NODE_ENV !== 'production';

    // Check if email already exists (with retry)
    // Limit selection to avoid fetching fields with incompatible DB types (e.g., legacy enums)
    const existingUser = await withRetry(() => prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
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

      // Send verification code email (or fallback)
      if (emailDisabled) {
        console.warn('SMTP_DISABLED=true, skipping email send.');
        if (fallbackAllowed) {
          return NextResponse.json(
            {
              message: 'Email sending disabled. Use the code returned for testing.',
              email: normalizedEmail,
              existingUser: true,
              code: verificationCode,
            },
            { status: 200 }
          );
        } else {
          return NextResponse.json(
            { message: 'Email sending is currently disabled.' },
            { status: 503 }
          );
        }
      }

      try {
        const html = createVerificationCodeEmail({
          code: verificationCode,
          clinicName,
          clinicLogo,
        });

        const ok = await sendEmail({
          to: normalizedEmail,
          subject: '[KRX] Your verification code',
          html,
        });
        if (!ok) throw new Error('Email send failed (SMTP and fallback)');
        console.log('Verification email sent successfully');
      } catch (emailError) {
        console.error('Email sending error:', emailError);
        if (fallbackAllowed) {
          console.warn('FALLBACK: Returning code in response (token preserved)');
          return NextResponse.json(
            {
              message: 'Email sending failed. Use the code returned for testing.',
              email: normalizedEmail,
              existingUser: true,
              code: verificationCode,
            },
            { status: 200 }
          );
        }

        // Clean up token if email fails and no fallback allowed
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

    // Send verification code email (or fallback)
    if (emailDisabled) {
      console.warn('SMTP_DISABLED=true, skipping email send.');
      if (fallbackAllowed) {
        return NextResponse.json(
          {
            message: 'Email sending disabled. Use the code returned for testing.',
            email: normalizedEmail,
            code: verificationCode,
          },
          { status: 200 }
        );
      } else {
        return NextResponse.json(
          { message: 'Email sending is currently disabled.' },
          { status: 503 }
        );
      }
    }

    try {
      const html = createVerificationCodeEmail({
        code: verificationCode,
        clinicName,
        clinicLogo,
      });

      const ok = await sendEmail({
        to: normalizedEmail,
        subject: '[KRX] Your verification code',
        html,
      });
      if (!ok) throw new Error('Email send failed (SMTP and fallback)');
      console.log('Verification email sent successfully');
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      if (fallbackAllowed) {
        console.warn('FALLBACK: Returning code in response (token preserved)');
        return NextResponse.json(
          {
            message: 'Email sending failed. Use the code returned for testing.',
            email: normalizedEmail,
            code: verificationCode,
          },
          { status: 200 }
        );
      }

      // Clean up token if email fails and no fallback allowed
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
