import Link from 'next/link';
import StatusClient from './StatusClient';
import { headers } from 'next/headers';

function formatBRL(value: number) {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
  } catch {
    return `R$ ${(value || 0).toFixed(2)}`;
  }
}

function formatMoney(value: number, currency: string | null | undefined, locale: string) {
  const curRaw = typeof currency === 'string' ? currency.trim() : '';
  if (!curRaw) return `${(value || 0).toFixed(2)}`;
  const cur = curRaw.toUpperCase();
  const loc = locale || (cur === 'BRL' ? 'pt-BR' : 'en-US');
  try { return new Intl.NumberFormat(loc, { style: 'currency', currency: cur }).format(value || 0); }
  catch { return `${cur} ${(value || 0).toFixed(2)}`; }
}

function getBaseUrl() {
  const dom = (process.env.NEXT_PUBLIC_APP_BASE_DOMAIN || process.env.APP_BASE_DOMAIN) as string | undefined;
  if (dom && dom.trim()) {
    const d = dom.trim();
    const hasProto = /^https?:\/\//i.test(d);
    const url = hasProto ? d : `https://${d}`;
    return url.replace(/\/$/, '');
  }
  return (
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'http://localhost:3000'
  );
}

async function getProduct(productId: string) {
  try {
    const res = await fetch(`${getBaseUrl()}/api/products/public/${productId}`, { cache: 'no-store' });
    const js = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    // Accept either direct object or { product }
    return js?.product || js;
  } catch {}
  return null;
}

async function getClinic(slug: string) {
  try {
    const res = await fetch(`${getBaseUrl()}/api/clinic/by-slug/${slug}`, { cache: 'no-store' });
    const js = await res.json().catch(() => ({}));
    const c = js?.clinic || js?.data || js;
    if (res.ok && c) {
      return {
        name: c.name as string,
        theme: (c.theme || 'LIGHT') as 'LIGHT' | 'DARK',
        buttonColor: c?.buttonColor || null,
        buttonTextColor: c?.buttonTextColor || null,
        logoUrl: c?.logoUrl || c?.logo || null,
      };
    }
  } catch {}
  return { name: slug, theme: 'LIGHT' as const, buttonColor: null, buttonTextColor: null, logoUrl: null };
}

async function getOrder(orderId: string) {
  try {
    const res = await fetch(`${getBaseUrl()}/api/checkout/status?id=${encodeURIComponent(orderId)}`, { cache: 'no-store' });
    const js = await res.json();
    if (!res.ok) throw new Error(js?.error || 'Erro');
    return js;
  } catch (e) {
    try { console.warn('[checkout][success] getOrder failed', (e as any)?.message || e); } catch {}
    return { error: true };
  }
}

