import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { randomInt } from 'crypto';
import { sendVerificationCode } from '@/lib/email';

/**
 * POST /api/v2/doctor-profile/send-code
 * Envia código de verificação para o email do usuário
 */
export async function POST(request: NextRequest) {
  try {
    const { email, doctorId } = await request.json();

    if (!email || !doctorId) {
      return NextResponse.json(
        { success: false, message: 'Email e ID do médico são obrigatórios' },
        { status: 400 }
      );
    }

    // Verificar se o médico existe
    const doctor = await prisma.user.findFirst({
      where: {
        id: doctorId,
        role: 'DOCTOR',
        is_active: true
      },
      select: {
        id: true,
        name: true
      }
    });

    if (!doctor) {
      return NextResponse.json(
        { success: false, message: 'Médico não encontrado' },
        { status: 404 }
      );
    }

    // Verificar se o usuário existe
    const user = await prisma.user.findFirst({
      where: {
        email: email.toLowerCase(),
        is_active: true
      }
    });

    // Flag para indicar se é um novo usuário ou usuário existente
    const isNewUser = !user;
    
    // Se for um novo usuário, verificar se já existe um usuário temporário com este email
    let userId: string = '';
    
    if (isNewUser) {
      // Verificar se já existe um usuário com este email (incluindo temporários)
      const existingUser = await prisma.user.findFirst({
        where: {
          email: email.toLowerCase()
        }
      });
      
      if (existingUser) {
        // Se já existe um usuário com este email, usar seu ID
        userId = existingUser.id;
      } else {
        // Gerar um ID único para o usuário temporário
        const tempUserId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
        
        try {
          // Criar usuário temporário
          const tempUser = await prisma.user.create({
            data: {
              id: tempUserId,
              email: email.toLowerCase(),
              name: 'Usuário Temporário',
              role: 'PATIENT',
              is_active: false, // Usuário inativo até completar o cadastro
              password: '', // Senha vazia, será definida no cadastro completo
              doctor_slug: null
            }
          });
          
          userId = tempUser.id;
        } catch (error) {
          console.error('Erro ao criar usuário temporário:', error);
          return NextResponse.json(
            { success: false, message: 'Erro ao processar solicitação' },
            { status: 500 }
          );
        }
      }
    } else {
      // Se for um usuário existente, usar seu ID
      userId = user!.id;
      
      // Verificar se tem prescrições deste médico
      const hasPrescriptions = await prisma.protocolPrescription.findFirst({
        where: {
          patient: {
            id: user.id
          },
          protocol: {
            doctor_id: doctor.id
          }
        }
      });

      if (!hasPrescriptions) {
        return NextResponse.json(
          { success: false, message: 'Você não tem protocolos ativos com este médico.' },
          { status: 403 }
        );
      }
    }

    // Gerar código de 6 dígitos
    const verificationCode = randomInt(100000, 999999).toString();
    
    // Salvar código no banco de dados com expiração de 15 minutos
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);

    // Criar o código de verificação
    await prisma.verificationCode.create({
      data: {
        code: verificationCode,
        user_id: userId, // Usar o ID do usuário existente ou temporário
        doctor_id: doctor.id,
        expires_at: expiresAt,
        type: 'DOCTOR_LINK'
      }
    });

    // Enviar email com o código
    await sendVerificationCode(email, verificationCode, doctor.name || 'seu médico');

    return NextResponse.json({
      success: true,
      message: 'Código enviado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao enviar código de verificação:', error);
    return NextResponse.json(
      { success: false, message: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
