import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import nodemailer from "nodemailer";
import { createVerificationCodeEmail } from "@/email-templates/auth/verification-code";

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

    // Validações básicas
    if (!email) {
      return NextResponse.json(
        { message: "Email é obrigatório" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Verificar se email já existe
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      // Gerar código de verificação para login (6 dígitos)
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      const codeExpiry = new Date(Date.now() + 3600000); // 1 hora

      // Armazenar o código temporariamente
      await prisma.verificationToken.create({
        data: {
          identifier: normalizedEmail,
          token: verificationCode,
          expires: codeExpiry
        }
      });

      // Enviar email com código de verificação
      try {
        await transporter.verify();
        console.log('SMTP connection verified');

        const html = createVerificationCodeEmail({
          code: verificationCode
        });

        await transporter.sendMail({
          from: {
            name: 'Cxlus',
            address: process.env.SMTP_FROM as string
          },
          to: normalizedEmail,
          subject: '[Cxlus] Seu código de verificação',
          html
        });

        console.log('Verification email sent successfully');
      } catch (emailError) {
        console.error('Email sending error:', emailError);
        
        // Limpar o token se o email falhar
        await prisma.verificationToken.deleteMany({
          where: { 
            identifier: normalizedEmail,
            token: verificationCode
          }
        });
        
        throw emailError;
      }

      return NextResponse.json(
        {
          message: "Email já cadastrado. Código de verificação enviado para login.",
          email: normalizedEmail,
          existingUser: true
        },
        { status: 200 }
      );
    }

    // Gerar código de verificação (6 dígitos)
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const codeExpiry = new Date(Date.now() + 3600000); // 1 hora

    // Armazenar o código temporariamente
    await prisma.verificationToken.create({
      data: {
        identifier: normalizedEmail,
        token: verificationCode,
        expires: codeExpiry
      }
    });

    // Enviar email com código de verificação
    try {
      await transporter.verify();
      console.log('SMTP connection verified');

      const html = createVerificationCodeEmail({
        code: verificationCode
      });

      await transporter.sendMail({
        from: {
          name: 'Cxlus',
          address: process.env.SMTP_FROM as string
        },
        to: normalizedEmail,
        subject: '[Cxlus] Seu código de verificação',
        html
      });

      console.log('Verification email sent successfully');
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      
      // Limpar o token se o email falhar
      await prisma.verificationToken.deleteMany({
        where: { 
          identifier: normalizedEmail,
          token: verificationCode
        }
      });
      
      throw emailError;
    }

    return NextResponse.json(
      {
        message: "Código de verificação enviado com sucesso",
        email: normalizedEmail
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Email verification error:", error);
    return NextResponse.json(
      { message: "Erro ao enviar código de verificação" },
      { status: 500 }
    );
  }
}
