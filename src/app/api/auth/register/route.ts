import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
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
    const { name, email, password, doctorId } = await req.json();

    // Basic validation
    if (!name || !email || !password) {
      return NextResponse.json(
        { message: "Todos os campos são obrigatórios" },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    // Variável para armazenar o ID do usuário (novo ou existente)
    let userId;

    // Se o usuário já existe, atualizar seus dados em vez de criar um novo
    if (existingUser) {
      console.log('Usuário já existe, atualizando dados:', { email, name });
      
      // Atualizar os dados do usuário existente
      const updatedUser = await prisma.user.update({
        where: { email },
        data: {
          name, // Atualizar o nome se for diferente
          is_active: true, // Garantir que o usuário esteja ativo
        },
      });
      
      userId = updatedUser.id;
    }

    // Generate verification code (6 digits)
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const codeExpiry = new Date(Date.now() + 3600000); // 1 hour from now

    // Hash password
    const hashedPassword = await hash(password, 12);

    // Verificar se o doctorId é válido, se fornecido
    let doctor = null;
    if (doctorId) {
      doctor = await prisma.user.findFirst({
        where: {
          id: doctorId,
          role: 'DOCTOR',
          is_active: true
        }
      });
      
      if (!doctor) {
        return NextResponse.json(
          { message: "Médico não encontrado" },
          { status: 404 }
        );
      }
    }

    // Criar ou usar usuário existente
    let user;
    
    if (!existingUser) {
      // Gerar um ID único para o novo usuário
      const newUserId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
      
      // Criar novo usuário se não existir
      user = await prisma.user.create({
        data: {
          id: newUserId,
          name,
          email,
          password: hashedPassword,
          email_verified: null,
          role: 'PATIENT' // Garantir que o usuário seja criado como paciente
        },
      });
      
      userId = user.id;
      
      // Criar token de verificação para novos usuários
      await prisma.verificationToken.create({
        data: {
          identifier: email,
          token: verificationCode,
          expires: codeExpiry
        }
      });
    } else {
      // Usar o usuário existente já atualizado
      user = existingUser;
    }
    
    // Se houver um médico associado, verificar se já existe relação e criar se não existir
    if (doctor) {
      // Verificar se já existe relação entre médico e paciente
      const existingRelation = await prisma.doctorPatientRelationship.findFirst({
        where: {
          doctorId: doctorId,
          patientId: user.id
        }
      });
      
      if (!existingRelation) {
        // Registrar que o paciente veio através do link do médico
        await prisma.doctorPatientRelationship.create({
          data: {
            doctorId: doctorId,
            patientId: user.id,
            // Remover campo source que não existe no modelo
            status: 'ACTIVE'
          }
        });
        
        // Registrar log de aquisição (usando console.log pois o modelo accessLog não existe)
        console.log('PATIENT_REGISTRATION_VIA_DOCTOR_LINK', {
          user_id: user.id,
          action: 'PATIENT_REGISTRATION_VIA_DOCTOR_LINK',
          details: `Registro via link do médico ${doctorId}`,
          ip_address: req.headers.get('x-forwarded-for') || 'unknown'
        });
      } else {
        console.log('Relação entre médico e paciente já existe:', {
          doctor_id: doctorId,
          patient_id: user.id
        });
      }
    }

    // Enviar e-mail de verificação apenas para novos usuários
    if (!existingUser) {
      console.log('Sending verification email to new user:', email);
      
      // Send verification email using new template
      try {
        await transporter.verify();
        console.log('SMTP connection verified');

        const emailHtml = createVerificationEmail({
          name,
          code: verificationCode,
          expiryHours: 1
        });

        await transporter.sendMail({
          from: {
            name: 'CXLUS',
            address: process.env.SMTP_FROM as string
          },
          to: email,
          subject: '[Cxlus] Verify Your Email',
          html: emailHtml
        });

        console.log('Verification email sent successfully');
      } catch (emailError) {
        console.error('Email sending error:', emailError);
        // If email fails, delete the user and verification token
        await prisma.user.delete({
          where: { id: user.id }
        });
        await prisma.verificationToken.delete({
          where: {
            identifier_token: {
              identifier: email,
              token: verificationCode
            }
          }
        });
        throw emailError;
      }
    } else {
      console.log('Usuário existente, pulando envio de e-mail de verificação:', email);
    }

    // Mensagem personalizada dependendo se é um novo usuário ou existente
    const message = existingUser
      ? "Conta atualizada com sucesso. Redirecionando para área do médico."
      : "Usuário criado com sucesso. Verifique seu email para confirmar o cadastro.";
    
    const statusCode = existingUser ? 200 : 201; // 200 para atualização, 201 para criação
    
    return NextResponse.json(
      {
        message,
        userId: user.id,
        isNewUser: !existingUser,
        doctorId: doctorId || null
      },
      { status: statusCode }
    );
  } catch (error) {
    console.error("Registration error:", error);
    
    // Fornecer mensagem de erro mais detalhada
    let errorMessage = "Erro ao criar usuário";
    
    if (error instanceof Error) {
      errorMessage = `Erro ao criar usuário: ${error.message}`;
      console.error("Error details:", {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
    }
    
    return NextResponse.json(
      { message: errorMessage, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 