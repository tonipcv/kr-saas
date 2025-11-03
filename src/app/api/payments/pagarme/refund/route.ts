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
    } catch (e: any) {
      // Fallback: POST /charges/{id}/refunds (útil para estorno parcial)
      const status = Number(e?.status) || undefined;
      const providerDetails = e?.responseJson || null;
      console.log('[refund] cancel failed, attempting POST refund', { chargeId, error: e instanceof Error ? e.message : e, status, providerDetails });
      try {
        result = await pagarmeRefundCharge(chargeId, amountCents);
        console.log('[refund] refund success', { chargeId, status: result?.status });
      } catch (e2: any) {
        const st = Number(e2?.status) || 400;
        const prov = e2?.responseJson || null;
        const text = e2?.responseText || '';
        console.error('[refund] final provider error', { status: st, provider: prov });
        // Map common 404 into a clear error message
        if (st === 404) {
          return NextResponse.json({ ok: false, error: 'Charge not found at provider', provider: prov || text }, { status: 404 });
        }
        const msg = e2?.message || 'Erro ao solicitar estorno';
        return NextResponse.json({ ok: false, error: msg, provider: prov || text, status: st }, { status: st });
      }
    }

    // Não alteramos DB aqui; deixamos os webhooks (charge.refunded/order.canceled) atualizarem o status.
    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    const status = Number(e?.status) || 400;
    const msg = e?.message || 'Erro ao solicitar estorno';
    const provider = e?.responseJson || e?.responseText || undefined;
    console.error('[refund] final error', { error: msg, status, provider });
    return NextResponse.json({ ok: false, error: msg, status, provider }, { status });
  }
}
