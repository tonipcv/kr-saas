"use client";

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type ClinicBranding = {
  theme?: 'LIGHT' | 'DARK';
  buttonColor?: string | null;
  buttonTextColor?: string | null;
  name?: string | null;
  logo?: string | null;
};

type Product = {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  originalPrice?: number;
  discountPrice?: number;
};

export default function BrandedCheckoutPage() {
  const params = useParams<{ slug: string; id: string }>();
  const slug = params.slug;
  const productId = params.id;
  const sp = useSearchParams();

  const [branding, setBranding] = useState<ClinicBranding>({});
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  // Quantity fixed to 1 as requested
  const qty = 1;
  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [buyerDocument, setBuyerDocument] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'card' | null>(null);
  const [installments, setInstallments] = useState<number>(1);
  // Card fields
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [cardExpMonth, setCardExpMonth] = useState('');
  const [cardExpYear, setCardExpYear] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  // Address fields
  const [addrStreet, setAddrStreet] = useState('');
  const [addrNumber, setAddrNumber] = useState('');
  const [addrZip, setAddrZip] = useState('');
  const [addrCity, setAddrCity] = useState('');
  const [addrState, setAddrState] = useState('');
  const [addrCountry, setAddrCountry] = useState('BR');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [cardStatus, setCardStatus] = useState<null | { approved: boolean; status?: string; message?: string; last4?: string; brand?: string }>(null);
  // PIX modal state
  const [pixOpen, setPixOpen] = useState(false);
  const [pixQrUrl, setPixQrUrl] = useState<string | null>(null);
  const [pixQrCode, setPixQrCode] = useState<string | null>(null);
  const [pixExpiresAt, setPixExpiresAt] = useState<string | null>(null);
  const [pixRemaining, setPixRemaining] = useState<number>(0);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [paid, setPaid] = useState(false);
  const qrFallbackUrl = useMemo(() => pixQrCode ? `https://api.qrserver.com/v1/create-qr-code/?size=224x224&data=${encodeURIComponent(pixQrCode)}` : null, [pixQrCode]);
  const [success, setSuccess] = useState(false);
  const [cardPolling, setCardPolling] = useState<{ active: boolean; startedAt: number } | null>(null);
  // Checkout countdown (10 minutes)
  const [checkoutRemaining, setCheckoutRemaining] = useState<number>(600);
  // Minimalist approval modal
  const [approveModal, setApproveModal] = useState<{ open: boolean; stage: 'loading' | 'success' }>({ open: false, stage: 'loading' });

  // Auto-preencher endereço padrão quando for cartão (não há entrega)
  useEffect(() => {
    if (paymentMethod === 'card') {
      if (!addrStreet) setAddrStreet('Rua Desconhecida');
      if (!addrNumber) setAddrNumber('0');
      if (!addrZip) setAddrZip('00000000');
      if (!addrCity) setAddrCity('São Paulo');
      if (!addrState) setAddrState('SP');
      if (!addrCountry) setAddrCountry('BR');
    }
  }, [paymentMethod]);

  function resetCardForm() {
    setCardNumber('');
    setCardHolder('');
    setCardExpMonth('');
    setCardExpYear('');
    setCardCvv('');
    setInstallments(1);
    setCardStatus(null);
    setError(null);
  }

  // Dev helper: prefill test data and submit
  async function payNowTest() {
    try {
      setPaymentMethod('card');
      // Buyer
      setBuyerName('João Teste');
      setBuyerEmail('joao+test@exemplo.com');
      setBuyerPhone('+5511999999999');
      setBuyerDocument('06624289511');
      // Address
      setAddrStreet('Av. Paulista');
      setAddrNumber('1000');
      setAddrZip('01310200');
      setAddrCity('São Paulo');
      setAddrState('SP');
      setAddrCountry('BR');
      // Card (sandbox)
      setInstallments(1);
      setCardNumber('4000000000000010');
      setCardHolder('JOAO TESTE');
      setCardExpMonth('12');
      setCardExpYear('30');
      setCardCvv('123');
      // Let state settle then submit
      setTimeout(() => { onSubmit(); }, 150);
    } catch (e) {
      console.error('payNowTest error', e);
    }
  }

  function mapDeclineMessage(raw: { status?: string; acquirer_message?: string; return_code?: string; status_reason?: string }): string | null {
    const s = (raw.status || '').toLowerCase();
    const m = (raw.acquirer_message || raw.status_reason || '').toLowerCase();
    const code = (raw.return_code || '').toLowerCase();
    const text = `${s} ${m} ${code}`.trim();
    if (!text) return null;
    // Common mappings
    if (text.includes('insufficient') || text.includes('saldo') || text.includes('funds')) return 'Saldo insuficiente';
    if (text.includes('expired') || text.includes('expir') || text.includes('data invalida')) return 'Cartão expirado';
    if (text.includes('cvv') || text.includes('cvc') || text.includes('security code') || text.includes('codigo de seguranca')) return 'CVV inválido';
    if (text.includes('do not honor') || text.includes('nao honrar')) return 'Transação não autorizada pelo banco (do not honor)';
    if (text.includes('invalid number') || text.includes('wrong number') || text.includes('card number')) return 'Número do cartão inválido';
    if (text.includes('invalid expiry') || text.includes('invalid exp') || text.includes('data de validade')) return 'Validade do cartão inválida';
    if (text.includes('stolen') || text.includes('lost') || text.includes('pickup')) return 'Cartão bloqueado (perdido/roubado)';
    if (text.includes('processor') && text.includes('unavailable')) return 'Indisponibilidade temporária do processador. Tente novamente.';
    if (text.includes('insufficient limit') || text.includes('sem limite')) return 'Sem limite disponível';
    if (text.includes('suspected fraud') || text.includes('suspeita')) return 'Suspeita de fraude. Contate o emissor do cartão.';
    if (s === 'failed' && !m) return 'Transação falhou';
    return raw.acquirer_message || raw.status || null;
  }

  const theme = 'LIGHT' as 'LIGHT' | 'DARK';
  // Improve default contrast in DARK if clinic didn't set button color
  const btnBg = branding.buttonColor || (theme === 'DARK' ? '#4f46e5' : '#111827');
  const btnFg = branding.buttonTextColor || '#ffffff';
  const inputClass = theme === 'DARK'
    ? 'bg-[#0f0f0f] border-gray-800 text-gray-100 placeholder:text-gray-400'
    : 'bg-gray-100 border-transparent text-gray-900 placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';
  const selectClass = theme === 'DARK'
    ? 'bg-[#0f0f0f] border-gray-800 text-gray-100'
    : 'bg-gray-100 border-transparent text-gray-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';

  const displayPrice = useMemo(() => (product?.discountPrice ?? product?.originalPrice ?? 0), [product]);
  const priceCents = useMemo(() => Math.round((displayPrice || 0) * 100), [displayPrice]);

  useEffect(() => {
    async function loadBranding() {
      try {
        const clinicRes = await fetch(`/api/clinic/by-slug/${slug}`, { cache: 'no-store' });
        if (clinicRes.ok) {
          const cj = await clinicRes.json().catch(() => ({}));
          if (cj?.success && cj?.clinic) {
            setBranding({
              name: cj.clinic.name,
              logo: cj.clinic.logo,
              theme: cj.clinic.theme,
              buttonColor: cj.clinic.buttonColor,
              buttonTextColor: cj.clinic.buttonTextColor,
            });
          }
        }
      } catch {}
    }
    if (slug) loadBranding();
  }, [slug]);

  useEffect(() => {
    async function loadProduct() {
      try {
        setLoading(true);
        const res = await fetch(`/api/products/${productId}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('Produto não encontrado');
        const data = await res.json();
        // Developer console visibility - detailed product data
        console.log('[checkout][product] loaded product details', {
          id: data?.id,
          name: data?.name,
          price: data?.price,
          imageUrl: data?.imageUrl || data?.image_url || data?.image,
          fullData: data
        });
        setProduct(data);
      } catch (e: any) {
        setError(e?.message || 'Erro ao carregar produto');
      } finally {
        setLoading(false);
      }
    }
    if (productId) loadProduct();
  }, [productId]);

  useEffect(() => {
    async function calc() {
      if (!priceCents) { setPreview(null); return; }
      const res = await fetch(`/api/payments/pricing?amount_cents=${priceCents}`);
      const data = await res.json();
      setPreview(data?.preview || null);
    }
    calc();
  }, [priceCents]);

  const totalCents = useMemo(() => priceCents || 0, [priceCents]);
  const perInstallmentCents = useMemo(() => {
    if (paymentMethod !== 'card') return null;
    const list = preview?.installments?.per_installment_cents_list as number[] | undefined;
    if (!list || !Array.isArray(list)) return null;
    const idx = Math.min(Math.max(installments, 1), (preview?.installments?.n || 1)) - 1;
    return list[idx] ?? null;
  }, [paymentMethod, installments, preview]);
  const formatBRL = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
  const formatCents = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((cents || 0) / 100);

  // ===== Card preview helpers =====
  function detectBrand(num: string): string | null {
    const n = (num || '').replace(/\D/g, '');
    if (/^4/.test(n)) return 'VISA';
    if (/^5[1-5]/.test(n)) return 'MASTERCARD';
    if (/^3[47]/.test(n)) return 'AMEX';
    if (/^(6011|65|64[4-9])/.test(n)) return 'DISCOVER';
    if (/^(220[0-4]|222[1-9]|22[3-9]|2[3-6]|27[0-1]|2720)/.test(n)) return 'MASTERCARD'; // 2-series MasterCard
    return null;
  }
  function formatCardNumberPreview(input: string): string {
    const digits = (input || '').replace(/\D/g, '').slice(0, 16);
    const padded = (digits + '••••••••••••••••').slice(0, 16);
    return padded.replace(/(.{4})/g, '$1 ').trim();
  }
  function formatExpiryPreview(mm: string, yy: string): string {
    const m = (mm || '').replace(/\D/g, '').slice(0, 2);
    const y = (yy || '').replace(/\D/g, '').slice(0, 2);
    const mmFinal = m.padEnd(2, '•');
    const yyFinal = y.padEnd(2, '•');
    return `${mmFinal}/${yyFinal}`;
  }
  const cardPreview = {
    brand: detectBrand(cardNumber) || 'CARD',
    number: formatCardNumberPreview(cardNumber),
    name: (cardHolder || 'NOME NO CARTÃO').toUpperCase(),
    expiry: formatExpiryPreview(cardExpMonth, cardExpYear),
  };

  async function onSubmit() {
    setError(null);
    if (!product) return;
    if (!buyerName.trim()) { console.warn('Informe o nome'); return; }
    if (!buyerEmail.trim()) { console.warn('Informe o email'); return; }
    if (!buyerPhone.trim()) { console.warn('Informe o telefone'); return; }
    if (!buyerDocument.trim()) { console.warn('Informe o CPF/CNPJ'); return; }
    if (paymentMethod === 'card') {
      if (!cardNumber.trim() || !cardHolder.trim() || !cardExpMonth.trim() || !cardExpYear.trim() || !cardCvv.trim()) {
        console.warn('Preencha todos os dados do cartão');
        return;
      }
      if (!addrStreet.trim() || !addrNumber.trim() || !addrZip.trim() || !addrCity.trim() || !addrState.trim() || !addrCountry.trim()) {
        console.warn('Preencha todos os dados de endereço');
        return;
      }
    }
    try {
      setSubmitting(true);
      const res = await fetch('/api/checkout/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          productName: product.name,
          amountCents: priceCents,
          buyer: {
            name: buyerName,
            email: buyerEmail,
            phone: buyerPhone,
            document: buyerDocument,
            address: {
              street: addrStreet,
              number: addrNumber,
              zip_code: addrZip,
              city: addrCity,
              state: addrState,
              country: addrCountry || 'BR',
            }
          },
          slug,
          payment: paymentMethod === 'pix'
            ? { method: 'pix' }
            : {
                method: 'card',
                installments,
                card: {
                  number: cardNumber,
                  holder_name: cardHolder,
                  exp_month: cardExpMonth,
                  exp_year: cardExpYear,
                  cvv: cardCvv,
                }
              }
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
      // Reset card UI status before handling
      setCardStatus(null);
      // Handle PIX modal
      if (paymentMethod === 'pix' && data?.order) {
        setOrderId(data.order?.id || null);
        const pix = data?.pix || {};
        setPixQrUrl(pix?.qr_code_url || null);
        setPixQrCode(pix?.qr_code || null);
        // compute remaining
        let seconds = 0;
        if (typeof pix?.expires_in === 'number') seconds = pix.expires_in;
        else if (pix?.expires_at) {
          const end = new Date(pix.expires_at).getTime();
          seconds = Math.max(0, Math.floor((end - Date.now()) / 1000));
        }
        setPixRemaining(seconds);
        setPixExpiresAt(pix?.expires_at || null);
        setPixOpen(true);
        setPaid(false);
      }
      // Handle CARD response like Stripe (inline feedback)
      if (paymentMethod === 'card' && data?.card) {
        const c = data.card;
        const friendly = mapDeclineMessage({ status: c?.status, acquirer_message: c?.acquirer_message, status_reason: c?.status_reason, return_code: c?.acquirer_return_code }) || c?.acquirer_message || c?.soft_descriptor || c?.status || '';
        const msg = friendly;
        setCardStatus({ approved: !!c?.approved, status: c?.status, message: msg, last4: c?.last4 || undefined, brand: c?.brand || undefined });
        if (data?.order_id) setOrderId(String(data.order_id));
        // Start short polling if processing
        const st = (c?.status || '').toLowerCase();
        if (st === 'processing' && data?.order_id) {
          setCardPolling({ active: true, startedAt: Date.now() });
          // show loading modal while processing
          setApproveModal({ open: true, stage: 'loading' });
        }
        if (!c?.approved) {
          setError(msg || 'Pagamento não aprovado');
          const dbg = c?.debug || {};
          try {
            const lines: string[] = [];
            lines.push(`Motivo amigável: ${msg || 'Indisponível'}`);
            if (c?.status) lines.push(`Status: ${c.status}`);
            if (c?.acquirer_message || c?.status_reason) lines.push(`Mensagem do adquirente: ${c.acquirer_message || c.status_reason}`);
            if (c?.acquirer_return_code) lines.push(`Código do adquirente: ${c.acquirer_return_code}`);
            if (dbg?.gateway_response_code || dbg?.gateway_response_message) lines.push(`Gateway: ${dbg.gateway_response_code || ''} ${dbg.gateway_response_message || ''}`.trim());
            if (dbg?.antifraud_score != null) lines.push(`Antifraude score: ${dbg.antifraud_score}`);
            if (c?.brand || c?.last4) lines.push(`Cartão: ${c.brand || ''} ${c.last4 ? '(**** **** **** ' + c.last4 + ')' : ''}`.trim());
            console.group('[checkout][card] Falha no pagamento');
            lines.forEach((l) => console.warn(l));
            if (Object.keys(dbg).length > 0) console.debug('Debug bruto:', dbg);
            console.groupEnd();
          } catch {}
        } else {
          setError(null);
          console.log('[checkout][card] approved', { status: c?.status, last4: c?.last4, brand: c?.brand });
          if (data?.order_id) {
            setSuccess(true);
            const to = `/${slug}/checkout/success?order_id=${data.order_id}&method=card&product_id=${productId}`;
            showApprovedAndRedirect(to);
          }
        }
      }
    } catch (e: any) {
      setError(e?.message || 'Erro ao criar checkout');
    } finally {
      setSubmitting(false);
    }
  }

  // Redirect on success (Pix paid or card approved)
  useEffect(() => {
    if (success || (cardStatus?.approved ?? false)) {
      const params = new URLSearchParams();
      if (orderId) params.set('order_id', orderId);
      const method = (cardStatus?.approved ?? false) ? 'card' : 'pix';
      params.set('method', method);
      params.set('product_id', productId);
      const to = `/${slug}/checkout/success?${params.toString()}`;
      const t = setTimeout(() => { window.location.href = to; }, 2000);
      return () => clearTimeout(t);
    }
  }, [success, cardStatus?.approved, slug]);

  // Countdown for PIX
  useEffect(() => {
    if (!pixOpen || !pixRemaining) return;
    const id = setInterval(() => {
      setPixRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [pixOpen]);

  // Countdown for overall checkout (3 minutes)
  useEffect(() => {
    if (checkoutRemaining <= 0) return;
    const id = setInterval(() => {
      setCheckoutRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [checkoutRemaining]);

  // Polling for PIX status and QR availability
  useEffect(() => {
    if (!pixOpen || paid || !orderId) return;
    const id = setInterval(() => {
      checkPaymentStatus();
    }, 5000);
    return () => clearInterval(id);
  }, [pixOpen, paid, orderId]);

  // Polling for CARD processing -> approved/failed
  useEffect(() => {
    if (!cardPolling?.active || !orderId) return;
    let stopped = false;
    const endAt = (cardPolling.startedAt || Date.now()) + 30_000; // 30s window
    const tick = async () => {
      if (stopped) return;
      try {
        const res = await fetch(`/api/checkout/status?id=${encodeURIComponent(orderId)}`, { cache: 'no-store' });
        const js = await res.json();
        if (res.ok) {
          const pay = Array.isArray(js?.order?.payments) ? js.order.payments[0] : null;
          const ch = Array.isArray(js?.order?.charges) ? js.order.charges[0] : null;
          const tx = ch?.last_transaction || pay?.last_transaction || null;
          const status = (tx?.status || pay?.status || ch?.status || js?.payment_status || js?.order_status || '').toString().toLowerCase();
          if (status && status !== 'processing') {
            const approved = ['paid','approved','authorized'].includes(status);
            setCardStatus((prev) => ({ approved, status, message: prev?.message, last4: prev?.last4, brand: prev?.brand }));
            if (approved) {
              setApproveModal({ open: true, stage: 'success' });
              setSuccess(true);
            }
            setCardPolling(null);
            return;
          }
        }
      } catch {}
      if (Date.now() < endAt) {
        setTimeout(tick, 3000);
      } else {
        setCardPolling(null);
      }
    };
    tick();
    return () => { stopped = true; };
  }, [cardPolling?.active, orderId]);

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  };

  // Show approval modal, then redirect
  function showApprovedAndRedirect(to: string) {
    try {
      setApproveModal({ open: true, stage: 'loading' });
      setTimeout(() => setApproveModal({ open: true, stage: 'success' }), 700);
      setTimeout(() => { window.location.href = to; }, 1600);
    } catch {
      window.location.href = to;
    }
  }

  async function checkPaymentStatus() {
    if (!orderId) return;
    try {
      setChecking(true);
      const res = await fetch(`/api/checkout/status?id=${encodeURIComponent(orderId)}`, { cache: 'no-store' });
      const js = await res.json();
      if (res.ok) {
        const status = (js?.payment_status || js?.order_status || '').toString().toLowerCase();
        if (status.includes('paid') || status === 'paid') {
          setPaid(true);
          setPixOpen(false);
          setSuccess(true);
          if (orderId) {
            const to = `/${slug}/checkout/success?order_id=${orderId}&method=pix&product_id=${productId}`;
            showApprovedAndRedirect(to);
          }
        } else {
          // refresh qr if provided
          if (js?.pix?.qr_code_url) setPixQrUrl(js.pix.qr_code_url);
          if (js?.pix?.qr_code) setPixQrCode(js.pix.qr_code);
        }
      } else {
        throw new Error(js?.error || 'Falha ao consultar pedido');
      }
    } catch (e) {
      console.error('checkPaymentStatus', e);
    } finally {
      setChecking(false);
    }
  }

  if (loading) {
    return (
      <div className={`min-h-screen ${theme === 'DARK' ? 'bg-[#0b0b0b] text-gray-200' : 'bg-gradient-to-b from-gray-50 to-white text-gray-900'} p-4 md:p-6`}>
        <div className="mx-auto max-w-7xl">
          {/* Header skeleton with logo */}
          <div className="text-center mt-6 md:mt-10 mb-8 md:mb-12">
            <div className={`bg-white border-gray-200 h-12 w-40 md:w-56 mx-auto rounded-md border animate-pulse`} />
          </div>

          {/* Content grid: left (form) + right (summary) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left card */}
            <div className="lg:col-span-8">
              <div className={`bg-white border-gray-200 rounded-xl border p-5 shadow-sm`}>
                {/* Buyer info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className={`bg-gray-100 h-4 rounded-md w-20 mb-2 animate-pulse`} />
                  <div className={`bg-gray-100 h-4 rounded-md w-20 mb-2 animate-pulse`} />
                  <div className={`bg-gray-100 h-11 rounded-md col-span-1 animate-pulse`} />
                  <div className={`bg-gray-100 h-11 rounded-md col-span-1 animate-pulse`} />
                  <div className={`bg-gray-100 h-11 rounded-md col-span-1 animate-pulse`} />
                  <div className={`bg-gray-100 h-11 rounded-md col-span-1 animate-pulse`} />
                </div>

                {/* Payment method */}
                <div className="mt-6">
                  <div className={`bg-gray-100 h-4 rounded-md w-40 mb-3 animate-pulse`} />
                  <div className="flex gap-2">
                    <div className={`bg-white h-10 w-20 rounded-lg border border-gray-300 animate-pulse`} />
                    <div className={`bg-white h-10 w-24 rounded-lg border border-gray-300 animate-pulse`} />
                  </div>
                </div>

                {/* Card inputs skeleton */}
                <div className="mt-6 space-y-3">
                  <div className={`bg-gray-100 h-3 rounded-md w-28 animate-pulse`} />
                  <div className={`bg-gray-100 rounded-md h-12 border border-transparent flex items-center animate-pulse`} />
                  <div className={`bg-gray-100 h-3 rounded-md w-36 animate-pulse`} />
                  <div className={`bg-gray-100 h-12 rounded-md animate-pulse`} />
                </div>

                {/* Pay button skeleton */}
                <div className="mt-6 flex justify-end">
                  <div className={`bg-gray-200 h-10 w-32 rounded-md animate-pulse`} />
                </div>
              </div>
            </div>

            {/* Right summary card */}
            <div className="lg:col-span-4">
              <div className={`bg-white border-gray-200 rounded-xl border p-5 shadow-sm`}>
                <div className="flex items-start gap-3">
                  <div className={`bg-gray-100 h-16 w-16 rounded-md border border-gray-200 animate-pulse`} />
                  <div className="flex-1">
                    <div className={`bg-gray-100 h-4 w-40 rounded animate-pulse`} />
                    <div className={`bg-gray-100 h-3 w-24 rounded mt-2 animate-pulse`} />
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className={`bg-gray-100 h-3 w-24 rounded animate-pulse`} />
                    <div className={`bg-gray-100 h-3 w-16 rounded animate-pulse`} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className={`bg-gray-100 h-3 w-28 rounded animate-pulse`} />
                    <div className={`bg-gray-100 h-3 w-20 rounded animate-pulse`} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className={`min-h-screen ${theme === 'DARK' ? 'bg-[#0b0b0b] text-gray-200' : 'bg-gradient-to-b from-gray-50 to-white text-gray-900'} p-6`}>
        <div className="mx-auto max-w-4xl">
          <p className="text-gray-700">Produto não encontrado.</p>
          <div className="mt-3">
            <Link href={`/${slug}`} className="text-sm text-gray-900 underline">Voltar</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${theme === 'DARK' ? 'min-h-screen bg-[#0b0b0b] text-gray-100' : 'min-h-screen bg-gradient-to-b from-gray-50 to-white text-gray-900'} font-normal tracking-[-0.02em] flex flex-col`}>
      <div className="flex-1 flex flex-col items-center p-3 md:p-6 pt-8 md:pt-12 w-full">
        {/* Header com branding */}
        <div className={`w-full max-w-7xl ${theme === 'DARK' ? 'bg-transparent' : 'bg-transparent'} rounded-none border-0 p-0 shadow-none`}> 
          {/* Countdown hidden as requested */}
          <div className="mt-6 md:mt-10 mb-16 text-center">
            {branding.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.logo}
                alt={branding.name || 'Clinic'}
                className="mx-auto h-14 w-auto object-contain mb-4 md:mb-6"
                referrerPolicy="no-referrer"
                decoding="async"
                loading="eager"
              />
            ) : (
              <div className="mx-auto h-10 w-10" />
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left: produto e formulário */}
            <div className="lg:col-span-8">
              <div className={`rounded-xl ${theme === 'DARK' ? 'bg-[#0f0f0f]' : 'bg-white'} p-5`}>
                

                {/* Buyer info (Stripe order) */}
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className={`text-sm ${theme === 'DARK' ? 'text-gray-400' : 'text-gray-600'} mb-1.5`}>Nome</div>
                    <Input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Nome completo" className={`${inputClass} h-11 text-sm`} />
                  </div>
                  <div>
                    <div className={`text-sm ${theme === 'DARK' ? 'text-gray-400' : 'text-gray-600'} mb-1.5`}>Email</div>
                    <Input value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} placeholder="email@dominio.com" className={`${inputClass} h-11 text-sm`} />
                  </div>
                  <div>
                    <div className={`text-sm ${theme === 'DARK' ? 'text-gray-400' : 'text-gray-600'} mb-1.5`}>Telefone</div>
                    <Input value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} placeholder="+5511999999999" className={`${inputClass} h-11 text-sm`} />
                  </div>
                  <div>
                    <div className={`text-sm ${theme === 'DARK' ? 'text-gray-400' : 'text-gray-600'} mb-1.5`}>Documento (CPF/CNPJ)</div>
                    <Input value={buyerDocument} onChange={(e) => setBuyerDocument(e.target.value)} placeholder="Somente números" className={`${inputClass} h-11 text-sm`} />
                  </div>
                </div>

                {/* Payment method */}
                <div className="mt-5">
                  <div className={`text-sm ${theme === 'DARK' ? 'text-gray-400' : 'text-gray-600'} mb-2`}>Forma de pagamento</div>
                  <div className="flex gap-2 mb-3">
                    <button type="button" onClick={() => setPaymentMethod('pix')} className={`px-4 h-10 rounded-lg text-base border ${paymentMethod==='pix' ? 'border-blue-500 text-blue-600 shadow-sm bg-white' : (theme==='DARK'?'border-gray-800 text-gray-300 bg-transparent':'border-gray-300 text-gray-700 bg-white')}`}>Pix</button>
                    <button type="button" onClick={() => setPaymentMethod('card')} className={`px-4 h-10 rounded-lg text-base border ${paymentMethod==='card' ? 'border-blue-500 text-blue-600 shadow-sm bg-white' : (theme==='DARK'?'border-gray-800 text-gray-300 bg-transparent':'border-gray-300 text-gray-700 bg-white')}`}>Cartão</button>
                  </div>
                  {paymentMethod === 'card' && (
                    <div>
                      
                      <div className={`text-sm ${theme === 'DARK' ? 'text-gray-400' : 'text-gray-600'} mb-1.5`}>Parcelas</div>
                      <select value={installments} onChange={(e) => setInstallments(parseInt(e.target.value, 10))} className={`${selectClass} h-11 w-full rounded-md border px-3 text-sm`}>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(n => (
                          <option key={n} value={n}>{n}x</option>
                        ))}
                      </select>
                      {!!perInstallmentCents && (
                        <div className={`mt-1 text-xs ${theme==='DARK'?'text-gray-400':'text-gray-600'}`}>Estimativa: {installments}x de {formatCents(perInstallmentCents)}</div>
                      )}
                      {Array.isArray((preview as any)?.installments?.per_installment_cents_list) && (preview as any)?.installments?.n > 0 && (
                        <div className="mt-3">
                          <div className={`text-xs ${theme==='DARK'?'text-gray-400':'text-gray-600'} mb-1`}>Opções de parcelamento</div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                            {((preview as any).installments.per_installment_cents_list as number[]).slice(0, (preview as any).installments.n).map((cents: number, i: number) => (
                              <div key={i} className="flex items-center justify-between">
                                <span className={`${theme==='DARK'?'text-gray-300':'text-gray-700'}`}>{i+1}x</span>
                                <span className="font-medium">{formatCents(cents)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="mt-4">
                        <div className={`text-sm ${theme==='DARK'?'text-gray-400':'text-gray-600'} mb-1.5`}>País ou região</div>
                        <select value={addrCountry} onChange={(e) => setAddrCountry(e.target.value)} className={`${selectClass} h-11 w-full rounded-md border px-3 text-sm`}>
                          <option value="BR">Brazil</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                

                {paymentMethod === 'card' && (
                  <div className="mt-4 space-y-3">
                    <div className={`text-[12px] ${theme === 'DARK' ? 'text-gray-400' : 'text-gray-600'}`}>Card information</div>
                    {/* Segmented row: number | MM/YY | CVC */}
                    <div className={`${theme==='DARK'?'bg-[#0f0f0f] border border-gray-800':'bg-gray-100 border border-transparent'} rounded-md h-12 flex items-stretch overflow-hidden focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500`}>
                      {/* Number */}
                      <div className="relative flex-1 flex items-center">
                        <input
                          value={cardNumber}
                          onChange={(e) => setCardNumber(e.target.value)}
                          placeholder="1234 1234 1234 1234"
                          className={`w-full h-full px-3 text-sm outline-none bg-transparent ${theme==='DARK'?'text-gray-100 placeholder:text-gray-500':'text-gray-900 placeholder:text-gray-400'}`}
                        />
                        {/* Brand badges */}
                        <div className="absolute right-2 inset-y-0 flex items-center gap-1">
                          <span className="inline-flex items-center justify-center h-4 px-1.5 rounded-[3px] text-[10px] font-semibold text-white bg-[#1a1f71]">VISA</span>
                          <span className="inline-flex items-center justify-center h-4 px-1.5 rounded-[3px] text-[10px] font-semibold text-white bg-[#eb001b]">MC</span>
                        </div>
                      </div>
                      {/* Divider */}
                      <div className={`${theme==='DARK'?'bg-gray-800':'bg-gray-300'} w-px`} />
                      {/* MM/YY */}
                      <div className="w-28 flex items-center">
                        <input
                          value={`${cardExpMonth}`}
                          onChange={(e) => setCardExpMonth(e.target.value)}
                          placeholder="MM"
                          className={`w-1/2 h-full px-2 text-sm outline-none bg-transparent ${theme==='DARK'?'text-gray-100 placeholder:text-gray-500':'text-gray-900 placeholder:text-gray-400'}`}
                        />
                        <span className={`${theme==='DARK'?'text-gray-500':'text-gray-400'} text-xs`}>/</span>
                        <input
                          value={`${cardExpYear}`}
                          onChange={(e) => setCardExpYear(e.target.value)}
                          placeholder="YY"
                          className={`w-1/2 h-full px-2 text-sm outline-none bg-transparent ${theme==='DARK'?'text-gray-100 placeholder:text-gray-500':'text-gray-900 placeholder:text-gray-400'}`}
                        />
                      </div>
                      {/* Divider */}
                      <div className={`${theme==='DARK'?'bg-gray-800':'bg-gray-300'} w-px`} />
                      {/* CVC */}
                      <div className="w-24 flex items-center">
                        <input
                          value={cardCvv}
                          onChange={(e) => setCardCvv(e.target.value)}
                          placeholder="CVC"
                          className={`w-full h-full px-3 text-sm outline-none bg-transparent ${theme==='DARK'?'text-gray-100 placeholder:text-gray-500':'text-gray-900 placeholder:text-gray-400'}`}
                        />
                      </div>
                    </div>

                    {/* Cardholder */}
                    <div>
                      <div className={`text-[12px] ${theme === 'DARK' ? 'text-gray-400' : 'text-gray-600'} mb-1`}>Cardholder name</div>
                      <Input value={cardHolder} onChange={(e) => setCardHolder(e.target.value)} placeholder="Full name on card" className={`${inputClass} h-12 text-base`} />
                    </div>
                  </div>
                )}

                {error && <div className="mt-3 text-sm text-red-500">{error}</div>}

                

                <div className="mt-6 flex items-center justify-end gap-3">
                  {error && (
                    <div className={`text-sm ${theme === 'DARK' ? 'text-red-400' : 'text-red-600'} mr-auto`}>{error}</div>
                  )}
                  <button
                    disabled={submitting}
                    onClick={onSubmit}
                    className="w-full h-12 rounded-md text-base font-medium transition-colors focus:outline-none bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-60"
                  >
                    {submitting ? 'Processando…' : 'Comprar agora'}
                  </button>
                  {process.env.NODE_ENV !== 'production' && (
                    <button
                      type="button"
                      onClick={payNowTest}
                      className={`${theme==='DARK'?'bg-[#0f0f0f] border-gray-800 text-gray-100':'bg-white border-gray-300 text-gray-900'} px-3 h-10 rounded-md text-sm border`}
                      title="Preencher dados de teste e pagar (sandbox)"
                    >
                      Pagar agora (teste)
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Order Summary (desktop) */}
            <aside className="hidden lg:block lg:col-span-4">
              <div className={`rounded-xl ${theme==='DARK' ? 'bg-[#0f0f0f]' : 'bg-white'} p-4 sticky top-6 w-full`}>
                <div className="text-sm font-semibold mb-3">Resumo do pedido</div>
                {product?.imageUrl && (
                  <div className="rounded-xl overflow-hidden border border-gray-200 mb-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={product.imageUrl} alt={product.name} className="w-full h-32 object-cover" />
                  </div>
                )}
                <div className="text-[15px] font-medium">{product?.name || 'Massagem Modeladore'}</div>
                <div className={`${theme==='DARK'?'text-gray-400':'text-gray-600'} text-sm mt-1`}>
                  {product?.description || 'A massagem modeladora utiliza movimentos rápidos e firmes para estimular a circulação sanguínea, quebrar as células de gordura e eliminar toxinas. Ajuda a reduzir a celulite, melhorar o contorno corporal e diminuir o inchaço. É um tratamento que requer sessões regulares para manter os resultados.'}
                </div>
                <div className="mt-4 pt-3 border-t border-gray-200 flex items-center justify-between">
                  <div className={`${theme==='DARK'?'text-gray-400':'text-gray-600'} text-sm`}>Total</div>
                  <div className="text-base font-semibold">{formatBRL(displayPrice as number)}</div>
                </div>
              </div>
            </aside>
          </div>
        </div>

      </div>
      {/* Rodapé */}
      <footer className="mt-6 mb-4">
        <div className={`flex items-center justify-center gap-2 ${theme === 'DARK' ? 'text-gray-400' : 'text-gray-400'}`}>
          <span className="text-[10px]">Powered by</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Sistema" className={`h-4 object-contain opacity-60 ${theme === 'DARK' ? 'invert' : ''}`} />
        </div>
      </footer>
      {/* PIX Modal */}
      {pixOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className={`${theme==='DARK'?'bg-[#111] text-gray-100 border border-gray-800':'bg-white text-gray-900 border border-gray-200'} w-full max-w-md rounded-2xl p-5 shadow-xl`}>
            <div className="text-center mb-3">
              <div className="text-sm font-semibold">Pague com Pix</div>
              <div className={`${theme==='DARK'?'text-gray-400':'text-gray-600'} text-xs mt-1`}>Expira em {fmtTime(pixRemaining)}</div>
            </div>
            {pixQrUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pixQrUrl} alt="QR Code Pix" className="mx-auto w-56 h-56 object-contain rounded-md border border-gray-700/30" />
            ) : qrFallbackUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrFallbackUrl} alt="QR Code Pix" className="mx-auto w-56 h-56 object-contain rounded-md border border-gray-700/30" />
            ) : (
              <div className={`${theme==='DARK'?'bg-[#0f0f0f]':'bg-gray-50'} rounded-md p-3 text-xs break-all`}>{pixQrCode || 'Aguardando QR Code...'}</div>
            )}
            <div className="mt-4 grid grid-cols-1 gap-2">
              <button
                className={`${theme==='DARK'?'bg-[#0f0f0f] border-gray-800 text-gray-100':'bg-white border-gray-300 text-gray-900'} h-10 rounded-md text-sm border`}
                onClick={async () => { if (pixQrCode) { await navigator.clipboard.writeText(pixQrCode); } }}
                disabled={!pixQrCode}
              >
                Copiar código
              </button>
              {process.env.NODE_ENV !== 'production' && (
                <button
                  className={`${theme==='DARK'?'bg-emerald-900/20 border-emerald-800 text-emerald-300':'bg-emerald-50 border-emerald-300 text-emerald-700'} h-10 rounded-md text-sm border`}
                  onClick={() => {
                    try {
                      setPixOpen(false);
                      setPaid(true);
                      setSuccess(true);
                      if (orderId) {
                        const to = `/${slug}/checkout/success?order_id=${orderId}&method=pix&product_id=${productId}`;
                        showApprovedAndRedirect(to);
                      }
                    } catch {}
                  }}
                >
                  Simular pagamento (dev)
                </button>
              )}
            </div>
            <div className="mt-3 flex items-center justify-end">
              <button
                className={`${theme==='DARK'?'text-gray-300':'text-gray-700'} text-sm underline`}
                onClick={() => setPixOpen(false)}
              >
                Fechar
              </button>
            </div>
            {pixRemaining === 0 && (
              <div className={`${theme==='DARK'?'text-gray-300':'text-gray-700'} text-xs mt-2`}>Prazo expirado — gere um novo Pix clicando em Pagar agora.</div>
            )}
          </div>
        </div>
      )}

      {/* Processing/Approved Modal (Card) */}
      {approveModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className={`${theme==='DARK'?'bg-[#111] text-gray-100 border border-gray-800':'bg-white text-gray-900 border border-gray-200'} w-full max-w-xs rounded-2xl p-5 shadow-xl text-center`}> 
            {approveModal.stage === 'loading' ? (
              <>
                <div className="mx-auto h-10 w-10 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
                <div className="mt-3 text-sm font-medium">Processando pagamento…</div>
              </>
            ) : (
              <>
                <div className="mx-auto h-10 w-10 rounded-full bg-emerald-500 flex items-center justify-center">
                  <span className="text-white text-lg">✓</span>
                </div>
                <div className="mt-3 text-sm font-medium">Pagamento aprovado</div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
