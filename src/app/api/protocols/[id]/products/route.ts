import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

// GET /api/protocols/[id]/products - Buscar produtos associados ao protocolo
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
    const protocolId = resolvedParams.id;

    // Verificar se é médico
    const user = await prisma.user.findUnique({
      where: { id: session.user.id }
    });

    if (!user || user.role !== 'DOCTOR') {
      return NextResponse.json({ error: 'Acesso negado. Apenas médicos podem visualizar produtos de protocolos.' }, { status: 403 });
    }

    // Verificar se o protocolo pertence ao médico
    const protocol = await prisma.protocol.findFirst({
      where: {
        id: protocolId,
        doctorId: session.user.id
      }
    });

    if (!protocol) {
      return NextResponse.json({ error: 'Protocolo não encontrado' }, { status: 404 });
    }

    const protocolProducts = await prisma.protocol_products.findMany({
      where: {
        protocolId: protocolId
      },
      include: {
        products: true
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    // Transformar para o formato esperado pelo frontend
    const transformedProducts = protocolProducts.map(pp => ({
      ...pp,
      product: pp.products
    }));

    return NextResponse.json(transformedProducts);
  } catch (error) {
    console.error('Error fetching protocol products:', error);
    return NextResponse.json({ error: 'Erro ao buscar produtos do protocolo' }, { status: 500 });
  }
}

// POST /api/protocols/[id]/products - Adicionar produto ao protocolo
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const protocolId = resolvedParams.id;
    
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Verificar se é médico
    const user = await prisma.user.findUnique({
      where: { id: session.user.id }
    });

    if (!user || user.role !== 'DOCTOR') {
      return NextResponse.json({ error: 'Acesso negado. Apenas médicos podem adicionar produtos a protocolos.' }, { status: 403 });
    }

    const body = await request.json();
    const { productId, quantity, instructions } = body;

    // Verificar se o protocolo pertence ao médico
    const protocol = await prisma.protocol.findFirst({
      where: {
        id: protocolId,
        doctorId: session.user.id
      }
    });

    if (!protocol) {
      return NextResponse.json({ error: 'Protocolo não encontrado' }, { status: 404 });
    }

    // Verificar se o produto pertence ao médico
    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        doctorId: session.user.id,
        isActive: true
      }
    });

    if (!product) {
      return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 });
    }

    // Verificar se a associação já existe
    const existingAssociation = await prisma.protocol_products.findUnique({
      where: {
        protocolId_productId: {
          protocolId: protocolId,
          productId: productId
        }
      }
    });

    if (existingAssociation) {
      return NextResponse.json({ error: 'Produto já está associado a este protocolo' }, { status: 400 });
    }

    // Gerar ID único
    const { createId } = await import('@paralleldrive/cuid2');

    const protocolProduct = await prisma.protocol_products.create({
      data: {
        id: createId(),
        protocolId: protocolId,
        productId: productId,
        quantity: quantity || 1,
        instructions: instructions || null
      },
      include: {
        products: true
      }
    });

    // Transformar para o formato esperado pelo frontend
    const transformedProduct = {
      ...protocolProduct,
      product: protocolProduct.products
    };

    return NextResponse.json(transformedProduct, { status: 201 });
  } catch (error) {
    console.error('Error adding product to protocol:', error);
    return NextResponse.json({ error: 'Erro ao adicionar produto ao protocolo' }, { status: 500 });
  }
}

// PUT /api/protocols/[id]/products - Atualizar produtos do protocolo
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const protocolId = resolvedParams.id;
    
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Verificar se é médico
    const user = await prisma.user.findUnique({
      where: { id: session.user.id }
    });

    if (!user || user.role !== 'DOCTOR') {
      return NextResponse.json({ error: 'Acesso negado. Apenas médicos podem atualizar produtos de protocolos.' }, { status: 403 });
    }

    const body = await request.json();
    const { products } = body;

    // Verificar se o protocolo pertence ao médico
    const protocol = await prisma.protocol.findFirst({
      where: {
        id: protocolId,
        doctorId: session.user.id
      }
    });

    if (!protocol) {
      return NextResponse.json({ error: 'Protocolo não encontrado' }, { status: 404 });
    }

    // Gerar ID único
    const { createId } = await import('@paralleldrive/cuid2');

    // Atualizar produtos em transação
    const updatedProducts = await prisma.$transaction(async (tx) => {
      // Remover associações existentes
      await tx.protocol_products.deleteMany({
        where: {
          protocolId: protocolId
        }
      });

      // Criar novas associações
      const newProducts = [];
      for (const productData of products) {
        const protocolProduct = await tx.protocol_products.create({
          data: {
            id: createId(),
            protocolId: protocolId,
            productId: productData.productId,
            quantity: productData.quantity || 1,
            instructions: productData.instructions || null
          },
          include: {
            products: true
          }
        });
        
        // Transformar para o formato esperado pelo frontend
        const transformedProduct = {
          ...protocolProduct,
          product: protocolProduct.products
        };
        
        newProducts.push(transformedProduct);
      }

      return newProducts;
    });

    return NextResponse.json(updatedProducts);
  } catch (error) {
    console.error('Error updating protocol products:', error);
    return NextResponse.json({ error: 'Erro ao atualizar produtos do protocolo' }, { status: 500 });
  }
} 