import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Ensure doctor role
    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user || user.role !== 'DOCTOR') {
      return NextResponse.json({ error: 'Apenas médicos podem duplicar produtos.' }, { status: 403 });
    }

    const { id } = await params;

    // Load source product and ensure it belongs to doctor
    const source = await prisma.products.findFirst({
      where: { id, doctorId: session.user.id }
    });

    if (!source) {
      return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 });
    }

    const { createId } = await import('@paralleldrive/cuid2');

    // Prepare duplicated data; keep same fields but inactive
    const data: any = {
      id: createId(),
      name: `${source.name} (Cópia)`,
      description: source.description ?? null,
      price: source.price ?? 0,
      creditsPerUnit: (source as any)?.creditsPerUnit ?? null,
      imageUrl: (source as any)?.imageUrl ?? null,
      category: source.category ?? 'Geral',
      isActive: false, // duplicated starts inactive
      doctorId: session.user.id,
    };

    const duplicated = await prisma.products.create({ data });

    const transformed = {
      ...duplicated,
      brand: null,
      imageUrl: (duplicated as any)?.imageUrl ?? null,
      originalPrice: duplicated?.price != null ? Number(duplicated.price) : null,
      discountPrice: null,
      discountPercentage: null,
      purchaseUrl: null,
      usageStats: 0,
      doctorId: session.user.id,
      creditsPerUnit: (duplicated as any)?.creditsPerUnit != null ? Number((duplicated as any).creditsPerUnit) : null,
    };

    return NextResponse.json(transformed, { status: 201 });
  } catch (error) {
    console.error('❌ Error duplicating product:', error);
    return NextResponse.json({ error: 'Erro ao duplicar produto' }, { status: 500 });
  }
}
