"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Product = {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  originalPrice?: number;
  discountPrice?: number;
};

export default function CheckoutPage({ params }: { params: { id: string } }) {
  const productId = params.id;
  const sp = useSearchParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState<number>(Number(sp.get('qty') || 1));
  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<any>(null);

  const priceCents = useMemo(() => {
    const price = product?.discountPrice ?? product?.originalPrice ?? 0;
    return Math.round((price || 0) * 100);
  }, [product]);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const res = await fetch(`/api/products/${productId}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('Produto não encontrado');
        const data = await res.json();
        setProduct(data);
      } catch (e: any) {
        setError(e?.message || 'Erro ao carregar produto');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [productId]);

  useEffect(() => {
    async function calc() {
      if (!priceCents || qty <= 0) { setPreview(null); return; }
      const res = await fetch(`/api/payments/pricing?amount_cents=${priceCents * qty}`);
      const data = await res.json();
      setPreview(data?.preview || null);
    }
    calc();
  }, [priceCents, qty]);

  const totalCents = useMemo(() => (priceCents * qty) || 0, [priceCents, qty]);

  const formatCurrency = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((cents || 0) / 100);

  async function onSubmit() {
    setError(null);
    if (!product) return;
    if (!buyerName.trim()) return setError('Informe o nome');
    if (!buyerEmail.trim()) return setError('Informe o email');
    if (!buyerPhone.trim()) return setError('Informe o telefone');
    try {
      setSubmitting(true);
      const res = await fetch('/api/checkout/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          quantity: qty,
          buyer: { name: buyerName, email: buyerEmail, phone: buyerPhone },
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
      // placeholder: redirect/link if provided
      if (data?.payment_url) {
        window.location.href = data.payment_url;
      } else {
        alert('Pedido criado com sucesso. Integração de pagamento será concluída em breve.');
      }
    } catch (e: any) {
      setError(e?.message || 'Erro ao criar checkout');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-6 text-gray-900">
        <div className="mx-auto max-w-5xl">
          <div className="h-6 bg-gray-200 w-40 rounded mb-3" />
          <div className="h-10 bg-gray-100 w-64 rounded" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-6 text-gray-900">
        <div className="mx-auto max-w-5xl">
          <p className="text-gray-700">Produto não encontrado.</p>
          <div className="mt-3">
            <Link href="/" className="text-sm text-gray-900 underline">Voltar</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white text-gray-900">
      <div className="min-h-screen flex flex-col items-center p-4">
        <div className="w-full max-w-5xl bg-white border border-gray-200 rounded-2xl shadow-lg p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <div className="rounded-xl border border-gray-200 p-4">
                <div className="flex gap-4">
                  <div className="h-20 w-20 rounded-lg bg-gray-100 overflow-hidden border border-gray-200 flex items-center justify-center">
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="text-gray-400 text-xs">sem imagem</div>
                    )}
                  </div>
                  <div>
                    <h1 className="text-[18px] font-semibold">{product.name}</h1>
                    {product.description && <p className="text-sm text-gray-600 mt-1">{product.description}</p>}
                    <div className="mt-2 text-gray-900 font-semibold">{formatCurrency(priceCents/100)}</div>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <div className="text-[12px] text-gray-600 mb-1">Quantidade</div>
                    <Input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, parseInt(e.target.value || '1', 10)))} className="h-10" />
                  </div>
                  <div>
                    <div className="text-[12px] text-gray-600 mb-1">Nome</div>
                    <Input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Nome completo" className="h-10" />
                  </div>
                  <div>
                    <div className="text-[12px] text-gray-600 mb-1">Email</div>
                    <Input value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} placeholder="email@dominio.com" className="h-10" />
                  </div>
                  <div>
                    <div className="text-[12px] text-gray-600 mb-1">Telefone</div>
                    <Input value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} placeholder="+5511999999999" className="h-10" />
                  </div>
                </div>

                {error && <div className="mt-3 text-sm text-red-600">{error}</div>}

                <div className="mt-5 flex gap-2">
                  <Button onClick={onSubmit} disabled={submitting} className="bg-gray-900 text-white hover:bg-black">
                    {submitting ? 'Processando…' : 'Pagar agora'}
                  </Button>
                  <Button asChild variant="outline" className="h-10">
                    <Link href="/">Cancelar</Link>
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 p-4 bg-gray-50">
              <div className="text-sm font-semibold">Resumo</div>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-600">Subtotal</span><span className="font-medium text-gray-900">{formatCurrency(totalCents)}</span></div>
                {preview && (
                  <>
                    <div className="flex justify-between"><span className="text-gray-600">Taxa plataforma</span><span className="font-medium text-gray-900">{formatCurrency(preview.platform_fee_cents)}</span></div>
                    {preview.installments && (
                      <div className="text-xs text-gray-600">
                        Parcelas (exemplo): {preview.installments.n}x de {(preview.installments.per_installment_cents_list?.[0] ? formatCurrency(preview.installments.per_installment_cents_list[0]) : '—')}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <footer className="mt-6">
          <div className="flex items-center justify-center gap-2 text-gray-400">
            <span className="text-[10px]">Powered by</span>
            <img src="/logo.png" alt="Sistema" className="h-4 object-contain opacity-60" />
          </div>
        </footer>
      </div>
    </div>
  );
}
