import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { pagarmeGetRecipient } from '@/lib/payments/pagarme/sdk';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const clinicId = searchParams.get('clinicId');
    if (!clinicId) {
      return NextResponse.json({ error: 'clinicId é obrigatório' }, { status: 400 });
    }

    // Verify user is a member of clinic
    const clinicMember = await prisma.clinicMember.findFirst({
      where: { clinicId, userId: session.user.id, isActive: true },
    });
    if (!clinicMember) {
      return NextResponse.json({ error: 'Não autorizado para esta clínica' }, { status: 403 });
    }

    const merchant = await prisma.merchant.findUnique({
      where: { clinicId },
      select: { status: true, recipientId: true, splitPercent: true, platformFeeBps: true, lastSyncAt: true },
    });
    if (!merchant) {
      return NextResponse.json({
        connected: false,
        status: 'PENDING',
        recipientId: null,
        splitPercent: 100,
        platformFeeBps: 0,
        lastSyncAt: null,
      });
    }

    let details: any = undefined;
    if (merchant.recipientId) {
      try {
        const r = await pagarmeGetRecipient(merchant.recipientId);
        details = {
          name: r?.name || r?.register_information?.name || null,
          document: r?.document || r?.register_information?.document || null,
          type: r?.type || r?.register_information?.type || null,
          transfer_settings: r?.transfer_settings || null,
          bank_account: r?.default_bank_account || null,
          status: r?.status || null,
          payment_mode: r?.payment_mode || null,
          created_at: r?.created_at || null,
          updated_at: r?.updated_at || null,
        };
      } catch (e) {
        console.warn('[pagarme][status] recipient fetch failed', e);
      }
    }

    return NextResponse.json({
      connected: !!merchant.recipientId && merchant.status !== 'DISABLED',
      status: merchant.status,
      recipientId: merchant.recipientId,
      splitPercent: merchant.splitPercent,
      platformFeeBps: merchant.platformFeeBps,
      lastSyncAt: merchant.lastSyncAt ? merchant.lastSyncAt.toISOString() : null,
      details,
    });
  } catch (e) {
    console.error('[pagarme][status] error', e);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
