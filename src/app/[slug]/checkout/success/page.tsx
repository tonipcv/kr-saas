import Link from 'next/link';

function formatBRL(value: number) {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
  } catch {
    return `R$ ${(value || 0).toFixed(2)}`;
  }
}

function getBaseUrl() {
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
    const res = await fetch(`/api/checkout/status?id=${encodeURIComponent(orderId)}`, { cache: 'no-store' });
    const js = await res.json();
    if (!res.ok) throw new Error(js?.error || 'Erro');
    return js;
  } catch (e) {
    return { error: true };
  }
}

export default async function SuccessPage({ params, searchParams }: { params: Promise<{ slug: string }>, searchParams: Promise<{ order_id?: string, method?: string, product_id?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const orderId = sp?.order_id || '';
  const method = (sp?.method || '').toLowerCase();
  const urlProductId = sp?.product_id || '';
  
  // Log all inputs
  console.log('[checkout][success] input params', { slug, orderId, method, urlProductId });
  
  // Determine product ID and fetch clinic + product in parallel (server-side absolute URLs)
  const productIdToUse = urlProductId;
  const [clinic, productData, orderInfo] = await Promise.all([
    getClinic(slug),
    productIdToUse ? getProduct(productIdToUse) : Promise.resolve(null),
    orderId ? getOrder(orderId).catch(() => null) : Promise.resolve(null),
  ]);

  // Force LIGHT look as requested
  const theme: 'LIGHT' | 'DARK' = 'LIGHT';
  const pay = (orderInfo as any)?.order?.payments?.[0] || null;
  const ch = (orderInfo as any)?.order?.charges?.[0] || null;
  const status = ((orderInfo as any)?.payment_status || (orderInfo as any)?.order_status || ch?.status || 'paid').toString();
  const tx = ch?.last_transaction || pay?.last_transaction || null;
  const cardBrand = tx?.card?.brand || null;
  const cardLast4 = tx?.card?.last_four_digits || tx?.card?.last4 || null;

  // Product display: use fetched productData as source of truth
  const item = (orderInfo as any)?.order?.items?.[0] || {};
  const meta = (item?.metadata || {}) as any;
  const productName = productData?.name || meta?.name || '';
  const productImage = productData?.imageUrl || productData?.image_url || productData?.image || meta?.imageUrl || '';
  const productAmount = (productData?.price != null)
    ? Number(productData.price)
    : (meta?.priceCents ? meta.priceCents / 100 : (typeof item?.amount === 'number' ? item.amount / 100 : 0));

  console.log('[checkout][success] final product data', {
    productName,
    productImage,
    productAmount,
    fromDirectFetch: !!productData,
    fromMetadata: !!meta?.name
  });

  const orderObj = (orderInfo as any)?.order || null;
  let amountCents = (ch?.paid_amount ?? pay?.paid_amount ?? ch?.amount ?? pay?.amount ?? orderObj?.amount_paid ?? orderObj?.amount ?? 0);
  if (status.toLowerCase() === 'paid' && !amountCents) {
    amountCents = Math.round((productAmount || 0) * 100);
  }
  const amount = (amountCents || 0) / 100;

  const primaryBg = clinic.buttonColor || '#111827';
  const primaryFg = clinic.buttonTextColor || '#ffffff';

  return (
    <div className={`min-h-screen bg-gradient-to-b from-gray-50 to-white text-gray-900 flex flex-col`}> 
      <div className="flex-1 w-full p-4 sm:p-6">
        <div className="max-w-xl mx-auto">
        <div className={`border-gray-200 bg-white rounded-2xl border shadow-sm overflow-hidden`}> 
          {/* Header */}
          <div className={`bg-white px-5 sm:px-6 pt-8 pb-6 border-b border-gray-200 text-center`}>
            {clinic.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={clinic.logoUrl}
                alt={clinic.name}
                className="mx-auto h-12 sm:h-14 max-w-[260px] w-auto object-contain mb-8"
                referrerPolicy="no-referrer"
                decoding="async"
              />
            )}
            <div className="mt-0 flex items-center justify-center gap-2">
              <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs bg-emerald-50 text-emerald-700 border border-emerald-300`}>✓</div>
              <div className="text-[18px] sm:text-[20px] font-semibold leading-none">
                {method === 'card' ? 'Cartão aprovado' : 'Pix confirmado'}
              </div>
            </div>
            <div className="mt-2 text-xs text-gray-600">
              Obrigado! Enviamos a confirmação para o seu e-mail.
            </div>
            <div className={`inline-block mt-3 text-[11px] px-2.5 py-1 rounded-full whitespace-nowrap bg-emerald-50 text-emerald-700 border border-emerald-300`}>Status: {status}</div>
          </div>

          {/* Body */}
          <div className="px-5 sm:px-6 py-6">
            {/* Product header */}
            <div className="flex items-start gap-3 mb-4">
              {/* Always show product image - use hardcoded fallback if needed */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src={productImage || 'https://via.placeholder.com/150'} 
                alt={productName} 
                className="h-14 w-14 rounded-md object-cover border border-gray-200" 
              />
              <div>
                <div className="text-sm font-semibold">{productName}</div>
                <div className={`text-xs text-gray-600`}>Valor do produto: {formatBRL(productAmount)}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className={`bg-gray-50 border-gray-200 rounded-xl p-4 border`}>
                <div className={`text-xs text-gray-600`}>Pedido</div>
                <div className="text-sm font-medium break-all">{orderId || '-'}</div>
              </div>
              <div className={`bg-gray-50 border-gray-200 rounded-xl p-4 border`}>
                <div className={`text-xs text-gray-600`}>Método</div>
                <div className="text-sm font-medium capitalize">{method === 'card' ? 'Cartão de crédito' : 'Pix'}</div>
              </div>
              <div className={`bg-gray-50 border-gray-200 rounded-xl p-4 border`}>
                <div className={`text-xs text-gray-600`}>Valor do produto</div>
                <div className="text-sm font-medium">{formatBRL(productAmount)}</div>
              </div>
              <div className={`bg-gray-50 border-gray-200 rounded-xl p-4 border`}>
                <div className={`text-xs text-gray-600`}>Valor pago</div>
                <div className="text-sm font-semibold">{formatBRL(amount)}</div>
              </div>
              <div className={`bg-gray-50 border-gray-200 rounded-xl p-4 border`}>
                <div className={`text-xs text-gray-600`}>Clínica</div>
                <div className="text-sm font-medium">{clinic.name}</div>
              </div>
              {method === 'card' && (cardBrand || cardLast4) && (
                <div className={`bg-gray-50 border-gray-200 rounded-xl p-4 border sm:col-span-2`}>
                  <div className={`text-xs text-gray-600`}>Cartão</div>
                  <div className="text-sm font-medium">{cardBrand || ''} {cardLast4 ? `(**** **** **** ${cardLast4})` : ''}</div>
                </div>
              )}
            </div>

            {/* Action buttons removed as requested */}
          </div>
        </div>
      </div>
      </div>
      {/* Footer */}
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
