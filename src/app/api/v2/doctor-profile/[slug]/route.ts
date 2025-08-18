import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/v2/doctor-profile/[slug]
 * Busca informações do médico pelo slug
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    // Garantir que params seja tratado como assíncrono
    const slug = params.slug;

    if (!slug) {
      return NextResponse.json(
        { success: false, message: 'Slug não fornecido' },
        { status: 400 }
      );
    }

    // Buscar médico pelo slug
    const doctor = await prisma.user.findFirst({
      where: {
        doctor_slug: slug,
        role: 'DOCTOR',
        is_active: true
      } as any, // Usando any para contornar o erro de tipagem até atualizar o schema do Prisma
      select: {
        id: true,
        name: true,
        image: true,
        email: true
      }
    });

    if (!doctor) {
      return NextResponse.json(
        { success: false, message: 'Médico não encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: doctor
    });
  } catch (error) {
    console.error('Erro ao buscar médico por slug:', error);
    return NextResponse.json(
      { success: false, message: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
