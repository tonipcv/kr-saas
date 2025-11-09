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

    console.log('[of.payments][success]', { correlationId, paymentLinkId, orderRef, latencyMs: dt });
    return NextResponse.json({ paymentLinkId, redirect_uri, expiresAt, correlationId });
  } catch (e: any) {
    console.error('[of.payments][error]', { correlationId, message: e?.message });
    return NextResponse.json({ error: e?.message || 'Erro ao criar pagamento', body, correlationId }, { status: e?.status || 500 });
  }
}
