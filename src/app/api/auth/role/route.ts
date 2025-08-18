import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/auth/role - Verificar role do usuário
export async function GET() {
  try {
    console.log('[ROLE API] Iniciando verificação de role');
    
    const session = await getServerSession(authOptions);
    console.log('[ROLE API] Sessão obtida:', session ? 'Sim' : 'Não');
    console.log('[ROLE API] Detalhes da sessão:', JSON.stringify(session, null, 2));
    
    if (!session?.user?.email) {
      console.log('[ROLE API] Erro: Sessão inválida ou email não encontrado');
      return NextResponse.json(
        { error: 'Não autorizado' },
        { status: 401 }
      );
    }

    console.log('[ROLE API] Buscando usuário para email:', session.user.email);

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { role: true, id: true, email: true }
    });

    console.log('[ROLE API] Usuário encontrado:', user ? 'Sim' : 'Não');

    if (!user) {
      console.log('[ROLE API] Erro: Usuário não encontrado no banco - invalidando sessão');
      // Se o usuário não existe no banco mas tem sessão válida, 
      // significa que há inconsistência - retornar 401 para forçar novo login
      return NextResponse.json(
        { error: 'Usuário não encontrado - sessão inválida' },
        { status: 401 }
      );
    }

    console.log('[ROLE API] Role do usuário:', user.role);

    return NextResponse.json(
      { role: user.role }, 
      {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    );
  } catch (error) {
    console.error('[ROLE API] Erro interno:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
} 