import { NextResponse } from 'next/server';
import { pagarmeGetOrder, pagarmeGetSubscription } from '@/lib/payments/pagarme/sdk';
import { prisma } from '@/lib/prisma';
import Stripe from 'stripe';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 });

    // Stripe branch: allow querying PaymentIntent status for ids pi_...
    if (id.startsWith('pi_')) {
      // Try DB first
      try {
        const tx = await prisma.paymentTransaction.findFirst({
          where: { provider: 'stripe', providerOrderId: String(id) },
          select: {
            provider: true,
            status: true,
            amountCents: true,
            currency: true,
            installments: true,
            providerOrderId: true,
            providerChargeId: true,
            rawPayload: true,
          },
        });
        if (tx) {
          const normalized = {
            provider: tx.provider,
            status: tx.status,
            amount_minor: Number(tx.amountCents || 0),
            currency: (typeof tx.currency === 'string' && tx.currency.trim() ? tx.currency.toUpperCase() : null),
            installments: Number(tx.installments || 1),
            order_id: tx.providerOrderId || id,
            charge_id: tx.providerChargeId || null,
            buyer: (tx.rawPayload as any)?.buyer || null,
          } as any;
          return NextResponse.json({ success: true, provider: 'STRIPE', normalized });
        }
      } catch {}
      // Query Stripe across active integrations until one succeeds
      try {
        const integrations = await prisma.merchantIntegration.findMany({
          where: { provider: 'STRIPE' as any, isActive: true },
          select: { credentials: true },
        });
        for (const integ of integrations) {
          const creds = (integ.credentials || {}) as any;
          const apiKey: string | undefined = creds?.apiKey;
          const accountId: string | undefined = creds?.accountId || undefined;
          if (!apiKey) continue;
          try {
            const stripe = new Stripe(apiKey);
            const pi = await stripe.paymentIntents.retrieve(String(id), accountId ? { stripeAccount: accountId } : undefined);
            // Expand charge for billing details when possible (best-effort)
            let charge: any = null;
            try {
              const expanded = await stripe.paymentIntents.retrieve(String(id), accountId ? ({ expand: ['latest_charge'], stripeAccount: accountId } as any) : ({ expand: ['latest_charge'] } as any));
              charge = (expanded as any)?.latest_charge || null;
            } catch {}
            const normalized = {
              provider: 'STRIPE',
              status: String(pi.status || ''),
              amount_minor: Number(pi.amount || 0),
              currency: String(pi.currency || 'usd').toUpperCase(),
              installments: 1,
              order_id: String(pi.id),
              charge_id: (typeof charge === 'object' && charge && charge.id) ? String(charge.id) : null,
              buyer: {
                name: (charge && (charge as any).billing_details?.name) || null,
                email: (charge && (charge as any).billing_details?.email) || null,
              },
            } as any;
            return NextResponse.json({ success: true, provider: 'STRIPE', normalized });
          } catch {}
        }
      } catch {}
      // Not found anywhere
      return NextResponse.json({ error: 'Stripe PaymentIntent not found' }, { status: 404 });
    }

    // Appmax branch: check our DB first (we persist provider_order_id as the Appmax order id)
    try {
      const txAppmax = await prisma.paymentTransaction.findFirst({
        where: { provider: 'appmax' as any, OR: [ { providerOrderId: String(id) }, { providerChargeId: String(id) } ] },
        select: {
          provider: true,
          status: true,
          amountCents: true,
          currency: true,
          installments: true,
          providerOrderId: true,
          providerChargeId: true,
          rawPayload: true,
        },
      } as any)
      if (txAppmax) {
        const normalized = {
          provider: 'APPMAX',
          status: txAppmax.status,
          amount_minor: Number(txAppmax.amountCents || 0),
          currency: (typeof txAppmax.currency === 'string' && txAppmax.currency.trim() ? txAppmax.currency.toUpperCase() : 'BRL'),
          installments: Number(txAppmax.installments || 1),
          order_id: txAppmax.providerOrderId || id,
          charge_id: txAppmax.providerChargeId || null,
          buyer: {
            name: (txAppmax.rawPayload as any)?.data?.customer?.firstname || null,
            email: (txAppmax.rawPayload as any)?.data?.customer?.email || null,
          },
        } as any;
        // Include payment_status/order_status for polling and PIX data for modal refresh
        const payment_status = String(normalized.status || '').toLowerCase();
        const order_status = payment_status;
        // Extract PIX from rawPayload (AppMax stores at payResp.data.pix_qrcode, pix_emv, etc)
        // Map to frontend expectations: qr_code_url (image) and qr_code (EMV)
        const rp: any = (txAppmax as any)?.rawPayload || {};
        const payData: any = rp?.payResp?.data || rp?.data || {};
        const expiresAt = payData?.pix_expiration_date || payData?.pix_creation_date || null;
        const expiresIn = expiresAt ? Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)) : 0;
        const pix = (payData?.pix_qrcode || payData?.pix_emv) ? {
          qr_code_url: payData?.pix_qrcode ? `data:image/png;base64,${payData.pix_qrcode}` : null,
          qr_code: payData?.pix_emv || null,
          expires_at: expiresAt,
          expires_in: expiresIn,
        } : null;
        return NextResponse.json({ success: true, provider: 'APPMAX', payment_status, order_status, normalized, ...(pix ? { pix } : {}) });
      }
    } catch {}

    // KRXLabs (Pagar.me) subscription branch: ids like sub_*
    if (id.startsWith('sub_')) {
      // Try DB payment_transactions first (webhooks or persistence may have created a row)
      try {
        const rows = await prisma.$queryRawUnsafe<any[]>(
          `SELECT provider, status, amount_cents, currency, installments, provider_order_id, provider_charge_id
             FROM payment_transactions
            WHERE provider = 'pagarme' AND (provider_order_id = $1 OR provider_charge_id = $1)
            ORDER BY updated_at DESC, created_at DESC
            LIMIT 1`,
          String(id)
        );
        const tx = rows && rows[0] ? rows[0] : null;
        // If we have a tx but it's not terminal, see if the subscription table already confirms ACTIVE/TRIAL
        if (tx) {
          const txStatus = String(tx.status || '').toLowerCase();
          const isTerminal = txStatus === 'paid' || txStatus === 'succeeded' || txStatus === 'authorized' || txStatus === 'captured';
          if (!isTerminal) {
            try {
              const srows = await prisma.$queryRawUnsafe<any[]>(
                `SELECT status, price_cents, currency, current_period_start, current_period_end
                   FROM customer_subscriptions
                  WHERE provider_subscription_id = $1
                  LIMIT 1`,
                String(id)
              );
              const sub = srows && srows[0] ? srows[0] : null;
              const subStatus = String(sub?.status || '').toUpperCase();
              const isOk = subStatus === 'ACTIVE' || subStatus === 'TRIAL';
              if (isOk) {
                const normalized = {
                  provider: 'KRXPAY',
                  status: 'active',
                  amount_minor: Number(sub?.price_cents || tx.amount_cents || 0) || null,
                  currency: String((sub?.currency || tx.currency || 'BRL')).toUpperCase(),
                  installments: Number(tx.installments || 1),
                  order_id: tx.provider_order_id || id,
                  charge_id: tx.provider_charge_id || null,
                  billing_period_start: sub?.current_period_start || null,
                  billing_period_end: sub?.current_period_end || null,
                } as any;
                try {
                  console.log('[checkout][status] subscription prefers customer_subscriptions', { id, tx_status: txStatus, sub_status: subStatus, amount: normalized.amount_minor, currency: normalized.currency });
                } catch {}
                return NextResponse.json({ success: true, provider: 'KRXPAY', normalized });
              }
            } catch {}
          }
          // Default: return tx as-is
          const normalized = {
            provider: 'KRXPAY',
            status: String(tx.status || ''),
            amount_minor: Number(tx.amount_cents || 0),
            currency: (typeof tx.currency === 'string' && tx.currency.trim() ? tx.currency.toUpperCase() : 'BRL'),
            installments: Number(tx.installments || 1),
            order_id: tx.provider_order_id || id,
            charge_id: tx.provider_charge_id || null,
          } as any;
          try {
            console.log('[checkout][status] subscription from payment_transactions', { 
              id, 
              status: normalized.status, 
              amount: normalized.amount_minor, 
              currency: normalized.currency,
              provider_order_id: tx.provider_order_id,
              provider_charge_id: tx.provider_charge_id
            });
          } catch {}
          return NextResponse.json({ success: true, provider: 'KRXPAY', normalized });
        }
      } catch (e) {
        try { console.warn('[checkout][status] payment_transactions query failed', { id, error: (e as any)?.message }); } catch {}
      }
      // Fallback: check customer_subscriptions table
      try {
        const rows = await prisma.$queryRawUnsafe<any[]>(
          `SELECT status,
                  current_period_start,
                  current_period_end,
                  customer_id,
                  product_id,
                  price_cents,
                  currency
             FROM customer_subscriptions
            WHERE provider_subscription_id = $1
            LIMIT 1`,
          String(id)
        ).catch(() => []);
        const r = rows && rows[0] ? rows[0] : null;
        if (r) {
          const normalized = {
            provider: 'KRXPAY',
            status: String(r.status || 'ACTIVE'),
            amount_minor: Number(r.price_cents || 0) || null,
            currency: String(r.currency || 'BRL').toUpperCase(),
            installments: 1,
            order_id: id,
            charge_id: null,
            billing_period_start: r.current_period_start || null,
            billing_period_end: r.current_period_end || null,
          } as any;
          return NextResponse.json({ success: true, provider: 'KRXPAY', normalized });
        }
      } catch {}
      // Final fallback: fetch subscription directly from Pagar.me to populate success page
      try {
        const sub = await pagarmeGetSubscription(String(id));
        const amountMinor = (() => {
          const item = Array.isArray(sub?.items) ? sub.items[0] : null;
          const ps = item?.pricing_scheme || item?.pricingScheme || null;
          const price = (ps && (ps.price ?? ps.unit_price ?? ps.unitPrice)) ?? sub?.plan?.amount ?? sub?.amount;
          const n = Number(price);
          return Number.isFinite(n) ? n : null;
        })();
        const currency = String(sub?.currency || 'BRL').toUpperCase();
        const normalized = {
          provider: 'KRXPAY',
          status: String(sub?.status || ''),
          amount_minor: amountMinor,
          currency,
          installments: 1,
          order_id: String(id),
          charge_id: (Array.isArray(sub?.charges) && sub.charges[0]?.id) ? String(sub.charges[0].id) : null,
          billing_period_start: sub?.current_period?.start_at || sub?.current_period_start || null,
          billing_period_end: sub?.current_period?.end_at || sub?.current_period_end || null,
        } as any;
        return NextResponse.json({ success: true, provider: 'KRXPAY', normalized });
      } catch {}
      // Not found
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    const order = await pagarmeGetOrder(id);
    console.log('[checkout][status] order details', {
      id: order?.id,
      status: order?.status,
      metadata: order?.metadata || null,
      items: order?.items?.map((item: any) => ({
        id: item?.id,
        code: item?.code,
        description: item?.description,
        amount: item?.amount,
        metadata: item?.metadata || null
      })),
      charges: order?.charges?.map((ch: any) => ({
        id: ch?.id,
        status: ch?.status,
        amount: ch?.amount,
        paid_amount: ch?.paid_amount
      }))
    });
    
    const pay = Array.isArray(order?.payments) ? order.payments[0] : null;
    const tx = pay?.last_transaction || pay?.transaction || null;

    const pix = pay?.payment_method === 'pix' ? {
      qr_code_url: tx?.qr_code_url || null,
      qr_code: tx?.qr_code || null,
      status: tx?.status || pay?.status || order?.status || null,
      expires_in: pay?.pix?.expires_in ?? null,
      expires_at: pay?.pix?.expires_at ?? null,
    } : null;

    // Try to include normalized fields from our DB payment_transactions (single source of truth)
    let normalized: any = null;
    try {
      const tx = await prisma.paymentTransaction.findFirst({
        where: {
          OR: [
            { providerOrderId: String(id) },
            { providerChargeId: String(id) },
          ],
        },
        select: {
          provider: true,
          status: true,
          amountCents: true,
          currency: true,
          installments: true,
          providerOrderId: true,
          providerChargeId: true,
        },
      });
      if (tx) {
        normalized = {
          provider: tx.provider,
          status: tx.status,
          amount_minor: Number(tx.amountCents || 0),
          currency: (typeof tx.currency === 'string' && tx.currency.trim() ? tx.currency.toUpperCase() : null),
          installments: Number(tx.installments || 1),
          order_id: tx.providerOrderId || id,
          charge_id: tx.providerChargeId || null,
        };
      }
    } catch {}

    return NextResponse.json({ success: true, order_status: order?.status, payment_status: pay?.status, pix, order, normalized });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro ao consultar pedido' }, { status: Number(e?.status) || 500 });
  }
}
