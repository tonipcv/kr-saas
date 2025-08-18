import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verify } from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { encode } from 'next-auth/jwt';
import { getServerSession } from 'next-auth';

/**
 * POST /api/auth/token-signin
 * Endpoint para autenticação usando token JWT gerado pelo sistema de verificação de código
 */
export async function POST(request: NextRequest) {
  try {
    const { token, email } = await request.json();

    if (!token || !email) {
      return NextResponse.json(
        { success: false, message: 'Token e email são obrigatórios' },
        { status: 400 }
      );
    }

    // Verificar o token JWT
    const secret = process.env.NEXTAUTH_SECRET || 'default-secret-key';
    let decoded;
    
    try {
      decoded = verify(token, secret);
      console.log('Token verificado com sucesso:', decoded);
    } catch (error) {
      console.error('Erro ao verificar token:', error);
      return NextResponse.json(
        { success: false, message: 'Token inválido ou expirado' },
        { status: 401 }
      );
    }

    // Verificar se o email do token corresponde ao email fornecido
    if (decoded.email !== email) {
      console.error('Email do token não corresponde ao email fornecido');
      return NextResponse.json(
        { success: false, message: 'Dados de autenticação inválidos' },
        { status: 401 }
      );
    }

    // Buscar usuário no banco de dados
    const user = await prisma.user.findUnique({
      where: {
        email: email.toLowerCase()
      }
    });

    if (!user) {
      console.error('Usuário não encontrado:', email);
      return NextResponse.json(
        { success: false, message: 'Usuário não encontrado' },
        { status: 404 }
      );
    }

    // Gerar token de sessão NextAuth
    const nextAuthToken = await encode({
      token: {
        sub: user.id,
        email: user.email,
        name: user.name,
        picture: user.image,
        role: user.role,
      },
      secret,
    });

    // Configurar cookie de sessão
    const cookieStore = cookies();
    
    // Logs detalhados para depuração
    console.log('Token NextAuth gerado:', nextAuthToken ? 'Sim (primeiros caracteres: ' + nextAuthToken.substring(0, 20) + '...)' : 'Não');
    
    // Nota: Não estamos mais configurando o cookie diretamente
    // Em vez disso, o frontend vai usar o signIn do NextAuth para autenticar o usuário
    // Isso garante que o NextAuth reconheça a sessão corretamente

    // Log de acesso
    console.log(`Login via token JWT para usuário ${user.id} (${user.email})`);

    return NextResponse.json({
      success: true,
      message: 'Autenticação bem-sucedida',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Erro ao processar autenticação com token:', error);
    return NextResponse.json(
      { success: false, message: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
