import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/products - Listar produtos
export async function GET(request: Request) {
  console.log('🔍 Products API called');
  try {
    console.log('🔍 Products API called');
    const { searchParams } = new URL(request.url);
    const userEmail = searchParams.get('userEmail');
    
    let session;
    if (userEmail) {
      console.log('📧 Using userEmail parameter:', userEmail);
      // Buscar usuário pelo email para casos especiais
      const user = await prisma.user.findUnique({
        where: { email: userEmail },
        select: { id: true }
      });
      if (user) {
        session = { user: { id: user.id } };
        console.log('✅ Session created from userEmail:', session.user.id);
      } else {
        console.log('❌ User not found for email:', userEmail);
      }
    } else {
      console.log('🔐 Getting session from NextAuth');
      session = await getServerSession(authOptions);
      console.log('📋 Session from NextAuth:', session ? { userId: session.user?.id, email: session.user?.email } : 'null');
    }
    
    if (!session?.user?.id) {
      console.log('❌ No valid session found');
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    console.log('✅ Valid session found for user:', session.user.id);

    // Verificar se é médico
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, email: true, role: true }
    });

    console.log('👤 User found:', user ? { id: user.id, email: user.email, role: user.role } : 'null');

    if (!user || user.role !== 'DOCTOR') {
      console.log('❌ User is not a doctor or not found');
      return NextResponse.json({ error: 'Acesso negado. Apenas médicos podem visualizar produtos.' }, { status: 403 });
    }

    console.log('✅ User is a doctor, proceeding to fetch products');

    try {
      // Buscar produtos do médico e clínica
      const clinicId = searchParams.get('clinicId');
      console.log('🏥 Filtering by clinicId:', clinicId);

      // Verificar acesso à clínica
      if (clinicId) {
        const hasAccess = await prisma.clinic.findFirst({
          where: {
            id: clinicId,
            OR: [
              { ownerId: session.user.id },
              {
                members: {
                  some: {
                    userId: session.user.id,
                    isActive: true
                  }
                }
              }
            ]
          }
        });

        if (!hasAccess) {
          console.log('❌ User does not have access to clinic:', clinicId);
          return NextResponse.json({ error: 'Access denied to this clinic' }, { status: 403 });
        }
      }

      // Buscar produtos do médico atual
      const products = await prisma.product.findMany({
        where: {
          doctorId: session.user.id,
          ...(clinicId
            ? { OR: [ { clinicId }, { clinicId: null } ] }
            : {})
        },
        include: {
          _count: {
            select: {
              purchases: true,
              categories: true,
              offers: true,
            },
          },
          // Usar a relação correta definida no schema
          categories: { 
            include: { 
              category: true 
            } 
          },
          productCategory: true // Manter a relação 1:N legada para compatibilidade
        },
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'desc' }
        ]
      });

      console.log('📦 Products found:', products.length);

      // Transformar para o formato esperado pelo frontend
      const transformedProducts = products.map((product: any) => {
        // Extrair categorias da relação N:N
        const categories = product.categories?.map((cp: any) => ({
          id: cp.category.id,
          name: cp.category.name
        })) || [];
        
        // Adicionar categoria legada se existir e não estiver já nas categorias
        if (product.productCategory && !categories.some((c: any) => c.id === product.productCategory.id)) {
          categories.push({
            id: product.productCategory.id,
            name: product.productCategory.name
          });
        }
        
        return {
          ...product,
          // Adicionar campos que o frontend espera mas que não existem na tabela
          brand: null,
          imageUrl: product?.imageUrl ?? null,
          originalPrice: product?.price != null ? Number(product.price) : null,
          discountPrice: null,
          discountPercentage: null,
          purchaseUrl: null,
          usageStats: 0,
          doctorId: session.user.id, // Simular que pertence ao médico atual
          creditsPerUnit: product?.creditsPerUnit != null ? Number(product.creditsPerUnit) : null,
          // Usar as categorias extraídas
          categories,
          categoryIds: categories.map((c: any) => c.id),
          _count: {
            purchases: product._count?.purchases || 0,
            categories: product._count?.categories || 0,
            coupons: product._count?.offers || 0,
          }
        };
      });

      console.log('✅ Returning transformed products:', transformedProducts.length);
      return NextResponse.json(transformedProducts);
    } catch (dbError) {
      console.error('❌ Erro ao buscar produtos:', dbError);
      return NextResponse.json({ error: 'Erro ao buscar produtos no banco de dados' }, { status: 500 });
    }
  } catch (error) {
    console.error('❌ Error fetching products:', error instanceof Error ? error.message : 'Erro desconhecido');
    return NextResponse.json({ error: 'Erro ao buscar produtos' }, { status: 500 });
  }
}