export default async function SuccessPage({ params, searchParams }: { params: Promise<{ slug: string }>, searchParams: Promise<{ order_id?: string, method?: string, product_id?: string, installments?: string, currency?: string, amount_minor?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const hdrs = await headers();
  const acceptLang = hdrs.get('accept-language') || '';
  const detectedLocale = (() => {
    const first = acceptLang.split(',')[0]?.trim() || '';
    if (!first) return 'pt-BR';
    // normalize simple tags
    if (/^pt(\-|$)/i.test(first)) return 'pt-BR';
    if (/^en(\-|$)/i.test(first)) return 'en-US';
    if (/^es(\-|$)/i.test(first)) return 'es-ES';
    return first;
  })();
  const orderId = sp?.order_id || '';
  const urlMethod = (sp?.method || '').toLowerCase(); // URL hint, not source of truth
  const urlProductId = sp?.product_id || '';
  const urlInstallments = (() => { try { const n = Number(sp?.installments); return Number.isFinite(n) && n > 0 ? n : null; } catch { return null; } })();
  const urlCurrency = (sp?.currency && String(sp.currency).trim()) ? String(sp.currency).toUpperCase() : null;
  const urlAmountMinor = (() => { try { const n = Number(sp?.amount_minor); return Number.isFinite(n) ? n : null; } catch { return null; } })();
  
  // Log all inputs
  console.log('[checkout][success] input params', { slug, orderId, urlMethod, urlProductId });
  
  // Determine product ID and fetch clinic + product in parallel (server-side absolute URLs)
  const productIdToUse = urlProductId;
  const [clinic, productData, orderInfo] = await Promise.all([
    getClinic(slug),
    productIdToUse ? getProduct(productIdToUse) : Promise.resolve(null),
    orderId ? getOrder(orderId).catch(() => null) : Promise.resolve(null),
  ]);

  // Force LIGHT look as requested
  const theme: 'LIGHT' | 'DARK' = 'LIGHT';
  // Helper to coerce numbers that may be strings in provider payloads
  const num = (v: any): number | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };
  const orderObj = (orderInfo as any)?.order || null;
  const normalized = (orderInfo as any)?.normalized || null;
  // Infer product data from order first; then fall back to product fetch
  const order = (orderInfo as any)?.order || null;
  const ch = Array.isArray(order?.charges) ? order.charges[0] : null;
  const pay = Array.isArray(order?.payments) ? order.payments[0] : null;
  const tx = ch?.last_transaction || pay?.last_transaction || null;
  const normalizedStatus = (typeof normalized?.status === 'string' && normalized.status.trim()) ? String(normalized.status).toLowerCase() : '';
  const status = (normalizedStatus || (tx?.status || ch?.status || order?.status || '')).toString();
  const statusLower = status.toLowerCase();
  const isPaid = (statusLower === 'paid' || statusLower === 'succeeded' || statusLower === 'authorized');
  // CRITICAL: derive actual payment method from order data, NOT from URL param
  const actualMethodRaw = (tx?.payment_method || ch?.payment_method || pay?.payment_method || '').toString().toLowerCase();
  const normalizedActualMethod = actualMethodRaw === 'credit_card' ? 'card' : actualMethodRaw;
  const method = normalizedActualMethod || urlMethod; // fallback to URL only if order has no method
  try {
    console.log('[checkout][success] payment method', { actualMethod: normalizedActualMethod || actualMethodRaw, urlMethod, using: method });
  } catch {}
  const item = Array.isArray(order?.items) ? order.items[0] : null;
  // IMPORTANT: Pagar.me doesn't preserve item.metadata (returns null), use order.metadata instead
  const meta = order?.metadata || null;
  const cardBrand = (
    (tx as any)?.card?.brand || (tx as any)?.credit_card?.brand ||
    (pay as any)?.card?.brand || (pay as any)?.credit_card?.brand || null
  );
  const cardLast4 = (
    (tx as any)?.card?.last_four_digits || (tx as any)?.card?.last4 || (tx as any)?.credit_card?.last4 ||
    (pay as any)?.card?.last_four_digits || (pay as any)?.card?.last4 || (pay as any)?.credit_card?.last4 || null
  );
  // Display data: prefer item.metadata (source of truth sent in checkout.create)
  let productName = ((meta as any)?.name || item?.description || '').trim() || (productData as any)?.name || '';
  let productImage = ((meta as any)?.imageUrl || (productData as any)?.imageUrl || (productData as any)?.image || '');
  // Base offer amount (posted value) should come from metadata.priceCents
  const offerAmountCents: number | null = (() => {
    const fromMeta = (meta as any)?.priceCents;
    if (typeof fromMeta === 'number' && Number.isFinite(fromMeta) && fromMeta > 0) return Number(fromMeta);
    if (typeof fromMeta === 'string' && Number(fromMeta) > 0) return Math.round(Number(fromMeta));
    // fallback to productData when metadata is missing
    const pd = (productData as any)?.priceCents;
    if (typeof pd === 'number' && Number.isFinite(pd) && pd > 0) return Number(pd);
    if (typeof pd === 'string' && Number(pd) > 0) return Math.round(Number(pd));
    return null;
  })();
  // Amount charged should come from charge/pay/order totals, not the offer amount
  const paidOrOrderAmountCents: number | null = (() => {
    const fromCharge = Number.isFinite(ch?.paid_amount) ? Number(ch?.paid_amount) : (Number.isFinite(ch?.amount) ? Number(ch?.amount) : null);
    if (fromCharge && fromCharge > 0) return fromCharge;
    if (Number.isFinite(item?.amount) && Number(item?.amount) > 0) return Number(item?.amount);
    return null;
  })();
  const productDescription = (meta as any)?.description || (productData as any)?.description || (productData as any)?.subtitle || '';
  // Valor da oferta: strictly from offerAmountCents when available; else fallback to product data prices (display only)
  let productAmountCents: number | null = offerAmountCents;
  let productAmount = (productAmountCents != null)
    ? (productAmountCents / 100)
    : (
        (productData?.discountPrice != null) ? Number(productData.discountPrice) :
        (productData?.originalPrice != null) ? Number(productData.originalPrice) :
        (productData as any)?.price != null ? Number((productData as any).price) : 0
      );

  // Log mismatches and final resolved data
  try {
    if (item?.code && urlProductId && item.code !== urlProductId) {
      console.warn('[checkout][success] URL product_id differs from order item code', { urlProductId, itemCode: item.code });
    }
  } catch {}
  console.log('[checkout][success] final product data', { productName, productImage, productAmount, fromDirectFetch: !!productData, fromMetadata: !!meta });

  // Prefer normalized amount from DB (webhook-updated), fallback to provider payload
  let amountCents = (
    (typeof normalized?.amount_minor === 'number' && Number.isFinite(normalized?.amount_minor)) ? Number(normalized.amount_minor) : null
  ) ?? (
    num(ch?.paid_amount) ??
    num(tx?.paid_amount) ??
    num(ch?.amount) ??
    num(tx?.amount) ??
    num(pay?.paid_amount) ??
    num(pay?.amount) ??
    num(orderObj?.amount_paid) ??
    num(orderObj?.amount) ??
    (urlAmountMinor != null ? urlAmountMinor : null) ??
    paidOrOrderAmountCents ??
    null
  );
  if ((status.toLowerCase() === 'paid' || status.toLowerCase() === 'approved' || status.toLowerCase() === 'captured') && (amountCents == null || amountCents === 0)) {
    // if provider did not return an amount, fall back to paidOrOrderAmountCents, else keep offer value separate
    amountCents = paidOrOrderAmountCents != null ? paidOrOrderAmountCents : Math.round((productAmount || 0) * 100);
  }
  const amount = (amountCents || 0) / 100;
  // Never override offer value with paid value; keep them distinct

  // Derivar parcelas (apenas cartão)
  // Preferir metadado definido no checkout.create (fonte de verdade)
  const metaEffInst = num((meta as any)?.effectiveInstallments);
  const installmentsCount = (
    (typeof normalized?.installments === 'number' && normalized?.installments > 0) ? Number(normalized.installments) : null
  ) ?? (
    (urlInstallments != null ? urlInstallments : null) ??
    metaEffInst ??
    num((tx as any)?.credit_card?.installments) ??
    num((tx as any)?.credit_card?.installment_count) ??
    num((tx as any)?.card?.installments) ??
    num((tx as any)?.card?.installment_count) ??
    num((tx as any)?.installments) ??
    num((tx as any)?.installment_count) ??
    num((pay as any)?.credit_card?.installments) ??
    num((pay as any)?.credit_card?.installment_count) ??
    num((pay as any)?.installments) ??
    num((pay as any)?.installment_count) ??
    num((ch as any)?.installments) ??
    num((ch as any)?.installment_count) ??
    null
  ) ?? 1;
  const providerPerInstallment = (
    num((tx as any)?.credit_card?.installment_amount) ??
    num((tx as any)?.card?.installment_amount) ??
    num((tx as any)?.installment_amount) ??
    num((tx as any)?.installment_value) ??
    num((pay as any)?.credit_card?.installment_amount) ??
    num((pay as any)?.installment_amount) ??
    num((pay as any)?.installment_value) ??
    null
  );
  const perInstallmentCents = installmentsCount > 1
    ? (providerPerInstallment != null
        ? providerPerInstallment
        : (amountCents ? Math.round(amountCents / installmentsCount) : null))
    : null;

  // Derive paid currency from provider payloads (charge/payment/tx/order/metadata)
  const paidCurrency = (() => {
    const norm = (normalized && typeof normalized.currency === 'string' && normalized.currency.trim()) ? normalized.currency : null;
    if (norm) return String(norm).toUpperCase();
    if (urlCurrency) return urlCurrency;
    const c = (
      (tx as any)?.currency ||
      (ch as any)?.currency ||
      (pay as any)?.currency ||
      (order as any)?.currency ||
      (order?.metadata as any)?.currency ||
      null
    );
    if (typeof c === 'string' && c.trim()) return c.toUpperCase();
    return 'BRL';
  })();

  // Offer currency (for display of catalog/offer price)
  const offerCurrency = (() => {
    const c = (meta as any)?.currency || null;
    if (typeof c === 'string' && c.trim()) return String(c).toUpperCase();
    return 'BRL';
  })();

  const primaryBg = clinic.buttonColor || '#111827';
  const primaryFg = clinic.buttonTextColor || '#ffffff';

  // Recalcular parcelas com a mesma regra do checkout (APR mensal do endpoint de pricing)
  const DEFAULT_APR = 0.029; // mesmo fallback do checkout
  let aprMonthly = DEFAULT_APR;
  let recomputedPerInstallmentCents: number | null = null;
  try {
    if (amountCents && installmentsCount > 1) {
      // Base principal deve ser o valor da oferta, não o total pago em cents
      const principalCents = (productAmountCents != null) ? productAmountCents : Number(amountCents);
      const pr = await fetch(`${getBaseUrl()}/api/payments/pricing?amount_cents=${principalCents}`, { cache: 'no-store' });
      if (pr.ok) {
        const pj = await pr.json().catch(() => ({} as any));
        aprMonthly = typeof pj?.pricing?.INSTALLMENT_CUSTOMER_APR_MONTHLY === 'number' ? pj.pricing.INSTALLMENT_CUSTOMER_APR_MONTHLY : DEFAULT_APR;
        const pricePer = (P: number, i: number, n: number) => {
          if (n <= 1 || i <= 0) return Math.round(P);
          const factor = Math.pow(1 + i, n);
          const denom = factor - 1;
          if (denom <= 0) return Math.ceil(P / n);
          const A = (P * i * factor) / denom;
          return Math.round(A);
        };
        recomputedPerInstallmentCents = pricePer(Number(principalCents), aprMonthly, Number(installmentsCount));
      }
    }
  } catch {}

  // Valor final por parcela a exibir
  const displayedPerInstallmentCents = (() => {
    if (installmentsCount <= 1) return null;
    if (recomputedPerInstallmentCents != null) return recomputedPerInstallmentCents;
    if (providerPerInstallment != null) return providerPerInstallment;
    if (productAmountCents != null) return Math.round(productAmountCents / installmentsCount);
    if (amountCents) return Math.round(amountCents / installmentsCount);
    return null;
  })();

  // Translations (minimal)
  const t = (() => {
    const isPT = detectedLocale.toLowerCase().startsWith('pt');
    const isES = detectedLocale.toLowerCase().startsWith('es');
    if (isPT) return {
      approved: 'Pagamento aprovado', processing: 'Pagamento em processamento', pixConfirmed: 'Pix confirmado', pixWaiting: 'Pix gerado — aguardando pagamento',
      thanks: 'Obrigado! Enviamos a confirmação para o seu e-mail.', finishPix: 'Finalize o pagamento via PIX. Assim que o provedor confirmar, enviaremos a confirmação por e-mail.',
      order: 'Pedido', method: 'Método', card: 'Cartão de crédito', pix: 'Pix', paidValue: 'Valor pago', installments: 'Parcelamento', upfront: 'À vista',
    };
    if (isES) return {
      approved: 'Pago aprobado', processing: 'Pago en procesamiento', pixConfirmed: 'Pix confirmado', pixWaiting: 'Pix generado — esperando pago',
      thanks: '¡Gracias! Enviamos la confirmación a tu correo.', finishPix: 'Finaliza el pago por PIX. Al confirmar, te enviaremos un correo.',
      order: 'Pedido', method: 'Método', card: 'Tarjeta de crédito', pix: 'Pix', paidValue: 'Valor pagado', installments: 'Cuotas', upfront: 'Al contado',
    };
    return {
      approved: 'Payment approved', processing: 'Payment processing', pixConfirmed: 'Pix confirmed', pixWaiting: 'Pix generated — awaiting payment',
      thanks: 'Thanks! We sent the confirmation to your email.', finishPix: 'Complete the payment via PIX. Once confirmed, you will receive an email.',
      order: 'Order', method: 'Method', card: 'Credit card', pix: 'Pix', paidValue: 'Paid amount', installments: 'Installments', upfront: 'Upfront',
    };
  })();

  return (
    <div className={`min-h-screen bg-[#eff1f3] text-gray-900 flex flex-col`}>
      <div className="flex-1 w-full p-4 sm:p-6">
        <div className="max-w-xl mx-auto">
          {/* Logo acima e fora do box, com espaçamento igual ao checkout */}
          <div className="text-center mt-6 md:mt-10 mb-16">
            {clinic.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={clinic.logoUrl}
                alt={clinic.name}
                className="mx-auto h-12 sm:h-14 max-w-[260px] w-auto object-contain"
                referrerPolicy="no-referrer"
                decoding="async"
              />
            )}
          </div>

          <div className={`border-gray-200 bg-white rounded-2xl border shadow-sm overflow-hidden`}>
            {/* Header */}
            <div className={`bg-white px-5 sm:px-6 pt-8 pb-4 border-b border-gray-200 text-center`}>
              <div className="mt-0 flex items-center justify-center gap-2">
                {isPaid && (
                  <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs bg-emerald-50 text-emerald-700 border border-emerald-300`}>✓</div>
                )}
                <div className="text-[18px] sm:text-[20px] font-semibold leading-none">
                  {method === 'card'
                    ? (isPaid ? t.approved : t.processing)
                    : (isPaid ? t.pixConfirmed : t.pixWaiting)}
                </div>
              </div>
              <div className="mt-2 text-xs text-gray-600">
                {isPaid
                  ? t.thanks
                  : (method === 'pix' ? t.finishPix : t.processing)}
              </div>
              {!!orderId && (<StatusClient orderId={orderId} />)}
            </div>

            {/* Body */}
            <div className="px-5 sm:px-6 py-6">
              {/* Product hero (como no checkout) */}
              <div className="mb-5">
                {productImage && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={productImage}
                    alt={productName || 'Produto'}
                    className="w-full h-40 sm:h-48 object-cover rounded-xl border border-gray-200"
                  />
                )}
                <div className="mt-3">
                  <div className="text-base sm:text-[15px] font-semibold">{productName || 'Produto'}</div>
                  {!!productDescription && (
                    <div className="text-sm text-gray-600 mt-2">{productDescription}</div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className={`bg-gray-50 border-gray-200 rounded-xl p-4 border`}>
                  <div className={`text-xs text-gray-600`}>{t.order}</div>
                  <div className="text-sm font-medium break-all">{orderId || '-'}</div>
                </div>
                <div className={`bg-gray-50 border-gray-200 rounded-xl p-4 border`}>
                  <div className={`text-xs text-gray-600`}>{t.method}</div>
                  <div className="text-sm font-medium capitalize">{method === 'card' ? t.card : t.pix}</div>
                </div>
                <div className={`bg-gray-50 border-gray-200 rounded-xl p-4 border`}>
                  <div className={`text-xs text-gray-600`}>{t.paidValue}</div>
                  <div className="text-sm font-semibold">{formatMoney(amount, paidCurrency, detectedLocale)}</div>
                </div>
                {/* Installments card intentionally removed for a more minimal success UI */}
                {method === 'card' && (cardBrand || cardLast4) && (
                  <div className={`bg-gray-50 border-gray-200 rounded-xl p-4 border sm:col-span-2`}>
                    <div className={`text-xs text-gray-600`}>Cartão</div>
                    <div className="text-sm font-medium">{cardBrand || ''} {cardLast4 ? `(**** **** **** ${cardLast4})` : ''}</div>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
      <footer className="mt-4 mb-4">
        <div className="flex items-center justify-center gap-2 text-gray-400">
          <span className="text-[10px]">Powered by</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Sistema" className="h-4 object-contain opacity-60" />
        </div>
      </footer>
    </div>
  );
}
