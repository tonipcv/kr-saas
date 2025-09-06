import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserClinics } from '@/lib/clinic-utils';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Não autorizado' },
        { status: 401 }
      );
    }

    // Verificar role
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true }
    });

    if (!user || (user.role !== 'DOCTOR' && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
      return NextResponse.json(
        { error: 'Acesso negado. Apenas médicos ou administradores podem acessar clínicas.' },
        { status: 403 }
      );
    }

    let clinics;
    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
      // Admin: listar todas clínicas ativas
      clinics = await prisma.clinic.findMany({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' },
        include: {
          owner: { select: { id: true, name: true, email: true } },
          members: {
            where: { isActive: true },
            include: { user: { select: { id: true, name: true, email: true, role: true } } },
          },
        },
      });
    } else {
      // Médico: apenas suas clínicas
      clinics = await getUserClinics(session.user.id);
    }

    return NextResponse.json({ 
      clinics,
      total: clinics.length 
    });

  } catch (error) {
    console.error('Erro ao buscar clínicas:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