// POST /api/products - Criar novo produto
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Verificar se é médico (selecionar apenas campos necessários)
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, role: true }
    });

    if (!user || user.role !== 'DOCTOR') {
      return NextResponse.json({ error: 'Acesso negado. Apenas médicos podem criar produtos.' }, { status: 403 });
    }

    const body = await request.json();
    console.log('📝 [POST /api/products] Raw body:', body);
    const { 
      name, 
      description, 
      originalPrice,
      creditsPerUnit,
      category = 'Geral',
      confirmationUrl,
      imageUrl,
      categoryIds,
      priority,
      clinicId,
      // Subscription-related (optional)
      type,
      interval,
      intervalCount,
      trialDays,
      autoRenew,
    } = body;

    // Verificar acesso à clínica
    if (clinicId) {
      const hasAccess = await prisma.clinic.findFirst({
        where: {
          id: clinicId,
          OR: [
            { ownerId: session.user.id },
            {
              members: {
                some: {
                  userId: session.user.id,
                  isActive: true
                }
              }
            }
          ]
        }
      });

      if (!hasAccess) {
        return NextResponse.json({ error: 'Access denied to this clinic' }, { status: 403 });
      }
    }

    // Validar campos obrigatórios
    if (!name) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });
    }

    // Gerar ID único
    const { createId } = await import('@paralleldrive/cuid2');

    const normalizedPrice = originalPrice ? Number(originalPrice) : 0;
    const normalizedCredits = typeof creditsPerUnit === 'number' ? creditsPerUnit : (creditsPerUnit ? Number(creditsPerUnit) : 0);

    const baseData: any = {
      id: createId(),
      name,
      description,
      clinicId,
      price: normalizedPrice,
      category,
      isActive: true,
      doctorId: session.user.id,
      confirmationUrl: confirmationUrl ?? null,
      imageUrl: imageUrl ?? null,
      priority: typeof priority === 'number' ? priority : (priority != null ? Number(priority) : 0),
    };

    // Attach creditsPerUnit initially
    let dataWithCredits: any = { ...baseData, creditsPerUnit: normalizedCredits };

    // If creating a subscription product, attach subscription fields
    if (type === 'SUBSCRIPTION') {
      dataWithCredits = {
        ...dataWithCredits,
        type: 'SUBSCRIPTION',
        interval: interval ?? 'MONTH',
        intervalCount: typeof intervalCount === 'number' ? intervalCount : (intervalCount != null ? Number(intervalCount) : 1),
        trialDays: typeof trialDays === 'number' ? trialDays : (trialDays != null ? Number(trialDays) : null),
        autoRenew: typeof autoRenew === 'boolean' ? autoRenew : true,
      };
    } else {
      // Ensure explicit PRODUCT type if provided
      if (type === 'PRODUCT') {
        dataWithCredits.type = 'PRODUCT';
      }
    }
    console.log('📦 [POST /api/products] Prepared data (with creditsPerUnit):', dataWithCredits);

    let product;
    try {
      product = await prisma.product.create({ data: dataWithCredits });
    } catch (e: any) {
      const message = e?.message || String(e);
      console.error('❌ Prisma create failed:', message);
      if (message.includes('Unknown argument `creditsPerUnit`')) {
        console.warn('⚠️ Retrying without creditsPerUnit due to unknown argument error. This suggests Prisma Client or DB is out-of-sync.');
        console.log('🧪 [POST /api/products] Prepared data (without creditsPerUnit):', baseData);
        product = await prisma.product.create({ data: baseData });
      } else {
        throw e;
      }
    }

    // Insert pivot links if categoryIds provided
    if (Array.isArray(categoryIds) && categoryIds.length > 0) {
      const valid = await prisma.productCategory.findMany({
        where: {
          id: { in: categoryIds },
          OR: [{ doctorId: session.user.id }, { doctorId: null }],
          isActive: true
        },
        select: { id: true }
      });
      const validSet = new Set(valid.map((c) => c.id));
      const filtered = categoryIds.filter((id: string) => validSet.has(id));
      if (filtered.length > 0) {
        await prisma.categoriesOnProducts.createMany({
          data: filtered.map((cid: string) => ({ productId: product.id, categoryId: cid }))
        });
      }
    }

    // Retornar no formato esperado pelo frontend
    // Re-fetch with categories
    const createdWithCategories = await prisma.product.findFirst({
      where: { id: product.id },
      include: { 
        categories: { include: { category: true } },
        productCategory: true // Manter a relação 1:N legada para compatibilidade
      }
    });

    // Extrair categorias da relação N:N
    const categories = (createdWithCategories as any)?.categories?.map((cp: any) => ({
      id: cp.category.id,
      name: cp.category.name
    })) || [];
    
    // Adicionar categoria legada se existir e não estiver já nas categorias
    if ((createdWithCategories as any)?.productCategory && 
        !categories.some((c: any) => c.id === (createdWithCategories as any).productCategory.id)) {
      categories.push({
        id: (createdWithCategories as any).productCategory.id,
        name: (createdWithCategories as any).productCategory.name
      });
    }
    
    const transformedProduct = {
      ...createdWithCategories,
      brand: null,
      imageUrl: (createdWithCategories as any)?.imageUrl ?? null,
      originalPrice: (createdWithCategories as any)?.price != null ? Number((createdWithCategories as any).price) : null,
      discountPrice: null,
      discountPercentage: null,
      purchaseUrl: null,
      usageStats: 0,
      doctorId: session.user.id,
      creditsPerUnit: (createdWithCategories as any)?.creditsPerUnit != null ? Number((createdWithCategories as any).creditsPerUnit) : null,
      categories,
      categoryIds: categories.map((c: any) => c.id)
    };

    return NextResponse.json(transformedProduct, { status: 201 });
  } catch (error) {
    console.error('❌ Error creating product:', error);
    return NextResponse.json({ error: 'Erro ao criar produto', details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
} 