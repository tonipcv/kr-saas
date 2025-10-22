import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { pagarmeGetRecipient } from '@/lib/pagarme';

// POST /api/payments/pagarme/recipient/set
// Body: { clinicId: string, recipientId: string, splitPercent?: number, platformFeeBps?: number, verify?: boolean }
// Sets the Merchant.recipientId for a clinic. Optionally verifies the recipient exists at provider.
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const isDev = process.env.NODE_ENV !== 'production';
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { clinicId, recipientId, splitPercent, platformFeeBps, verify } = await req.json();
    if (!clinicId) return NextResponse.json({ error: 'clinicId é obrigatório' }, { status: 400 });
    if (!recipientId) return NextResponse.json({ error: 'recipientId é obrigatório' }, { status: 400 });

    // Basic validation
    const rid = String(recipientId).trim();
    if (!/^re_[A-Za-z0-9]+$/.test(rid)) {
      return NextResponse.json({ error: 'recipientId inválido. Use um ID v5 iniciando com re_' }, { status: 400 });
    }

    // Authorization: ensure user is a member of this clinic
    const clinicMember = await prisma.clinicMember.findFirst({ where: { clinicId, userId: session.user.id } });
    if (!clinicMember) {
      return NextResponse.json({ error: 'Não autorizado para esta clínica' }, { status: 403 });
    }

    // Optional verification against provider
    let provider: any = null;
    if (verify !== false) {
      try {
        provider = await pagarmeGetRecipient(rid);
      } catch (e: any) {
        if (isDev) console.warn('[pagarme][recipient.set] provider verify failed', e?.message || e);
      }
      if (!provider || !provider.id) {
        return NextResponse.json({ error: 'Recipient não encontrado no provider (verifique o ambiente e o ID)' }, { status: 404 });
      }
    }

    // Ensure merchant row exists
    const existing = await prisma.merchant.upsert({
      where: { clinicId },
      update: {},
      create: { clinicId, status: 'PENDING' },
      select: { id: true },
    });

    const updated = await prisma.merchant.update({
      where: { clinicId },
      data: {
        recipientId: rid,
        splitPercent: typeof splitPercent === 'number' ? splitPercent : undefined,
        platformFeeBps: typeof platformFeeBps === 'number' ? platformFeeBps : undefined,
        status: 'ACTIVE',
        lastSyncAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true, merchant: updated, provider });
  } catch (e: any) {
    const diag = { message: e?.message, stack: e?.stack };
    console.error('[pagarme][recipient.set] error', diag);
    return NextResponse.json({ error: e?.message || 'Erro interno' }, { status: 500 });
  }
}
