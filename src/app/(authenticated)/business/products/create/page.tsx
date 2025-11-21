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
  const [countryPrice, setCountryPrice] = useState<{ country: string; currency: 'BRL'|'USD'|'EUR'; provider: 'KRXPAY'|'STRIPE'; price: string }>({
    country: 'BR',
    currency: 'BRL',
    provider: 'KRXPAY',
    price: '',
  });

  // Gateway por localização (MVP)
  const [routingUsePlatformDefault, setRoutingUsePlatformDefault] = useState(true);
  const [routingDefaultProvider, setRoutingDefaultProvider] = useState<'KRXPAY' | 'STRIPE'>('KRXPAY');
  const [routingOverrides, setRoutingOverrides] = useState<Array<{ country: string; provider: 'KRXPAY'|'STRIPE' }>>([]);
  const [merchantId, setMerchantId] = useState<string>('');
  const [pgConnected, setPgConnected] = useState<boolean>(false);
  const [stripeConnected, setStripeConnected] = useState<boolean>(false);

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
                      <Input id="name" value={formData.name} onChange={(e) => handleInputChange('name', e.target.value)} placeholder="e.g., Ultra Light Sunscreen" required className="mt-2 border-gray-300 focus:border-gray-900 focus:ring-gray-900 bg-white text-gray-700 placeholder:text-gray-500 rounded-xl h-9" />
                    </div>

                    <div>
                      <Label htmlFor="subtitle" className="text-gray-900 font-medium">Subtitle</Label>
                      <Input id="subtitle" value={formData.subtitle} onChange={(e) => handleInputChange('subtitle', e.target.value)} placeholder="Short product subtitle" className="mt-2 border-gray-300 focus:border-gray-900 focus:ring-gray-900 bg-white text-gray-700 placeholder:text-gray-500 rounded-xl h-9" />
                    </div>

                    <div>
                      <Label htmlFor="description" className="text-gray-900 font-medium">Description</Label>
                      <Textarea id="description" value={formData.description} onChange={(e) => handleInputChange('description', e.target.value)} placeholder="Describe the product and its benefits..." rows={4} className="mt-2 border-gray-300 focus:border-gray-900 focus:ring-gray-900 bg-white text-gray-700 placeholder:text-gray-500 rounded-xl" />
                    </div>

                    {/* Confirmation URL removed in favor of Offer.checkoutUrl on the initial Offer below */}

                    <div>
                      <Label htmlFor="category" className="text-gray-900 font-medium">Category</Label>
                      <div className="mt-2">
                        <Select value={formData.category || ''} onValueChange={(val) => { if (val === '__create__') { setCreatingCategory(true); return; } setCreatingCategory(false); handleInputChange('category', val); }}>
                          <SelectTrigger className="border-gray-300 focus:border-gray-900 focus:ring-gray-900 bg-white text-gray-700 rounded-xl h-9">
                            <SelectValue placeholder={categoriesLoading ? 'Loading...' : 'Select a category'} />
                          </SelectTrigger>
                          <SelectContent>
                            {formData.category && !categories.some(c => c.name === formData.category) && (
                              <SelectItem value={formData.category}>{formData.category}</SelectItem>
                            )}
                            {categories.map(c => (
                              <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                            ))}
                            <SelectItem value="__create__">+ Create new category…</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {creatingCategory && (
                        <div className="mt-3 flex gap-2">
                          <Input 
                            id="newCategory"
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            placeholder="New category name"
                            className="border-gray-300 focus:border-gray-900 focus:ring-gray-900 bg-white text-gray-700 placeholder:text-gray-500 rounded-xl h-9 flex-1"
                          />
                          <Button 
                            type="button"
                            className="border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 rounded-xl h-9"
                            disabled={!newCategoryName.trim()}
                            onClick={async () => {
                              const name = newCategoryName.trim();
                              if (!name) return;
                              try {
                                const res = await fetch('/api/product-categories', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ name })
                                });
                                if (res.ok) {
                                  const created = await res.json();
                                  const listRes = await fetch('/api/product-categories');
                                  if (listRes.ok) {
                                    const list = await listRes.json();
                                    setCategories(list || []);
                                  }
                                  handleInputChange('category', created?.name || name);
                                  setNewCategoryName('');
                                  setCreatingCategory(false);
                                } else {
                                  const err = await res.json();
                                  alert(err.error || 'Erro ao criar categoria');
                                }
                              } catch (e) {
                                console.error('Error creating category', e);
                                alert('Erro ao criar categoria');
                              }
                            }}
                          >
                            Save
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="border-gray-200 bg-white text-gray-700 hover:bg-gray-50 rounded-xl h-9"
                            onClick={() => { setCreatingCategory(false); setNewCategoryName(''); }}
                          >
                            Cancel
                          </Button>
                        </div>
                      )}
                      <p className="text-xs text-gray-500 mt-2">If left empty, the 'General' category will be used.</p>
                    </div>

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

              {/* Initial Offer */}
              <Card className="bg-white border-gray-200 shadow-sm rounded-2xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold text-gray-900">Initial Offer</CardTitle>
                  <p className="text-xs text-gray-500 mt-1">Preço e métodos por país são definidos nas OfferPrices (por país/moeda/provedor).</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-1">
                      <Label className="text-gray-900 font-medium">Name</Label>
                      <Input value={offerForm.name} onChange={(e) => setOfferForm(o => ({ ...o, name: e.target.value }))} className="mt-2 h-9 border-gray-300 focus:border-gray-900 focus:ring-gray-900" placeholder="New offer" />
                    </div>
                  </div>
                  {offerForm.isSubscription && (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div>
                        <Label className="text-gray-900 font-medium">Interval</Label>
                        <Select value={offerForm.intervalUnit} onValueChange={(val: any) => setOfferForm(o => ({ ...o, intervalUnit: val }))}>
                          <SelectTrigger className="mt-2 h-9 border-gray-300 focus:border-gray-900 focus:ring-gray-900"><SelectValue placeholder="Interval" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="DAY">Day</SelectItem>
                            <SelectItem value="WEEK">Week</SelectItem>
                            <SelectItem value="MONTH">Month</SelectItem>
                            <SelectItem value="YEAR">Year</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-gray-900 font-medium">Interval Count</Label>
                        <Input type="number" min={1} value={offerForm.intervalCount} onChange={(e) => setOfferForm(o => ({ ...o, intervalCount: e.target.value }))} className="mt-2 h-9 border-gray-300 focus:border-gray-900 focus:ring-gray-900" />
                      </div>
                      <div>
                        <Label className="text-gray-900 font-medium">Trial (days)</Label>
                        <Input type="number" min={0} value={offerForm.trialDays} onChange={(e) => setOfferForm(o => ({ ...o, trialDays: e.target.value }))} className="mt-2 h-9 border-gray-300 focus:border-gray-900 focus:ring-gray-900" />
                      </div>
                    </div>
                  )}

                  {/* Initial Country Price (required) */}
                  <div className="pt-2">
                    <Label className="text-gray-900 font-medium">Initial country price</Label>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <div>
                        <Label className="text-[11px] text-gray-600">Country</Label>
                        <Select value={countryPrice.country} onValueChange={(val: any) => setCountryPrice(p => ({ ...p, country: val }))}>
                          <SelectTrigger className="mt-1 h-9 border-gray-300 focus:border-gray-900 focus:ring-gray-900">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            {COUNTRIES.map(c => (
                              <SelectItem key={c.code} value={c.code}>{flagEmoji(c.code)} {c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-[11px] text-gray-600">Currency</Label>
                        <Select value={countryPrice.currency} onValueChange={(val: any) => setCountryPrice(p => ({ ...p, currency: val }))}>
                          <SelectTrigger className="mt-1 h-9 border-gray-300 focus:border-gray-900 focus:ring-gray-900">
                            <SelectValue placeholder="Currency" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="BRL">BRL</SelectItem>
                            <SelectItem value="USD">USD</SelectItem>
                            <SelectItem value="EUR">EUR</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-[11px] text-gray-600">Provider</Label>
                        <Select value={countryPrice.provider} onValueChange={(val: any) => setCountryPrice(p => ({ ...p, provider: val }))}>
                          <SelectTrigger className="mt-1 h-9 border-gray-300 focus:border-gray-900 focus:ring-gray-900">
                            <SelectValue placeholder="Provider" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="KRXPAY">KRXPAY</SelectItem>
                            <SelectItem value="STRIPE">STRIPE</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-[11px] text-gray-600">Price</Label>
                        <div className="mt-1 flex items-center gap-1">
                          <span className="text-gray-500 text-sm">$</span>
                          <Input type="number" min="0" step="0.01" value={countryPrice.price} onChange={(e) => setCountryPrice(p => ({ ...p, price: e.target.value }))} className="h-9 border-gray-300 focus:border-gray-900 focus:ring-gray-900" placeholder="0.00" />
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">This first country price will be created for your initial offer.</p>
                  </div>
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
