"use client";

import React, { useEffect, useMemo, useState } from 'react';

function getOsVersion(): string {
  const ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '') || '';
  let m: RegExpMatchArray | null = null;
  if (ua.includes('Mac OS X')) { m = ua.match(/Mac OS X (\d+[._]\d+(?:[._]\d+)?)/); if (m) return m[1].replace(/_/g, '.'); }
  if (ua.includes('Windows NT')) { m = ua.match(/Windows NT (\d+\.\d+)/); if (m) return m[1]; }
  if (ua.includes('Android')) { m = ua.match(/Android (\d+(?:\.\d+)?)/); if (m) return m[1]; }
  if (ua.includes('iPhone OS') || ua.includes('iPad')) { m = ua.match(/OS (\d+[._]\d+(?:[._]\d+)?)/); if (m) return m[1].replace(/_/g, '.'); }
  if (ua.includes('Linux')) return 'Linux';
  return '14';
}
import { useRouter, useSearchParams } from 'next/navigation';
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
  clinic?: { slug?: string | null } | null;
};

export default function CheckoutPage({ params }: { params: { id: string } }) {
  const productId = params.id;
  const sp = useSearchParams();
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState<number>(Number(sp.get('qty') || 1));
  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [buyerCpf, setBuyerCpf] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [ofModalOpen, setOfModalOpen] = useState(false);
  const [banks, setBanks] = useState<any[]>([]);
  const [banksLoading, setBanksLoading] = useState(false);
  const [banksErr, setBanksErr] = useState<string | null>(null);
  const [selectedBankIdx, setSelectedBankIdx] = useState<number | null>(null);
  const [ofProcessing, setOfProcessing] = useState(false);
  const [bankCheckLoading, setBankCheckLoading] = useState(false);
  const [bankNeedsEnrollment, setBankNeedsEnrollment] = useState<boolean | null>(null);
  const [bankCheckError, setBankCheckError] = useState<string | null>(null);
  const [preferredOrgId, setPreferredOrgId] = useState<string | null>(null);
  const [showEnrollSuccess, setShowEnrollSuccess] = useState(false);

  const priceCents = useMemo(() => {
    const price = product?.discountPrice ?? product?.originalPrice ?? 0;
    return Math.round((price || 0) * 100);
  }, [product]);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        // Use public endpoint to also get clinic slug for redirection to branded checkout
        const res = await fetch(`/api/products/public/${productId}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('Produto não encontrado');
        const data = await res.json();
        setProduct(data);
        // If this product belongs to a clinic with slug, redirect to branded checkout preserving query params
        const slug = data?.clinic?.slug;
        if (slug) {
          const qs = typeof window !== 'undefined' ? window.location.search : '';
          const to = `/${slug}/checkout/${productId}${qs}`;
          // Use replace to avoid back navigation to unbranded route
          window.location.replace(to);
          return;
        }
        // Try to prefill buyer from profile (incl. userId to use in OF checks)
        try {
          const meRes = await fetch('/api/profile', { cache: 'no-store' });
          if (meRes.ok) {
            const me = await meRes.json();
            if (me?.name && !buyerName) setBuyerName(me.name);
            if (me?.email && !buyerEmail) setBuyerEmail(me.email);
            if (me?.phone && !buyerPhone) setBuyerPhone(me.phone);
          }
        } catch {}
      } catch (e: any) {
        setError(e?.message || 'Erro ao carregar produto');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [productId]);

  // Open Finance Pix (consent -> authorization-url -> redirect)
  async function startObPix() {
    setError(null);
    if (!product) return;
    try {
      setOfModalOpen(true);
      setBanksErr(null);
      if (banks.length === 0 && !banksLoading) {
        setBanksLoading(true);
        try {
          const res = await fetch('/api/open-finance/participants', { cache: 'no-store' });
          const j = await res.json();
          const list = Array.isArray(j?.participants) ? j.participants : [];
          setBanks(list);
          if (list.length === 1) setSelectedBankIdx(0);
        } catch (e: any) {
          setBanksErr(e?.message || 'Falha ao carregar bancos');
        } finally {
          setBanksLoading(false);
        }
      }
    } catch (e: any) {
      setError(e?.message || 'Erro no fluxo Open Finance Pix');
    }
  }

  function extractIds(p: any): { organisationId?: string; authorisationServerId?: string } {
    const organisationId = p?.organisationId || p?.organisation_id || p?.OrganisationId || p?.OrganisationID || p?.Organisation?.OrganisationId || p?.Organisation?.id;
    let authorisationServerId = p?.authorisationServerId || p?.authorisation_server_id || p?.AuthorisationServerId || p?.AuthorisationServerID;
    if (!authorisationServerId) {
      const arr = p?.authorisationServers || p?.AuthorisationServers || p?.authorisation_servers || [];
      if (Array.isArray(arr) && arr.length > 0) {
        const as = arr[0];
        authorisationServerId = as?.authorisationServerId || as?.AuthorisationServerId || as?.id || as?.AuthorisationServerID;
      }
    }
    return { organisationId, authorisationServerId };
  }

  async function onSelectBank(idx: number) {
    setSelectedBankIdx(idx);
    setBankCheckError(null);
    setBankNeedsEnrollment(null);
    try {
      const p = banks[idx];
      const { organisationId } = extractIds(p);
      let userId = '';
      try {
        const meRes = await fetch('/api/profile', { cache: 'no-store' });
        if (meRes.ok) { const me = await meRes.json(); userId = me?.id || ''; }
      } catch {}
      if (!userId || !organisationId) {
        setBankNeedsEnrollment(true);
        return;
      }
      setBankCheckLoading(true);
      const checkRes = await fetch(`/api/v2/enrollments/check`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', body: JSON.stringify({ userId, organisationId }) });
      const check = await checkRes.json().catch(() => ({}));
      if (!checkRes.ok) throw new Error(check?.error || 'Falha na verificação do vínculo');
      setBankNeedsEnrollment(Boolean(check?.needsEnrollment));
    } catch (e: any) {
      setBankCheckError(e?.message || 'Falha ao verificar vínculo');
      setBankNeedsEnrollment(null);
    } finally {
      setBankCheckLoading(false);
    }
  }

  async function handleOfVerifyAndPay() {
    try {
      if (selectedBankIdx == null || !banks[selectedBankIdx]) return;
      if (!product) return;
      setOfProcessing(true);
      const p = banks[selectedBankIdx];
      const { organisationId } = extractIds(p);
      let userId = '';
      try {
        const meRes = await fetch('/api/profile', { cache: 'no-store' });
        if (meRes.ok) { const me = await meRes.json(); userId = me?.id || ''; }
      } catch {}
      if (!userId || !organisationId) {
        try {
          const externalId = crypto.randomUUID();
          const payload = {
            userId: userId || externalId,
            clinicId: null,
            redirectUri: `${window.location.origin}/redirect`,
            enrollment: {
              document: ((buyerCpf || '76109277673')).replace(/\D/g, ''),
              deviceName: (typeof navigator !== 'undefined' ? navigator.userAgent : 'browser'),
              externalId,
            },
            riskSignals: {
              deviceId: externalId,
              osVersion: getOsVersion(),
              userTimeZoneOffset: String(-(new Date().getTimezoneOffset()/60)).padStart(2,'0'),
              language: (typeof navigator !== 'undefined' ? navigator.language : 'pt-BR').slice(0,2),
              screenDimensions: { width: typeof window !== 'undefined' ? window.innerWidth : 1080, height: typeof window !== 'undefined' ? window.innerHeight : 1920 },
              accountTenure: (new Date(Date.now() - 365*24*60*60*1000)).toISOString().slice(0,10),
              isRootedDevice: false,
              elapsedTimeSinceBoot: Date.now(),
              screenBrightness: 1,
            },
            context: {
              productId: product.id,
              amountCents: Number(totalCents || 0),
              currency: 'BRL',
              orderRef: `ORDER_${Date.now()}_${Math.random().toString(36).slice(2,9)}`,
            },
          } as any;
          sessionStorage.setItem('of_enroll', JSON.stringify(payload));
          sessionStorage.setItem('of_return_to', window.location.href);
        } catch {}
        window.location.href = '/open-finance/select-bank';
        return;
      }

      const checkRes = await fetch(`/api/v2/enrollments/check`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', body: JSON.stringify({ userId, organisationId }) });
      const check = await checkRes.json().catch(() => ({}));
      if (!checkRes.ok) throw new Error(check?.error || 'Falha na verificação do vínculo');
      if (check.needsEnrollment) {
        try {
          const externalId = crypto.randomUUID();
          const payload = {
            userId: userId,
            clinicId: null,
            redirectUri: `${window.location.origin}/redirect`,
            enrollment: {
              document: ((buyerCpf || '76109277673')).replace(/\D/g, ''),
              deviceName: (typeof navigator !== 'undefined' ? navigator.userAgent : 'browser'),
              externalId,
            },
            riskSignals: {
              deviceId: externalId,
              osVersion: getOsVersion(),
              userTimeZoneOffset: String(-(new Date().getTimezoneOffset()/60)).padStart(2,'0'),
              language: (typeof navigator !== 'undefined' ? navigator.language : 'pt-BR').slice(0,2),
              screenDimensions: { width: typeof window !== 'undefined' ? window.innerWidth : 1080, height: typeof window !== 'undefined' ? window.innerHeight : 1920 },
              accountTenure: new Date(Date.now() - 365*24*60*60*1000).toISOString().slice(0,10),
              isRootedDevice: false,
              elapsedTimeSinceBoot: Date.now(),
              screenBrightness: 1,
            },
            context: {
              productId: product.id,
              amountCents: Number(totalCents || 0),
              currency: 'BRL',
              orderRef: `ORDER_${Date.now()}_${Math.random().toString(36).slice(2,9)}`,
            },
          } as any;
          sessionStorage.setItem('of_enroll', JSON.stringify(payload));
          sessionStorage.setItem('of_return_to', window.location.href);
        } catch {}
        window.location.href = '/open-finance/select-bank';
        return;
      }

      const enrollmentId: string = String(check.enrollmentId || '');
      if (!enrollmentId) throw new Error('EnrollmentId ausente');

      const orderRef = `ORDER_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const cpfOnly = (buyerCpf || '').replace(/[^0-9]/g, '');

      const res = await fetch('/api/open-finance/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          enrollmentId,
          amount: Number(totalCents || 0),
          currency: 'BRL',
          payer: { name: buyerName, email: buyerEmailState(), cpf: cpfOnly },
          orderRef,
          userId,
        })
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || 'Falha ao criar pagamento');
      }
      const j = await res.json();
      const paymentLinkId: string = j?.paymentLinkId;
      const redirect_uri: string = j?.redirect_uri;
      if (!paymentLinkId || !redirect_uri) throw new Error('Resposta inválida do provedor');

      try {
        sessionStorage.setItem('of_payment_link_id', paymentLinkId);
        sessionStorage.setItem('of_payment_product_id', product.id);
        sessionStorage.setItem('of_payment_order_ref', orderRef);
      } catch {}

      window.location.href = redirect_uri;
    } catch (e: any) {
      setError(e?.message || 'Falha ao iniciar pagamento');
    } finally {
      setOfProcessing(false);
      setOfModalOpen(false);
    }
  }

  function buyerEmailState() {
    return buyerEmail;
  }

  // Detect return from enrollment and show success UX (no auto-pay)
  useEffect(() => {
    try {
      const completed = typeof window !== 'undefined' ? (window.sessionStorage.getItem('of_enrollment_complete') === '1') : false;
      if (completed) {
        window.sessionStorage.removeItem('of_enrollment_complete');
        // Try to preselect last bank via of_enroll_ctx (best-effort only)
        let orgId: string | null = null;
        try {
          const s = window.sessionStorage.getItem('of_enroll_ctx');
          if (s) {
            const ctx = JSON.parse(s);
            orgId = ctx?.organisationId || ctx?.organizationId || null;
          }
        } catch {}
        setPreferredOrgId(orgId);
        setShowEnrollSuccess(true);
        // Open modal and load banks list
        startObPix();
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
                  <div>
                    <div className="text-[12px] text-gray-600 mb-1">CPF</div>
                    <Input value={buyerCpf} onChange={(e) => setBuyerCpf(e.target.value)} placeholder="000.000.000-00" className="h-10" />
                  </div>
                </div>

                {error && <div className="mt-3 text-sm text-red-600">{error}</div>}

                <div className="mt-5 flex gap-2">
                  <Button onClick={onSubmit} disabled={submitting} className="bg-gray-900 text-white hover:bg-black">
                    {submitting ? 'Processando…' : 'Pagar agora'}
                  </Button>
                  <Button onClick={startObPix} disabled={submitting || !totalCents} variant="outline" className="h-10">
                    {submitting ? 'Processando…' : 'Pagar com Open Finance Pix'}
                  </Button>
                  <Button asChild variant="outline" className="h-10">
                    <Link href="/">Cancelar</Link>
                  </Button>
                </div>
                {ofModalOpen && (
                  <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                    <div className="bg-white w-full max-w-md rounded-lg border p-4">
                      <div className="text-base font-semibold">Open Finance Pix</div>
                      <div className="text-sm text-gray-600 mt-1">Selecione o banco e verificaremos seu cadastro biométrico.</div>
                      <div className="mt-3">
                        {banksErr && <div className="text-sm text-red-600">{banksErr}</div>}
                        <div className="max-h-48 overflow-auto space-y-2 mt-2">
                          {banksLoading ? (
                            <div className="text-sm text-gray-600">Carregando bancos...</div>
                          ) : (
                            banks.map((b, idx) => (
                              <button key={idx} onClick={() => onSelectBank(idx)} className={`w-full text-left px-3 py-2 rounded border text-sm ${selectedBankIdx===idx?'border-blue-500 bg-blue-50':'border-gray-200 hover:bg-gray-50'}`}>
                                {b?.name || b?.OrganisationName || `Banco ${idx+1}`}
                              </button>
                            ))
                          )}
                          {banks.length===0 && !banksLoading && (
                            <div className="text-sm text-gray-600">Nenhum banco disponível.</div>
                          )}
                        </div>
                      </div>
                      {!!bankCheckError && <div className="mt-2 text-sm text-red-600">{bankCheckError}</div>}
                      {selectedBankIdx!=null && (
                        <div className="mt-2 text-xs text-gray-600">
                          {bankCheckLoading ? 'Verificando cadastro biométrico…' : bankNeedsEnrollment===true ? 'Você ainda não possui vínculo para este banco.' : bankNeedsEnrollment===false ? 'Vínculo encontrado. Você pode pagar agora.' : 'Selecione um banco para verificar o vínculo.'}
                        </div>
                      )}
                      <div className="mt-4 flex gap-2 justify-end">
                        <Button variant="outline" onClick={() => setOfModalOpen(false)}>Cancelar</Button>
                        {bankNeedsEnrollment !== false && (
                          <Button
                            variant="outline"
                            onClick={async () => {
                              try {
                                if (typeof window !== 'undefined') {
                                  const current = window.location.href;
                                  let branded = current;
                                  try {
                                    // Try to normalize to slugged checkout URL
                                    const pRes = await fetch(`/api/products/public/${encodeURIComponent(product!.id)}`, { cache: 'no-store' });
                                    const p = await pRes.json().catch(() => ({}));
                                    const slug = p?.clinic?.slug;
                                    if (pRes.ok && slug) {
                                      const u = new URL(current);
                                      branded = `${u.origin}/${slug}/checkout/${product!.id}${u.search}`;
                                    }
                                  } catch {}
                                  window.sessionStorage.setItem('of_return_to', branded);
                                }
                              } catch {}
                              try {
                                // Also persist return URL server-side (cookie) to survive cross-domain
                                const toPersist = (typeof window !== 'undefined') ? (window.sessionStorage.getItem('of_return_to') || window.location.href) : '';
                                await fetch('/api/v2/return-to', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: toPersist }) });
                              } catch {}
                              window.location.href = '/open-finance/select-bank';
                            }}
                          >
                            Confirmar
                          </Button>
                        )}
                        {bankNeedsEnrollment === false && (
                          <Button disabled={selectedBankIdx==null || ofProcessing} onClick={handleOfVerifyAndPay}>
                            {ofProcessing ? 'Processando…' : 'Pagar'}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
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
