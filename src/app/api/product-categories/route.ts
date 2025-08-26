import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

// GET /api/product-categories - list categories for current doctor
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user || user.role !== 'DOCTOR') {
      return NextResponse.json({ error: 'Acesso negado. Apenas médicos.' }, { status: 403 });
    }

    const categories = await prisma.productCategory.findMany({
      where: { doctorId: session.user.id, isActive: true },
      select: { id: true, name: true, slug: true },
      orderBy: { name: 'asc' }
    });

    return NextResponse.json(categories);
  } catch (error) {
    console.error('Error listing categories:', error);
    return NextResponse.json({ error: 'Erro ao listar categorias' }, { status: 500 });
  }
}

// POST /api/product-categories - create category for current doctor
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user || user.role !== 'DOCTOR') {
      return NextResponse.json({ error: 'Acesso negado. Apenas médicos.' }, { status: 403 });
    }

    const body = await request.json();
    const name = (body?.name || '').toString().trim();
    if (!name) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });
    }

    // Try to find existing (unique per doctor by name)
    const existing = await prisma.productCategory.findFirst({
      where: { doctorId: session.user.id, name },
      select: { id: true, name: true, slug: true }
    });
    if (existing) {
      return NextResponse.json(existing, { status: 200 });
    }

    const created = await prisma.productCategory.create({
      data: {
        name,
        slug: slugify(name),
        doctorId: session.user.id,
        isActive: true,
      },
      select: { id: true, name: true, slug: true }
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('Error creating category:', error);
    return NextResponse.json({ error: 'Erro ao criar categoria' }, { status: 500 });
  }
}
