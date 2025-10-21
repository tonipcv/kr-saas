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
      where: { id: session.user.id },
      select: { id: true, role: true }
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
            purchases: true,
            categories: true,
            coupons: true,
          }
        },
        // include categories through pivot
        categories: {
          include: {
            category: true
          }
        },
        productCategory: true // Manter a relação 1:N legada para compatibilidade
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
      categories: (product as any)?.categories?.map((cp: any) => ({ id: cp.category.id, name: cp.category.name })) ?? [],
      categoryIds: (product as any)?.categories?.map((cp: any) => cp.category.id) ?? [],
      _count: {
        purchases: (product as any)._count?.purchases || 0,
        categories: (product as any)._count?.categories || 0,
        coupons: (product as any)._count?.coupons || 0,
      },
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
      where: { id: session.user.id },
      select: { id: true, role: true }
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
      confirmationUrl,
      categoryIds,
      priority,
      // Subscription related
      type,
      interval,
      intervalCount,
      trialDays,
      autoRenew,
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

    // Build update data incrementally
    const updateData: any = {
      name,
      description,
      price: originalPrice ? parseFloat(originalPrice) : existingProduct.price,
      creditsPerUnit: typeof creditsPerUnit === 'number' ? creditsPerUnit : (creditsPerUnit != null ? parseFloat(creditsPerUnit) : existingProduct.creditsPerUnit),
      imageUrl: imageUrl ?? (existingProduct as any)?.imageUrl ?? null,
      category,
      isActive,
      confirmationUrl: confirmationUrl ?? (existingProduct as any)?.confirmationUrl ?? null,
      priority: typeof priority === 'number' ? priority : (priority != null ? Number(priority) : (existingProduct as any)?.priority ?? 0),
    };

    // Apply subscription fields if provided
    if (typeof type === 'string') {
      if (type === 'SUBSCRIPTION') {
        updateData.type = 'SUBSCRIPTION';
        updateData.interval = interval ?? (existingProduct as any)?.interval ?? 'MONTH';
        updateData.intervalCount = typeof intervalCount === 'number' ? intervalCount : (intervalCount != null ? Number(intervalCount) : (existingProduct as any)?.intervalCount ?? 1);
        updateData.trialDays = typeof trialDays === 'number' ? trialDays : (trialDays != null ? Number(trialDays) : (existingProduct as any)?.trialDays ?? null);
        updateData.autoRenew = typeof autoRenew === 'boolean' ? autoRenew : ((existingProduct as any)?.autoRenew ?? true);
      } else if (type === 'PRODUCT') {
        updateData.type = 'PRODUCT';
        // Clear subscription-only fields when switching to PRODUCT
        updateData.interval = null;
        updateData.intervalCount = null;
        updateData.trialDays = null;
        updateData.autoRenew = null;
      }
    }

    const updatedProduct = await prisma.products.update({
      where: { id: productId },
      data: updateData,
    });

    // Sync categories pivot if categoryIds is provided (array of strings)
    if (Array.isArray(categoryIds)) {
      // Optionally validate categoryIds belong to same doctor (if product has doctorId)
      if (existingProduct.doctorId) {
        const validIds = await prisma.productCategory.findMany({
          where: {
            id: { in: categoryIds },
            OR: [
              { doctorId: existingProduct.doctorId },
              { doctorId: null }
            ],
            isActive: true
          },
          select: { id: true }
        });
        const validSet = new Set(validIds.map((c) => c.id));
        const filtered = categoryIds.filter((id: string) => validSet.has(id));
        // Replace links: delete all then create selected
        await prisma.categoriesOnProducts.deleteMany({ where: { productId } });
        if (filtered.length > 0) {
          await prisma.categoriesOnProducts.createMany({
            data: filtered.map((cid: string) => ({ productId, categoryId: cid }))
          });
        }
      } else {
        // If product has no doctorId, just replace without validation
        await prisma.categoriesOnProducts.deleteMany({ where: { productId } });
        if (categoryIds.length > 0) {
          await prisma.categoriesOnProducts.createMany({
            data: categoryIds.map((cid: string) => ({ productId, categoryId: cid }))
          });
        }
      }
    }

    // Retornar no formato esperado pelo frontend
    // Re-fetch categories for response
    const withCategories = await prisma.products.findFirst({
      where: { id: productId },
      include: {
        categories: { include: { category: true } },
        productCategory: true // Manter a relação 1:N legada para compatibilidade
      }
    });

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
      creditsPerUnit: (updatedProduct as any)?.creditsPerUnit != null ? Number((updatedProduct as any).creditsPerUnit) : null,
      categories: (withCategories as any)?.categories?.map((cp: any) => ({ id: cp.category.id, name: cp.category.name })) ?? [],
      categoryIds: (withCategories as any)?.categories?.map((cp: any) => cp.category.id) ?? []
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

    // Verificar se o produto existe
    const existingProduct = await prisma.products.findFirst({
      where: {
        id: productId
      }
    });

    if (!existingProduct) {
      return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 });
    }

    // Autorização: só o médico dono do produto pode excluir
    if (existingProduct.doctorId && existingProduct.doctorId !== session.user.id) {
      return NextResponse.json({ error: 'Acesso negado. Você não é o dono deste produto.' }, { status: 403 });
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