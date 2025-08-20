import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import nodemailer from "nodemailer";
import { createDoctorVerificationEmail } from "@/email-templates/auth/doctor-verification";

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
    const { name, email, password } = await req.json();

    // Basic validations
    if (!name || !email || !password) {
      return NextResponse.json(
        { message: "Name, email and password are required" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { message: "Password must be at least 6 characters long" },
        { status: 400 }
      );
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (existingUser) {
      return NextResponse.json(
        { message: "This email is already in use" },
        { status: 400 }
      );
    }

    // Find default plan for doctors
    const defaultPlan = await prisma.subscriptionPlan.findFirst({
      where: { isDefault: true }
    });

    if (!defaultPlan) {
      return NextResponse.json(
        { message: "Default plan not found" },
        { status: 500 }
      );
    }

    // Generate verification code (6 digits)
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const codeExpiry = new Date(Date.now() + 3600000); // 1 hour

    // Hash password
    const hashedPassword = await hash(password, 12);

    // Create doctor
    const doctor = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        role: 'DOCTOR',
        emailVerified: null,
        verificationCode,
        verificationCodeExpiry: codeExpiry
      }
    });

    // Create trial subscription
    await prisma.doctorSubscription.create({
      data: {
        doctorId: doctor.id,
        planId: defaultPlan.id,
        status: 'TRIAL',
        trialEndDate: new Date(Date.now() + (defaultPlan.trialDays || 7) * 24 * 60 * 60 * 1000)
      }
    });

    // Send verification email
    try {
      await transporter.verify();
      console.log('SMTP connection verified');

      const html = createDoctorVerificationEmail({
        name,
        code: verificationCode,
        trialDays: defaultPlan.trialDays || 7
      });

      await transporter.sendMail({
        from: {
          name: 'Cxlus',
          address: process.env.SMTP_FROM as string
        },
        to: email,
        subject: '[Cxlus] Verify Your Email',
        html
      });

      console.log('Verification email sent successfully');
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      // If the email fails, delete the created doctor
      await prisma.doctorSubscription.deleteMany({
        where: { doctorId: doctor.id }
      });
      await prisma.user.delete({
        where: { id: doctor.id }
      });
      throw emailError;
    }

    return NextResponse.json(
      {
        message: "Doctor created successfully. Please check your email to confirm registration.",
        doctorId: doctor.id
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { message: "Error creating doctor" },
      { status: 500 }
    );
  }
} 