import { NextResponse } from 'next/server';
import { pagarmeGetOrder } from '@/lib/pagarme';
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
        return NextResponse.json({ success: true, provider: 'APPMAX', normalized });
      }
    } catch {}

    // KRXLabs (Pagar.me) subscription branch: ids like sub_*
    if (id.startsWith('sub_')) {
      // Try DB payment_transactions first (webhooks or persistence may have created a row)
      try {
        const tx = await prisma.paymentTransaction.findFirst({
          where: { provider: 'pagarme' as any, OR: [ { providerOrderId: String(id) }, { providerChargeId: String(id) } ] },
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
          const normalized = {
            provider: 'KRXPAY',
            status: tx.status,
            amount_minor: Number(tx.amountCents || 0),
            currency: (typeof tx.currency === 'string' && tx.currency.trim() ? tx.currency.toUpperCase() : 'BRL'),
            installments: Number(tx.installments || 1),
            order_id: tx.providerOrderId || id,
            charge_id: tx.providerChargeId || null,
          } as any;
          return NextResponse.json({ success: true, provider: 'KRXPAY', normalized });
        }
      } catch {}
      // Fallback: check customer_subscriptions table
      try {
        const rows = await prisma.$queryRawUnsafe<any[]>(
          `SELECT status, current_period_start, current_period_end, customer_id, product_id
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
            amount_minor: null,
            currency: 'BRL',
            installments: 1,
            order_id: id,
            charge_id: null,
            billing_period_start: r.current_period_start || null,
            billing_period_end: r.current_period_end || null,
          } as any;
          return NextResponse.json({ success: true, provider: 'KRXPAY', normalized });
        }
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
