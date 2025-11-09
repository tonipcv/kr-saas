"use client";

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type Product = { id: string; name: string; imageUrl?: string; price?: number; originalPrice?: number; discountPrice?: number };

export default function SuccessPage() {
  const sp = useSearchParams();
  const productId = sp.get('product_id');
  const orderId = sp.get('order_id');
  const method = sp.get('method');
  const installments = sp.get('installments');
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState<boolean>(!!productId);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!productId) { setLoading(false); return; }
      try {
        setLoading(true);
        const res = await fetch(`/api/products/public/${productId}`, { cache: 'no-store' });
        const js = await res.json().catch(() => ({}));
        if (!active) return;
        setProduct({
          id: js?.id,
          name: js?.name || 'Produto',
          imageUrl: js?.imageUrl || js?.image_url || js?.image,
          price: typeof js?.price === 'number' ? js.price : (typeof js?.price === 'string' ? Number(js.price) : undefined),
          originalPrice: js?.originalPrice,
          discountPrice: js?.discountPrice,
        });
      } catch {
        if (active) setProduct(null);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [productId]);

  const displayPrice = useMemo(() => {
    if (!product) return null;
    const p = product.price ?? product.discountPrice ?? product.originalPrice;
    return typeof p === 'number' ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p) : null;
  }, [product]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-3 h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
          <span className="text-green-600 text-xl">✓</span>
        </div>
        <h1 className="text-lg font-medium">Pagamento confirmado</h1>
        <p className="mt-2 text-sm text-gray-600">Transação concluída com sucesso{method ? ` (${method})` : ''}.</p>
        {orderId && (
          <p className="mt-1 text-xs text-gray-500">Pedido: {orderId}{installments ? ` · ${installments}x` : ''}</p>
        )}
        {!loading && product && (
          <div className="mt-4 flex items-center gap-3 justify-center">
            {product.imageUrl && (<img src={product.imageUrl} alt={product.name} className="h-12 w-12 rounded object-cover" />)}
            <div className="text-left">
              <p className="text-sm font-medium">{product.name}</p>
              {displayPrice && <p className="text-sm text-gray-600">{displayPrice}</p>}
            </div>
          </div>
        )}
        <div className="mt-5">
          <a href="/" className="inline-block px-4 py-2 text-sm rounded bg-blue-600 text-white">Voltar</a>
        </div>
      </div>
    </div>
  );
}
