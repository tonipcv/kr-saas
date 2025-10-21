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

  const getBaseUrl = () => {
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
    interval: 'MONTH', // DAY | WEEK | MONTH | YEAR
    intervalCount: '1',
    hasTrial: false,
    trialDays: '0',
    autoRenew: true,
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
            // Create initial Offer
            const priceNumber = Math.max(0, Number((offerForm.price || '0').replace(',', '.')));
            const priceCents = Math.round(priceNumber * 100);
            // Clamp installments according to rules
            const monthsFromInterval = (unit: string, count: number) => {
              const u = String(unit || 'MONTH').toUpperCase();
              if (u === 'YEAR') return Math.max(1, count * 12);
              if (u === 'MONTH') return Math.max(1, count);
              if (u === 'WEEK') return Math.max(1, Math.ceil(count / 4));
              if (u === 'DAY') return Math.max(1, Math.ceil(count / 30));
              return 1;
            };
            const offeredMax = Math.max(1, Number(offerForm.maxInstallments || '1'));
            const priceNumberForRule = Math.max(0, Number((offerForm.price || '0').replace(',', '.')));
            const priceCentsRule = Math.round(priceNumberForRule * 100);
            const platformCap = 12;
            const isSub = !!offerForm.isSubscription;
            const periodMonths = isSub ? monthsFromInterval(offerForm.intervalUnit, Number(offerForm.intervalCount || '1')) : 0;
            const businessMax = isSub ? periodMonths : (priceCentsRule >= 9700 ? platformCap : 1);
            const finalMaxInstallments = Math.max(1, Math.min(offeredMax, businessMax, platformCap));

            const offerPayload: any = {
              name: offerForm.name || 'Nova oferta',
              priceCents,
              currency: offerForm.currency,
              // Offer type is bound to product type
              isSubscription: payload.type === 'SUBSCRIPTION',
              intervalUnit: (payload.type === 'SUBSCRIPTION') ? offerForm.intervalUnit : null,
              intervalCount: (payload.type === 'SUBSCRIPTION') ? Number(offerForm.intervalCount || 1) : null,
              trialDays: (payload.type === 'SUBSCRIPTION') ? Number(offerForm.trialDays || 0) : null,
              maxInstallments: finalMaxInstallments,
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
              } catch {}
            }
            if (offerId && (offerForm.allowPIX || offerForm.allowCARD)) {
              await fetch(`/api/products/${productId}/offers/${offerId}/methods`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ methods: [ { method: 'PIX', active: !!offerForm.allowPIX }, { method: 'CARD', active: !!offerForm.allowCARD } ] })
              });
            }
            // Go to edit page
            router.push(`/business/products/${productId}/edit`);
          } catch (e) {
            // If offer creation fails, still go to edit page
            router.push(`/business/products/${productId}/edit`);
          }
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
                      <Input id="name" value={formData.name} onChange={(e) => handleInputChange('name', e.target.value)} placeholder="e.g., Ultra Light Sunscreen" required className="mt-2 border-gray-300 focus:border-gray-900 focus:ring-gray-900 bg-white text-gray-700 placeholder:text-gray-500 rounded-xl h-10" />
                    </div>

                    <div>
                      <Label htmlFor="subtitle" className="text-gray-900 font-medium">Subtitle</Label>
                      <Input id="subtitle" value={formData.subtitle} onChange={(e) => handleInputChange('subtitle', e.target.value)} placeholder="Short product subtitle" className="mt-2 border-gray-300 focus:border-gray-900 focus:ring-gray-900 bg-white text-gray-700 placeholder:text-gray-500 rounded-xl h-10" />
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
                          <SelectTrigger className="border-gray-300 focus:border-gray-900 focus:ring-gray-900 bg-white text-gray-700 rounded-xl h-10">
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
                            className="border-gray-300 focus:border-gray-900 focus:ring-gray-900 bg-white text-gray-700 placeholder:text-gray-500 rounded-xl h-10 flex-1"
                          />
                          <Button 
                            type="button"
                            className="border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 rounded-xl h-10"
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
                            className="border-gray-200 bg-white text-gray-700 hover:bg-gray-50 rounded-xl h-10"
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
                          <SelectTrigger className="border-gray-300 focus:border-gray-900 focus:ring-gray-900 bg-white text-gray-700 rounded-xl h-10">
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
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                    <div className="md:col-span-2">
                      <Label className="text-gray-900 font-medium">Name</Label>
                      <Input value={offerForm.name} onChange={(e) => setOfferForm(o => ({ ...o, name: e.target.value }))} className="mt-2 h-10 border-gray-300 focus:border-gray-900 focus:ring-gray-900" placeholder="New offer" />
                    </div>
                    <div>
                      <Label className="text-gray-900 font-medium">Price</Label>
                      <Input type="number" step="0.01" min={0} value={offerForm.price} onChange={(e) => setOfferForm(o => ({ ...o, price: e.target.value }))} className="mt-2 h-10 border-gray-300 focus:border-gray-900 focus:ring-gray-900" placeholder="99.90" />
                    </div>
                    <div>
                      <Label className="text-gray-900 font-medium">Currency</Label>
                      <Select value={offerForm.currency} onValueChange={(val: any) => setOfferForm(o => ({ ...o, currency: val }))}>
                        <SelectTrigger className="mt-2 h-10 border-gray-300 focus:border-gray-900 focus:ring-gray-900"><SelectValue placeholder="Moeda" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="BRL">BRL</SelectItem>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="EUR">EUR</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {offerForm.isSubscription ? (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div>
                        <Label className="text-gray-900 font-medium">Interval</Label>
                        <Select value={offerForm.intervalUnit} onValueChange={(val: any) => setOfferForm(o => ({ ...o, intervalUnit: val }))}>
                          <SelectTrigger className="mt-2 h-10 border-gray-300 focus:border-gray-900 focus:ring-gray-900"><SelectValue placeholder="Interval" /></SelectTrigger>
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
                        <Input type="number" min={1} value={offerForm.intervalCount} onChange={(e) => setOfferForm(o => ({ ...o, intervalCount: e.target.value }))} className="mt-2 h-10 border-gray-300 focus:border-gray-900 focus:ring-gray-900" />
                      </div>
                      <div>
                        <Label className="text-gray-900 font-medium">Trial (days)</Label>
                        <Input type="number" min={0} value={offerForm.trialDays} onChange={(e) => setOfferForm(o => ({ ...o, trialDays: e.target.value }))} className="mt-2 h-10 border-gray-300 focus:border-gray-900 focus:ring-gray-900" />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <Label className="text-gray-900 font-medium">Max installments</Label>
                        <Input type="number" min={1} value={offerForm.maxInstallments} onChange={(e) => setOfferForm(o => ({ ...o, maxInstallments: e.target.value }))} className="mt-2 h-10 border-gray-300 focus:border-gray-900 focus:ring-gray-900" />
                        <p className="text-xs text-gray-500 mt-1">Até 12x. Se o preço for menor que R$97, será 1x.</p>
                      </div>
                    </div>
                  )}
                  {/* Subscription also allows defining installments up to the period months */}
                  {offerForm.isSubscription && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <Label className="text-gray-900 font-medium">Max installments</Label>
                        <Input
                          type="number"
                          min={1}
                          value={offerForm.maxInstallments}
                          onChange={(e) => setOfferForm(o => ({ ...o, maxInstallments: e.target.value }))}
                          className="mt-2 h-10 border-gray-300 focus:border-gray-900 focus:ring-gray-900"
                        />
                        <p className="text-xs text-gray-500 mt-1">Limite: até o número de meses do período (1/3/6/12).</p>
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="text-xs text-gray-700 mb-2">Payment methods</div>
                    <div className="flex flex-wrap gap-2">
                      {(['PIX','CARD'] as const).map((m) => {
                        const on = m === 'PIX' ? offerForm.allowPIX : offerForm.allowCARD;
                        return (
                          <button key={m} type="button" onClick={() => {
                            setOfferForm(o => ({ ...o, allowPIX: m==='PIX' ? !o.allowPIX : o.allowPIX, allowCARD: m==='CARD' ? !o.allowCARD : o.allowCARD }));
                          }} className={`px-3 py-1.5 rounded-lg text-xs border ${on ? 'bg-gray-100 border-gray-300 text-gray-800' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                            {m}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white border-gray-200 shadow-sm rounded-2xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold text-gray-900">Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="isActive" className="text-gray-900 font-medium">Active Product</Label>
                      <p className="text-gray-500 font-medium mt-1">Active products can be recommended in protocols</p>
                    </div>
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
