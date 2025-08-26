import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Public, patient-safe list of a doctor's active products
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ doctorId: string }> }
) {
  try {
    const { doctorId } = await params;

    if (!doctorId) {
      return NextResponse.json({ success: false, message: 'doctorId inválido' }, { status: 400 });
    }

    const products = await prisma.products.findMany({
      where: { doctorId, isActive: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        creditsPerUnit: true,
        category: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, data: products });
  } catch (err) {
    console.error('Erro ao listar produtos do médico:', err);
    return NextResponse.json({ success: false, message: 'Erro ao listar produtos' }, { status: 500 });
  }
}
