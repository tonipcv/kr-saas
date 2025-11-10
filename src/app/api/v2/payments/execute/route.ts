import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const PIX_OB_ENABLED = String(process.env.CHECKOUT_PIX_OB_ENABLED || '').toLowerCase() === 'true';
    if (!PIX_OB_ENABLED) {
      return NextResponse.json({ error: 'PIX Open Finance desativado' }, { status: 400 });
    }
    const body = await req.json().catch(() => ({} as any));
    const consentId: string | undefined = body?.consentId;
    const amount = body?.amount; // e.g. { currency: 'BRL', amount: '100.00' }
    const currency = body?.currency || amount?.currency || 'BRL';

    if (!consentId || amount == null) {
      return NextResponse.json({ error: 'Missing consentId or amount' }, { status: 400 });
    }

    const linaBase = process.env.LINAOB_BASE_URL || '';
    const cookieHeader = (req.headers as any).get?.('cookie') || '';
    const cookieMap = new Map<string, string>();
    try {
      cookieHeader.split(/;\s*/).forEach((p: string) => {
        if (!p) return; const idx = p.indexOf('='); if (idx === -1) return; const k = decodeURIComponent(p.slice(0, idx)); const v = decodeURIComponent(p.slice(idx + 1)); cookieMap.set(k, v);
      });
    } catch {}
    // Prefer Authorization header bearer; fallback to cookie ob_token
    const authz = (req.headers as any).get?.('authorization') || (req.headers as any).get?.('Authorization') || '';
    let accessToken: string | undefined;
    if (authz.toLowerCase().startsWith('bearer ')) accessToken = authz.slice(7).trim();
    if (!accessToken) {
      const tokenJson = cookieMap.get('ob_token');
      if (tokenJson) {
        let token: any = null; try { token = JSON.parse(tokenJson); } catch {}
        accessToken = token?.access_token;
      }
    }
    if (!linaBase || !accessToken) {
      return NextResponse.json({ error: 'Missing LINAOB_BASE_URL or access_token' }, { status: 500 });
    }

    const url = `${linaBase}/jsr/payments`;
    const fapiId = crypto.randomUUID();
    const idemKey = crypto.randomUUID();
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'x-fapi-interaction-id': fapiId,
        'x-idempotency-key': idemKey,
      },
      body: JSON.stringify({
        consentId,
        amount,
        remittanceInformation: body?.remittanceInformation || body?.remittance || undefined,
      }),
      cache: 'no-store',
    });

    const text = await resp.text();
    let json: any = {}; try { json = JSON.parse(text); } catch {}
    if (!resp.ok) {
      return NextResponse.json({ error: 'Payment execution failed', provider: json || text, statusCode: resp.status }, { status: resp.status || 500 });
    }

    const data = json?.data || json;
    const providerPaymentId: string | undefined = data?.paymentId || data?.id;
    const providerStatus: string | undefined = data?.status;
    const mappedStatus = providerStatus === 'ACCP' ? 'paid' : (providerStatus === 'RJCT' ? 'failed' : 'processing');
    // amount to cents
    const amountStr: string | undefined = amount?.amount || amount;
    const amountCents = typeof amountStr === 'string' ? Math.round(parseFloat(amountStr) * 100) : (typeof amount === 'number' ? Math.round(amount * 100) : 0);

    const deterministicId = `ob:${consentId}`;
    try {
      await prisma.paymentTransaction.upsert({
        where: { id: deterministicId },
        update: {
          status: mappedStatus,
          providerOrderId: providerPaymentId || consentId,
          amountCents: isNaN(amountCents) ? 0 : amountCents,
          currency,
          rawPayload: json,
        },
        create: {
          id: deterministicId,
          provider: 'open_banking',
          providerOrderId: providerPaymentId || consentId,
          paymentMethodType: 'pix_ob',
          amountCents: isNaN(amountCents) ? 0 : amountCents,
          currency,
          status: mappedStatus,
          rawPayload: json,
        },
      });
    } catch {}

    // Update consent status accordingly (best-effort)
    try {
      const consentStatus = providerStatus === 'ACCP' ? 'EXECUTED' : (providerStatus === 'RJCT' ? 'REJECTED' : providerStatus || null);
      await prisma.paymentConsent.update({
        where: { consentId },
        data: { status: consentStatus || undefined },
      }).catch(() => undefined);
    } catch {}

    return NextResponse.json({ ok: true, paymentId: providerPaymentId, status: providerStatus, fapiInteractionId: fapiId });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
