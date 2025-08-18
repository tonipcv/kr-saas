import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '../../../../../../lib/prisma';
import { z } from 'zod';

// Initialize Prisma client directly


const createQuestionSchema = z.object({
  question: z.string().min(1, 'A pergunta é obrigatória'),
  type: z.enum(['MULTIPLE_CHOICE', 'SCALE', 'TEXT', 'YES_NO'], {
    errorMap: () => ({ message: 'Tipo de pergunta inválido. Use: MULTIPLE_CHOICE, SCALE, TEXT ou YES_NO' })
  }),
  options: z.string().optional(),
  order: z.number().default(0),
}).strict({
  message: 'Campos não reconhecidos foram enviados'
});

// GET - Listar perguntas do protocolo
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    console.log('🔍 Starting GET checkin-questions...');
    
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      console.log('❌ No session found');
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    console.log('✅ Session found:', session.user.id);

    const { id: protocolId } = await params;
    console.log('✅ Protocol ID:', protocolId);

    console.log('🔍 Checking prisma client:', typeof prisma, !!prisma);
    console.log('🔍 Checking dailyCheckinQuestion:', typeof prisma.dailyCheckinQuestion, !!prisma.dailyCheckinQuestion);

    // Verificar se o usuário tem acesso ao protocolo
    const protocol = await prisma.protocol.findFirst({
      where: {
        id: protocolId,
        OR: [
          { doctor_id: session.user.id },
          { prescriptions: { some: { user_id: session.user.id } } }
        ]
      }
    });

    console.log('✅ Protocol found:', !!protocol);

    if (!protocol) {
      return NextResponse.json({ error: 'Protocolo não encontrado' }, { status: 404 });
    }

    console.log('🔍 About to query dailyCheckinQuestion...');
    
    const questions = await prisma.dailyCheckinQuestion.findMany({
      where: {
        protocolId,
        isActive: true
      },
      orderBy: { order: 'asc' }
    });

    console.log('✅ Questions found:', questions.length);

    return NextResponse.json({ questions });

  } catch (error) {
    console.error('❌ Erro ao buscar perguntas:', error);
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack');
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST - Criar nova pergunta
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { id: protocolId } = await params;

    // Verificar se é o médico dono do protocolo
    const protocol = await prisma.protocol.findFirst({
      where: {
        id: protocolId,
        doctor_id: session.user.id
      }
    });

    if (!protocol) {
      return NextResponse.json({ error: 'Protocolo não encontrado ou sem permissão' }, { status: 404 });
    }

    const body = await request.json();
    const validatedData = createQuestionSchema.parse(body);

    const question = await prisma.dailyCheckinQuestion.create({
      data: {
        ...validatedData,
        protocolId,
        id: `checkin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        isActive: true,
        isRequired: true,
      }
    });

    return NextResponse.json({ question }, { status: 201 });

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Dados inválidos', details: error.errors }, { status: 400 });
    }
    console.error('Erro ao criar pergunta:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
} 