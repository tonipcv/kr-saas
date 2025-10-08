import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/products/public/[id] - Public product fetch for checkout/success pages
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 });

    const product = await prisma.products.findFirst({
      where: { id },
      select: {
        id: true,
        name: true,
        price: true,
        imageUrl: true,
        clinicId: true,
        clinic: {
          select: {
            slug: true,
            name: true,
            theme: true,
            buttonColor: true,
            buttonTextColor: true,
            logo: true,
          }
        }
      },
    });

    if (!product) return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 });

    return NextResponse.json({
      id: product.id,
      name: product.name,
      price: product.price != null ? Number(product.price) : null,
      imageUrl: (product as any)?.imageUrl || null,
      clinicId: product.clinicId,
      clinic: product.clinic
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro ao buscar produto' }, { status: 500 });
  }
}

