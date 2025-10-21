import { NextResponse } from 'next/server';
import { pagarmeCancelCharge, pagarmeRefundCharge } from '@/lib/pagarme';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const chargeId = String(body?.chargeId || '') as string;
    const amountCentsRaw = body?.amountCents;
    const amountCents = Number.isFinite(Number(amountCentsRaw)) && Number(amountCentsRaw) > 0 ? Math.floor(Number(amountCentsRaw)) : undefined;

    console.log('[refund] request received', { chargeId, amountCents });

    if (!chargeId) {
      return NextResponse.json({ ok: false, error: 'chargeId é obrigatório' }, { status: 400 });
    }

    let result: any = null;
    try {
      // Prefer DELETE /charges/{id} (Core v5). Cancela/estorna conforme o método.
      console.log('[refund] attempting DELETE cancel for charge', chargeId);
      result = await pagarmeCancelCharge(chargeId);
      console.log('[refund] cancel success', { chargeId, status: result?.status });
    } catch (e) {
      // Fallback: POST /charges/{id}/refunds (útil para estorno parcial)
      console.log('[refund] cancel failed, attempting POST refund', { chargeId, error: e instanceof Error ? e.message : e });
      result = await pagarmeRefundCharge(chargeId, amountCents);
      console.log('[refund] refund success', { chargeId, status: result?.status });
    }

    // Não alteramos DB aqui; deixamos os webhooks (charge.refunded/order.canceled) atualizarem o status.
    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    const msg = e?.message || 'Erro ao solicitar estorno';
    console.error('[refund] final error', { error: msg, stack: e?.stack });
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
