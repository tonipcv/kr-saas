import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import nodemailer from "nodemailer";
import { createVerificationEmail } from "@/email-templates/auth/verification";

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
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json(
        { message: "Email is required" },
        { status: 400 }
      );
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return NextResponse.json(
        { message: "User not found" },
        { status: 404 }
      );
    }

    // Generate new verification code (6 digits)
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const codeExpiry = new Date(Date.now() + 3600000); // 1 hour

    // Delete any existing tokens
    await prisma.verificationToken.deleteMany({
      where: { identifier: email }
    });

    // Create new verification token
    await prisma.verificationToken.create({
      data: {
        identifier: email,
        token: verificationCode,
        expires: codeExpiry
      }
    });

    // Send new verification email
    try {
      await transporter.verify();
      console.log('SMTP connection verified');

      const html = createVerificationEmail({
        name: user.name || 'User',
        code: verificationCode,
        expiryHours: 1
      });

      await transporter.sendMail({
        from: {
          name: 'Zuzz',
          address: process.env.SMTP_FROM as string
        },
        to: email,
        subject: '[Zuzz] Verify Your Email',
        html
      });

      console.log('New verification code sent successfully');
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      throw emailError;
    }

    return NextResponse.json(
      { message: "New code sent successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error resending code:', error);
    return NextResponse.json(
      { message: "Error sending new code" },
      { status: 500 }
    );
  }
} 