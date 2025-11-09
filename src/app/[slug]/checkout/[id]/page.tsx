"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';

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
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from 'react-international-phone';
import 'react-international-phone/style.css';

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
  // subscription support
  type?: 'SUBSCRIPTION' | 'ONE_TIME' | string;
  providerPlanId?: string | null;
};

export default function BrandedCheckoutPage() {
  const params = useParams<{ slug: string; id: string }>();
  const slug = params.slug;
  const productId = params.id;
  const sp = useSearchParams();
  const offerParam = useMemo(() => sp?.get('offer') || null, [sp]);

  const [branding, setBranding] = useState<ClinicBranding>({});
  const [product, setProduct] = useState<Product | null>(null);
  type Offer = { id: string; name?: string; description?: string | null; priceCents: number; currency?: string; isSubscription?: boolean; intervalCount?: number|null; intervalUnit?: 'DAY'|'WEEK'|'MONTH'|'YEAR'|null; trialDays?: number|null; maxInstallments?: number|null; paymentMethods?: Array<{ method: 'PIX'|'CARD'|'OPEN_FINANCE'|'OPEN_FINANCE_AUTOMATIC'; active: boolean }>; active?: boolean };
  const [offer, setOffer] = useState<Offer | null>(null);
  const [loading, setLoading] = useState(true);
  // Quantity fixed to 1 as requested
  const qty = 1;
  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [buyerDocument, setBuyerDocument] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'card' | 'pix_ob' | null>('card');
  const [hasRedirected, setHasRedirected] = useState(false);
  const LOCAL_REDIRECT_KEY = 'checkout_pending_redirect_to';
  const [showEmergency, setShowEmergency] = useState(false);
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
  const [pricing, setPricing] = useState<any>(null);
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
  const redirectingRef = useRef<boolean>(false);
  const [cardPolling, setCardPolling] = useState<{ active: boolean; startedAt: number } | null>(null);
  // Allowed methods derived from offer
  const pixAllowed = useMemo(() => (offer?.paymentMethods || []).some(x => x.method === 'PIX' && x.active), [offer?.paymentMethods]);
  const cardAllowed = useMemo(() => (offer?.paymentMethods || []).some(x => x.method === 'CARD' && x.active), [offer?.paymentMethods]);
  const openFinanceAllowed = useMemo(() => (offer?.paymentMethods || []).some(x => x.method === 'OPEN_FINANCE' && x.active), [offer?.paymentMethods]);
  const openFinanceAutoAllowed = useMemo(() => (offer?.paymentMethods || []).some(x => x.method === 'OPEN_FINANCE_AUTOMATIC' && x.active), [offer?.paymentMethods]);
  // Open Finance participants (bank selection for pix_ob)
  const [participants, setParticipants] = useState<any[]>([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<{ organisationId?: string; authorisationServerId?: string; name?: string } | null>(null);

  // Ensure selected method is allowed whenever offer changes
  useEffect(() => {
    const isSub = !!offer?.isSubscription;
    if (isSub) {
      // Prefer OPEN_FINANCE_AUTOMATIC, then PIX, then CARD
      if (openFinanceAutoAllowed) setPaymentMethod('pix_ob');
      else if (pixAllowed) setPaymentMethod('pix');
      else if (cardAllowed) setPaymentMethod('card');
      else setPaymentMethod(null);
      return;
    }
    // One-time: prefer CARD, then OPEN_FINANCE, then PIX
    if (cardAllowed) setPaymentMethod('card');
    else if (openFinanceAllowed) setPaymentMethod('pix_ob');
    else if (pixAllowed) setPaymentMethod('pix');
    else setPaymentMethod(null);
  }, [cardAllowed, pixAllowed, openFinanceAllowed, openFinanceAutoAllowed, offer?.isSubscription]);
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
      setBuyerDocument('76109277673');
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

  const displayPrice = useMemo(() => (
    offer?.priceCents != null ? (offer.priceCents / 100) : (product?.discountPrice ?? product?.originalPrice ?? 0)
  ), [offer?.priceCents, product]);
  const priceCents = useMemo(() => {
    if (offer?.priceCents != null) return offer.priceCents;
    return Math.round((displayPrice || 0) * 100);
  }, [offer?.priceCents, displayPrice]);

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
        // Use public endpoint so anonymous users (checkout) can fetch product details
        const res = await fetch(`/api/products/public/${productId}`, { cache: 'no-store' });
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
        // Map public payload to the shape expected by the checkout UI
        setProduct({
          ...data,
          originalPrice: typeof data?.price === 'number' ? Number(data.price) : (typeof data?.price === 'string' ? Number(data.price) : undefined),
          imageUrl: data?.imageUrl || data?.image_url || data?.image,
        });
        // Load offers and select the first active one (source of truth)
        try {
          const ores = await fetch(`/api/products/${productId}/offers`, { cache: 'no-store' });
          if (ores.ok) {
            const oj = await ores.json();
            const list: Offer[] = Array.isArray(oj?.offers) ? oj.offers : [];
            console.log('[checkout][offers] loaded offers', { offerParam, count: list.length, offerIds: list.map(o => o.id) });
            const chosen = offerParam ? (list.find(o => o.id === offerParam) || null) : null;
            if (offerParam && !chosen) {
              console.warn('[checkout][offers] URL offer not found in list', { offerParam, available: list.map(o => o.id) });
            }
            const active = chosen || list.find(o => o.active) || list[0] || null;
            console.log('[checkout][offers] selected offer', { 
              offerId: active?.id, 
              priceCents: active?.priceCents, 
              isChosen: !!chosen, 
              isFallback: !chosen 
            });
            if (active) {
              setOffer(active);
              // Default payment method from offer
              const pixOn = (active.paymentMethods || []).some(x => x.method === 'PIX' && x.active);
              const cardOn = (active.paymentMethods || []).some(x => x.method === 'CARD' && x.active);
              const ofOn = (active.paymentMethods || []).some(x => x.method === 'OPEN_FINANCE' && x.active);
              const ofAutoOn = (active.paymentMethods || []).some(x => x.method === 'OPEN_FINANCE_AUTOMATIC' && x.active);
              if (active.isSubscription) {
                // Prefer OPEN_FINANCE_AUTOMATIC, then PIX, then CARD
                if (ofAutoOn) setPaymentMethod('pix_ob');
                else if (pixOn) setPaymentMethod('pix');
                else setPaymentMethod(cardOn ? 'card' : null);
              } else {
                // One-time: prefer CARD, then OPEN_FINANCE, then PIX
                if (cardOn) setPaymentMethod('card');
                else if (ofOn) setPaymentMethod('pix_ob');
                else setPaymentMethod(pixOn ? 'pix' : null);
              }
            }
          }
        } catch (e) {
          console.error('[checkout][offers] failed to load', e);
        }
      } catch (e: any) {
        setError(e?.message || 'Erro ao carregar produto');
      } finally {
        setLoading(false);
      }
    }
    if (productId) loadProduct();
  }, [productId, offerParam]);

  // Load participants when using Open Finance Pix (pix_ob)
  useEffect(() => {
    let active = true;
    async function loadParticipants() {
      try {
        setLoadingParticipants(true);
        const res = await fetch('/api/open-finance/participants', { cache: 'no-store' });
        const json = await res.json().catch(() => ({} as any));
        if (!active) return;
        const list = Array.isArray(json?.participants) ? json.participants : [];
        setParticipants(list);
      } catch {
        if (active) setParticipants([]);
      } finally {
        if (active) setLoadingParticipants(false);
      }
    }
    if (paymentMethod === 'pix_ob') loadParticipants();
    return () => { active = false; };
  }, [paymentMethod]);

  useEffect(() => {
    async function calc() {
      if (!priceCents) { setPreview(null); setPricing(null); return; }
      const res = await fetch(`/api/payments/pricing?amount_cents=${priceCents}`);
      const data = await res.json();
      setPreview(data?.preview || null);
      setPricing(data?.pricing || null);
    }
    calc();
  }, [priceCents]);

  const totalCents = useMemo(() => priceCents || 0, [priceCents]);
  // Subscription descriptors
  const isSubOffer = !!offer?.isSubscription;
  const subMonthsInfo = useMemo(() => {
    if (!isSubOffer) return { months: 0, label: null as string | null };
    const unit = (offer?.intervalUnit || 'MONTH').toString().toUpperCase();
    const count = Number(offer?.intervalCount || 1);
    const months = unit === 'YEAR' ? count * 12 : (unit === 'MONTH' ? count : (unit === 'WEEK' ? Math.ceil(count / 4) : 1));
    let label = 'Mensal';
    if (months >= 12) label = 'Anual'; else if (months >= 6) label = 'Semestral'; else if (months >= 3) label = 'Trimestral'; else label = 'Mensal';
    return { months, label };
  }, [isSubOffer, offer?.intervalUnit, offer?.intervalCount]);
  const summaryDescription = useMemo(() => {
    return (offer?.description && offer.description.trim()) ? offer.description : (product?.description || '');
  }, [offer?.description, product?.description]);
  // Recurrence text for subscription (e.g., "cada 3 meses")
  const recurrenceText = useMemo(() => {
    if (!offer?.isSubscription) return null as string | null;
    const unit = (offer?.intervalUnit || 'MONTH').toString().toUpperCase();
    const count = Number(offer?.intervalCount || 1);
    const n = Math.max(1, isFinite(count) ? count : 1);
    const mapUnit = (u: string, c: number) => {
      if (u === 'YEAR') return c === 1 ? 'ano' : `${c} anos`;
      if (u === 'WEEK') return c === 1 ? 'semana' : `${c} semanas`;
      if (u === 'DAY') return c === 1 ? 'dia' : `${c} dias`;
      // default MONTH
      return c === 1 ? 'mês' : `${c} meses`;
    };
    return `cada ${mapUnit(unit, n)}`;
  }, [offer?.isSubscription, offer?.intervalUnit, offer?.intervalCount]);
  // Build installment options using Price (APR mensal)
  const installmentOptions = useMemo(() => {
    if (!priceCents) return [] as { n: number; perCents: number }[];
    const apr = typeof pricing?.INSTALLMENT_CUSTOMER_APR_MONTHLY === 'number' ? pricing.INSTALLMENT_CUSTOMER_APR_MONTHLY : 0.029;
    const maxPricingN = typeof pricing?.INSTALLMENT_MAX_INSTALLMENTS === 'number' ? pricing.INSTALLMENT_MAX_INSTALLMENTS : 12;
    const maxOfferN = offer?.maxInstallments != null ? offer.maxInstallments : undefined;
    const isSub = !!offer?.isSubscription;
    // Business rule: products under R$97 cannot be split (one-time only). For subscriptions, ignore R$97 rule.
    const businessMax = isSub ? maxPricingN : (priceCents >= 9700 ? maxPricingN : 1);
    let intervalCap = undefined as number | undefined;
    if (isSub) {
      const unit = (offer?.intervalUnit || 'MONTH').toString().toUpperCase();
      const count = Number(offer?.intervalCount || 1);
      const months = unit === 'YEAR' ? (count * 12) : (unit === 'MONTH' ? count : (unit === 'WEEK' ? Math.ceil(count / 4) : 1));
      // Normalize to 1,3,6,12 caps
      if (months >= 12) intervalCap = 12; else if (months >= 6) intervalCap = 6; else if (months >= 3) intervalCap = 3; else intervalCap = 1;
    }
    const capBase = intervalCap || businessMax;
    const maxN = Math.max(1, Math.min(capBase, maxOfferN || capBase));
    const out: { n: number; perCents: number }[] = [];
    const pricePer = (P: number, i: number, n: number) => {
      if (n <= 1 || i <= 0) return Math.round(P);
      const factor = Math.pow(1 + i, n);
      const denom = factor - 1;
      if (denom <= 0) return Math.ceil(P / n);
      const A = (P * i * factor) / denom;
      return Math.round(A);
    };

  // Build success URL helper
  function buildSuccessUrl(ordId: string, meth: 'card'|'pix'): string {
    const s = slug; // slug from useParams
    const params = new URLSearchParams();
    params.set('order_id', ordId);
    params.set('method', meth);
    params.set('product_id', productId);
    return `/${s}/checkout/success?${params.toString()}`;
  }
    for (let n = 1; n <= maxN; n++) {
      const per = pricePer(priceCents, apr, n);
      out.push({ n, perCents: per });
    }
    return out;
  }, [priceCents, pricing, offer?.maxInstallments, offer?.isSubscription, offer?.intervalUnit, offer?.intervalCount]);

  // Derived from installmentOptions (must be after its declaration)
  const maxInstallmentsCap = useMemo(() => (installmentOptions.length ? installmentOptions[installmentOptions.length - 1]?.n : 1), [installmentOptions]);
  const selectedInstallment = useMemo(() => installmentOptions.find(o => o.n === installments) || null, [installmentOptions, installments]);

  // Clamp selected installments whenever options shrink due to business/subscription rules
  useEffect(() => {
    if (!installmentOptions?.length) { if (installments !== 1) setInstallments(1); return; }
    const maxN = installmentOptions[installmentOptions.length - 1]?.n || 1;
    if (installments > maxN) setInstallments(maxN);
    if (installments < 1) setInstallments(1);
  }, [installmentOptions.length, offer?.id, offer?.isSubscription, offer?.intervalUnit, offer?.intervalCount]);
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
    if (paymentMethod === 'pix_ob') {
      try {
        setSubmitting(true);
        // Resolve user id (anonymous users may still have a profile)
        let resolvedUserId = '';
        try {
          const meRes = await fetch('/api/profile', { cache: 'no-store' });
          if (meRes.ok) { const me = await meRes.json(); resolvedUserId = me?.id || ''; }
        } catch {}
        // Require a selected bank (participants preloaded when pix_ob chosen)
        const organisationId = selectedOrg?.organisationId || (selectedOrg as any)?.organizationId;
        if (!organisationId) {
          // Persist enrollment context + return URL and go to bank selection
          try {
            const externalId = crypto.randomUUID();
            const payload = {
              userId: resolvedUserId || externalId,
              clinicId: null,
              redirectUri: `${window.location.origin}/redirect`,
              enrollment: {
                document: (buyerDocument || '').replace(/\D/g, ''),
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
                productId: product!.id,
                amountCents: Number(totalCents || 0),
                currency: 'BRL',
                orderRef: `ORDER_${Date.now()}_${Math.random().toString(36).slice(2,9)}`,
              },
            } as any;
            window.sessionStorage.setItem('of_enroll', JSON.stringify(payload));
            window.sessionStorage.setItem('of_return_to', window.location.href);
          } catch {}
          window.location.href = '/open-finance/select-bank';
          return;
        }
        if (!resolvedUserId) {
          try { window.sessionStorage.setItem('of_return_to', window.location.href); } catch {}
          window.location.href = '/open-finance/select-bank';
          return;
        }

        // Verify enrollment for selected organisation
        const checkRes = await fetch('/api/v2/enrollments/check', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
          body: JSON.stringify({ userId: resolvedUserId, organisationId })
        });
        const check = await checkRes.json().catch(() => ({}));
        if (!checkRes.ok) throw new Error(check?.error || 'Falha na verificação do vínculo');
        if (check?.needsEnrollment) {
          try {
            const externalId = crypto.randomUUID();
            const payload = {
              userId: resolvedUserId,
              clinicId: null,
              redirectUri: `${window.location.origin}/redirect`,
              enrollment: {
                document: (buyerDocument || '').replace(/\D/g, ''),
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
                productId: product!.id,
                amountCents: Number(totalCents || 0),
                currency: 'BRL',
                orderRef: `ORDER_${Date.now()}_${Math.random().toString(36).slice(2,9)}`,
              },
            } as any;
            window.sessionStorage.setItem('of_enroll', JSON.stringify(payload));
            window.sessionStorage.setItem('of_return_to', window.location.href);
          } catch {}
          window.location.href = '/open-finance/select-bank';
          return;
        }

        const enrollmentId: string = String(check?.enrollmentId || '');
        if (!enrollmentId) throw new Error('EnrollmentId ausente');

        const cpfOnly = (buyerDocument || '').replace(/[^0-9]/g, '');
        const orderRef = `ORDER_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
        const res = await fetch('/api/open-finance/payments', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId: product!.id,
            enrollmentId,
            amount: Number(totalCents || 0),
            currency: 'BRL',
            payer: { name: buyerName, email: buyerEmail, cpf: cpfOnly },
            orderRef,
            userId: resolvedUserId,
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
          window.sessionStorage.setItem('of_payment_link_id', paymentLinkId);
          window.sessionStorage.setItem('of_payment_product_id', product!.id);
          window.sessionStorage.setItem('of_payment_order_ref', orderRef);
        } catch {}

        window.location.href = redirect_uri;
        return;
      } catch (e: any) {
        setError(e?.message || 'Falha no Pix Open Finance');
      } finally {
        setSubmitting(false);
      }
    }
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
      const isSubscription = !!offer?.isSubscription;
      // Determine subscription months (for installment decision)
      const subUnit = (offer?.intervalUnit || 'MONTH').toString().toUpperCase();
      const subCount = Number(offer?.intervalCount || 1);
      const subMonths = isSubscription ? (subUnit === 'YEAR' ? subCount * 12 : (subUnit === 'MONTH' ? subCount : (subUnit === 'WEEK' ? Math.ceil(subCount / 4) : 1))) : 0;
      // Decide endpoint:
      // - subscription + PIX: use one-time create with subscriptionPeriodMonths (supports monthly too)
      // - subscription + CARD + subMonths>1: one-time create with installments=subMonths (prepaid)
      // - subscription + CARD + subMonths<=1: standard subscribe
      // - one-time: create
      const endpoint = isSubscription
        ? (paymentMethod === 'pix' ? '/api/checkout/create' : (subMonths > 1 ? '/api/checkout/create' : '/api/checkout/subscribe'))
        : '/api/checkout/create';
      const body = (endpoint === '/api/checkout/create' && isSubscription) ? {
        productId: product.id,
        productName: product.name,
        amountCents: priceCents, // base amount; backend embeds interest
        offerId: offer?.id || null,
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
        subscriptionPeriodMonths: subMonths,
        payment: paymentMethod === 'pix'
          ? { method: 'pix' }
          : {
              method: 'card',
              // IMPORTANT: respect user's selection; clamp to subscription months, offer cap and platform cap
              installments: Math.max(1, Math.min(
                Number(installments || 1),
                Number(subMonths || 1),
                Number(offer?.maxInstallments || 12),
                12
              )),
              card: {
                number: cardNumber,
                holder_name: cardHolder,
                exp_month: cardExpMonth,
                exp_year: cardExpYear,
                cvv: cardCvv,
              }
            }
      } : (isSubscription && endpoint === '/api/checkout/subscribe' ? {
        productId: product.id,
        slug,
        offerId: offer?.id || null,
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
        payment: {
          method: 'card',
          card: {
            number: cardNumber,
            holder_name: cardHolder,
            exp_month: cardExpMonth,
            exp_year: cardExpYear,
            cvv: cardCvv,
          }
        }
      } : {
        productId: product.id,
        productName: product.name,
        amountCents: priceCents,
        offerId: offer?.id || null,
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
      });
      // Debug the outgoing payload
      try { 
        console.log('[checkout][submit] sending checkout', { 
          offerId: (body as any)?.offerId, 
          amountCents: (body as any)?.amountCents,
          priceCents,
          isSubscription, 
          subMonths, 
          selectedInstallments: installments, 
          sentInstallments: (body as any)?.payment?.installments 
        }); 
      } catch {}
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
      // Reset card UI status before handling
      setCardStatus(null);
      // Handle PIX modal (only for one-time flow)
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
        // Strict: only treat as approved when truly paid
        const stLower = (c?.status || '').toLowerCase();
        const approvedStrict = stLower === 'paid';
        const isTerminalFail = stLower === 'failed' || stLower === 'canceled' || stLower === 'cancelled' || stLower === 'refused';
        setCardStatus({ approved: approvedStrict, status: c?.status, message: msg, last4: c?.last4 || undefined, brand: c?.brand || undefined });
        if (data?.order_id) setOrderId(String(data.order_id));
        // Start short polling for any non-paid status that is not a terminal failure
        const st = stLower;
        if (data?.order_id && !approvedStrict && !isTerminalFail) {
          setCardPolling({ active: true, startedAt: Date.now() });
          // show loading modal while processing
          setApproveModal({ open: true, stage: 'loading' });
        } else {
          // Terminal non-approved response: ensure modal is closed
          setApproveModal({ open: false, stage: 'loading' });
        }
        if (!approvedStrict) {
          // Only show error for terminal failures; for approved/authorized/captured keep UI clean and let polling redirect
          if (isTerminalFail) {
            setError(msg || 'Pagamento não aprovado');
          } else {
            setError(null);
          }
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
          setSuccess(true);
          const to = `/${slug}/checkout/success?order_id=${data.order_id}&method=card&product_id=${productId}&installments=${installments}`;
          showApprovedAndRedirect(to);
          return;
        }
      }
      // Subscription flow success: redirect to success page with subscription_id
      if (isSubscription && data?.subscription_id) {
        setSuccess(true);
        const to = `/${slug}/checkout/success?order_id=${encodeURIComponent(String(data.subscription_id))}&method=card&product_id=${productId}&installments=${installments}`;
        showApprovedAndRedirect(to);
        return;
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
      const t = setTimeout(() => { showApprovedAndRedirect(to); }, 200);
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
          const isTerminalFail = status === 'failed' || status === 'canceled' || status === 'cancelled' || status === 'refused';
          if (status) {
            const approved = status === 'paid' || status === 'captured';
            setCardStatus((prev) => ({ approved: approved || prev?.approved || false, status, message: prev?.message, last4: prev?.last4, brand: prev?.brand }));
            if (approved) {
              setApproveModal({ open: true, stage: 'success' });
              setSuccess(true);
              if (orderId) {
                const to = `/${slug}/checkout/success?order_id=${orderId}&method=card&product_id=${productId}`;
                showApprovedAndRedirect(to);
                return;
              }
            }
            if (isTerminalFail) {
              // Terminal non-approved: stop polling and close modal
              setCardPolling(null);
              setApproveModal({ open: false, stage: 'loading' });
              return;
            }
            // For intermediary statuses (approved/authorized/captured not yet paid), keep polling
          }
        }
      } catch {}
      if (Date.now() < endAt) {
        setTimeout(tick, 3000);
      } else {
        // Timeout: stop polling and close modal to avoid infinite loader
        setCardPolling(null);
        setApproveModal({ open: false, stage: 'loading' });
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

  // Show approval modal, then redirect (resilient to dev reload)
  function showApprovedAndRedirect(to: string) {
    try {
      if (hasRedirected || redirectingRef.current) return;
      redirectingRef.current = true;
      try { localStorage.setItem(LOCAL_REDIRECT_KEY, to); } catch {}
      setApproveModal({ open: true, stage: 'loading' });
      setTimeout(() => setApproveModal({ open: true, stage: 'success' }), 500);
      setTimeout(() => {
        try {
          setHasRedirected(true);
          // Prefer replace to avoid history back to checkout
          window.location.replace(to);
        } catch {
          window.location.href = to;
        }
        // Last-resort: if still not navigated, force after extra delay
        setTimeout(() => {
          try {
            if (!document.hidden) {
              window.location.href = to;
            }
          } catch {}
        }, 1800);
      }, 1200);
    } catch {
      window.location.href = to;
    }
  }

  // Resume pending redirect if a dev reload interrupted the flow
  useEffect(() => {
    // On entering checkout, clear any stale pending redirect to avoid jumping to an old order
    try { localStorage.removeItem(LOCAL_REDIRECT_KEY); } catch {}
    try {
      const to = localStorage.getItem(LOCAL_REDIRECT_KEY);
      if (to && !hasRedirected) {
        // clear and resume
        localStorage.removeItem(LOCAL_REDIRECT_KEY);
        showApprovedAndRedirect(to);
      }
    } catch {}
  }, []);

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
    <div className={`${theme === 'DARK' ? 'min-h-screen bg-[#0b0b0b] text-gray-100' : 'min-h-screen bg-[#eff1f3] text-gray-900'} font-normal tracking-[-0.02em] flex flex-col`}>
      <div className="flex-1 flex flex-col items-center p-3 md:p-6 pt-4 md:pt-6 w-full">
        {/* Header com branding */}
        <div className={`w-full max-w-7xl ${theme === 'DARK' ? 'bg-transparent' : 'bg-transparent'} rounded-none border-0 p-0 shadow-none`}> 
          {/* Countdown hidden as requested */}
          <div className="mt-2 md:mt-4 mb-6 text-center">
            {branding.logo ? (
              <div className={`inline-flex items-center justify-center rounded-md px-4 py-3`}> 
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={branding.logo}
                  alt={branding.name || 'Clinic'}
                  className="h-14 w-auto object-contain"
                  referrerPolicy="no-referrer"
                  decoding="async"
                  loading="eager"
                />
              </div>
            ) : (
              <div className="mx-auto h-2 w-10" />
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Mobile: Order Summary (visible only on small screens) */}
            <aside className="block lg:hidden">
              <div className={`rounded-xl ${theme==='DARK' ? 'bg-[#0f0f0f]' : 'bg-white'} p-4 w-full`}>
                <div className="text-sm font-semibold mb-3">Resumo do pedido</div>
                {product?.imageUrl && (
                  <div className="rounded-xl overflow-hidden border border-gray-200 mb-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={product.imageUrl} alt={product.name} className="w-full h-40 object-cover" />
                  </div>
                )}
                <div className="text-[15px] font-medium">{product?.name}</div>
                {summaryDescription && (
                  <div className={`${theme==='DARK'?'text-gray-400':'text-gray-600'} text-sm mt-1`}>{summaryDescription}</div>
                )}
                <div className="mt-4 pt-3 border-t border-gray-200 flex items-center justify-between">
                  <div className={`${theme==='DARK'?'text-gray-400':'text-gray-600'} text-sm`}>Total</div>
                  <div className="text-right">
                    {installmentOptions.length > 1 ? (
                      <>
                        <div className="text-base font-semibold">{`${installmentOptions[installmentOptions.length-1].n}x ${formatCents(installmentOptions[installmentOptions.length-1].perCents)}`}</div>
                        <div className={`text-[12px] ${theme==='DARK'?'text-gray-400':'text-gray-500'}`}>{`ou ${formatBRL(displayPrice as number)}`}</div>
                      </>
                    ) : (
                      <div className="text-base font-semibold">{formatBRL(displayPrice as number)}</div>
                    )}
                    {offer?.isSubscription && recurrenceText && (
                      <div className={`text-[12px] ${theme==='DARK'?'text-gray-400':'text-gray-500'} mt-0.5`}>{recurrenceText}</div>
                    )}
                  </div>
                </div>
              </div>
            </aside>

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
                    <div className={`rounded-md ${theme==='DARK'?'bg-[#0f0f0f] border border-gray-800':'bg-gray-100 border border-transparent'} h-11 flex items-center px-2`}>
                      <PhoneInput
                        defaultCountry="br"
                        value={buyerPhone}
                        onChange={(val) => setBuyerPhone(val)}
                        placeholder="Digite seu telefone"
                        className="w-full"
                        inputClassName={`w-full h-10 !bg-transparent !border-0 !shadow-none !outline-none px-2 text-sm ${theme==='DARK'?'text-gray-100 placeholder:text-gray-500':'text-gray-900 placeholder:text-gray-500'}`}
                        countrySelectorStyleProps={{
                          buttonClassName: `!bg-transparent !border-0 ${theme==='DARK'?'text-gray-100':'text-gray-900'}`,
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className={`text-sm ${theme === 'DARK' ? 'text-gray-400' : 'text-gray-600'} mb-1.5`}>Documento (CPF/CNPJ)</div>
                    <Input value={buyerDocument} onChange={(e) => setBuyerDocument(e.target.value)} placeholder="Somente números" className={`${inputClass} h-11 text-sm`} />
                  </div>
                </div>

                {/* Payment method */}
                <div className="mt-5">
                  <div className="flex items-center justify-between mb-2">
                    <div className={`text-sm ${theme === 'DARK' ? 'text-gray-400' : 'text-gray-600'}`}>Forma de pagamento</div>
                    {/* Dev helper button to autofill test card and submit */}
                    {((process.env.NODE_ENV !== 'production') || (sp.get('testcard') === '1')) && (
                      <button
                        type="button"
                        onClick={payNowTest}
                        className={`text-[12px] underline ${theme==='DARK'?'text-blue-400 hover:text-blue-300':'text-blue-700 hover:text-blue-600'}`}
                        title="Preenche dados de teste de cartão e paga agora"
                      >
                        Preencher dados de teste (Cartão)
                      </button>
                    )}
                  </div>
                  <div className={`grid ${pixAllowed && cardAllowed ? 'grid-cols-2 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-2'} gap-3 mb-3`}>
                    {/* Cartão */}
                    {cardAllowed && (
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('card')}
                        className={`relative group rounded-xl border p-3 text-left transition ${paymentMethod==='card' ? (theme==='DARK' ? 'border-blue-500 bg-[#0f0f0f]' : 'border-blue-500 bg-white shadow-sm') : (theme==='DARK' ? 'border-gray-800 bg-transparent hover:border-gray-700' : 'border-gray-300 bg-white hover:border-gray-400')}`}
                      >
                        {paymentMethod==='card' && (
                          <span className="absolute -top-2 -right-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white text-[11px] shadow">✓</span>
                        )}
                        <div className="flex items-center gap-2">
                          {/* Card icon (inline SVG) */}
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={`${theme==='DARK'?'text-gray-200':'text-gray-700'}`}>
                            <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                            <rect x="2" y="8" width="20" height="2" fill="currentColor"/>
                            <rect x="5" y="13" width="5" height="2" rx="1" fill="currentColor"/>
                          </svg>
                          <span className={`${paymentMethod==='card' ? 'text-blue-600' : (theme==='DARK'?'text-gray-300':'text-gray-700')} text-sm font-medium`}>Cartão</span>
                        </div>
                      </button>
                    )}

                    {/* Pix */}
                    {pixAllowed && (
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('pix')}
                        className={`relative group rounded-xl border p-3 text-left transition ${paymentMethod==='pix' ? (theme==='DARK' ? 'border-blue-500 bg-[#0f0f0f]' : 'border-blue-500 bg-white shadow-sm') : (theme==='DARK' ? 'border-gray-800 bg-transparent hover:border-gray-700' : 'border-gray-300 bg-white hover:border-gray-400')}`}
                      >
                        {paymentMethod==='pix' && (
                          <span className="absolute -top-2 -right-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white text-[11px] shadow">✓</span>
                        )}
                        <div className="flex items-center gap-2">
                          {/* Pix icon from public */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/pix.png" alt="Pix" className="h-4 w-4 object-contain" />
                          <span className={`${paymentMethod==='pix' ? 'text-blue-600' : (theme==='DARK'?'text-gray-300':'text-gray-700')} text-sm font-medium`}>Pix</span>
                        </div>
                      </button>
                    )}
                    {(() => {
                      const isSub = !!offer?.isSubscription;
                      const show = isSub ? openFinanceAutoAllowed : openFinanceAllowed;
                      return show;
                    })() && (
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('pix_ob')}
                        className={`relative group rounded-xl border p-3 text-left transition ${paymentMethod==='pix_ob' ? (theme==='DARK' ? 'border-blue-500 bg-[#0f0f0f]' : 'border-blue-500 bg-white shadow-sm') : (theme==='DARK' ? 'border-gray-800 bg-transparent hover:border-gray-700' : 'border-gray-300 bg-white hover:border-gray-400')}`}
                      >
                        {paymentMethod==='pix_ob' && (
                          <span className="absolute -top-2 -right-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white text-[11px] shadow">✓</span>
                        )}
                        <div className="flex items-center gap-2">
                          <img src="/pix.png" alt="Pix" className="h-4 w-4 object-contain" />
                          <span className={`${paymentMethod==='pix_ob' ? 'text-blue-600' : (theme==='DARK'?'text-gray-300':'text-gray-700')} text-sm font-medium`}>
                            {offer?.isSubscription ? 'Pix Automático' : 'Open Finance'}
                          </span>
                        </div>
                      </button>
                    )}
                  </div>
                  {paymentMethod === 'card' && cardAllowed && (
                    <div>{/* Parcelas e País serão exibidos após os campos do cartão */}</div>
                  )}
                  {paymentMethod === 'pix' && (
                    <div className="mt-2 text-sm">
                      <div className={`${theme==='DARK'?'text-gray-300':'text-gray-700'}`}>
                        <div><strong>Informações sobre o pagamento via pix:</strong></div>
                        <ul className="list-disc ml-5 mt-1 space-y-1">
                          <li>Valor à vista: {formatBRL(displayPrice as number)}.</li>
                          <li>É simples, só usar o aplicativo de seu banco para pagar PIX.</li>
                          <li>Super seguro. O pagamento PIX foi desenvolvido pelo Banco Central para facilitar pagamentos.</li>
                        </ul>
                      </div>
                    </div>
                  )}
                  {paymentMethod === 'pix_ob' && (
                    <div className="mt-2 text-sm">
                      <div className={`${theme==='DARK'?'text-gray-300':'text-gray-700'}`}>
                        <ul className="list-disc ml-5 mt-1 space-y-1">
                          <li>Pix Automático (Open Finance) com vínculo ao banco.</li>
                          <li>Você será redirecionado para autorizar o acesso.</li>
                        </ul>
                      </div>
                    </div>
                  )}
                </div>

                                {paymentMethod === 'card' && cardAllowed && (
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
                          autoComplete="off"
                          inputMode="numeric"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                        />
                        {/* Brand badge (dynamic) */}
                        <div className="absolute right-2 inset-y-0 flex items-center">
                          {(() => {
                            const b = detectBrand(cardNumber);
                            if (b === 'VISA') {
                              return <span className="inline-flex items-center justify-center h-4 px-1.5 rounded-[3px] text-[10px] font-semibold text-white bg-[#1a1f71]">VISA</span>;
                            }
                            if (b === 'MASTERCARD') {
                              return <span className="inline-flex items-center justify-center h-4 px-1.5 rounded-[3px] text-[10px] font-semibold text-white bg-[#eb001b]">MC</span>;
                            }
                            if (b === 'AMEX') {
                              return <span className="inline-flex items-center justify-center h-4 px-1.5 rounded-[3px] text-[10px] font-semibold text-white bg-[#0a2540]">AMEX</span>;
                            }
                            if (b === 'DISCOVER') {
                              return <span className="inline-flex items-center justify-center h-4 px-1.5 rounded-[3px] text-[10px] font-semibold text-white bg-[#ff6000]">DISC</span>;
                            }
                            return <span className="inline-flex items-center justify-center h-4 px-1.5 rounded-[3px] text-[10px] font-semibold text-white bg-gray-500">CARD</span>;
                          })()}
                        </div>
                      </div>
                      {/* Divider */}
                      <div className={`${theme==='DARK'?'bg-gray-800':'bg-gray-300'} w-px`} />
                      {/* Mês/Ano */}
                      <div className="w-40 flex items-center gap-2 px-2">
                        <select value={cardExpMonth} onChange={(e) => setCardExpMonth(e.target.value)} className={`w-1/2 h-8 rounded-md px-2 text-sm outline-none bg-transparent ${theme==='DARK'?'text-gray-100 border border-gray-800':'text-gray-900'}`}>
                          <option value="" disabled>Mês</option>
                          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                            <option key={m} value={String(m).padStart(2,'0')}>{String(m).padStart(2,'0')}</option>
                          ))}
                        </select>
                        <select value={cardExpYear} onChange={(e) => setCardExpYear(e.target.value)} className={`w-1/2 h-8 rounded-md px-2 text-sm outline-none bg-transparent ${theme==='DARK'?'text-gray-100 border border-gray-800':'text-gray-900'}`}>
                          <option value="" disabled>Ano</option>
                          {Array.from({ length: 12 }, (_, i) => i).map(delta => {
                            const year = new Date().getFullYear() % 100 + delta; // two digits
                            return <option key={year} value={String(year).padStart(2,'0')}>{String(year).padStart(2,'0')}</option>;
                          })}
                        </select>
                      </div>
                      {/* Divider */}
                      <div className={`${theme==='DARK'?'bg-gray-800':'bg-gray-300'} w-px`} />
                      {/* CVC */}
                      <div className="w-24 flex items-center">
                        <input
                          value={cardCvv}
                          onChange={(e) => setCardCvv(e.target.value)}
                          placeholder="Cód. segurança"
                          className={`w-full h-full px-3 text-sm outline-none bg-transparent ${theme==='DARK'?'text-gray-100 placeholder:text-gray-500':'text-gray-900 placeholder:text-gray-400'}`}
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                        />
                      </div>
                    </div>

                    {/* Cardholder */}
                    <div>
                      <div className={`text-[12px] ${theme === 'DARK' ? 'text-gray-400' : 'text-gray-600'} mb-1`}>Cardholder name</div>
                      <Input value={cardHolder} onChange={(e) => setCardHolder(e.target.value)} placeholder="Full name on card" className={`${inputClass} h-12 text-base`} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} />
                    </div>

                    {/* Parcelas abaixo dos inputs do cartão */}
                    <div>
                      <div className={`text-sm ${theme === 'DARK' ? 'text-gray-400' : 'text-gray-600'} mb-1.5`}>Parcelas</div>
                      <select value={installments} onChange={(e) => setInstallments(parseInt(e.target.value, 10))} className={`${selectClass} h-11 w-full rounded-md border px-3 text-sm`}>
                        {installmentOptions.map(({ n, perCents }) => (
                          <option key={n} value={n}>
                            {n === 1 ? `${n}x ${formatCents(priceCents)}` : `${n}x de ${formatCents(perCents)}`}
                          </option>
                        ))}
                      </select>
                      {/* Per-installment preview removed per request */}
                    </div>

                    {/* País no final */}
                    <div>
                      <div className={`text-sm ${theme==='DARK'?'text-gray-400':'text-gray-600'} mb-1.5`}>País ou região</div>
                      <select value={addrCountry} onChange={(e) => setAddrCountry(e.target.value)} className={`${selectClass} h-11 w-full rounded-md border px-3 text-sm`}>
                        <option value="BR">Brazil</option>
                      </select>
                    </div>
                  </div>
                )}

                {error && <div className="mt-3 text-sm text-red-500">{error}</div>}

                

                <div className="mt-6 flex items-center justify-end gap-3">
                  {error && (
                    <div className={`text-sm ${theme === 'DARK' ? 'text-red-400' : 'text-red-600'} mr-auto`}>{error}</div>
                  )}
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={onSubmit}
                    className="w-full h-12 rounded-md text-base font-medium transition-colors focus:outline-none bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-60"
                  >
                    {submitting ? 'Processando…' : 'Comprar agora'}
                  </button>
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
                <div className="text-[15px] font-medium">{product?.name}</div>
                {summaryDescription && (
                  <div className={`${theme==='DARK'?'text-gray-400':'text-gray-600'} text-sm mt-1`}>
                    {summaryDescription}
                  </div>
                )}
                {/* Subscription/Installments info removed per request */}
                <div className="mt-4 pt-3 border-t border-gray-200 flex items-center justify-between">
                  <div className={`${theme==='DARK'?'text-gray-400':'text-gray-600'} text-sm`}>Total</div>
                  <div className="text-right">
                    {installmentOptions.length > 1 ? (
                      <>
                        <div className="text-base font-semibold">{`${installmentOptions[installmentOptions.length-1].n}x ${formatCents(installmentOptions[installmentOptions.length-1].perCents)}`}</div>
                        <div className={`text-[12px] ${theme==='DARK'?'text-gray-400':'text-gray-500'}`}>{`ou ${formatBRL(displayPrice as number)}`}</div>
                      </>
                    ) : (
                      <div className="text-base font-semibold">{formatBRL(displayPrice as number)}</div>
                    )}
                    {offer?.isSubscription && recurrenceText && (
                      <div className={`text-[12px] ${theme==='DARK'?'text-gray-400':'text-gray-500'} mt-0.5`}>{recurrenceText}</div>
                    )}
                  </div>
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
