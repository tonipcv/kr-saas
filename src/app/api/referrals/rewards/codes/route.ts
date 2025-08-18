import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Utils
function randomCode(len: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem I, O, 0, 1 para evitar confusão
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// GET /api/referrals/rewards/codes?rewardId=...&status=UNUSED|USED
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const rewardId = searchParams.get('rewardId');
    const status = searchParams.get('status');

    if (!rewardId) {
      return NextResponse.json({ error: 'rewardId é obrigatório' }, { status: 400 });
    }

    // Ownership check
    const reward = await prisma.referralReward.findFirst({ where: { id: rewardId, doctorId: session.user.id } });
    if (!reward) {
      return NextResponse.json({ error: 'Recompensa não encontrada' }, { status: 404 });
    }

    const where: any = { rewardId };
    if (status === 'UNUSED' || status === 'USED') where.status = status;

    const codes = await prisma.referralRewardCode.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({ success: true, codes });
  } catch (err) {
    console.error('GET codes error', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST /api/referrals/rewards/codes
// Body:
// - rewardId: string
// - quantity: number (1-1000)
// - length?: number (default 6, 4-16)
// - prefix?: string (opcional, sem espaços)
// - codes?: string[] (opcional, insere códigos fornecidos manualmente)
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const { rewardId, quantity, length = 6, prefix = '', codes } = body || {};

    if (!rewardId) {
      return NextResponse.json({ error: 'rewardId é obrigatório' }, { status: 400 });
    }

    // Ownership check
    const reward = await prisma.referralReward.findFirst({ where: { id: rewardId, doctorId: session.user.id } });
    if (!reward) {
      return NextResponse.json({ error: 'Recompensa não encontrada' }, { status: 404 });
    }

    // Inserção manual de códigos
    if (Array.isArray(codes) && codes.length > 0) {
      const toInsert = codes
        .map((c: string) => String(c || '').trim().toUpperCase())
        .filter((c: string) => !!c);

      if (toInsert.length === 0) {
        return NextResponse.json({ error: 'Nenhum código válido informado' }, { status: 400 });
      }

      // createMany com skipDuplicates, unique(code)
      const result = await prisma.referralRewardCode.createMany({
        data: toInsert.map((c: string) => ({ rewardId, code: c })),
        skipDuplicates: true,
      });

      return NextResponse.json({ success: true, created: result.count });
    }

    // Geração em lote
    if (!quantity || typeof quantity !== 'number' || quantity < 1 || quantity > 1000) {
      return NextResponse.json({ error: 'quantity deve estar entre 1 e 1000' }, { status: 400 });
    }
    if (typeof length !== 'number' || length < 4 || length > 16) {
      return NextResponse.json({ error: 'length deve estar entre 4 e 16' }, { status: 400 });
    }
    if (typeof prefix !== 'string' || /\s/.test(prefix)) {
      return NextResponse.json({ error: 'prefix inválido (não use espaços)' }, { status: 400 });
    }

    const target = quantity;
    let created = 0;
    const maxIterations = quantity * 10; // evita loop infinito
    let iterations = 0;

    while (created < target && iterations < maxIterations) {
      iterations++;
      const batchSize = Math.min(100, target - created);
      const batch: { rewardId: string; code: string }[] = [];
      for (let i = 0; i < batchSize; i++) {
        const code = `${prefix ? prefix.toUpperCase() + '-' : ''}${randomCode(length)}`;
        batch.push({ rewardId, code });
      }

      const result = await prisma.referralRewardCode.createMany({ data: batch, skipDuplicates: true });
      created += result.count;
    }

    return NextResponse.json({ success: true, created });
  } catch (err) {
    console.error('POST codes error', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// DELETE /api/referrals/rewards/codes?codeId=...
// Só permite deletar códigos UNUSED
export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const codeId = searchParams.get('codeId');

    if (!codeId) {
      return NextResponse.json({ error: 'codeId é obrigatório' }, { status: 400 });
    }

    const code = await prisma.referralRewardCode.findUnique({
      where: { id: codeId },
      include: { reward: true },
    });
    if (!code || code.reward.doctorId !== session.user.id) {
      return NextResponse.json({ error: 'Código não encontrado' }, { status: 404 });
    }
    if (code.status !== 'UNUSED') {
      return NextResponse.json({ error: 'Não é possível deletar código já utilizado' }, { status: 400 });
    }

    await prisma.referralRewardCode.delete({ where: { id: codeId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE code error', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
