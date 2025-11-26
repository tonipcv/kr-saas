'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeftIcon,
  ShoppingBagIcon,
  CheckIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useClinic } from '@/contexts/clinic-context';
import { ProtocolImagePicker } from '@/components/protocol/protocol-image-picker';

// Country helpers (ISO2 + English name) and flag renderer via regional indicators
const COUNTRIES: Array<{ code: string; name: string }> = [
  { code: 'BR', name: 'Brazil' },
  { code: 'US', name: 'United States' },
  { code: 'PT', name: 'Portugal' },
  { code: 'ES', name: 'Spain' },
  { code: 'MX', name: 'Mexico' },
  { code: 'AR', name: 'Argentina' },
  { code: 'CL', name: 'Chile' },
  { code: 'CO', name: 'Colombia' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },
  { code: 'IT', name: 'Italy' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'JP', name: 'Japan' },
  { code: 'CN', name: 'China' },
  { code: 'IN', name: 'India' },
];
function flagEmoji(iso2: string) {
  const code = (iso2 || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '🏳️';
  const A = 0x1f1e6; // Regional Indicator Symbol Letter A
  const chars = Array.from(code).map(c => String.fromCodePoint(A + (c.charCodeAt(0) - 65))).join('');
  return chars;
}

export default function CreateProductPage() {
  const router = useRouter();
  const { currentClinic } = useClinic();
  const [isLoading, setIsLoading] = useState(false);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [categoriesLoading, setCategoriesLoading] = useState<boolean>(false);
  const [creatingCategory, setCreatingCategory] = useState<boolean>(false);
  const [newCategoryName, setNewCategoryName] = useState<string>('');
  // Initial Offer state
  const [offerForm, setOfferForm] = useState({
    name: 'Nova oferta',
    price: '', // decimal string
    currency: 'BRL' as 'BRL'|'USD'|'EUR',
    isSubscription: false,
    intervalUnit: 'MONTH' as 'DAY'|'WEEK'|'MONTH'|'YEAR',
    intervalCount: '1',
    trialDays: '0',
    maxInstallments: '1',
    allowPIX: true,
    allowCARD: true,
  });

  // Minimal required country price for the first offer (at least one)
  const [countryPrice, setCountryPrice] = useState<{ country: string; currency: 'BRL'|'USD'|'EUR'; provider: 'KRXPAY'|'STRIPE'|'APPMAX'; price: string }>({
    country: 'BR',
    currency: 'BRL',
    provider: 'KRXPAY',
    price: '',
  });

  // Enforce regional rules:
  // - BR: allow KRXPAY or STRIPE, PIX toggle available
  // - Non-BR (e.g., US): force STRIPE, disable PIX
  useEffect(() => {
    try {
      const cc = String(countryPrice.country || '').toUpperCase();
      if (cc !== 'BR') {
        if (countryPrice.provider !== 'STRIPE') {
          setCountryPrice((p) => ({ ...p, provider: 'STRIPE' }));
        }
        if (offerForm.allowPIX) {
          setOfferForm((o) => ({ ...o, allowPIX: false }));
        }
      }
      // BR keeps current selections
    } catch {}
  }, [countryPrice.country]);

  // Auto-derive currency from country for minimal UX: BR -> BRL, EU majors -> EUR, others -> USD
  useEffect(() => {
    try {
      const cc = String(countryPrice.country || '').toUpperCase();
      const euroSet = new Set(['PT','ES','FR','DE','IT']);
      let cur: 'BRL'|'USD'|'EUR' = 'USD';
      if (cc === 'BR') cur = 'BRL';
      else if (euroSet.has(cc)) cur = 'EUR';
      if (countryPrice.currency !== cur) {
        setCountryPrice((p) => ({ ...p, currency: cur }));
      }
    } catch {}
  }, [countryPrice.country]);

  // Integration connection flags must be defined before computing providers
  const [pgConnected, setPgConnected] = useState<boolean>(false);
  const [stripeConnected, setStripeConnected] = useState<boolean>(false);
  const [appmaxConnected, setAppmaxConnected] = useState<boolean>(false);

  // Compute available providers per country based on active integrations
  const providersAvailable = React.useMemo(() => {
    const cc = String(countryPrice.country || '').toUpperCase();
    const list: Array<'KRXPAY'|'STRIPE'|'APPMAX'> = [];
    if (cc === 'BR') {
      if (pgConnected) list.push('KRXPAY');
      if (stripeConnected) list.push('STRIPE');
      if (appmaxConnected) list.push('APPMAX');
    } else {
      if (stripeConnected) list.push('STRIPE');
    }
    return list;
  }, [countryPrice.country, pgConnected, stripeConnected, appmaxConnected]);

  // Ensure selected provider is valid when country or integrations change
  useEffect(() => {
    if (!providersAvailable.includes(countryPrice.provider as any)) {
      if (providersAvailable.length > 0) {
        setCountryPrice((p) => ({ ...p, provider: providersAvailable[0] }));
      }
    }
  }, [providersAvailable, countryPrice.provider]);

  // Country options allowed by provider: Stripe -> all, others -> only BR
  const countryOptions = React.useMemo(() => {
    const prov = String(countryPrice.provider || '').toUpperCase();
    if (prov === 'STRIPE') return COUNTRIES;
    return COUNTRIES.filter(c => c.code === 'BR');
  }, [countryPrice.provider]);

  // Ensure country fits provider constraints (non-Stripe -> BR)
  useEffect(() => {
    const prov = String(countryPrice.provider || '').toUpperCase();
    if (prov !== 'STRIPE' && String(countryPrice.country).toUpperCase() !== 'BR') {
      setCountryPrice(p => ({ ...p, country: 'BR' }));
    }
  }, [countryPrice.provider]);

  // Gateway por localização (MVP)
  const [routingUsePlatformDefault, setRoutingUsePlatformDefault] = useState(true);
  const [routingDefaultProvider, setRoutingDefaultProvider] = useState<'KRXPAY' | 'STRIPE' | 'APPMAX'>('KRXPAY');
  const [routingOverrides, setRoutingOverrides] = useState<Array<{ country: string; provider: 'KRXPAY'|'STRIPE'|'APPMAX' }>>([]);
  const [merchantId, setMerchantId] = useState<string>('');

  useEffect(() => {
    const loadMerchantAndStatuses = async () => {
      try {
        if (!currentClinic?.id) return;
        const m = await fetch(`/api/admin/integrations/merchant/by-clinic?clinicId=${encodeURIComponent(currentClinic.id)}`, { cache: 'no-store' }).then(r => r.json()).catch(() => ({}));
        if (m?.exists && m?.id) setMerchantId(String(m.id));
        const pg = await fetch(`/api/payments/pagarme/status?clinicId=${encodeURIComponent(currentClinic.id)}`, { cache: 'no-store' }).then(r => r.json()).catch(() => ({}));
        setPgConnected(!!pg?.connected);
        const st = await fetch(`/api/admin/integrations/stripe/status?clinicId=${encodeURIComponent(currentClinic.id)}`, { cache: 'no-store' }).then(r => r.json()).catch(() => ({}));
        setStripeConnected(!!st?.connected);
        const apm = await fetch(`/api/admin/integrations/appmax/status?clinicId=${encodeURIComponent(currentClinic.id)}`, { cache: 'no-store' }).then(r => r.json()).catch(() => ({}));
        setAppmaxConnected(!!apm?.connected);
      } catch {}
    };
    loadMerchantAndStatuses();
  }, [currentClinic?.id]);

  const getBaseUrl = () => {
    const dom = (process.env.NEXT_PUBLIC_APP_BASE_DOMAIN || process.env.APP_BASE_DOMAIN) as string | undefined;
    if (dom && dom.trim()) {
      const d = dom.trim();
      const hasProto = /^https?:\/\//i.test(d);
      const url = hasProto ? d : `https://${d}`;
      return url.replace(/\/$/, '');
    }
    const pub = (process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_NEXTAUTH_URL) as string | undefined;
    if (pub && /^https?:\/\//.test(pub)) return pub.replace(/\/$/, '');
    if (typeof window !== 'undefined') return window.location.origin;
    return 'http://localhost:3000';
  };
  const [formData, setFormData] = useState({
    name: '',
    subtitle: '',
    description: '',
    imageUrl: '',
    originalPrice: '',
    discountPrice: '',
    discountPercentage: '',
    usageStats: '0',
    purchaseUrl: '',
    creditsPerUnit: '',
    category: '',
    isActive: true,
    confirmationUrl: '',
    priority: '0',
    // Selling type
    type: 'PRODUCT', // PRODUCT | SUBSCRIPTION
  });

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setCategoriesLoading(true);
        const res = await fetch('/api/product-categories');
        if (res.ok) {
          const data = await res.json();
          setCategories(data || []);
        }
      } catch (e) {
        console.error('Error fetching categories', e);
      } finally {
        setCategoriesLoading(false);
      }
    };
    fetchCategories();
  }, []);

  // Keep offerForm.isSubscription in sync with product type
  useEffect(() => {
    const isSub = formData.type === 'SUBSCRIPTION';
    setOfferForm((prev) => ({
      ...prev,
      isSubscription: isSub,
      // When switching to subscription, ensure maxInstallments is 1
      maxInstallments: isSub ? '1' : prev.maxInstallments,
    }));
  }, [formData.type]);

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Legacy pricing removed on create page; no derived discount calc needed
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) { alert('Name is required'); return; }
    if (!countryPrice.price || Number(countryPrice.price) <= 0) { alert('Enter a valid price for the initial country offer'); return; }
    try {
      setIsLoading(true);
      const payload: any = {
        name: formData.name,
        description: formData.description,
        imageUrl: formData.imageUrl || undefined,
        creditsPerUnit: formData.creditsPerUnit ? Number(formData.creditsPerUnit) : undefined,
        category: formData.category || 'Geral',
        priority: formData.priority !== '' ? Number(formData.priority) : undefined,
      };
      // Selling type defined explicitly by user selection
      payload.type = formData.type === 'SUBSCRIPTION' ? 'SUBSCRIPTION' : 'PRODUCT';
      const response = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        const created = await response.json().catch(() => ({}));
        const productId = created?.id || created?.product?.id;
        if (productId) {
          try {
            // Create initial Offer (global, without price/methods/installments)
            const offerPayload: any = {
              name: offerForm.name || 'Nova oferta',
              // Offer type is bound to product type
              isSubscription: payload.type === 'SUBSCRIPTION',
              intervalUnit: (payload.type === 'SUBSCRIPTION') ? offerForm.intervalUnit : null,
              intervalCount: (payload.type === 'SUBSCRIPTION') ? Number(offerForm.intervalCount || 1) : null,
              trialDays: (payload.type === 'SUBSCRIPTION') ? Number(offerForm.trialDays || 0) : null,
              active: true,
              // checkoutUrl will be auto-generated below
            };
            const offerRes = await fetch(`/api/products/${productId}/offers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(offerPayload) });
            const offerJs = offerRes.ok ? await offerRes.json().catch(() => ({})) : null;
            const offerId = offerJs?.offer?.id;
            // Auto-generate absolute checkout URL to /:slug/checkout/:productId?offer=:offerId
            if (offerId) {
              try {
                const slug = (currentClinic?.slug && String(currentClinic.slug)) || 'krx-clinic';
                const base = getBaseUrl();
                const fullUrl = `${base}/${slug}/checkout/${productId}?offer=${offerId}`;
                await fetch(`/api/products/${productId}/offers/${offerId}`, {
                  method: 'PUT', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ checkoutUrl: fullUrl })
                });
                // Create required initial country price for the offer
                try {
                  const amountCents = Math.round(Number(countryPrice.price) * 100);
                  await fetch(`/api/offers/${offerId}/prices`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      country: countryPrice.country,
                      currency: countryPrice.currency,
                      provider: countryPrice.provider,
                      amountCents,
                      active: true,
                    })
                  });
                  // Align initial routing for this offer (CARD and optionally PIX) similar to the edit page
                  try {
                    const methodProvider = countryPrice.provider as 'KRXPAY' | 'STRIPE' | 'APPMAX';
                    // Route CARD to selected provider for the chosen country
                    await fetch(`/api/payment-routing`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        offerId,
                        country: String(countryPrice.country).toUpperCase(),
                        method: 'CARD',
                        provider: methodProvider,
                        priority: 10,
                        isActive: true,
                      })
                    });
                    // Route PIX when enabled in the form
                    if (offerForm.allowPIX) {
                      await fetch(`/api/payment-routing`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          offerId,
                          country: String(countryPrice.country).toUpperCase(),
                          method: 'PIX',
                          provider: methodProvider,
                          priority: 10,
                          isActive: true,
                        })
                      });
                    }
                  } catch {}
                  // Persist payment methods for the offer (enable/disable)
                  try {
                    await fetch(`/api/products/${productId}/offers/${offerId}/methods`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        methods: [
                          { method: 'CARD', active: !!offerForm.allowCARD },
                          { method: 'PIX', active: !!offerForm.allowPIX },
                          // OPEN_FINANCE flags can be added later if desired
                        ]
                      })
                    });
                  } catch {}
                  // Compute and persist BR installments like the edit page logic
                  try {
                    const monthsFromInterval = (unit: string, count: number) => {
                      const u = String(unit || 'MONTH').toUpperCase();
                      if (u === 'YEAR') return Math.max(1, count * 12);
                      if (u === 'MONTH') return Math.max(1, count);
                      if (u === 'WEEK') return Math.max(1, Math.ceil(count / 4));
                      if (u === 'DAY') return Math.max(1, Math.ceil(count / 30));
                      return 1;
                    };
                    const platformCap = 12;
                    const offeredMax = Math.max(1, Number(offerForm.maxInstallments || '1'));
                    const isSub = !!offerForm.isSubscription;
                    const periodMonths = isSub ? monthsFromInterval(offerForm.intervalUnit, Number(offerForm.intervalCount || '1')) : 0;
                    const finalMaxInstallments = isSub
                      ? Math.max(1, Math.min(offeredMax, periodMonths, platformCap))
                      : Math.max(1, Math.min(offeredMax, platformCap));
                    await fetch(`/api/products/${productId}/offers/${offerId}`, {
                      method: 'PUT', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ maxInstallments: finalMaxInstallments })
                    });
                  } catch {}
                  // Set default checkout country for providers config to the initial country
                  try {
                    await fetch(`/api/products/${productId}/offers/${offerId}/providers/config`, {
                      method: 'PUT', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ config: { CHECKOUT_DEFAULT_COUNTRY: String(countryPrice.country).toUpperCase() } })
                    });
                  } catch {}
                } catch {}
              } catch {}
            }
            // Payment methods will be defined per country/provider in OfferPrices later
            // Go to edit page
            router.push(`/business/products/${productId}/edit`);
          } catch (e) {
            // If offer creation fails, still go to edit page
            router.push(`/business/products/${productId}/edit`);
          }
          // Persist routing rules if configured
          try {
            if (merchantId && productId) {
              // If not using platform default, create a default rule without country
              if (!routingUsePlatformDefault) {
                await fetch('/api/routing/rules', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ merchantId, productId, provider: routingDefaultProvider, priority: 100, isActive: true })
                });
              }
              // Create overrides by country
              for (const ov of routingOverrides) {
                if (!ov.country || !ov.provider) continue;
                await fetch('/api/routing/rules', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ merchantId, productId, country: ov.country.toUpperCase(), provider: ov.provider, priority: 50, isActive: true })
                });
              }
            }
          } catch {}
        } else {
          router.push('/business/products');
        }
      } else {
        const error = await response.json();
        alert(error.error || 'Error creating product');
      }
    } catch (error) {
      console.error('Error creating product:', error);
      alert('Error creating product');
    } finally {
      setIsLoading(false);
    }
  };

  // No WhatsApp modal here; use Offer.checkoutUrl directly if needed

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24">

          <div className="flex items-center gap-4 mb-4">
            <Button variant="ghost" size="sm" asChild className="h-9 rounded-xl px-3 border border-gray-200 text-gray-700 hover:bg-gray-50">
              <Link href="/business/products">
                <ArrowLeftIcon className="h-4 w-4 mr-2" />
                Back
              </Link>
            </Button>
            <div>
              <h1 className="text-[20px] font-semibold text-gray-900 tracking-[-0.01em]">New Product</h1>
              <p className="text-sm text-gray-500 mt-1">Add a new product to recommend to clients</p>
            </div>
          </div>

          <div>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left: Details */}
                <Card className="bg-white border-gray-200 shadow-sm rounded-2xl">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold text-gray-900">Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="name" className="text-gray-900 font-medium">Product Name *</Label>
                      <Input id="name" value={formData.name} onChange={(e) => handleInputChange('name', e.target.value)} placeholder="Your product name" required className="mt-2 border-gray-300 focus:border-gray-900 focus:ring-gray-900 bg-white text-gray-700 placeholder:text-gray-500 rounded-xl h-9" />
                    </div>


                    {/* Confirmation URL removed in favor of Offer.checkoutUrl on the initial Offer below */}


                    {/* Product Type Selector (moved below Category) */}
                    <div className="pt-2">
                      <Label className="text-gray-900 font-medium">Product Type</Label>
                      <div className="mt-2">
                        <Select value={formData.type} onValueChange={(val) => handleInputChange('type', val)}>
                          <SelectTrigger className="border-gray-300 focus:border-gray-900 focus:ring-gray-900 bg-white text-gray-700 rounded-xl h-9">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PRODUCT">One-time</SelectItem>
                            <SelectItem value="SUBSCRIPTION">Subscription</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">This controls the initial offer type below and the checkout behavior.</p>
                    </div>

                  </CardContent>
                </Card>

                {/* Right: Image */}
                <Card className="bg-white border-gray-200 shadow-sm rounded-2xl">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold text-gray-900">Image</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label className="text-gray-900 font-medium">Product Image</Label>
                      <div className="mt-2">
                        <ProtocolImagePicker
                          selectedImage={formData.imageUrl || ''}
                          onSelectImage={(url) => handleInputChange('imageUrl', url)}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-2">Upload an image or paste a URL below.</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Pricing & Offer */}
              <Card className="bg-white border-gray-200 shadow-sm rounded-2xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold text-gray-900">Pricing & Payment</CardTitle>
                  <p className="text-xs text-gray-500 mt-1">Configure price, payment methods and installments</p>
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* Subscription Settings */}
                  {offerForm.isSubscription && (
                    <div className="pb-4 border-b border-gray-100">
                      <Label className="text-sm font-medium text-gray-900 mb-3 block">Subscription Settings</Label>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <Label className="text-xs text-gray-600">Interval</Label>
                          <Select value={offerForm.intervalUnit} onValueChange={(val: any) => setOfferForm(o => ({ ...o, intervalUnit: val }))}>
                            <SelectTrigger className="mt-1.5 h-10 border-gray-300 focus:border-gray-900 focus:ring-gray-900">
                              <SelectValue placeholder="Select interval" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="DAY">Day</SelectItem>
                              <SelectItem value="WEEK">Week</SelectItem>
                              <SelectItem value="MONTH">Month</SelectItem>
                              <SelectItem value="YEAR">Year</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs text-gray-600">Every</Label>
                          <Input 
                            type="number" 
                            min={1} 
                            value={offerForm.intervalCount} 
                            onChange={(e) => setOfferForm(o => ({ ...o, intervalCount: e.target.value }))} 
                            className="mt-1.5 h-10 border-gray-300 focus:border-gray-900 focus:ring-gray-900" 
                            placeholder="1"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-gray-600">Trial Period (days)</Label>
                          <Input 
                            type="number" 
                            min={0} 
                            value={offerForm.trialDays} 
                            onChange={(e) => setOfferForm(o => ({ ...o, trialDays: e.target.value }))} 
                            className="mt-1.5 h-10 border-gray-300 focus:border-gray-900 focus:ring-gray-900" 
                            placeholder="0"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Price Configuration */}
                  <div>
                    <Label className="text-sm font-medium text-gray-900 mb-3 block">Price Configuration *</Label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <Label className="text-xs text-gray-600 mb-1.5 block">Country</Label>
                        <Select value={countryPrice.country} onValueChange={(val: any) => setCountryPrice(p => ({ ...p, country: val }))}>
                          <SelectTrigger className="h-10 border-gray-300 focus:border-gray-900 focus:ring-gray-900">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            {countryOptions.map(c => (
                              <SelectItem key={c.code} value={c.code}>
                                <span className="inline-flex items-center gap-2">
                                  <img
                                    src={`https://flagcdn.com/${c.code.toLowerCase()}.svg`}
                                    alt={`${c.name} flag`}
                                    className="h-3 w-4 rounded-sm object-cover"
                                    loading="lazy"
                                  />
                                  <span>{c.name}</span>
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-600 mb-1.5 block">Currency</Label>
                        <div className="mt-1.5 h-10 flex items-center rounded-xl border border-gray-200 px-3 bg-gray-50 text-gray-700">
                          {countryPrice.currency}
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-600 mb-1.5 block">Provider</Label>
                        <Select value={countryPrice.provider} onValueChange={(val: any) => setCountryPrice(p => ({ ...p, provider: val }))}>
                          <SelectTrigger className="h-10 border-gray-300 focus:border-gray-900 focus:ring-gray-900">
                            <SelectValue placeholder="Provider" />
                          </SelectTrigger>
                          <SelectContent>
                            {providersAvailable.length === 0 && (
                              <SelectItem value="__none__" disabled>
                                No active providers
                              </SelectItem>
                            )}
                            {providersAvailable.map((p) => (
                              <SelectItem key={p} value={p}>
                                {p === 'STRIPE' ? 'Stripe' : p === 'KRXPAY' ? 'KRX Pay' : 'Appmax'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-600 mb-1.5 block">Price *</Label>
                        <Input 
                          type="number" 
                          min="0" 
                          step="0.01" 
                          value={countryPrice.price} 
                          onChange={(e) => setCountryPrice(p => ({ ...p, price: e.target.value }))} 
                          className="h-10 border-gray-300 focus:border-gray-900 focus:ring-gray-900" 
                          placeholder="0.00" 
                          required
                        />
                      </div>
                    </div>
                  </div>

                  {/* Payment Methods */}
                  <div className="pt-4 border-t border-gray-100">
                    <Label className="text-sm font-medium text-gray-900 mb-3 block">Payment Methods</Label>
                    <div className="flex items-center gap-6">
                      <label className="inline-flex items-center gap-2.5 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={offerForm.allowCARD} 
                          onChange={(e) => setOfferForm(o => ({ ...o, allowCARD: e.target.checked }))} 
                          className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                        />
                        <span className="text-sm text-gray-700">Credit/Debit Card</span>
                      </label>
                      <label className="inline-flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={offerForm.allowPIX}
                          disabled={String(countryPrice.country).toUpperCase() !== 'BR'}
                          onChange={(e) => setOfferForm(o => ({ ...o, allowPIX: e.target.checked }))} 
                          className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                        <span className={`text-sm ${String(countryPrice.country).toUpperCase() !== 'BR' ? 'text-gray-400' : 'text-gray-700'}`}>
                          PIX {String(countryPrice.country).toUpperCase() !== 'BR' && '(Brazil only)'}
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* Installments (Brazil only) */}
                  {String(countryPrice.country).toUpperCase() === 'BR' && (
                    <div className="pt-4 border-t border-gray-100">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <Label className="text-sm font-medium text-gray-900 block">Installments</Label>
                          <p className="text-xs text-gray-500 mt-1">Maximum number of installments for card payments</p>
                        </div>
                        <div className="w-24">
                          <Input
                            type="number"
                            min={1}
                            max={12}
                            value={offerForm.maxInstallments}
                            onChange={(e) => setOfferForm(o => ({ ...o, maxInstallments: e.target.value }))}
                            className="h-10 border-gray-300 focus:border-gray-900 focus:ring-gray-900 text-center"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-white border-gray-200 shadow-sm rounded-2xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold text-gray-900">Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="isActive" className="text-gray-900 font-medium">Active</Label>
                    <Switch id="isActive" checked={formData.isActive} onCheckedChange={(checked) => handleInputChange('isActive', checked)} />
                  </div>
                </CardContent>
              </Card>


              <div className="flex gap-3">
                <Button type="submit" disabled={isLoading} className="flex-1 bg-gray-900 hover:bg-black text-white rounded-xl h-10 shadow-sm font-medium">
                  {isLoading ? (<><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>Creating...</>) : (<><CheckIcon className="h-4 w-4 mr-2" />Create Product</>)}
                </Button>
                <Button type="button" variant="outline" asChild className="border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 rounded-xl h-10 px-4 shadow-sm font-medium">
                  <Link href="/business/products">
                    <XMarkIcon className="h-4 w-4 mr-2" />
                    Cancel
                  </Link>
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* WhatsApp modal removed on create page */}
    </div>
  );
}
