import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/patients/credits?ids=<comma separated userIds>
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const idsParam = searchParams.get('ids');
    if (!idsParam) {
      return NextResponse.json({ error: 'ids são obrigatórios' }, { status: 400 });
    }

    const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) {
      return NextResponse.json({ error: 'ids inválidos' }, { status: 400 });
    }

    // Group credits by userId, counting only credits not used
    const grouped = await prisma.referralCredit.groupBy({
      by: ['userId'],
      where: {
        userId: { in: ids },
        isUsed: false,
      },
      _sum: { amount: true },
    });

    const toNum = (v: any) => (v?.toNumber ? v.toNumber() : (typeof v === 'string' ? parseFloat(v) : Number(v || 0)));
    const map: Record<string, number> = {};
    for (const g of grouped) {
      map[g.userId] = toNum(g._sum?.amount) || 0;
    }

    // Ensure missing users return 0
    ids.forEach((id) => {
      if (map[id] === undefined) map[id] = 0;
    });

    return NextResponse.json({ balances: map });
  } catch (error) {
    console.error('Erro ao buscar créditos dos pacientes:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
