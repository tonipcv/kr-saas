import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createRedirectPayment } from '@/lib/linaob';
import crypto from 'crypto';

export async function POST(req: Request) {
  // Create payment with provider and persist locally
  let body: any = null;
  const correlationId = crypto.randomUUID();
  try {
    body = await req.json();
    const {
      productId,
      enrollmentId,
      amount,
      currency,
      payer,
      orderRef,
      userId,
      metadata,
    } = body || {};

    if (!productId || !enrollmentId || !amount || !currency || !payer || !orderRef) {
      return NextResponse.json({ error: 'Campos obrigatórios: productId, enrollmentId, amount, currency, payer, orderRef' }, { status: 400 });
    }

    const amountInReais = (Number(amount) / 100).toFixed(2);

    const fwd = (req.headers as any).get?.('x-forwarded-for') || '';
    const clientIp = typeof fwd === 'string' ? fwd.split(',')[0].trim() : undefined;
    const subTenantId = process.env.LINAOB_SUBTENANT_ID || 'lina';

    console.log('[of.payments][start]', { correlationId, productId, enrollmentId, orderRef, amount, currency });

    // Validate enrollment is active using OpenFinanceLink (authorised)
    try {
      const link = await prisma.openFinanceLink.findFirst({
        where: { enrollmentId: String(enrollmentId) },
        orderBy: { updatedAt: 'desc' },
      });
      if (!link) {
        console.log('[of.payments][enrollment.not.found]', { correlationId, enrollmentId });
        return NextResponse.json({ error: 'Vínculo não encontrado', correlationId }, { status: 404 });
      }
      const validStatuses = ['ACTIVE', 'AUTHORISED', 'AUTHORIZED'];
      if (!validStatuses.includes((link.status || '').toUpperCase())) {
        if ((link.status || '').toUpperCase() === 'PENDING') {
          console.log('[of.payments] Status PENDING - aguardando...', { enrollmentId });
          await new Promise((resolve) => setTimeout(resolve, 2000));
          const linkRetry = await prisma.openFinanceLink.findFirst({ where: { enrollmentId: String(enrollmentId) } });
          if (linkRetry && validStatuses.includes((linkRetry.status || '').toUpperCase())) {
            console.log('[of.payments] ✅ Status atualizado após retry', {
              enrollmentId,
              oldStatus: link.status,
              newStatus: linkRetry.status,
              correlationId,
            });
          } else {
            console.log('[of.payments][enrollment.still.pending]', {
              correlationId,
              enrollmentId,
              linkStatus: linkRetry?.status || 'not_found',
            });
            return NextResponse.json(
              {
                error: 'Vínculo ainda processando. Aguarde alguns segundos e tente novamente.',
                correlationId,
                linkStatus: linkRetry?.status,
              },
              { status: 400 }
            );
          }
        } else {
          console.log('[of.payments][enrollment.invalid.status]', { correlationId, enrollmentId, linkStatus: link.status });
          return NextResponse.json(
            { error: `Vínculo inválido (status: ${link.status})`, correlationId },
            { status: 400 }
          );
        }
      }
    } catch (e: any) {
      console.warn('[of.payments][enrollment.check.error]', { correlationId, message: e?.message });
      return NextResponse.json({ error: 'Falha ao validar vínculo. Tente novamente.', correlationId }, { status: 500 });
    }

    // schedule.single.date: amanhã (YYYY-MM-DD)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const scheduleDate = tomorrow.toISOString().split('T')[0];

    const originRedirect = process.env.LINAOB_REDIRECT_URI || undefined;

    // Force Lina HML sandbox creditor to ensure provider acceptance during tests
    const creditor = {
      name: 'Mock Recebedor Sandbox',
      personType: 'PESSOA_NATURAL',
      cpfCnpj: '11111111111',
      accountNumber: '123456',
      accountIssuer: '1774',
      accountPixKey: 'sandbox@linaob.com.br',
      accountIspb: '60701190',
      accountType: 'CACC',
    };

    // Provider payload per /api/v1/payments
    const payload: any = {
      details: `Pagamento - Produto ${productId}`,
      externalId: String(orderRef),
      value: parseFloat(amountInReais),
      cpfCnpj: String(payer?.cpf || '').replace(/\D/g, ''),
      redirectUri: originRedirect,
      schedule: { single: { date: scheduleDate } },
      creditor,
    };

    // Debug: log full payload sent to provider (helps when diagnosing 5xx)
    try { console.log('🔍 [of.payments][payload.completo]', JSON.stringify(payload, null, 2)); } catch {}
    const t0 = Date.now();
    const res = await createRedirectPayment(payload, { subTenantId, clientIp });
    const dt = Date.now() - t0;

    const paymentLinkId: string | null =
      res?.paymentRequestId ||
      res?.payment_request_id ||
      res?.id ||
      res?.paymentLinkId ||
      res?.data?.id ||
      null;
    let redirect_uri: string | null =
      res?.redirectUri ||
      res?.redirect_url ||
      res?.redirectUrl ||
      res?.authorization_url ||
      res?.authorizationUrl ||
      res?.data?.redirectUrl ||
      null;
    const expiresAt: string | null = res?.expiresAt || res?.expires_at || res?.data?.expiresAt || null;

    // Fallback: construir redirect se provedor não enviar
    if (!redirect_uri) {
      const base = process.env.LINAOB_BASE_URL || '';
      const payId = res?.paymentId || res?.id || paymentLinkId;
      const sub = process.env.LINAOB_SUBTENANT_ID || 'lina';
      if (base && payId) {
        redirect_uri = `${base.replace(/\/$/, '')}/authorize?paymentId=${encodeURIComponent(payId)}&subTenantId=${encodeURIComponent(sub)}`;
      }
    }

    if (!paymentLinkId || !redirect_uri) {
      return NextResponse.json({ error: 'Resposta do provedor sem paymentLinkId/redirect_uri', providerResponse: res }, { status: 502 });
    }

    // Persist row (best-effort, additive to existing minimal table)
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO openbanking_payments (
           payment_link_id, product_id, enrollment_id, user_id,
           amount_cents, currency, order_ref, status,
           payer_name, payer_email, payer_cpf,
           redirect_uri, expires_at, metadata, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4,
           $5, $6, $7, 'PENDING'::"PaymentStatusOB",
           $8, $9, $10,
           $11, $12, $13::jsonb, now(), now()
         )
         ON CONFLICT (payment_link_id) DO UPDATE SET
           product_id = EXCLUDED.product_id,
           enrollment_id = EXCLUDED.enrollment_id,
           user_id = COALESCE(EXCLUDED.user_id, openbanking_payments.user_id),
           amount_cents = EXCLUDED.amount_cents,
           currency = EXCLUDED.currency,
           order_ref = EXCLUDED.order_ref,
           payer_name = COALESCE(EXCLUDED.payer_name, openbanking_payments.payer_name),
           payer_email = COALESCE(EXCLUDED.payer_email, openbanking_payments.payer_email),
           payer_cpf = COALESCE(EXCLUDED.payer_cpf, openbanking_payments.payer_cpf),
           redirect_uri = EXCLUDED.redirect_uri,
           expires_at = EXCLUDED.expires_at,
           metadata = COALESCE(EXCLUDED.metadata, openbanking_payments.metadata),
           updated_at = now()`,
        String(paymentLinkId),
        String(productId),
        String(enrollmentId),
        userId ? String(userId) : null,
        Number(amount) || 0,
        String(currency),
        String(orderRef),
        payer?.name ? String(payer.name) : null,
        payer?.email ? String(payer.email) : null,
        (payer?.cpf ? String(payer.cpf).replace(/\D/g, '') : null),
        String(redirect_uri),
        expiresAt ? new Date(expiresAt) : null,
        JSON.stringify({ providerResponse: res, ...(metadata || {}) }),
      );
    } catch (e) {
      // Log-only: table may not have all columns yet
      console.warn('[open-finance][payments] persist warning:', (e as any)?.message, { correlationId });
    }

    // BEGIN Non-blocking orchestration dual-write (Customer, CustomerProvider, PaymentTransaction)
    try {
      const product = await prisma.products.findUnique({ where: { id: productId }, select: { id: true, clinicId: true, doctorId: true } });
      if (product?.clinicId) {
        const merchant = await prisma.merchant.findFirst({ where: { clinicId: product.clinicId }, select: { id: true } });
        if (merchant) {
          // Upsert Customer
          let customer: any = null;
          const payerEmail = payer?.email ? String(payer.email) : null;
          const payerCpf = payer?.cpf ? String(payer.cpf).replace(/\D/g, '') : null;
          if (payerEmail || payerCpf) {
            const whereClause: any = { merchantId: merchant.id, OR: [] };
            if (payerEmail) whereClause.OR.push({ email: payerEmail });
            if (payerCpf) whereClause.OR.push({ document: payerCpf });
            customer = await prisma.customer.findFirst({ where: whereClause, select: { id: true } });
            if (!customer) {
              customer = await prisma.customer.create({
                data: {
                  merchantId: merchant.id,
                  name: payer?.name || null,
                  email: payerEmail,
                  phone: null,
                  document: payerCpf,
                  metadata: { source: 'open_finance_payment' },
                },
                select: { id: true },
              });
            }
          }
          // Upsert CustomerProvider (OPENFINANCE)
          let customerProvider: any = null;
          if (customer) {
            const cpWhere = { customerId: customer.id, provider: 'OPENFINANCE' as any, accountId: merchant.id };
            customerProvider = await prisma.customerProvider.findFirst({ where: cpWhere, select: { id: true } });
            if (!customerProvider) {
              customerProvider = await prisma.customerProvider.create({
                data: { ...cpWhere, providerCustomerId: null, metadata: { source: 'open_finance_payment' } },
                select: { id: true },
              });
            }
          }
          // Create PaymentTransaction with OPENFINANCE/PROCESSING
          await prisma.$executeRawUnsafe(
            `INSERT INTO payment_transactions (
              id, provider, provider_order_id, doctor_id, clinic_id, merchant_id, product_id,
              customer_id, customer_provider_id,
              amount_cents, currency, installments, payment_method_type,
              status, provider_v2, status_v2, routed_provider, raw_payload
            ) VALUES (
              $1, 'open_banking', $2, $3, $4, $5, $6,
              $7, $8,
              $9, $10, 1, 'pix',
              'processing', 'OPENFINANCE'::"PaymentProvider", 'PROCESSING'::"PaymentStatus", 'OPENFINANCE', $11::jsonb
            )
            ON CONFLICT (provider, provider_order_id) DO NOTHING`,
            crypto.randomUUID(),
            String(paymentLinkId),
            product.doctorId || null,
            product.clinicId,
            merchant.id,
            product.id,
            customer?.id || null,
            customerProvider?.id || null,
            Number(amount) || 0,
            String(currency),
            JSON.stringify({ provider: 'open_finance', paymentLinkId, orderRef, payer })
          );
        }
      }
    } catch (e) {
      console.warn('[open-finance][payments][orchestration] dual-write failed (non-blocking)', (e as any)?.message);
    }
    // END Non-blocking orchestration dual-write

    console.log('[of.payments][success]', { correlationId, paymentLinkId, orderRef, latencyMs: dt });
    return NextResponse.json({ paymentLinkId, redirect_uri, expiresAt, correlationId });
  } catch (e: any) {
    console.error('[of.payments][error]', { correlationId, message: e?.message });
    return NextResponse.json({ error: e?.message || 'Erro ao criar pagamento', body, correlationId }, { status: e?.status || 500 });
  }
}
