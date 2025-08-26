import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/products - Listar produtos
export async function GET(request: Request) {
  try {
    console.log('🔍 Products API called');
    const { searchParams } = new URL(request.url);
    const userEmail = searchParams.get('userEmail');
    
    let session;
    if (userEmail) {
      console.log('📧 Using userEmail parameter:', userEmail);
      // Buscar usuário pelo email para casos especiais
      const user = await prisma.user.findUnique({
        where: { email: userEmail }
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
      where: { id: session.user.id }
    });

    console.log('👤 User found:', user ? { id: user.id, email: user.email, role: user.role } : 'null');

    if (!user || user.role !== 'DOCTOR') {
      console.log('❌ User is not a doctor or not found');
      return NextResponse.json({ error: 'Acesso negado. Apenas médicos podem visualizar produtos.' }, { status: 403 });
    }

    console.log('✅ User is a doctor, proceeding to fetch products');

    try {
      // Buscar produtos do médico atual
      const products = await prisma.products.findMany({
        where: {
          doctorId: session.user.id
        },
        include: {
          _count: {
            select: {
              protocol_products: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      console.log('📦 Products found:', products.length);

      // Transformar para o formato esperado pelo frontend
      const transformedProducts = products.map((product: any) => ({
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
        creditsPerUnit: product?.creditsPerUnit != null ? Number(product.creditsPerUnit) : null,
        _count: {
          protocolProducts: product._count?.protocol_products || 0
        }
      }));

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

    // Verificar se é médico
    const user = await prisma.user.findUnique({
      where: { id: session.user.id }
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
      category = 'Geral'
    } = body;

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
      price: normalizedPrice,
      category,
      isActive: true,
      doctorId: session.user.id,
    };

    // Attach creditsPerUnit initially
    const dataWithCredits = { ...baseData, creditsPerUnit: normalizedCredits };
    console.log('📦 [POST /api/products] Prepared data (with creditsPerUnit):', dataWithCredits);

    let product;
    try {
      product = await prisma.products.create({ data: dataWithCredits });
    } catch (e: any) {
      const message = e?.message || String(e);
      console.error('❌ Prisma create failed:', message);
      if (message.includes('Unknown argument `creditsPerUnit`')) {
        console.warn('⚠️ Retrying without creditsPerUnit due to unknown argument error. This suggests Prisma Client or DB is out-of-sync.');
        console.log('🧪 [POST /api/products] Prepared data (without creditsPerUnit):', baseData);
        product = await prisma.products.create({ data: baseData });
      } else {
        throw e;
      }
    }

    // Retornar no formato esperado pelo frontend
    const transformedProduct = {
      ...product,
      brand: null,
      imageUrl: (product as any)?.imageUrl ?? null,
      originalPrice: product?.price != null ? Number(product.price) : null,
      discountPrice: null,
      discountPercentage: null,
      purchaseUrl: null,
      usageStats: 0,
      doctorId: session.user.id,
      creditsPerUnit: (product as any)?.creditsPerUnit != null ? Number((product as any).creditsPerUnit) : null
    };

    return NextResponse.json(transformedProduct, { status: 201 });
  } catch (error) {
    console.error('❌ Error creating product:', error);
    return NextResponse.json({ error: 'Erro ao criar produto', details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
} 