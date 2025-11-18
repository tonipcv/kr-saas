import { NextResponse } from 'next/server';
import { pagarmeCancelCharge, pagarmeRefundCharge, pagarmeGetCharge } from '@/lib/payments/pagarme/sdk';

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

    // Diagnostics: environment snapshot (non-sensitive)
    const baseUrl = process.env.PAGARME_BASE_URL || 'https://api.pagar.me/1';
    const accountPresent = !!process.env.PAGARME_ACCOUNT_ID;
    try {
      console.log('[refund][diag] env', { baseUrl, accountHeader: accountPresent ? 'present' : 'absent' });
    } catch {}

    // Pre-flight: verify charge exists in provider with current credentials
    try {
      const ch = await pagarmeGetCharge(chargeId);
      try { console.log('[refund][diag] provider charge found', { id: ch?.id, status: ch?.status, order_id: ch?.order?.id }); } catch {}
    } catch (pre: any) {
      const st = Number(pre?.status) || 404;
      const prov = pre?.responseJson || pre?.responseText;
      console.warn('[refund][diag] preflight GET charge failed', { status: st, provider: prov });
      if (st === 404) {
        return NextResponse.json({
          ok: false,
          error: 'Charge not found at provider',
          hint: 'Verifique PAGARME_BASE_URL (v5), PAGARME_API_KEY e X-PagarMe-Account-Id (se usar subconta) neste ambiente',
          provider: prov
        }, { status: 404 });
      }
      // Non-404 errors fall-through to try refund anyway
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
