import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sign } from 'jsonwebtoken';

/**
 * POST /api/v2/doctor-profile/verify-code
 * Verifica o código enviado e retorna um token de autenticação
 */
export async function POST(request: NextRequest) {
  try {
    const { email, code, doctorId } = await request.json();

    if (!email || !code || !doctorId) {
      return NextResponse.json(
        { success: false, message: 'Email, código e ID do médico são obrigatórios' },
        { status: 400 }
      );
    }

    // Verificar se o usuário existe
    const user = await prisma.user.findFirst({
      where: {
        email: email.toLowerCase(),
        is_active: true
      }
    });
    
    // Flag para indicar se é um novo usuário
    const isNewUser = !user;

    // Verificar se o médico existe
    const doctor = await prisma.user.findFirst({
      where: {
        id: doctorId,
        role: 'DOCTOR',
        is_active: true
      }
    });

    if (!doctor) {
      return NextResponse.json(
        { success: false, message: 'Médico não encontrado' },
        { status: 404 }
      );
    }

    // Buscar código de verificação válido
    const verificationCode = await prisma.verificationCode.findFirst({
      where: {
        code,
        user_id: user?.id, // Opcional para novos usuários
        doctor_id: doctor.id,
        type: 'DOCTOR_LINK',
        expires_at: {
          gt: new Date()
        },
        used_at: null
      }
    });

    if (!verificationCode) {
      return NextResponse.json(
        { success: false, message: 'Código inválido ou expirado' },
        { status: 400 }
      );
    }

    // Marcar código como usado
    await prisma.verificationCode.update({
      where: {
        id: verificationCode.id
      },
      data: {
        used_at: new Date()
      }
    });

    // Verificar se é um usuário temporário (ID começa com 'temp_')
    const isTemporaryUser = user?.id.startsWith('temp_');
    
    // Se for um usuário temporário ou novo, retornar sucesso sem gerar token
    // O token será gerado após o cadastro completo
    if (isNewUser || isTemporaryUser) {
      return NextResponse.json({
        success: true,
        isNewUser: true,
        message: 'Código verificado com sucesso. Continue o cadastro.',
        email: email.toLowerCase(),
        doctorId: doctor.id
      });
    }
    
    // Para usuários existentes, gerar token JWT
    const secret = process.env.NEXTAUTH_SECRET || 'default-secret-key';
    console.log('Gerando token JWT para usuário existente:', user!.email);
    
    const token = sign(
      {
        id: user!.id,
        email: user!.email,
        role: user!.role,
        doctorId: doctor.id,
        type: 'doctor-link'
      },
      secret,
      { expiresIn: '7d' }
    );

    console.log('Token gerado com sucesso, primeiros caracteres:', token.substring(0, 20) + '...');
    
    // Log de acesso para usuários existentes (comentado pois não há modelo de log no schema)
    // TODO: Implementar registro de logs quando houver um modelo adequado
    console.log(`Acesso via link do médico ${doctor.id} pelo usuário ${user!.id}`);

    // Verificar se o token foi gerado corretamente
    if (!token) {
      console.error('Erro: Token não foi gerado corretamente');
      return NextResponse.json(
        { success: false, message: 'Erro na geração do token' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Código verificado com sucesso',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Erro ao verificar código:', error);
    return NextResponse.json(
      { success: false, message: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
