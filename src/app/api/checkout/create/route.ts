    // Helper: ensure doctor-patient relationship without relying on a DB unique constraint
    const ensureRelationship = async (patientId: string, doctorId: string) => {
      try {
        const rel = await prisma.doctorPatientRelationship.findFirst({ where: { patientId, doctorId }, select: { id: true } });
        if (rel?.id) {
          await prisma.doctorPatientRelationship.update({ where: { id: rel.id }, data: { isActive: true } });
        } else {
          await prisma.doctorPatientRelationship.create({ data: { patientId, doctorId, isActive: true } });
        }
      } catch (e) {
        // As a last resort, swallow to avoid blocking checkout
        try { console.warn('[checkout][create] ensureRelationship failed:', (e as any)?.message || e); } catch {}
      }
    };
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { emitEvent } from '@/lib/events';
import { EventActor, EventType } from '@prisma/client';
import crypto from 'crypto';
import { pagarmeCreateOrder, pagarmeGetOrder, isV5, pagarmeCreateCustomer, pagarmeCreateCustomerCard } from '@/lib/pagarme';
import { sendEmail } from '@/lib/email';
import { baseTemplate } from '@/email-templates/layouts/base';

function onlyDigits(s: string) { return (s || '').replace(/\D/g, ''); }

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { productId, slug, buyer, payment, amountCents: amountCentsFromClient, productName } = body || {};

    if (!productId) return NextResponse.json({ error: 'productId é obrigatório' }, { status: 400 });
    if (!buyer?.name || !buyer?.email || !buyer?.phone) return NextResponse.json({ error: 'Dados do comprador incompletos' }, { status: 400 });
    if (!payment?.method || !['pix', 'card'].includes(payment.method)) return NextResponse.json({ error: 'Forma de pagamento inválida' }, { status: 400 });
    const explicitSavedCardId: string | null = payment?.saved_card_id || null;
    const explicitProviderCustomerId: string | null = payment?.provider_customer_id || null;

    let product: any = null;
    let clinic: any = null;
    let merchant: any = null;
    let amountCents = 0;
    let doctorId: string | null = null;
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
      // Guard: only allow checkout when recipient is configured for clinic
      if (!merchant?.recipientId) {
        return NextResponse.json(
          { error: 'Clínica sem recebedor cadastrado. Pagamentos indisponíveis no momento.', code: 'MISSING_RECIPIENT' },
          { status: 400 }
        );
      }
      // Price from DB
      const price = Number(product?.price as any);
      amountCents = Math.round((price || 0) * 100);
      // Resolve doctorId early for persistence (prefer clinic owner, fallback to product.doctorId)
      doctorId = clinic?.ownerId || (product as any)?.doctorId || null;
    } catch (dbErr: any) {
      // DB unavailable or transient error: allow fallback when client provides amountCents and productName
      if (!amountCentsFromClient || !productName) {
        return NextResponse.json({ error: 'Banco de dados indisponível. Informe amountCents e productName para prosseguir sem DB.' }, { status: 503 });
      }
      amountCents = Number(amountCentsFromClient) || 0;
      try { console.warn('[checkout][create] DB error on product/clinic load, using client-provided amount as fallback:', dbErr?.code || dbErr?.message || String(dbErr)); } catch {}
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
      // Two paths: (A) explicit saved card, (B) raw card capture
      if (!explicitSavedCardId) {
        if (!cc.number || !cc.holder_name || !cc.exp_month || !cc.exp_year || !cc.cvv) {
          return NextResponse.json({ error: 'Dados do cartão incompletos' }, { status: 400 });
        }
      }
      const installments = Math.max(1, Math.min(12, Number(payment.installments || 1)));

      // Default raw-card payments (fallback)
      const fallbackPayments = [{
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

      // Attempt to create/reuse Pagar.me customer and save card to wallet
      let useSavedCard = false;
      // Path (A): explicit saved card provided by caller (UI)
      if (explicitSavedCardId) {
        payments = [{
          amount: amountCents,
          payment_method: 'credit_card',
          credit_card: {
            installments,
            operation_type: 'auth_and_capture',
            card_id: explicitSavedCardId,
          }
        }];
        useSavedCard = true;
      }
      // Hoisted profile id for card save flow persistence
      let profileIdForCardFlow: string | null = null;
      try {
        if (isV5() && !useSavedCard) {
          const customerPayload: any = {
            name: customer.name,
            email: customer.email,
            document: customer.document,
            type: customer.type,
            address: billingAddr,
            phones: customer.phones,
            metadata: { ...customer.metadata, source: 'checkout' },
          };
          const createdCustomer = await pagarmeCreateCustomer(customerPayload);
          const customerId = createdCustomer?.id;
          if (customerId) {
            // Persist PaymentCustomer (raw SQL table)
            try {
              // Resolve patient profile id (tenant-scoped) if possible
              let profileId: string | null = null;
              try {
                const u = buyer?.email ? await prisma.user.findUnique({ where: { email: String(buyer.email) }, select: { id: true } }) : null;
                if (u?.id && doctorId) {
                  const existingProfile = await prisma.patientProfile.findUnique({
                    where: { doctorId_userId: { doctorId: String(doctorId), userId: String(u.id) } },
                    select: { id: true }
                  }).catch(() => null as any);
                  profileId = existingProfile?.id || null;
                  await ensureRelationship(String(u.id), String(doctorId));
                }
              } catch {}
              // Fallback: try to infer patient id by email only
              if (!profileId && buyer?.email) {
                const u = await prisma.user.findUnique({ where: { email: String(buyer.email) }, select: { id: true } }).catch(() => null as any);
                if (u?.id && doctorId) {
                  try {
                    const createdProfile = await prisma.patientProfile.create({
                      data: { doctorId: String(doctorId), userId: String(u.id), name: String(buyer?.name || ''), phone: String(buyer?.phone || '') }
                    });
                    profileId = createdProfile.id;
                    await ensureRelationship(String(u.id), String(doctorId));
                  } catch {}
                }
              }
              // Save for later method persistence in this flow
              profileIdForCardFlow = profileId;
              if (doctorId && profileId) {
                const pcId = crypto.randomUUID();
                await prisma.$executeRawUnsafe(
                  `INSERT INTO payment_customers (id, provider, provider_customer_id, doctor_id, patient_profile_id, clinic_id)
                   VALUES ($1, 'pagarme', $2, $3, $4, $5)
                   ON CONFLICT (doctor_id, patient_profile_id, provider) DO UPDATE SET provider_customer_id = EXCLUDED.provider_customer_id, updated_at = NOW()`,
                  pcId, String(customerId), String(doctorId), String(profileId), clinic?.id ? String(clinic.id) : null
                );
              }
            } catch (e) {
              console.warn('[checkout][create] persist PaymentCustomer failed:', e instanceof Error ? e.message : e);
            }
            const cardPayload: any = {
              holder_name: cc.holder_name,
              exp_month: Number(cc.exp_month),
              exp_year: (() => { const y = Number(cc.exp_year); return y < 100 ? 2000 + y : y; })(),
              cvv: String(cc.cvv),
              number: String(cc.number).replace(/\s+/g, ''),
              billing_address: billingAddr,
              options: { verify_card: true },
            };
            const createdCard = await pagarmeCreateCustomerCard(customerId, cardPayload);
            const cardId = createdCard?.id || createdCard?.card?.id;
            if (cardId) {
              // Persist PaymentMethod (raw SQL)
              try {
                const brand = createdCard?.card?.brand || null;
                const last4 = createdCard?.card?.last_four_digits || createdCard?.card?.last4 || null;
                const expMonth = createdCard?.card?.exp_month || null;
                const expYear = createdCard?.card?.exp_year || null;
                // Find payment_customer row id (by doctor + profile)
                const row = await prisma.$queryRawUnsafe<any[]>(
                  `SELECT id FROM payment_customers WHERE doctor_id = $1 AND patient_profile_id = $2 AND provider = 'pagarme' LIMIT 1`,
                  String(doctorId), String(profileIdForCardFlow || '')
                ).catch(() => []);
                const paymentCustomerId = row?.[0]?.id || null;
                if (paymentCustomerId) {
                  const pmId = crypto.randomUUID();
                  await prisma.$executeRawUnsafe(
                    `INSERT INTO payment_methods (id, payment_customer_id, provider_card_id, brand, last4, exp_month, exp_year, is_default, status)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE')
                     ON CONFLICT (payment_customer_id, provider_card_id) DO UPDATE SET brand = EXCLUDED.brand, last4 = EXCLUDED.last4, exp_month = EXCLUDED.exp_month, exp_year = EXCLUDED.exp_year, updated_at = NOW()`,
                    pmId, String(paymentCustomerId), String(cardId), brand, last4, expMonth, expYear, true
                  );
                }
              } catch (e) {
                console.warn('[checkout][create] persist PaymentMethod failed:', e instanceof Error ? e.message : e);
              }
              payments = [{
                amount: amountCents,
                payment_method: 'credit_card',
                credit_card: {
                  installments,
                  operation_type: 'auth_and_capture',
                  card_id: cardId,
                }
              }];
              useSavedCard = true;
            }
          }
        }
      } catch (e) {
        // Do not break flow; fall back to raw card
        console.warn('[checkout][create] save-card flow failed, falling back to raw card:', e instanceof Error ? e.message : e);
      }

      // If split is enabled, avoid using saved card to prevent split restrictions with stored cards
      try {
        const ENABLE_SPLIT_FLAG = String(process.env.PAGARME_ENABLE_SPLIT || '').toLowerCase() === 'true';
        if (ENABLE_SPLIT_FLAG && !useSavedCard) {
          useSavedCard = false;
        }
      } catch {}

      if (!useSavedCard) {
        payments = fallbackPayments;
      }
    }

    // Apply recipient split when a clinic merchant recipient is available (behind feature flag)
    try {
      const ENABLE_SPLIT = String(process.env.PAGARME_ENABLE_SPLIT || '').toLowerCase() === 'true';
      const clinicRecipientId = merchant?.recipientId || null;
      const rawSplitPercent = typeof merchant?.splitPercent === 'number' ? merchant.splitPercent : null;
      // We'll prefer split at charges[].split for broader v5 compatibility
      let charges: any[] | null = null;
      if (ENABLE_SPLIT && clinicRecipientId && rawSplitPercent != null && Array.isArray(payments) && payments.length > 0) {
        // Temporary safeguard: enforce 100% to clinic if platform recipient/remainder is not configured
        let effectiveSplitPercent = Number(rawSplitPercent);
        if (effectiveSplitPercent !== 100) {
          console.warn('[checkout][create] splitPercent != 100 detected; overriding to 100% to avoid remainder issues without platform recipient');
          effectiveSplitPercent = 100;
        }
        const clinicAmount = Math.max(0, Math.min(Number(amountCents), Math.round(Number(amountCents) * (effectiveSplitPercent / 100)))) || 0;
        // Build split rules for Pagar.me v5 (core) using minimal compatible fields
        // Some accounts reject extra properties. Keep only required fields.
        const splitRules = clinicAmount > 0 ? [{
          recipient_id: String(clinicRecipientId),
          amount: clinicAmount,
          type: 'flat',
        }] : [] as any[];

        if (splitRules.length) {
          console.log('[checkout][create] applying split', { recipient_id: String(clinicRecipientId), amount: clinicAmount });
          // Convert payments to charges with split rules
          charges = payments.map((p: any) => {
            const base: any = { amount: p.amount, payment_method: p.payment_method, split: splitRules };
            if (p.credit_card) base.credit_card = p.credit_card;
            if (p.pix) base.pix = p.pix;
            if (p.device) base.device = p.device;
            return base;
          });
        }
      }
      // Expose charges in a scoped variable for payload construction
      (global as any).__charges_for_payload = (global as any).__charges_for_payload || null;
      (global as any).__charges_for_payload = charges;
    } catch (e) {
      console.warn('[checkout][create] split rules not applied:', e instanceof Error ? e.message : e);
    }

    // Recipient split (optional): for MVP, we let full amount to clinic recipient when known
    const scopedCharges = (global as any).__charges_for_payload as any[] | null;
    // Build payload; when using explicit saved card, still include identity fields (Pagarme may require name/email)
    const baseCustomer = (() => {
      const core: any = {
        name: customer?.name,
        email: customer?.email,
        document: customer?.document,
        type: customer?.type,
        address: billingAddr,
        phones: customer?.phones,
        metadata: { ...(customer?.metadata || {}), source: 'checkout' },
      };
      if (explicitSavedCardId && explicitProviderCustomerId) return { id: explicitProviderCustomerId, ...core };
      return { ...core };
    })();
    // userIdForProfile may not be defined at this point; use patientId fallback only
    const patientUserIdVal = String((typeof patientId !== 'undefined' && patientId) ? patientId : '');
    const payload: any = scopedCharges && scopedCharges.length ? {
      customer: baseCustomer,
      items,
      payments, // keep payments to satisfy API while using charges for split
      charges: scopedCharges,
      metadata: {
        clinicId: clinic?.id || null,
        buyerEmail: String(buyer?.email || customer?.email || ''),
        productId: String(product?.id || productId || ''),
        patientUserId: patientUserIdVal || null,
      }
    } : {
      customer: baseCustomer,
      items,
      payments,
      metadata: {
        clinicId: clinic?.id || null,
        buyerEmail: String(buyer?.email || customer?.email || ''),
        productId: String(product?.id || productId || ''),
        patientUserId: patientUserIdVal || null,
      }
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
        // Extra diagnostics if failed
        if (status === 'failed') {
          try {
            console.error('[checkout][create] card failed diagnostics', {
              order_id: order?.id,
              charge_id: ch?.id,
              tx_id: tx?.id,
              status_reason: debugInfo.status_reason,
              gateway_response_code: debugInfo.gateway_response_code,
              gateway_response_message: debugInfo.gateway_response_message,
              antifraud_score: debugInfo.antifraud_score,
              operation_type: debugInfo.operation_type,
              split_applied: String(process.env.PAGARME_ENABLE_SPLIT || '').toLowerCase() === 'true'
            });
          } catch {}
        }
      }
    } catch {}

    // Persist PaymentTransaction for both PIX and Card (processing status)
    try {
      // Resolve or create patient profile id
      let userIdForProfile: string | null = null;
      if (buyer?.email) {
        try {
          const u = await prisma.user.findUnique({ where: { email: String(buyer.email) }, select: { id: true } });
          userIdForProfile = u?.id || null;
        } catch {}
      }
      let profileId: string | null = null;
      if (doctorId && userIdForProfile) {
        try {
          const prof = await prisma.patientProfile.findUnique({ where: { doctorId_userId: { doctorId: String(doctorId), userId: String(userIdForProfile) } }, select: { id: true } });
          if (prof?.id) profileId = prof.id;
        } catch {}
      }
      if (doctorId && !userIdForProfile && buyer?.email) {
        // Create a minimal patient user to ensure PIX also logs transactions
        try {
          const created = await prisma.user.create({ data: { id: crypto.randomUUID(), email: String(buyer.email), name: String(buyer.name || 'Cliente'), role: 'PATIENT' as any } });
          userIdForProfile = created.id;
        } catch {}
      }
      if (doctorId && !profileId && userIdForProfile) {
        try {
          const createdProf = await prisma.patientProfile.create({ data: { doctorId: String(doctorId), userId: String(userIdForProfile), name: String(buyer?.name || ''), phone: String(buyer?.phone || '') } });
          profileId = createdProf.id;
          await ensureRelationship(String(userIdForProfile), String(doctorId));
        } catch {}
      }
      // Notify customer by email (non-blocking)
      try {
        const clinicNameStr = (clinic?.name as any) || 'Zuzz';
        const customerEmail = String(buyer?.email || customer?.email || '');
        const customerName = String(buyer?.name || customer?.name || '');
        const currency = 'BRL';
        const itemsForEmail = items.map((it: any) => ({ name: it.description || it.code || 'Item', qty: it.quantity || 1, price: it.amount }));
        const totalCents = Number(amountCents);
        const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(v / 100);

        if (customerEmail) {
          const ch = Array.isArray(order?.charges) ? order.charges[0] : null;
          const tx = ch?.last_transaction || null;
          const method = (tx?.payment_method || payment.method || '').toString();
          const chStatus = (ch?.status || '').toString();
          const txStatus = (tx?.status || '').toString();
          try { console.log('[checkout][email] status snapshot', { method, chStatus, txStatus, hasPix: !!(tx?.qr_code_url || tx?.qr_code) }); } catch {}

          // PIX generated: send QR/link email immediately
          if (method === 'pix') {
            const qr = tx?.qr_code_url || tx?.qr_code || null;
            const pixCopy = tx?.qr_code || null;
            const content = `
              <div style="font-size:16px; color:#111;">
                <p style="font-size:20px; font-weight:600; margin:0 0 12px;">PIX gerado</p>
                <p style="margin:0 0 8px;">${customerName ? `Olá ${customerName},` : 'Olá,'} seu PIX foi gerado para finalizar o pagamento.</p>
                <p style="margin:8px 0;">Valor: <strong>${fmt(totalCents)}</strong></p>
                ${qr ? `<p><a href="${qr}" target="_blank">Abrir QR Code do PIX</a></p>` : ''}
                ${pixCopy ? `<p style="word-break:break-all; font-size:12px; color:#444;">Copia e cola: ${pixCopy}</p>` : ''}
              </div>`;
            const html = baseTemplate({ content, clinicName: clinicNameStr });
            await sendEmail({ to: customerEmail, subject: `[${clinicNameStr}] PIX gerado`, html }).catch(() => {});
          }

          // Payment approved immediately (any method): send payment confirmed
          const paidNow = ['paid', 'approved', 'captured'].includes(chStatus)
            || ['paid', 'approved', 'captured'].includes(txStatus)
            || tx?.status === 'captured';
          if (paidNow) {
            try { console.log('[checkout][email] sending payment_confirmed (sync)'); } catch {}
            const itemsHtml = itemsForEmail.map((it: any) => `<tr><td style="padding:6px 0;">${it.name}</td><td style=\"padding:6px 0; text-align:right;\">${it.qty}x</td></tr>`).join('');
            const content = `
              <div style="font-size:16px; color:#111;">
                <p style="font-size:20px; font-weight:600; margin:0 0 12px;">Pagamento confirmado</p>
                <p style="margin:0 0 16px;">${customerName ? `Olá ${customerName},` : 'Olá,'} recebemos o seu pagamento.</p>
                <table style="width:100%; font-size:14px; border-collapse:collapse;">${itemsHtml}</table>
                <p style="margin-top:12px; font-weight:600;">Total: <span>${fmt(totalCents)}</span></p>
              </div>`;
            const html = baseTemplate({ content, clinicName: clinicNameStr });
            await sendEmail({ to: customerEmail, subject: `[${clinicNameStr}] Pagamento confirmado`, html }).catch(() => {});
          }
        }
      } catch (e) {
        console.warn('[checkout][email] send failed (non-fatal):', e instanceof Error ? e.message : e);
      }

      // Also persist payment customer/method from order response when available (works even if save-card flow didn't run)
      try {
        const pgCustomerId = order?.customer?.id || null;
        // card info can be nested in charges[0].last_transaction.card
        const ch = Array.isArray(order?.charges) ? order.charges[0] : null;
        const tx = ch?.last_transaction || null;
        const cardObj = tx?.card || null;
        const pgCardId = cardObj?.id || null;
        if (doctorId && profileId && pgCustomerId) {
          const pcId = crypto.randomUUID();
          await prisma.$executeRawUnsafe(
            `INSERT INTO payment_customers (id, provider, provider_customer_id, doctor_id, patient_profile_id, clinic_id)
             VALUES ($1, 'pagarme', $2, $3, $4, $5)
             ON CONFLICT (doctor_id, patient_profile_id, provider)
             DO UPDATE SET provider_customer_id = EXCLUDED.provider_customer_id, updated_at = NOW()`,
            pcId, String(pgCustomerId), String(doctorId), String(profileId), clinic?.id ? String(clinic.id) : null
          );
        }
        if (doctorId && profileId && pgCardId) {
          // find payment_customer id
          const rows = await prisma.$queryRawUnsafe<any[]>(
            `SELECT id FROM payment_customers WHERE doctor_id = $1 AND patient_profile_id = $2 AND provider = 'pagarme' LIMIT 1`,
            String(doctorId), String(profileId)
          ).catch(() => []);
          const paymentCustomerId = rows?.[0]?.id || null;
          if (paymentCustomerId) {
            const pmId = crypto.randomUUID();
            await prisma.$executeRawUnsafe(
              `INSERT INTO payment_methods (id, payment_customer_id, provider_card_id, brand, last4, exp_month, exp_year, is_default, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE')
               ON CONFLICT (payment_customer_id, provider_card_id)
               DO UPDATE SET brand = EXCLUDED.brand, last4 = EXCLUDED.last4, exp_month = EXCLUDED.exp_month, exp_year = EXCLUDED.exp_year, updated_at = NOW()`,
              pmId,
              String(paymentCustomerId),
              String(pgCardId),
              cardObj?.brand || null,
              cardObj?.last_four_digits || cardObj?.last4 || null,
              cardObj?.exp_month || null,
              cardObj?.exp_year || null,
              true
            );
          }
        }
      } catch (e) {
        console.warn('[checkout][create] persist payment customer/method from order failed:', e instanceof Error ? e.message : e);
      }
      try { console.log('[checkout][create] tx persist precheck', { doctorId, profileId, orderId: order?.id, method: payment?.method, amountCents }); } catch {}
      if (doctorId && profileId) {
        const txId = crypto.randomUUID();
        const methodType = payment?.method === 'pix' ? 'pix' : 'card';
        const orderId = order?.id || null;
        try { console.log('[checkout][create] inserting payment_transactions row', { txId, orderId, methodType }); } catch {}
        await prisma.$executeRawUnsafe(
          `INSERT INTO payment_transactions (id, provider, provider_order_id, doctor_id, patient_profile_id, clinic_id, product_id, amount_cents, currency, installments, payment_method_type, status, raw_payload)
           VALUES ($1, 'pagarme', $2, $3, $4, $5, $6, $7, 'BRL', $8, $9, 'processing', $10::jsonb)`,
          txId,
          orderId,
          String(doctorId),
          String(profileId),
          clinic?.id ? String(clinic.id) : null,
          String(productId),
          Number(amountCents),
          Number(payment?.installments || 1),
          methodType,
          JSON.stringify({ payload })
        );
        try { console.log('[checkout][create] inserted payment_transactions row', { txId }); } catch {}
      }
    } catch (e) {
      console.warn('[checkout][create] persist PaymentTransaction failed:', e instanceof Error ? e.message : e);
    }

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
          // Ensure PatientProfile for this doctor/patient
          try {
            if (patientId && doctorId) {
              const fullAddress = `${billingAddr.line_1}, ${billingAddr.city} - ${billingAddr.state}, ${billingAddr.zip_code}, ${billingAddr.country}`;
              await prisma.patientProfile.upsert({
                where: {
                  doctorId_userId: { doctorId: String(doctorId), userId: String(patientId) }
                },
                create: {
                  doctorId: String(doctorId),
                  userId: String(patientId),
                  name: String(buyer?.name || ''),
                  phone: String(buyer?.phone || ''),
                  address: fullAddress,
                  emergency_contact: null,
                  emergency_phone: null,
                  medical_history: null,
                  allergies: null,
                  medications: null,
                  notes: null,
                },
                update: {
                  name: String(buyer?.name || ''),
                  phone: String(buyer?.phone || ''),
                  address: fullAddress,
                }
              });
              await ensureRelationship(String(patientId), String(doctorId));
            }
          } catch (e) {
            console.warn('[checkout][create] patient profile upsert failed (non-fatal):', e instanceof Error ? e.message : e);
          }

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
