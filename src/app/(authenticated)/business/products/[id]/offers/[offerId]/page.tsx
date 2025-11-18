"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { REGIONAL_COUNTRIES, flagEmoji } from '@/lib/countries';
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeftIcon, CheckIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useClinic } from "@/contexts/clinic-context";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { getCurrencyForCountry as mapCurrency } from "@/lib/payments/countryCurrency";

interface PageProps {
  params: Promise<{ id: string; offerId: string }>
}

interface Offer {
  id: string;
  productId: string;
  name: string;
  description?: string | null;
  currency: string;
  priceCents: number;
  maxInstallments?: number | null;
  installmentMinCents?: number | null;
  active: boolean;
  isSubscription: boolean;
  intervalCount?: number | null;
  intervalUnit?: 'DAY'|'WEEK'|'MONTH'|'YEAR' | null;
  trialDays?: number | null;
  checkoutUrl?: string | null;
  paymentMethods?: Array<{ method: 'PIX'|'CARD'|'OPEN_FINANCE'|'OPEN_FINANCE_AUTOMATIC'; active: boolean }>
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export default function EditOfferPage({ params }: PageProps) {
  const router = useRouter();
  const [productId, setProductId] = useState<string>("");
  const [offerId, setOfferId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [methods, setMethods] = useState<{ PIX: boolean; CARD: boolean; OPEN_FINANCE: boolean; OPEN_FINANCE_AUTOMATIC: boolean }>({ PIX: true, CARD: true, OPEN_FINANCE: false, OPEN_FINANCE_AUTOMATIC: false });
  const { currentClinic } = useClinic();
  const [providerConfig, setProviderConfig] = useState<any>({});
  const [defaultCountry, setDefaultCountry] = useState<string>('BR');
  const [stripeBRL, setStripeBRL] = useState<string>('');
  const [stripeUSD, setStripeUSD] = useState<string>('');
  const [krxBRL, setKrxBRL] = useState<string>('');
  const [validating, setValidating] = useState<boolean>(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchCurrency, setSearchCurrency] = useState<'BRL'|'USD'>('BRL');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchCountry, setSearchCountry] = useState<string>('');
  // Country overrides (dynamic)
  const [overrideCountries, setOverrideCountries] = useState<string[]>([]);
  const [overrideEnabled, setOverrideEnabled] = useState<Record<string, boolean>>({});
  const [overridePrice, setOverridePrice] = useState<Record<string, string>>({});
  const [addingCountry, setAddingCountry] = useState<boolean>(false);
  const [addingCountryCode, setAddingCountryCode] = useState<string>('US');
  const [addingCountryMethod, setAddingCountryMethod] = useState<'CARD'|'PIX'|'OPEN_FINANCE'|'OPEN_FINANCE_AUTOMATIC'|''>('');
  const [addingCountryProvider, setAddingCountryProvider] = useState<'STRIPE'|'KRXPAY'|'APPMAX'|''>('');
  
  const [addingRegion, setAddingRegion] = useState<boolean>(false);
  const [addingRegionKey, setAddingRegionKey] = useState<string>('');
  const [routing, setRouting] = useState<Record<string, { CARD: 'STRIPE'|'KRXPAY'|'APPMAX'|null; PIX: 'STRIPE'|'KRXPAY'|'APPMAX'|null; OPEN_FINANCE: 'STRIPE'|'KRXPAY'|'APPMAX'|null; OPEN_FINANCE_AUTOMATIC: 'STRIPE'|'KRXPAY'|'APPMAX'|null }>>({});
  const [addRouteOpenFor, setAddRouteOpenFor] = useState<string>('');
  const [addRouteMethod, setAddRouteMethod] = useState<'CARD'|'PIX'|'OPEN_FINANCE'|'OPEN_FINANCE_AUTOMATIC' | ''>('');
  const [addRouteProvider, setAddRouteProvider] = useState<'STRIPE'|'KRXPAY'|'APPMAX' | ''>('');
  const [createStripeOpenFor, setCreateStripeOpenFor] = useState<{ country: string, currency: string } | null>(null);
  const [createStripeAmount, setCreateStripeAmount] = useState<string>('');
  const [createStripeNickname, setCreateStripeNickname] = useState<string>('');
  const [editingCountry, setEditingCountry] = useState<Record<string, boolean>>({});

  const currencyForCountry = (code: string): 'BRL'|'USD'|'EUR' => {
    return mapCurrency(code) as any;
  };

  const parseAmountToCents = (val: string): number => {
    const n = Number(String(val || '0').replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.round(n * 100);
  };

  const saveCountryEdits = async (cc: string) => {
    if (!offer) return;
    try {
      setSaving(true);
      const cur = currencyForCountry(cc);
      // Save custom amount when enabled for non-STRIPE providers (KRXPAY or APPMAX)
      if (!!overrideEnabled[cc]) {
        const provider = (routing[cc]?.CARD || null) as ('STRIPE'|'KRXPAY'|'APPMAX'|null);
        if (provider) {
          const cents = parseAmountToCents(overridePrice[cc] || '0');
          const body: any = { country: cc, currency: cur, provider, amountCents: cents };
          // If STRIPE and using custom price, clear any previous externalPriceId to enforce amountCents precedence
          if (provider === 'STRIPE') body.externalPriceId = '';
          await fetch(`/api/offers/${offer.id}/prices`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });
        }
      }
      // BR installments
      if (cc === 'BR') {
        await saveMaxInstallmentsBR();
      }
      await loadProviderConfig(productId, offer.id);
      setEditingCountry(prev => ({ ...prev, [cc]: false }));
    } catch (e) {
      console.error(e);
      alert('Falha ao salvar alterações do país');
    } finally {
      setSaving(false);
    }
  };

  const saveMaxInstallmentsBR = async () => {
    if (!offer) return;
    try {
      setSaving(true);
      const monthsFromInterval = (unit: string, count: number) => {
        const u = String(unit || 'MONTH').toUpperCase();
        if (u === 'YEAR') return Math.max(1, count * 12);
        if (u === 'MONTH') return Math.max(1, count);
        if (u === 'WEEK') return Math.max(1, Math.ceil(count / 4));
        if (u === 'DAY') return Math.max(1, Math.ceil(count / 30));
        return 1;
      };
      const platformCap = 12;
      const offeredMax = Math.max(1, Number(form.maxInstallments || '1'));
      const periodMonths = form.isSubscription ? monthsFromInterval(form.intervalUnit, Number(form.intervalCount || '1')) : 0;
      const finalMaxInstallments = form.isSubscription
        ? Math.max(1, Math.min(offeredMax, periodMonths, platformCap))
        : Math.max(1, Math.min(offeredMax, platformCap));
      const body: any = { maxInstallments: finalMaxInstallments };
      const res = await fetch(`/api/products/${productId}/offers/${offer.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) await loadOffer(productId, offer.id);
    } catch (e) {
      console.error(e);
      alert('Falha ao salvar parcelamento');
    } finally {
      setSaving(false);
    }
  };

  

  const deleteCountry = async (country: string) => {
    if (!offer) return;
    try {
      const cur = currencyForCountry(country);
      // Neutralize server-side config by clearing values
      const body = { config: { STRIPE: { [country]: { [cur]: { amountCents: 0, externalPriceId: '' } } }, CHECKOUT: { [country]: '' } } } as any;
      await fetch(`/api/products/${productId}/offers/${offer.id}/providers/config`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
    } catch {}
    // Remove from UI state
    setOverrideCountries(prev => prev.filter(c => c !== country));
    setOverrideEnabled(prev => { const n = { ...prev }; delete n[country]; return n; });
    setOverridePrice(prev => { const n = { ...prev }; delete n[country]; return n; });
    
  };

  const getCountryName = (code: string): string => {
    const cc = String(code || '').toUpperCase();
    for (const region of REGIONAL_COUNTRIES) {
      for (const c of region.countries) {
        if (String(c.code).toUpperCase() === cc) return c.name;
      }
    }
    return cc;
  };

  const [form, setForm] = useState({
    name: "",
    description: "",
    price: "",
    currency: "BRL" as 'BRL'|'USD'|'EUR',
    isSubscription: false,
    intervalCount: "1",
    intervalUnit: "MONTH" as 'DAY'|'WEEK'|'MONTH'|'YEAR',
    trialDays: "0",
    maxInstallments: "1",
    checkoutUrl: "",
    active: true,
  });

  const getBaseUrl = () => {
    // 1) Prefer APP_BASE_DOMAIN (public or server)
    const dom = (process.env.NEXT_PUBLIC_APP_BASE_DOMAIN || process.env.APP_BASE_DOMAIN) as string | undefined;
    if (dom && dom.trim()) {
      const d = dom.trim();
      const hasProto = /^https?:\/\//i.test(d);
      const url = hasProto ? d : `https://${d}`;
      return url.replace(/\/$/, '');
    }
    // 2) Fallback to previous public base URLs
    const pub = (process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_NEXTAUTH_URL) as string | undefined;
    if (pub && /^https?:\/\//.test(pub)) return pub.replace(/\/$/, '');
    // 3) Finally, window origin or localhost
    if (typeof window !== 'undefined') {
      const origin = window.location.origin;
      if (/localhost|127\.0\.0\.1/i.test(origin)) return 'https://www.zuzz.vu';
      return origin;
    }
    return 'https://www.zuzz.vu';
  };

  const openStripeSearch = async (currency: 'BRL'|'USD') => {
    setSearchCurrency(currency);
    setSearchQuery('');
    setSearchResults([]);
    setSearchOpen(true);
    await fetchStripePrices(currency, '');
  };

  const fetchStripePrices = async (currency: string, query: string) => {
    try {
      setSearchLoading(true);
      const url = new URL('/api/integrations/stripe/prices', window.location.origin);
      url.searchParams.set('currency', currency);
      if (query) url.searchParams.set('query', query);
      url.searchParams.set('limit', '20');
      // Use clinic integration (secret) instead of env/current doctor when available
      if (currentClinic?.id) url.searchParams.set('clinicId', String(currentClinic.id));
      const res = await fetch(url.toString(), { cache: 'no-store' });
      const js = await res.json().catch(() => ({}));
      setSearchResults(Array.isArray(js?.items) ? js.items : []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const selectStripePrice = async (priceId: string) => {
    try {
      if (!offer) return;
      const cc = (searchCountry || '').toUpperCase();
      const cur = (searchCurrency || '').toUpperCase();
      if (!cc || !/^[A-Z]{2}$/.test(cc)) {
        alert('Selecione um país para aplicar o price_id');
        return;
      }
      const it = (searchResults || []).find((x: any) => String(x.priceId) === String(priceId));
      const amountCents = typeof it?.unitAmount === 'number'
        ? it.unitAmount
        : Math.round(Math.max(0, Number((overridePrice[cc] || '0').replace(',', '.')) * 100));
      await fetch(`/api/offers/${offer.id}/prices`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country: cc, currency: cur, provider: 'STRIPE', amountCents, externalPriceId: priceId })
      });
      setSearchOpen(false);
      await loadProviderConfig(productId, offer.id);
    } catch (e) {
      console.error(e);
      alert('Falha ao aplicar price_id');
    }
  };

  const ensureStripePrice = async (currency: 'BRL'|'USD') => {
    if (!offer) return;
    try {
      // Derive amount from the modal quick input if provided; fallback to override price for current country
      const centsQuick = Math.round(Math.max(0, Number((createStripeAmount || '0').replace(',', '.')) * 100));
      const nickname = `${offer.name || 'Offer'} ${currency}`;
      const body: any = { currency, nickname };
      if (currentClinic?.id) body.clinicId = String(currentClinic.id);
      if (centsQuick > 0) body.amountCents = centsQuick;

      const res = await fetch(`/api/products/${productId}/offers/${offer.id}/providers/stripe/ensure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const js = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(js?.error || 'Failed to ensure Stripe price');
      if (currency === 'BRL') {
        setStripeBRL(js?.priceId || '');
        await loadProviderConfig(productId, offer.id);
      } else {
        setStripeUSD(js?.priceId || '');
        await loadProviderConfig(productId, offer.id);
      }
      alert('Stripe price ensured');
    } catch (e) {
      alert('Falha ao criar/garantir preço no Stripe');
    }
  };

  const loadProviderConfig = async (pid: string, oid: string) => {
    try {
      // 1) Load legacy providerConfig (for CHECKOUT provider selection)
      const res = await fetch(`/api/products/${pid}/offers/${oid}/providers/config`, { cache: 'no-store' });
      const cfgBase = res.ok ? ((await res.json().catch(() => ({})))?.config || {}) : {};
      // 2) Load normalized OfferPrice rows and merge into a compatible shape for UI
      const prRes = await fetch(`/api/offers/${oid}/prices`, { cache: 'no-store' });
      const prJson = prRes.ok ? await prRes.json().catch(() => ({})) : {};
      const rows: any[] = Array.isArray(prJson?.prices) ? prJson.prices : [];
      const cfg: any = { ...(cfgBase || {}) };
      cfg.STRIPE = cfg.STRIPE || {};
      cfg.KRXPAY = cfg.KRXPAY || {};
      cfg.APPMAX = cfg.APPMAX || {};
      for (const r of rows) {
        const cc = String(r.country || '').toUpperCase();
        const cur = String(r.currency || '').toUpperCase();
        const prov = String(r.provider || '').toUpperCase();
        if (!/^[A-Z]{2}$/.test(cc)) continue;
        if (prov === 'STRIPE') {
          cfg.STRIPE[cc] = cfg.STRIPE[cc] || {};
          cfg.STRIPE[cc][cur] = cfg.STRIPE[cc][cur] || {};
          if (typeof r.amountCents === 'number') cfg.STRIPE[cc][cur].amountCents = r.amountCents;
          if (r.externalPriceId) cfg.STRIPE[cc][cur].externalPriceId = r.externalPriceId;
        } else if (prov === 'KRXPAY') {
          cfg.KRXPAY[cc] = cfg.KRXPAY[cc] || {};
          cfg.KRXPAY[cc][cur] = cfg.KRXPAY[cc][cur] || {};
          if (typeof r.amountCents === 'number') cfg.KRXPAY[cc][cur].amountCents = r.amountCents;
        } else if (prov === 'APPMAX') {
          cfg.APPMAX[cc] = cfg.APPMAX[cc] || {};
          cfg.APPMAX[cc][cur] = cfg.APPMAX[cc][cur] || {};
          if (typeof r.amountCents === 'number') cfg.APPMAX[cc][cur].amountCents = r.amountCents;
        }
      }
      setProviderConfig(cfg);
      // Stripe quick refs (optional): try BR and US by currency from merged cfg
      setStripeBRL(cfg?.STRIPE?.BR?.BRL?.externalPriceId || '');
      setStripeUSD(cfg?.STRIPE?.US?.USD?.externalPriceId || '');
      setKrxBRL(cfg?.KRXPAY?.BR?.BRL?.externalItemId || '');
      // Countries from DB (routing + prices) — ignore legacy config for the list
      const en: Record<string, boolean> = {};
      const pr: Record<string, string> = {};
      try {
        const url = new URL('/api/payment-routing/countries', window.location.origin);
        url.searchParams.set('offerId', oid);
        const cres = await fetch(url.toString(), { cache: 'no-store' });
        const cjs = await cres.json().catch(() => ({}));
        const countries: string[] = Array.isArray(cjs?.countries) ? cjs.countries : [];
        setOverrideCountries(countries);
        // derive enabled/price hints from merged cfg only for display (optional)
        for (const cc of countries) {
          const cur = currencyForCountry(cc);
          const sAmt = cfg?.STRIPE?.[cc]?.[cur]?.amountCents;
          const kAmt = cfg?.KRXPAY?.[cc]?.[cur]?.amountCents;
          const aAmt = cfg?.APPMAX?.[cc]?.[cur]?.amountCents;
          const amt = typeof sAmt === 'number' ? sAmt : (typeof aAmt === 'number' ? aAmt : (typeof kAmt === 'number' ? kAmt : null));
          if (typeof amt === 'number') pr[cc] = String((amt/100).toFixed(2));
          en[cc] = !!cfg?.STRIPE?.[cc]?.[cur]?.externalPriceId || typeof sAmt === 'number' || typeof aAmt === 'number' || typeof kAmt === 'number';
        }
        setOverrideEnabled(en);
        setOverridePrice(pr);
        // Load routing for each country
        for (const cc of countries) {
          await loadRoutingForCountry(oid, cc);
        }
      } catch {}
      
      
    } catch {}
  };

  const loadRoutingForCountry = async (oid: string, cc: string) => {
    try {
      const res = await fetch(`/api/payment-routing?offerId=${encodeURIComponent(oid)}&country=${encodeURIComponent(cc)}`, { cache: 'no-store' });
      if (!res.ok) return;
      const js = await res.json().catch(() => ({}));
      const m = js?.methods || {};
      setRouting(prev => ({ ...prev, [cc]: {
        CARD: (m?.CARD?.provider || null),
        PIX: (m?.PIX?.provider || null),
        OPEN_FINANCE: (m?.OPEN_FINANCE?.provider || null),
        OPEN_FINANCE_AUTOMATIC: (m?.OPEN_FINANCE_AUTOMATIC?.provider || null),
      } }));
      // Do not mutate defaultCountry here; it is sourced from providers/config only
    } catch {}
  };

  const saveRouting = async (oid: string, cc: string, method: 'CARD'|'PIX'|'OPEN_FINANCE'|'OPEN_FINANCE_AUTOMATIC', provider: 'STRIPE'|'KRXPAY'|'APPMAX'|null) => {
    try {
      if (!provider) return;
      const payload = { offerId: oid, country: cc, method, provider, priority: 10, isActive: true } as const;
      console.log('[routing][saveRouting][req]', payload);
      const res = await fetch(`/api/payment-routing`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      let body: any = null;
      try { body = await res.clone().json(); } catch { body = await res.text().catch(() => ''); }
      console.log('[routing][saveRouting][res]', { ok: res.ok, status: res.status, body });
      if (!res.ok) return;
      await loadRoutingForCountry(oid, cc);
    } catch {}
  };

  const removeRouting = async (oid: string, cc: string, method: 'CARD'|'PIX'|'OPEN_FINANCE'|'OPEN_FINANCE_AUTOMATIC') => {
    try {
      // Use current provider to target the rule update; API requires provider value
      const current = (routing[cc]?.[method] || null) as ('STRIPE'|'KRXPAY'|'APPMAX'|null);
      if (!current) return;
      const payload = { offerId: oid, country: cc, method, provider: current, priority: 10, isActive: false } as const;
      console.log('[routing][removeRouting][req]', payload);
      const res = await fetch(`/api/payment-routing`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      let body: any = null;
      try { body = await res.clone().json(); } catch { body = await res.text().catch(() => ''); }
      console.log('[routing][removeRouting][res]', { ok: res.ok, status: res.status, body });
      if (!res.ok) return;
      await loadRoutingForCountry(oid, cc);
    } catch {}
  };

  const saveStripePrice = async (currency: 'BRL'|'USD', value: string) => {
    if (!offer) return;
    try {
      const country = (searchCountry || 'BR').toUpperCase();
      const body: any = { provider: 'STRIPE', currency, country, externalPriceId: value };
      const res = await fetch(`/api/offers/${offer.id}/prices`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) await loadProviderConfig(productId, offer.id);
    } catch {}
  };

  const saveKrxItem = async (value: string) => {
    if (!offer) return;
    try {
      const body = { provider: 'KRXPAY', currency: 'BRL', externalItemId: value } as any;
      const res = await fetch(`/api/products/${productId}/offers/${offer.id}/providers/config`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) await loadProviderConfig(productId, offer.id);
    } catch {}
  };

  const saveCountryOverrideAmount = async (country: string) => {
    if (!offer) return;
    try {
      const priceStr = overridePrice[country] || '0';
      const cents = Math.round(Math.max(0, Number(priceStr.replace(',', '.')) * 100));
      const cur = currencyForCountry(country);
      // Align provider with routed CARD provider (fallback STRIPE)
      const routed = (routing[country]?.CARD || null) as ('STRIPE'|'KRXPAY'|'APPMAX'|null);
      const provider = (routing[country]?.CARD || 'STRIPE') as 'STRIPE'|'KRXPAY'|'APPMAX';
      const body = { country, currency: cur, provider, amountCents: cents } as any;
      if (provider === 'STRIPE') body.externalPriceId = '';
      const res = await fetch(`/api/offers/${offer.id}/prices`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) await loadProviderConfig(productId, offer.id);
    } catch {}
  };

  const validateStripeIds = async () => {
    try {
      setValidating(true);
      const clinicId = currentClinic?.id;
      const statusRes = await fetch(`/api/admin/integrations/stripe/status?clinicId=${encodeURIComponent(clinicId || '')}`, { cache: 'no-store' });
      const status = await statusRes.json().catch(() => ({}));
      const connected = !!status?.connected;
      const formatOk = (id: string) => !id || /^price_[a-zA-Z0-9]+$/.test(id);
      const problems: string[] = [];
      if (!connected) problems.push('Stripe não conectado para esta clínica');
      if (!formatOk(stripeBRL)) problems.push('BRL: price_id inválido');
      if (!formatOk(stripeUSD)) problems.push('USD: price_id inválido');
      if (problems.length) alert('Validação:\n' + problems.join('\n'));
      else alert('Validação OK');
    } catch (e) {
      alert('Falha ao validar');
    } finally {
      setValidating(false);
    }
  };

  const getSlug = () => (currentClinic?.slug && String(currentClinic.slug)) || 'bella-vida';

  const ensureSlugInPath = (path: string) => {
    const slug = getSlug();
    if (!path) return `/${slug}/checkout/${productId}`;
    // Already slugged
    if (path.startsWith(`/${slug}/checkout/`)) return path;
    // Path like /checkout/:id → convert to /:slug/checkout/:id
    const m = path.match(/^\/checkout\/(.+)$/);
    if (m) return `/${slug}${path}`;
    // If only productId provided, build full slugged path
    if (!path.startsWith('/')) return `/${slug}/checkout/${path}`;
    return path;
  };

  const toFullCheckout = (value: string) => {
    if (!value) return '';
    const hasProto = /^https?:\/\//i.test(value);
    const base = getBaseUrl();
    if (hasProto) {
      try {
        const url = new URL(value);
        const sluggedPath = ensureSlugInPath(url.pathname);
        return `${url.origin}${sluggedPath}`;
      } catch {
        return value;
      }
    }
    const rawPath = value.startsWith('/') ? value : `/${value}`;
    const path = ensureSlugInPath(rawPath);
    return `${base}${path}`;
  };

  const normalizeCheckoutForSave = (value: string) => {
    // Save absolute URL, enforce slug in path
    return toFullCheckout(value);
  };

  useEffect(() => {
    (async () => {
      const { id, offerId } = await params;
      setProductId(id);
      setOfferId(offerId);
      await loadOffer(id, offerId);
      await loadProviderConfig(id, offerId);
    })();
  }, [params]);

  const loadOffer = async (pid: string, oid: string) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/products/${pid}/offers`);
      if (!res.ok) throw new Error("Failed to load offers");
      const js = await res.json();
      const found = (js?.offers || []).find((o: Offer) => o.id === oid) as Offer | undefined;
      if (found) {
        setOffer(found);
        setForm({
          name: found.name || "",
          description: found.description || "",
          price: (Number(found.priceCents || 0) / 100).toString(),
          currency: (found.currency as any) || 'BRL',
          isSubscription: !!found.isSubscription,
          intervalCount: String(found.intervalCount || 1),
          intervalUnit: (found.intervalUnit as any) || 'MONTH',
          trialDays: String(found.trialDays || 0),
          maxInstallments: String(found.maxInstallments || 1),
          // Ensure UI shows full absolute URL
          checkoutUrl: toFullCheckout(found.checkoutUrl || ''),
          active: !!found.active,
        });
        const pixOn = (found.paymentMethods || []).some(x => x.method === 'PIX' && x.active);
        const cardOn = (found.paymentMethods || []).some(x => x.method === 'CARD' && x.active);
        const ofOn = (found.paymentMethods || []).some(x => x.method === 'OPEN_FINANCE' && x.active);
        const ofAutoOn = (found.paymentMethods || []).some(x => x.method === 'OPEN_FINANCE_AUTOMATIC' && x.active);
        setMethods({ PIX: pixOn, CARD: cardOn, OPEN_FINANCE: ofOn, OPEN_FINANCE_AUTOMATIC: ofAutoOn });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!offer) return;
    try {
      setSaving(true);
      // Clamp maxInstallments according to business rules
      const monthsFromInterval = (unit: string, count: number) => {
        const u = String(unit || 'MONTH').toUpperCase();
        if (u === 'YEAR') return Math.max(1, count * 12);
        if (u === 'MONTH') return Math.max(1, count);
        if (u === 'WEEK') return Math.max(1, Math.ceil(count / 4));
        if (u === 'DAY') return Math.max(1, Math.ceil(count / 30));
        return 1;
      };
      const platformCap = 12;
      const offeredMax = Math.max(1, Number(form.maxInstallments || '1'));
      const periodMonths = form.isSubscription ? monthsFromInterval(form.intervalUnit, Number(form.intervalCount || '1')) : 0;
      const finalMaxInstallments = form.isSubscription
        ? Math.max(1, Math.min(offeredMax, periodMonths, platformCap))
        : Math.max(1, Math.min(offeredMax, platformCap));
      const body: any = {
        name: form.name || undefined,
        description: form.description || undefined,
        currency: form.currency,
        priceCents: Math.round(Math.max(0, Number((form.price || '0').replace(',', '.')) * 100)),
        isSubscription: !!form.isSubscription,
        intervalUnit: form.isSubscription ? form.intervalUnit : null,
        intervalCount: form.isSubscription ? Number(form.intervalCount || 1) : null,
        trialDays: form.isSubscription ? Number(form.trialDays || 0) : null,
        maxInstallments: finalMaxInstallments,
        active: !!form.active,
        // Save absolute URL
        checkoutUrl: normalizeCheckoutForSave(form.checkoutUrl) || undefined,
      };
      const res = await fetch(`/api/products/${productId}/offers/${offer.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error("Failed to save offer");
      // methods
      await fetch(`/api/products/${productId}/offers/${offer.id}/methods`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ methods: [
          { method: 'PIX', active: methods.PIX },
          { method: 'CARD', active: methods.CARD },
          { method: 'OPEN_FINANCE', active: methods.OPEN_FINANCE },
          { method: 'OPEN_FINANCE_AUTOMATIC', active: methods.OPEN_FINANCE_AUTOMATIC },
        ] })
      });
      // providers config: save default checkout country together with offer
      try {
        // fetch latest config to avoid overwriting concurrent keys
        let baseCfg: any = null;
        try {
          const fres = await fetch(`/api/products/${productId}/offers/${offer.id}/providers/config`, { cache: 'no-store' });
          if (fres.ok) {
            const fjs = await fres.json().catch(() => ({}));
            baseCfg = fjs?.config || fjs || {};
          }
        } catch {}
        const cfg = { ...(baseCfg || providerConfig || {}) } as any;
        const allowed = Array.isArray(overrideCountries) && overrideCountries.length > 0 ? overrideCountries : [];
        const dc = allowed.includes((defaultCountry || '').toUpperCase())
          ? (defaultCountry || '').toUpperCase()
          : (allowed[0] || '').toUpperCase();
        if (dc) cfg.CHECKOUT_DEFAULT_COUNTRY = dc;
        await fetch(`/api/products/${productId}/offers/${offer.id}/providers/config`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: cfg })
        });
        await loadProviderConfig(productId, offer.id);
      } catch {}
      await loadOffer(productId, offer.id);
    } catch (e) {
      console.error(e);
      alert('Failed to save offer');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!offer) return;
    if (!confirm('Delete this offer?')) return;
    try {
      setDeleting(true);
      const res = await fetch(`/api/products/${productId}/offers/${offer.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      router.push(`/business/products/${productId}/edit?tab=offers`);
    } catch (e) {
      console.error(e);
      alert('Failed to delete offer');
    } finally {
      setDeleting(false);
    }
  };

  const pricePretty = useMemo(() => (Number((form.price || '0').replace(',', '.'))).toLocaleString('pt-BR', { style: 'currency', currency: form.currency }), [form.price, form.currency]);

  const saveDefaultCountry = async () => {
    if (!offer) return;
    try {
      const cfg = { ...(providerConfig || {}) } as any;
      const allowed = Array.isArray(overrideCountries) && overrideCountries.length > 0 ? overrideCountries : [];
      const dc = allowed.includes((defaultCountry || '').toUpperCase())
        ? (defaultCountry || '').toUpperCase()
        : (allowed[0] || '').toUpperCase();
      if (dc) cfg.CHECKOUT_DEFAULT_COUNTRY = dc;
      await fetch(`/api/products/${productId}/offers/${offer.id}/providers/config`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: cfg })
      });
      await loadProviderConfig(productId, offer.id);
    } catch {}
  };

  useEffect(() => {
    try {
      if (!Array.isArray(overrideCountries)) return;
      if (overrideCountries.length === 0) return;
      const dc = (defaultCountry || '').toUpperCase();
      if (!dc) {
        setDefaultCountry(overrideCountries[0]);
      }
    } catch {}
  }, [overrideCountries]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24">
          <div className="flex items-center gap-4 mb-4">
            <Button variant="ghost" size="sm" asChild className="h-9 rounded-xl px-3 border border-gray-200 text-gray-700 hover:bg-gray-50">
              <Link href={`/business/products/${productId}/edit`}>
                <ArrowLeftIcon className="h-4 w-4 mr-2" />
                Back to product
              </Link>
            </Button>
            <div className="flex-1 flex items-center justify-between">
              <div>
                <h1 className="text-[20px] font-semibold text-gray-900 tracking-[-0.01em]">Edit Offer</h1>
                <p className="text-sm text-gray-500 mt-1">Product ID: <span className="font-mono">{productId}</span> • Offer ID: <span className="font-mono">{offerId}</span></p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleSave} disabled={saving} className="h-9 px-3 rounded-xl bg-gray-900 hover:bg-black text-white text-sm flex items-center gap-2">{saving ? (<><div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>Saving…</>) : (<><CheckIcon className="h-4 w-4" />Save</>)}</button>
                <Button type="button" variant="outline" onClick={handleDelete} disabled={deleting} className="h-9 border-red-200 text-red-600 hover:bg-red-50">{deleting ? 'Deleting…' : (<><TrashIcon className="h-4 w-4 mr-1" />Delete</> )}</Button>
              </div>
            </div>
          </div>

          {/* Two-column content */}
          <div className="grid grid-cols-1 gap-6">
            {/* Single column (image card removed) */}
            <div className="space-y-6">
              <Card className="bg-white border-gray-200 shadow-sm rounded-2xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold text-gray-900">Checkout Links</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label className="text-gray-900 font-medium">Checkout URL (full)</Label>
                    <Input value={form.checkoutUrl} onChange={(e) => setForm(v => ({ ...v, checkoutUrl: e.target.value }))} className="mt-2 h-10" placeholder={`${getBaseUrl()}/${getSlug()}/checkout/${productId}`} />
                    <p className="text-xs text-gray-500 mt-1">Saved as an absolute URL with slug “{getSlug()}” and base {getBaseUrl()}.</p>
                  </div>
                </CardContent>
              </Card>

              

              <Card className="bg-white border-gray-200 shadow-sm rounded-2xl">
                <Accordion type="single" collapsible>
                  <AccordionItem value="details" className="border-none px-3">
                    <AccordionTrigger className="py-3 text-base font-semibold text-gray-900">
                      Offer details
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <Label className="text-gray-900 font-medium">Name</Label>
                            <Input value={form.name} onChange={(e) => setForm(v => ({ ...v, name: e.target.value }))} className="mt-2 h-10" placeholder="Offer name" />
                          </div>
                          <div className="flex items-end">
                            <div className="w-full">
                              <Label className="text-gray-900 font-medium">Active</Label>
                              <div className="mt-2"><Switch checked={form.active} onCheckedChange={(checked) => setForm(v => ({ ...v, active: checked }))} /></div>
                            </div>
                          </div>
                        </div>
                        <div>
                          <Label className="text-gray-900 font-medium">Description</Label>
                          <Textarea value={form.description} onChange={(e) => setForm(v => ({ ...v, description: e.target.value }))} className="mt-2" rows={4} placeholder="Optional description" />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-gray-500">
                          <div>Created at: {offer?.createdAt ? new Date(offer.createdAt as any).toLocaleString() : '—'}</div>
                          <div>Updated at: {offer?.updatedAt ? new Date(offer.updatedAt as any).toLocaleString() : '—'}</div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="md:col-span-2">
                            <Label className="text-gray-900 font-medium">Default country (fallback)</Label>
                            <div className="mt-2 flex gap-2 items-center">
                              <Select value={defaultCountry} onValueChange={(v) => setDefaultCountry(v)}>
                                <SelectTrigger className="h-10 w-56"><SelectValue placeholder="Select country" /></SelectTrigger>
                                <SelectContent className="max-h-80">
                                  {overrideCountries.map((cc) => (
                                    <SelectItem key={cc} value={cc}>{flagEmoji(cc)} {getCountryName(cc)} ({cc})</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">Usado no checkout quando não há país na URL e não é possível detectar o país do dispositivo.</p>
                          </div>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </Card>

              {/* One Details card per added country */}
              {overrideCountries.map((cc) => {
                const cur = currencyForCountry(cc);
                const enabled = !!overrideEnabled[cc];
                const name = getCountryName(cc);
                return (
                  <Card key={cc} className="bg-white border-gray-200 shadow-sm rounded-2xl">
                    <Accordion type="single" collapsible>
                      <AccordionItem value={cc} className="border-none px-3">
                        <AccordionTrigger className="py-3 text-base font-semibold text-gray-900">
                          <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-3">
                              <span>Details {name}</span>
                              {routing[cc]?.CARD === 'STRIPE' && (
                                <span className="text-[11px] text-gray-500 font-mono">price_id: {String(providerConfig?.STRIPE?.[cc]?.[cur]?.externalPriceId || '—')}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Button type="button" variant="ghost" size="sm" onClick={(e) => { e.preventDefault(); deleteCountry(cc); }}>Excluir país</Button>
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="grid grid-cols-12 gap-3 items-start">
                            <div className="col-span-12 md:col-span-6">
                              <div className="text-[11px] text-gray-500">Toggle ON para usar preço customizado</div>
                              <div className="mt-2 flex items-center gap-2">
                                <Switch checked={enabled} onCheckedChange={(v) => setOverrideEnabled(prev => ({ ...prev, [cc]: !!v }))} />
                                <span className="text-xs text-gray-700">Usar preço customizado</span>
                              </div>
                            </div>
                            <div className="col-span-12 md:col-span-6">
                              {!editingCountry[cc] ? (
                                <div className="flex flex-col gap-2">
                                  <div>
                                    <Label className="text-gray-900 font-medium">Preço ({cur})</Label>
                                    <div className="mt-2 text-sm text-gray-800">
                                      {routing[cc]?.CARD === 'STRIPE' ? (
                                        (() => {
                                          const stripeForCountry = providerConfig?.STRIPE?.[cc]?.[cur] || {};
                                          const priceId = stripeForCountry?.externalPriceId as string | undefined;
                                          const amt = Number(stripeForCountry?.amountCents) || 0;
                                          return (
                                            <div className="flex items-center gap-3 flex-wrap">
                                              <span className="font-mono text-xs">{priceId ? `price_id: ${priceId}` : 'price_id: —'}</span>
                                              {amt > 0 && (<span className="text-xs text-gray-600">{(amt/100).toLocaleString('pt-BR', { style: 'currency', currency: cur })}</span>)}
                                            </div>
                                          );
                                        })()
                                      ) : (
                                        enabled ? (
                                          <span>{(parseAmountToCents(overridePrice[cc] || '0')/100).toLocaleString('pt-BR', { style: 'currency', currency: cur })}</span>
                                        ) : (
                                          <span className="text-gray-500">Usando preço base</span>
                                        )
                                      )}
                                    </div>
                                  </div>
                                  {cc === 'BR' && (
                                    <div>
                                      <Label className="text-gray-900 font-medium">Parcelamento máximo (Brasil)</Label>
                                      <div className="mt-2 text-sm text-gray-800">{form.maxInstallments || '—'}x</div>
                                    </div>
                                  )}
                                  {routing[cc]?.CARD === 'STRIPE' && (
                                    (() => {
                                      const stripeForCountry = providerConfig?.STRIPE?.[cc]?.[cur] || {};
                                      const priceId = stripeForCountry?.externalPriceId as string | undefined;
                                      return (
                                        <div className="flex items-center gap-3 flex-wrap">
                                          <div className="text-xs text-gray-600">Status: {priceId ? 'Configurado' : 'Pendente (selecione um price_id)'}</div>
                                        </div>
                                      );
                                    })()
                                  )}
                                  <div className="flex justify-end">
                                    <Button type="button" variant="outline" className="h-9" onClick={() => setEditingCountry(prev => ({ ...prev, [cc]: true }))}>Editar</Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-col gap-3">
                                  <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-2">
                                    <div className="md:col-span-2">
                                      <Label className="text-gray-900 font-medium">Preço ({cur})</Label>
                                      <Input
                                        type="number" step="0.01" min={0}
                                        value={overridePrice[cc] || ''}
                                        onChange={(e) => setOverridePrice(prev => ({ ...prev, [cc]: e.target.value }))}
                                        className="mt-2 h-10"
                                        placeholder={cur === 'USD' ? '30.00' : '0.00'}
                                        readOnly={routing[cc]?.CARD === 'STRIPE' && !enabled}
                                      />
                                    </div>
                                    <div className="flex items-end">
                                      {routing[cc]?.CARD === 'STRIPE' ? (
                                        (() => {
                                          const stripeForCountry = providerConfig?.STRIPE?.[cc]?.[cur] || {};
                                          const priceId = stripeForCountry?.externalPriceId as string | undefined;
                                          return (
                                            <div className="flex gap-2">
                                              {(() => {
                                                const isSupported = (cur === 'USD' || cur === 'BRL');
                                                return (
                                                  <>
                                                    <Button
                                                      type="button"
                                                      variant="outline"
                                                      className="h-10"
                                                      disabled={!isSupported}
                                                      onClick={() => { if (!isSupported) return; setSearchCountry(cc); openStripeSearch(cur as 'BRL'|'USD'); }}
                                                    >
                                                      {priceId ? 'Trocar price_id (Stripe)' : 'Selecionar price_id (Stripe)'}
                                                    </Button>
                                                    {!priceId && (
                                                      <Button
                                                        type="button"
                                                        className="h-10"
                                                        disabled={!isSupported}
                                                        onClick={() => { const amountStr = overridePrice[cc] || ''; setCreateStripeAmount(amountStr); setCreateStripeOpenFor({ country: cc, currency: cur }); }}
                                                      >
                                                        Criar price_id (Stripe)
                                                      </Button>
                                                    )}
                                                  </>
                                                );
                                              })()}
                                            </div>
                                          );
                                        })()
                                      ) : (
                                        <div className="text-xs text-gray-500">Defina o valor e salve as alterações</div>
                                      )}
                                    </div>
                                  </div>
                                  {cc === 'BR' && (
                                    <div className="w-full md:w-1/2">
                                      <Label className="text-gray-900 font-medium">Parcelamento máximo (Brasil)</Label>
                                      <Input type="number" min={1} value={form.maxInstallments} onChange={(e) => setForm(v => ({ ...v, maxInstallments: e.target.value }))} className="mt-2 h-10" />
                                    </div>
                                  )}
                                  <div className="flex justify-end gap-2">
                                    <Button type="button" variant="ghost" onClick={() => setEditingCountry(prev => ({ ...prev, [cc]: false }))}>Cancelar</Button>
                                    <Button type="button" onClick={() => saveCountryEdits(cc)}>Salvar alterações</Button>
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="col-span-12">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                                <div className="md:col-span-2">
                                  {/* Current routed methods */}
                                  <div className="mt-3">
                                    <div className="text-xs text-gray-600 mb-1">Meios de pagamento ativos</div>
                                    <div className="flex flex-wrap gap-2">
                                      {(['CARD','PIX','OPEN_FINANCE','OPEN_FINANCE_AUTOMATIC'] as const)
                                        .filter(m => routing[cc]?.[m])
                                        .map(m => (
                                          <span key={m} className="inline-flex items-center gap-2 px-2 py-1 rounded-full text-[11px] bg-gray-100 border border-gray-200 text-gray-700">
                                            <span>{m} · {routing[cc]?.[m]}</span>
                                            <button
                                              type="button"
                                              title={`Remover ${m}`}
                                              className="h-4 w-4 inline-flex items-center justify-center rounded-full bg-white border border-gray-300 text-gray-600 hover:bg-red-50 hover:text-red-700"
                                              onClick={() => offer && removeRouting(offer.id, cc, m)}
                                            >×</button>
                                          </span>
                                        ))}
                                      {(!routing[cc] || !(['CARD','PIX','OPEN_FINANCE','OPEN_FINANCE_AUTOMATIC'] as const).some(m => routing[cc]?.[m])) && (
                                        <span className="text-xs text-gray-500">Nenhum método configurado</span>
                                      )}
                                    </div>
                                  </div>
                                  {/* Add route */}
                                  <div className="mt-2">
                                    <Button type="button" variant="outline" className="h-9" onClick={() => { setAddRouteOpenFor(cc); setAddRouteMethod(''); setAddRouteProvider(''); }}>+ Adicionar meio de pagamento</Button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </Card>
                );
              })}

              {/* Add-region and add-country buttons at bottom */}
              <div className="flex justify-end gap-2 mt-3">
                <Button type="button" variant="outline" onClick={() => setAddingRegion(true)}>Adicionar região</Button>
                <Button type="button" variant="outline" onClick={() => setAddingCountry(true)}>Adicionar país</Button>
              </div>

              {/* Dialog to add country (create first routing rule) */}
              <Dialog open={addingCountry} onOpenChange={setAddingCountry}>
                <DialogContent className="sm:max-w-[520px]">
                  <DialogHeader>
                    <DialogTitle>Adicionar país</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="w-full">
                      <Label className="text-gray-900 font-medium">País</Label>
                      <Select value={addingCountryCode || undefined} onValueChange={(v) => setAddingCountryCode(v)}>
                        <SelectTrigger className="mt-2 h-10"><SelectValue placeholder="Selecione o país" /></SelectTrigger>
                        <SelectContent className="max-h-80">
                          {REGIONAL_COUNTRIES.map((region) => (
                            <div key={region.key} className="py-1">
                              <div className="px-2 py-1 text-[11px] uppercase tracking-wide text-gray-500">{region.label}</div>
                              {region.countries.map((c) => (
                                <SelectItem key={c.code} value={c.code}>{flagEmoji(c.code)} {c.name} ({c.code})</SelectItem>
                              ))}
                            </div>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-gray-900 font-medium">Método</Label>
                        <Select value={addingCountryMethod || undefined} onValueChange={(v: any) => setAddingCountryMethod(v)}>
                          <SelectTrigger className="mt-2 h-10"><SelectValue placeholder="Selecionar método" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="CARD">CARD</SelectItem>
                            {addingCountryCode === 'BR' && (
                              <>
                                <SelectItem value="PIX">PIX</SelectItem>
                                <SelectItem value="OPEN_FINANCE">OPEN_FINANCE</SelectItem>
                                <SelectItem value="OPEN_FINANCE_AUTOMATIC">OPEN_FINANCE_AUTOMATIC</SelectItem>
                              </>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-gray-900 font-medium">Gateway</Label>
                        <Select value={addingCountryProvider || undefined} onValueChange={(v: any) => setAddingCountryProvider(v)}>
                          <SelectTrigger className="mt-2 h-10"><SelectValue placeholder="Selecionar gateway" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="STRIPE">STRIPE</SelectItem>
                            {addingCountryCode === 'BR' && (<SelectItem value="KRXPAY">KRXPAY</SelectItem>)}
                            {addingCountryCode === 'BR' && (<SelectItem value="APPMAX">APPMAX</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="ghost" onClick={() => { setAddingCountry(false); setAddingCountryCode('US'); setAddingCountryMethod(''); setAddingCountryProvider(''); }}>Cancelar</Button>
                      <Button type="button" onClick={async () => {
                        try {
                          if (!offer) return;
                          const cc = (addingCountryCode || 'US').toUpperCase();
                          if (!/^[A-Z]{2}$/.test(cc)) return;
                          const method = addingCountryMethod || 'CARD';
                          const provider = (addingCountryProvider || (cc==='BR' ? 'APPMAX' : 'STRIPE')) as any;
                          await saveRouting(offer.id, cc, method as any, provider as any);
                          // reload from DB to reflect new country
                          await loadProviderConfig(productId, offer.id);
                        } finally {
                          setAddingCountry(false);
                          setAddingCountryCode('US');
                          setAddingCountryMethod('');
                          setAddingCountryProvider('');
                        }
                      }}>Adicionar</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Dialog: Criar price_id (Stripe) para país */}
              <Dialog open={!!createStripeOpenFor} onOpenChange={(v) => { if (!v) { setCreateStripeOpenFor(null); setCreateStripeAmount(''); } }}>
                <DialogContent className="sm:max-w-[520px]">
                  <DialogHeader>
                    <DialogTitle>Criar price_id (Stripe){createStripeOpenFor ? ` — ${getCountryName(createStripeOpenFor.country)} (${createStripeOpenFor.country}) ${createStripeOpenFor.currency}` : ''}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-gray-900 font-medium">Valor ({createStripeOpenFor?.currency || ''})</Label>
                      <Input type="number" step="0.01" min={0} value={createStripeAmount} onChange={(e) => setCreateStripeAmount(e.target.value)} className="mt-2 h-10" placeholder="99.90" />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="ghost" onClick={() => { setCreateStripeOpenFor(null); setCreateStripeAmount(''); }}>Cancelar</Button>
                      <Button type="button" onClick={async () => {
                        try {
                          if (!offer || !productId || !createStripeOpenFor) return;
                          const cc = createStripeOpenFor.country;
                          const cur = createStripeOpenFor.currency as 'BRL'|'USD'|'EUR';
                          const cents = Math.round(Math.max(0, Number(createStripeAmount.replace(',', '.')) * 100));
                          // 1) Ensure Stripe Product/Price with desired amount/currency
                          const ens = await fetch(`/api/products/${productId}/offers/${offer.id}/providers/stripe/ensure`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currency: cur, amountCents: cents })
                          });
                          if (ens.ok) {
                            const ej = await ens.json().catch(() => ({}));
                            const priceId = ej?.priceId as string | undefined;
                            // 2) Persist OfferPrice with externalPriceId for this country/provider
                            await fetch(`/api/offers/${offer.id}/prices`, {
                              method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ country: cc, currency: cur, provider: 'STRIPE', amountCents: cents, externalPriceId: priceId || undefined })
                            });
                            // 3) Refresh editor data
                            await loadProviderConfig(productId, offer.id);
                          }
                        } finally {
                          setCreateStripeOpenFor(null);
                          setCreateStripeAmount('');
                        }
                      }}>Criar</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Dialog to add region */}
              <Dialog open={addingRegion} onOpenChange={setAddingRegion}>
                <DialogContent className="sm:max-w-[520px]">
                  <DialogHeader>
                    <DialogTitle>Adicionar região</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="w-full">
                      <Label className="text-gray-900 font-medium">Região</Label>
                      <Select value={addingRegionKey || undefined} onValueChange={(v) => setAddingRegionKey(v)}>
                        <SelectTrigger className="mt-2 h-10"><SelectValue placeholder="Selecione a região" /></SelectTrigger>
                        <SelectContent className="max-h-80">
                          {REGIONAL_COUNTRIES.map((region) => (
                            <SelectItem key={region.key} value={region.key}>{region.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="ghost" onClick={() => { setAddingRegion(false); setAddingRegionKey(''); }}>Cancelar</Button>
                      <Button type="button" onClick={() => {
                        const key = String(addingRegionKey || '').trim();
                        const region = REGIONAL_COUNTRIES.find(r => r.key === key);
                        if (!region) return;
                        const codes = region.countries.map(c => String(c.code).toUpperCase()).filter(cc => /^[A-Z]{2}$/.test(cc));
                        setOverrideCountries(prev => Array.from(new Set([...prev, ...codes])));
                        setOverrideEnabled(prev => {
                          const n = { ...prev } as Record<string, boolean>;
                          codes.forEach(cc => { n[cc] = true; });
                          return n;
                        });
                        setAddingRegion(false);
                        setAddingRegionKey('');
                      }}>Adicionar</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
                <DialogContent className="sm:max-w-[720px]">
                  <DialogHeader>
                    <DialogTitle>Buscar preços no Stripe ({searchCurrency})</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2 items-center">
                        <div className="w-64">
                          <Label className="text-gray-900 font-medium">País (opcional)</Label>
                          <Select value={searchCountry || undefined} onValueChange={(v) => setSearchCountry(v === '__NONE__' ? '' : v)}>
                            <SelectTrigger className="mt-2 h-10"><SelectValue placeholder="Selecionar país (opcional)" /></SelectTrigger>
                            <SelectContent className="max-h-80">
                              <SelectItem value="__NONE__">Sem país</SelectItem>
                              {REGIONAL_COUNTRIES.map((region) => (
                                <div key={region.key} className="py-1">
                                  <div className="px-2 py-1 text-[11px] uppercase tracking-wide text-gray-500">{region.label}</div>
                                  {region.countries.map((c) => (
                                    <SelectItem key={c.code} value={c.code}>{flagEmoji(c.code)} {c.name} ({c.code})</SelectItem>
                                  ))}
                                </div>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex-1" />
                      </div>
                      <div className="flex gap-2">
                        <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Nome do produto ou price_id" />
                        <Button type="button" onClick={() => fetchStripePrices(searchCurrency, searchQuery)} disabled={searchLoading}>{searchLoading ? 'Buscando...' : 'Buscar'}</Button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                        <div>
                          <Label className="text-gray-900 font-medium">Valor ({searchCurrency})</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min={0}
                            value={createStripeAmount}
                            onChange={(e) => setCreateStripeAmount(e.target.value)}
                            className="mt-2 h-10"
                            placeholder={searchCurrency === 'USD' ? '30.00' : '0.00'}
                          />
                        </div>
                        <div>
                          <Label className="text-gray-900 font-medium">Apelido (opcional)</Label>
                          <Input
                            value={createStripeNickname}
                            onChange={(e) => setCreateStripeNickname(e.target.value)}
                            className="mt-2 h-10"
                            placeholder={`ex.: ${offer?.name || 'Offer'} ${searchCurrency}`}
                          />
                        </div>
                        <div className="flex items-end">
                          <Button
                            type="button"
                            className="h-10"
                            onClick={async () => {
                              if (!offer) return;
                              if (!currentClinic?.id) { alert('Clínica não definida'); return; }
                              if (!searchCountry) { alert('Selecione um país para aplicar o price_id'); return; }
                              const cents = Math.round(Math.max(0, Number((createStripeAmount || '0').replace(',', '.')) * 100));
                              if (!(cents > 0)) { alert('Informe um valor válido'); return; }
                              const nickname = createStripeNickname?.trim() || `${offer.name || 'Offer'} ${searchCurrency}`;
                              try {
                                const res = await fetch(`/api/products/${productId}/offers/${offer.id}/providers/stripe/ensure`, {
                                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ clinicId: String(currentClinic.id), currency: searchCurrency, amountCents: cents, nickname })
                                });
                                const js = await res.json().catch(() => ({}));
                                if (!res.ok) throw new Error(js?.error || 'Falha ao criar price');
                                const pid = js?.priceId as string | undefined;
                                if (pid) {
                                  await selectStripePrice(pid);
                                }
                                setSearchOpen(false);
                                setCreateStripeAmount('');
                                setCreateStripeNickname('');
                              } catch (e: any) {
                                alert(e?.message || 'Falha ao criar price');
                              }
                            }}
                          >
                            Criar price_id (Stripe)
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="max-h-80 overflow-auto rounded-lg border border-gray-200">
                      <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[11px] text-gray-500 border-b border-gray-200 bg-gray-50/50 sticky top-0">
                        <div className="col-span-6">Nome do Produto</div>
                        <div className="col-span-4">Nome do Preço</div>
                        <div className="col-span-2 text-right">Valor</div>
                      </div>
                      {searchResults.length === 0 && (
                        <div className="p-4 text-sm text-gray-500">Nenhum resultado</div>
                      )}
                      {searchResults.map((it) => {
                        const value = (Number(it.unitAmount||0)/100).toLocaleString('pt-BR', { style: 'currency', currency: String(it.currency||'').toUpperCase()||'BRL' })
                        const recur = it.interval ? ` / ${String(it.intervalCount||1)} ${String(it.interval).toLowerCase()}(s)` : ''
                        return (
                          <div key={it.priceId} className="grid grid-cols-12 gap-2 items-center px-3 py-2 border-b last:border-b-0">
                            <div className="col-span-6 min-w-0">
                              <div className="text-sm font-medium text-gray-900 truncate" title={it.productName || ''}>{it.productName || '—'}</div>
                              {it.productDescription && <div className="text-[11px] text-gray-500 truncate" title={it.productDescription}>{it.productDescription}</div>}
                            </div>
                            <div className="col-span-4 min-w-0">
                              <div className="text-sm text-gray-900 truncate" title={it.priceNickname || ''}>{it.priceNickname || '—'}</div>
                            </div>
                            <div className="col-span-2 flex items-center justify-end gap-2">
                              <div className="text-sm text-gray-900 whitespace-nowrap">{value}{recur}</div>
                              <Button size="sm" type="button" onClick={() => selectStripePrice(it.priceId)} className="shrink-0">Selecionar</Button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              {/* Dialog: Adicionar meio de pagamento (por país) */}
              <Dialog open={!!addRouteOpenFor} onOpenChange={(v) => { if (!v) { setAddRouteOpenFor(''); setAddRouteMethod(''); setAddRouteProvider(''); } }}>
                <DialogContent className="sm:max-w-[520px]">
                  <DialogHeader>
                    <DialogTitle>Adicionar meio de pagamento {addRouteOpenFor ? `(${getCountryName(addRouteOpenFor)} - ${addRouteOpenFor})` : ''}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-gray-900 font-medium">Método</Label>
                      <Select value={addRouteMethod || undefined} onValueChange={(v: any) => setAddRouteMethod(v)}>
                        <SelectTrigger className="mt-2 h-10"><SelectValue placeholder="Selecionar método" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CARD">CARD</SelectItem>
                          {addRouteOpenFor === 'BR' && (
                            <>
                              <SelectItem value="PIX">PIX</SelectItem>
                              <SelectItem value="OPEN_FINANCE">OPEN_FINANCE</SelectItem>
                              <SelectItem value="OPEN_FINANCE_AUTOMATIC">OPEN_FINANCE_AUTOMATIC</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-gray-900 font-medium">Gateway</Label>
                      <Select value={addRouteProvider || undefined} onValueChange={(v: any) => setAddRouteProvider(v)}>
                        <SelectTrigger className="mt-2 h-10"><SelectValue placeholder="Selecionar gateway" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="STRIPE">STRIPE</SelectItem>
                          {addRouteOpenFor === 'BR' && (<SelectItem value="KRXPAY">KRXPAY</SelectItem>)}
                          {addRouteOpenFor === 'BR' && (<SelectItem value="APPMAX">APPMAX</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <Button type="button" variant="ghost" onClick={() => { setAddRouteOpenFor(''); setAddRouteMethod(''); setAddRouteProvider(''); }}>Cancelar</Button>
                      <Button type="button" onClick={async () => {
                        if (!offer) return;
                        if (!addRouteOpenFor || !addRouteMethod || !addRouteProvider) return;
                        await saveRouting(offer.id, addRouteOpenFor, addRouteMethod as any, addRouteProvider as any);
                        setAddRouteOpenFor('');
                        setAddRouteMethod('');
                        setAddRouteProvider('');
                      }}>Salvar</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {/* Right column removed */}
          </div>
        </div>
      </div>
    </div>
  );
}
