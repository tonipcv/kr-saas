import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

// GET /api/products/[id] - Buscar produto específico
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const resolvedParams = await params;
    const productId = resolvedParams.id;

    // Verificar se é médico
    const user = await prisma.user.findUnique({
      where: { id: session.user.id }
    });

    if (!user || user.role !== 'DOCTOR') {
      return NextResponse.json({ error: 'Acesso negado. Apenas médicos podem visualizar produtos.' }, { status: 403 });
    }

    const product = await prisma.products.findFirst({
      where: {
        id: productId
      },
      include: {
        _count: {
          select: {
            protocol_products: true
          }
        },
        protocol_products: {
          include: {
            protocols: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      }
    });

    if (!product) {
      return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 });
    }

    // Transformar para o formato esperado pelo frontend
    const transformedProduct = {
      ...product,
      // Adicionar campos que o frontend espera mas que não existem na tabela
      brand: null,
      imageUrl: (product as any)?.imageUrl ?? null,
      originalPrice: product?.price != null ? Number(product.price) : null,
      discountPrice: null,
      discountPercentage: null,
      purchaseUrl: null,
      usageStats: 0,
      doctorId: session.user.id, // Simular que pertence ao médico atual
      creditsPerUnit: (product as any)?.creditsPerUnit != null ? Number((product as any).creditsPerUnit) : null,
      _count: {
        protocolProducts: product._count.protocol_products
      },
      protocolProducts: product.protocol_products.map(pp => ({
        protocol: {
          id: pp.protocols.id,
          name: pp.protocols.name
        }
      }))
    };

    return NextResponse.json(transformedProduct);
  } catch (error) {
    console.error('Error fetching product:', error instanceof Error ? error.message : 'Erro desconhecido');
    return NextResponse.json({ error: 'Erro ao buscar produto' }, { status: 500 });
  }
}

// PUT /api/products/[id] - Atualizar produto
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const productId = resolvedParams.id;
    
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Verificar se é médico
    const user = await prisma.user.findUnique({
      where: { id: session.user.id }
    });

    if (!user || user.role !== 'DOCTOR') {
      return NextResponse.json({ error: 'Acesso negado. Apenas médicos podem editar produtos.' }, { status: 403 });
    }

    const body = await request.json();
    const { 
      name, 
      description, 
      originalPrice,
      creditsPerUnit,
      imageUrl,
      category = 'Geral',
      isActive = true,
      confirmationUrl
    } = body;

    // Verificar se o produto existe
    const existingProduct = await prisma.products.findFirst({
      where: {
        id: productId
      }
    });

    if (!existingProduct) {
      return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 });
    }

    // Validar campos obrigatórios
    if (!name) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });
    }

    const updatedProduct = await prisma.products.update({
      where: { id: productId },
      data: {
        name,
        description,
        price: originalPrice ? parseFloat(originalPrice) : existingProduct.price,
        creditsPerUnit: typeof creditsPerUnit === 'number' ? creditsPerUnit : (creditsPerUnit != null ? parseFloat(creditsPerUnit) : existingProduct.creditsPerUnit),
        // Atualizar imageUrl quando enviado
        imageUrl: imageUrl ?? (existingProduct as any)?.imageUrl ?? null,
        category,
        isActive,
        confirmationUrl: confirmationUrl ?? (existingProduct as any)?.confirmationUrl ?? null
      }
    });

    // Retornar no formato esperado pelo frontend
    const transformedProduct = {
      ...updatedProduct,
      brand: null,
      imageUrl: (updatedProduct as any)?.imageUrl ?? null,
      originalPrice: updatedProduct?.price != null ? Number(updatedProduct.price) : null,
      discountPrice: null,
      discountPercentage: null,
      purchaseUrl: null,
      usageStats: 0,
      doctorId: session.user.id,
      creditsPerUnit: (updatedProduct as any)?.creditsPerUnit != null ? Number((updatedProduct as any).creditsPerUnit) : null
    };

    return NextResponse.json(transformedProduct);
  } catch (error) {
    console.error('Error updating product:', error instanceof Error ? error.message : 'Erro desconhecido');
    return NextResponse.json({ error: 'Erro ao atualizar produto' }, { status: 500 });
  }
}

// DELETE /api/products/[id] - Excluir produto
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const productId = resolvedParams.id;
    
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Verificar se é médico
    const user = await prisma.user.findUnique({
      where: { id: session.user.id }
    });

    if (!user || user.role !== 'DOCTOR') {
      return NextResponse.json({ error: 'Acesso negado. Apenas médicos podem excluir produtos.' }, { status: 403 });
    }

    // Verificar se o produto existe
    const existingProduct = await prisma.products.findFirst({
      where: {
        id: productId
      },
      include: {
        protocol_products: true
      }
    });

    if (!existingProduct) {
      return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 });
    }

    // Verificar se há protocolos usando este produto
    if (existingProduct.protocol_products.length > 0) {
      return NextResponse.json({ 
        error: 'Não é possível excluir produto que está sendo usado em protocolos. Remova das associações primeiro.' 
      }, { status: 400 });
    }

    // Excluir produto
    await prisma.products.delete({
      where: { id: productId }
    });

    return NextResponse.json({ message: 'Produto excluído com sucesso' });
  } catch (error) {
    console.error('Error deleting product:', error instanceof Error ? error.message : 'Erro desconhecido');
    return NextResponse.json({ error: 'Erro ao excluir produto' }, { status: 500 });
  }
} 