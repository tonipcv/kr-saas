import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    // Only allow DOCTOR or ADMIN
    const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
    if (!me || (me.role !== 'DOCTOR' && me.role !== 'ADMIN')) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    // Check if payment_transactions table exists
    const existsRows: any[] = await prisma.$queryRawUnsafe(
      "SELECT to_regclass('public.payment_transactions') IS NOT NULL as has_pt"
    ).catch(() => []);
    const hasPt = !!existsRows?.[0]?.has_pt;
    if (!hasPt) {
      return NextResponse.json({ ok: true, updated: 0, note: 'payment_transactions table not found; nothing to backfill' });
    }

    // Load mapping order_id -> amount_cents
    const rows: Array<{ provider_order_id: string; amount_cents: number }> = await prisma.$queryRawUnsafe(
      `SELECT provider_order_id, amount_cents
       FROM payment_transactions
       WHERE provider_order_id IS NOT NULL AND amount_cents IS NOT NULL`
    ).catch(() => [] as any);

    if (!rows || rows.length === 0) {
      return NextResponse.json({ ok: true, updated: 0, note: 'No payment transactions to backfill' });
    }

    let updated = 0;
    for (const r of rows) {
      const orderId = String(r.provider_order_id);
      const amount = Number(r.amount_cents) / 100;
      if (!orderId || !(amount > 0)) continue;
      try {
        const res = await prisma.purchase.updateMany({
          where: { externalIdempotencyKey: orderId },
          data: { unitPrice: amount as any, totalPrice: amount as any },
        });
        updated += res.count || 0;
      } catch {}
    }

    return NextResponse.json({ ok: true, updated });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro ao backfill de compras' }, { status: 500 });
  }
}
