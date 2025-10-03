import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { emitEvent } from '@/lib/events';
import { EventActor, EventType } from '@prisma/client';
import crypto from 'crypto';
import { pagarmeCreateOrder, pagarmeGetOrder, isV5 } from '@/lib/pagarme';

function onlyDigits(s: string) { return (s || '').replace(/\D/g, ''); }

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { productId, slug, buyer, payment, amountCents: amountCentsFromClient, productName } = body || {};

    if (!productId) return NextResponse.json({ error: 'productId é obrigatório' }, { status: 400 });
    if (!buyer?.name || !buyer?.email || !buyer?.phone) return NextResponse.json({ error: 'Dados do comprador incompletos' }, { status: 400 });
    if (!payment?.method || !['pix', 'card'].includes(payment.method)) return NextResponse.json({ error: 'Forma de pagamento inválida' }, { status: 400 });

    let product: any = null;
    let clinic: any = null;
    let merchant: any = null;
    let amountCents = 0;
    try {
      // Load product
      product = await prisma.products.findUnique({ where: { id: String(productId) } });
      if (!product) return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 });
      // Resolve clinic
      if (slug) {
        clinic = await prisma.clinic.findFirst({ where: { slug: String(slug) } });
      }
      if (!clinic && product?.clinicId) {
        clinic = await prisma.clinic.findUnique({ where: { id: product.clinicId } });
      }
      if (!clinic) return NextResponse.json({ error: 'Clínica não encontrada para este produto' }, { status: 400 });
      merchant = await prisma.merchant.findUnique({ where: { clinicId: clinic.id } });
      // Price from DB
      const price = Number(product?.price as any);
      amountCents = Math.round((price || 0) * 100);
    } catch (dbErr: any) {
      // Prisma P1001 (cannot reach DB)
      if (dbErr?.code === 'P1001') {
        if (!amountCentsFromClient || !productName) {
          return NextResponse.json({ error: 'Banco de dados indisponível. Informe amountCents e productName para prosseguir sem DB.' }, { status: 503 });
        }
        amountCents = Number(amountCentsFromClient) || 0;
      } else {
        throw dbErr;
      }
    }

    if (!amountCents || amountCents <= 0) return NextResponse.json({ error: 'Preço inválido' }, { status: 400 });

    // Build customer
    const phoneDigits = onlyDigits(String(buyer.phone));
    let ddd = phoneDigits.slice(0, 2), number = phoneDigits.slice(2);
    if (phoneDigits.startsWith('55') && phoneDigits.length >= 12) { ddd = phoneDigits.slice(2, 4); number = phoneDigits.slice(4); }

    const phoneObj = {
      country_code: '55',
      area_code: ddd,
      number,
    };
    // Try to infer client IP for antifraud/device
    const forwarded = (req.headers as any).get?.('x-forwarded-for') || undefined as any;
    const clientIp = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : undefined;

    // Build billing/address from buyer or defaults (helps antifraud)
    const addr = (buyer as any)?.address || {};
    const billingAddr = {
      line_1: `${addr.street || 'Av. Paulista'}, ${addr.number || '1000'}`,
      zip_code: String(addr.zip_code || '01310200').replace(/\D/g, ''),
      city: String(addr.city || 'São Paulo'),
      state: String(addr.state || 'SP'),
      country: String(addr.country || 'BR'),
    };

    const customer: any = {
      name: buyer.name,
      email: buyer.email,
      document: onlyDigits(String(buyer.document || '')) || undefined,
      type: (onlyDigits(String(buyer.document || '')).length > 11) ? 'company' : 'individual',
      phones: {
        mobile_phone: phoneObj,
      },
      address: billingAddr,
      metadata: {},
    };

    // Items (v5 requires a code for some gateways)
    const itemCode = String((product as any)?.code || product?.id || productId || 'prod_checkout');
    
    // Ensure we have product data for metadata
    const productData = {
      name: product?.name || productName || 'Produto',
      imageUrl: (product as any)?.imageUrl || (product as any)?.image_url || (product as any)?.image || null,
      priceCents: amountCents,
      id: productId
    };
    
    console.log('[checkout][create] product data for order', productData);
    
    const items = [{
      code: itemCode,
      type: 'product',
      amount: amountCents,
      quantity: 1,
      description: productData.name,
      metadata: productData
    }];
    
    // Log the final items payload
    console.log('[checkout][create] order items payload', JSON.stringify(items));

    // Payments (v5)
    let payments: any[] = [];
    if (payment.method === 'pix') {
      const clientExpires = Number((payment?.pix?.expires_in ?? payment?.pixExpiresIn));
      const expires_in = Number.isFinite(clientExpires) && clientExpires > 0 ? Math.floor(clientExpires) : 1800; // 30 min padrão
      payments = [{ amount: amountCents, payment_method: 'pix', pix: { expires_in } }];
    } else if (payment.method === 'card') {
      const cc = payment.card || {};
      if (!cc.number || !cc.holder_name || !cc.exp_month || !cc.exp_year || !cc.cvv) {
        return NextResponse.json({ error: 'Dados do cartão incompletos' }, { status: 400 });
      }
      const installments = Math.max(1, Math.min(12, Number(payment.installments || 1)));
      payments = [{
        amount: amountCents,
        payment_method: 'credit_card',
        credit_card: {
          installments,
          operation_type: 'auth_and_capture',
          card: {
            number: String(cc.number).replace(/\s+/g, ''),
            holder_name: cc.holder_name,
            exp_month: Number(cc.exp_month),
            exp_year: (() => { const y = Number(cc.exp_year); return y < 100 ? 2000 + y : y; })(),
            cvv: String(cc.cvv),
            billing_address: billingAddr,
          }
        },
        device: clientIp ? { ip: clientIp } : undefined,
      }];
    }

    // Recipient split (optional): for MVP, we let full amount to clinic recipient when known
    const payload: any = {
      customer,
      items,
      payments,
      // TODO: add split rules when merchant is known
    };

    if (!isV5()) {
      return NextResponse.json({ error: 'Pagar.me v5 não configurado no ambiente' }, { status: 400 });
    }

    let order = await pagarmeCreateOrder(payload);

    // Try to extract payment link or relevant info
    let payment_url: string | null = null;
    let pix: any = null;
    let card: any = null;
    try {
      // Prefer charges[0].last_transaction for PIX info
      let ch = Array.isArray(order?.charges) ? order.charges[0] : null;
      let tx = ch?.last_transaction || null;
      // Fallback to payments if needed
      let pay = Array.isArray(order?.payments) ? order.payments[0] : null;
      if (!tx) tx = pay?.last_transaction || pay?.transaction || null;
      // If transaction is not yet available, refetch order once
      if (!tx) {
        for (let i = 0; i < 3 && !tx; i++) {
          try {
            await new Promise(r => setTimeout(r, 400));
            const refreshed = await pagarmeGetOrder(order?.id);
            order = refreshed || order;
            ch = Array.isArray(order?.charges) ? order.charges[0] : ch;
            tx = ch?.last_transaction || tx;
            if (!tx) {
              pay = Array.isArray(order?.payments) ? order.payments[0] : pay;
              tx = pay?.last_transaction || pay?.transaction || tx;
            }
          } catch {}
        }
      }
      payment_url = tx?.qr_code_url || tx?.gateway_reference || tx?.url || null;
      if (payment?.method === 'pix') {
        pix = {
          qr_code_url: tx?.qr_code_url || null,
          qr_code: tx?.qr_code || null,
          expires_in: (typeof (payment?.pix?.expires_in ?? payment?.pixExpiresIn) === 'number' ? Number(payment?.pix?.expires_in ?? payment?.pixExpiresIn) : 1800),
          expires_at: tx?.expires_at ?? null,
        };
      }
      if (payment?.method === 'card') {
        const status = (tx?.status || pay?.status || ch?.status || order?.status || 'processing').toString().toLowerCase();
        const debugInfo = {
          transaction_id: tx?.id ?? null,
          status_reason: tx?.status_reason ?? null,
          acquirer_message: tx?.acquirer_message ?? null,
          acquirer_return_code: tx?.acquirer_return_code ?? null,
          authorization_code: tx?.authorization_code ?? null,
          gateway_response_code: (tx as any)?.gateway_response_code ?? null,
          gateway_response_message: (tx as any)?.gateway_response_message ?? null,
          antifraud_score: (tx as any)?.antifraud_score ?? null,
          operation_type: (tx as any)?.operation_type ?? null,
          charge_id: ch?.id ?? null,
        };
        card = {
          status,
          approved: status === 'paid' || status === 'approved' || status === 'authorized' || status === 'captured',
          authorization_code: tx?.authorization_code || null,
          acquirer_message: tx?.acquirer_message || tx?.status_reason || (status === 'processing' ? 'Processando pagamento' : null),
          acquirer_return_code: tx?.acquirer_return_code || null,
          tid: tx?.tid || tx?.id || null,
          nsu: tx?.nsu || null,
          amount: tx?.amount || ch?.amount || null,
          brand: tx?.card?.brand || null,
          last4: tx?.card?.last_four_digits || tx?.card?.last4 || null,
          soft_descriptor: tx?.soft_descriptor || null,
          debug: debugInfo,
        };
      }
    } catch {}

    // Persist Purchase when card is approved immediately
    try {
      const wasApproved = card && card.approved;
      if (wasApproved && order?.id && productId) {
        // Idempotency: avoid duplicate purchase for the same order
        const existing = await prisma.purchase.findFirst({ where: { externalIdempotencyKey: order.id } });
        if (!existing) {
          // Resolve clinic/doctor
          let clinic = null as any;
          try { clinic = await prisma.clinic.findFirst({ where: { slug }, select: { id: true, ownerId: true } }); } catch {}
          let doctorId: string | null = clinic?.ownerId || null;
          if (!doctorId) {
            // Fallback: product's doctor
            try {
              const prod = await prisma.products.findUnique({ where: { id: String(productId) }, select: { doctorId: true, clinicId: true } });
              doctorId = prod?.doctorId || null;
              if (!clinic && prod?.clinicId) clinic = await prisma.clinic.findUnique({ where: { id: prod.clinicId }, select: { id: true, ownerId: true } });
              if (!doctorId) doctorId = clinic?.ownerId || null;
            } catch {}
          }
          // Upsert patient by email (buyer)
          let patientId: string | null = null;
          try {
            if (buyer?.email) {
              const existingUser = await prisma.user.findUnique({ where: { email: String(buyer.email) } });
              if (existingUser) {
                patientId = existingUser.id;
              } else {
                const created = await prisma.user.create({ data: { id: crypto.randomUUID(), email: String(buyer.email), name: String(buyer.name || 'Cliente'), role: 'PATIENT' as any } });
                patientId = created.id;
              }
            }
          } catch {}
          // Create purchase if we have doctor and patient
          if (patientId && doctorId) {
            try {
              // Fetch product price and credits
              const prod = await prisma.products.findUnique({ where: { id: String(productId) }, select: { id: true, price: true, creditsPerUnit: true } });
              if (prod) {
                const created = await prisma.purchase.create({
                  data: {
                    userId: patientId,
                    doctorId,
                    productId: String(productId),
                    quantity: 1,
                    unitPrice: prod.price as any,
                    totalPrice: prod.price as any,
                    pointsAwarded: prod.creditsPerUnit as any,
                    status: 'COMPLETED',
                    externalIdempotencyKey: order.id,
                    notes: 'Checkout online (Pagar.me)'
                  }
                });

                // Emit events for analytics
                try {
                  if (clinic?.id) {
                    const value = Number(prod.price || 0);
                    const pts = Number(prod.creditsPerUnit || 0);
                    // Purchase made
                    await emitEvent({
                      eventId: `purchase_${created.id}`,
                      eventType: EventType.purchase_made,
                      actor: EventActor.clinic,
                      clinicId: clinic.id,
                      customerId: patientId,
                      timestamp: created.createdAt as any,
                      metadata: {
                        value,
                        currency: 'BRL',
                        items: [ { name: productData.name, categoria: (product as any)?.category || (product as any)?.productCategory?.name || 'outros', qty: 1, price: value } ],
                        channel: 'online',
                        purchase_id: created.id,
                        idempotency_key: order.id,
                      },
                    });
                    // Points earned
                    await emitEvent({
                      eventId: `points_${created.id}`,
                      eventType: EventType.points_earned,
                      actor: EventActor.customer,
                      clinicId: clinic.id,
                      customerId: patientId,
                      timestamp: created.createdAt as any,
                      metadata: { value: Math.round(pts), source: 'purchase', source_id: created.id },
                    });
                  }
                } catch (ee) {
                  console.error('[checkout][create] emit events failed', ee);
                }
              }
            } catch (e) {
              console.error('[checkout][create] failed to create Purchase', e);
            }
          }
        }
      }
    } catch (e) {
      console.error('[checkout][create] purchase-persist error', e);
    }

    const responsePayload = { success: true, order, order_id: order?.id, payment_method: payment?.method, payment_url, pix, card };
    try { console.log('[checkout][create] responding', { method: payment?.method, order_id: order?.id, card_status: card?.status, has_qr: !!pix?.qr_code_url || !!pix?.qr_code, acquirer_message: card?.acquirer_message, acquirer_return_code: card?.acquirer_return_code }); } catch {}
    return NextResponse.json(responsePayload);
  } catch (e: any) {
    console.error('[checkout][create] error', e);
    const status = Number(e?.status) || 500;
    return NextResponse.json({ error: e?.message || 'Erro interno', details: e?.responseJson || null }, { status });
  }
}
