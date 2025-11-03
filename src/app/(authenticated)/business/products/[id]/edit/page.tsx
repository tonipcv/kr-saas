'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { 
  ArrowLeftIcon,
  ShoppingBagIcon,
  CheckIcon,
  XMarkIcon,
  TrashIcon,
  EllipsisVerticalIcon,
  EllipsisHorizontalIcon
} from '@heroicons/react/24/outline';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ProtocolImagePicker } from '@/components/protocol/protocol-image-picker';
import { useClinic } from '@/contexts/clinic-context';

interface Product {
  id: string;
  name: string;
  description?: string;
  brand?: string;
  imageUrl?: string;
  originalPrice?: number;
  discountPrice?: number;
  discountPercentage?: number;
  purchaseUrl?: string;
  usageStats?: number;
  creditsPerUnit?: number;
  category?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  priority?: number;
  // Subscription fields
  type?: 'PRODUCT' | 'SUBSCRIPTION';
  interval?: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
  intervalCount?: number | null;
  trialDays?: number | null;
  autoRenew?: boolean | null;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function EditProductPage({ params }: PageProps) {
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [productId, setProductId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'details'|'offers'|'audit'>('details');
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const [originalType, setOriginalType] = useState<'PRODUCT' | 'SUBSCRIPTION' | null>(null);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [categoriesLoading, setCategoriesLoading] = useState<boolean>(false);
  const [creatingCategory, setCreatingCategory] = useState<boolean>(false);
  const [newCategoryName, setNewCategoryName] = useState<string>('');
  // Offers state
  type Offer = {
    id: string;
    name: string;
    description?: string | null;
    currency: 'BRL' | 'USD' | 'EUR';
    priceCents: number;
    maxInstallments?: number | null;
    installmentMinCents?: number | null;
    active: boolean;
    isSubscription: boolean;
    intervalCount?: number | null;
    intervalUnit?: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' | null;
    trialDays?: number | null;
    checkoutUrl?: string | null;
    paymentMethods?: Array<{ method: 'PIX' | 'CARD' | 'BOLETO' | 'PAYPAL'; active: boolean }>;
  };
  const [offers, setOffers] = useState<Offer[]>([]);
  const [offersLoading, setOffersLoading] = useState<boolean>(false);
  const [creatingOffer, setCreatingOffer] = useState<boolean>(false);
  const [createOfferOpen, setCreateOfferOpen] = useState<boolean>(false);
  const [editingOfferId, setEditingOfferId] = useState<string | null>(null);
  const [copiedOfferId, setCopiedOfferId] = useState<string | null>(null);
  const { currentClinic } = useClinic();
  const [newOffer, setNewOffer] = useState<{ name: string; price: string; currency: 'BRL'|'USD'|'EUR'; isSubscription: boolean; intervalUnit: 'DAY'|'WEEK'|'MONTH'|'YEAR'; intervalCount: string; trialDays: string; maxInstallments: string }>(
    { name: 'Nova oferta', price: '', currency: 'BRL', isSubscription: false, intervalUnit: 'MONTH', intervalCount: '1', trialDays: '0', maxInstallments: '1' }
  );

  // Keep newOffer.isSubscription bound to product originalType
  useEffect(() => {
    if (originalType) {
      setNewOffer((prev) => ({
        ...prev,
        isSubscription: originalType === 'SUBSCRIPTION',
        // Ensure maxInstallments is 1 for subscription products
        maxInstallments: (originalType === 'SUBSCRIPTION') ? '1' : prev.maxInstallments,
      }));
    }
  }, [originalType]);

  interface FormValues {
    name: string;
    subtitle: string;
    description: string;
    brand: string;
    imageUrl: string;
    originalPrice: string;
    discountPrice: string;
    discountPercentage: string;
    purchaseUrl: string;
    usageStats: string;
    creditsPerUnit: string;
    category: string;
    categoryIds: string[];
    isActive: boolean;
    confirmationUrl?: string;
    priority: string;
    // Subscription fields
    type: 'PRODUCT' | 'SUBSCRIPTION';
    interval: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
    intervalCount: string; // keep as string in form for input control
    hasTrial: boolean;
    trialDays: string;
    autoRenew: boolean;
  }

  const [formData, setFormData] = useState<FormValues>({
    name: '',
    subtitle: '',
    description: '',
    brand: '',
    imageUrl: '',
    originalPrice: '',
    discountPrice: '',
    discountPercentage: '',
    purchaseUrl: '',
    usageStats: '0',
    creditsPerUnit: '',
    category: '',
    categoryIds: [],
    isActive: true,
    confirmationUrl: '',
    priority: '0',
    // Subscription defaults
    type: 'PRODUCT',
    interval: 'MONTH',
    intervalCount: '1',
    hasTrial: false,
    trialDays: '0',
    autoRenew: true,
  });

  useEffect(() => {
    const getParams = async () => {
      const resolvedParams = await params;
      setProductId(resolvedParams.id);
    };
    getParams();
  }, [params]);

  useEffect(() => {
    if (productId) {
      loadProduct();
      loadOffers();
    }
  }, [productId]);

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

  const loadProduct = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/products/${productId}`);
      if (response.ok) {
        const data = await response.json();
        setProduct(data);
        setFormData({
          name: data.name || '',
          subtitle: data.subtitle || '',
          description: data.description || '',
          brand: data.brand || '',
          imageUrl: data.imageUrl || '',
          originalPrice: (data.originalPrice ?? data.price ?? '')?.toString() || '',
          discountPrice: (data.discountPrice ?? '')?.toString() || '',
          discountPercentage: (data.discountPercentage ?? '')?.toString() || '',
          purchaseUrl: data.purchaseUrl || '',
          usageStats: (data.usageStats ?? '0')?.toString(),
          creditsPerUnit: (data.creditsPerUnit ?? '')?.toString() || '',
          category: data.category || '',
          categoryIds: Array.isArray(data.categoryIds) ? data.categoryIds : [],
          isActive: data.isActive,
          confirmationUrl: data.confirmationUrl || '',
          priority: (data.priority ?? 0).toString(),
          // Subscription fields
          type: (data.type as any) === 'SUBSCRIPTION' ? 'SUBSCRIPTION' : 'PRODUCT',
          interval: (data.interval as any) || 'MONTH',
          intervalCount: (data.intervalCount != null ? String(data.intervalCount) : '1'),
          hasTrial: (data.trialDays != null && Number(data.trialDays) > 0),
          trialDays: (data.trialDays != null ? String(data.trialDays) : '0'),
          autoRenew: (data.autoRenew != null ? Boolean(data.autoRenew) : true),
        });
        setOriginalType(((data.type as any) === 'SUBSCRIPTION') ? 'SUBSCRIPTION' : 'PRODUCT');
      } else {
        router.push('/business/products');
      }
    } catch (error) {
      console.error('Error loading product:', error);
      router.push('/business/products');
    } finally {
      setIsLoading(false);
    }
  };

  const loadOffers = async () => {
    try {
      setOffersLoading(true);
      const res = await fetch(`/api/products/${productId}/offers`, { cache: 'no-store' });
      if (res.ok) {
        const js = await res.json().catch(() => ({}));
        setOffers(Array.isArray(js?.offers) ? js.offers : []);
      }
    } catch (e) {
      console.error('Error loading offers', e);
    } finally {
      setOffersLoading(false);
    }
  };

  const handleCreateOffer = async () => {
    try {
      setCreatingOffer(true);
      const isSub = originalType === 'SUBSCRIPTION';
      const monthsFromInterval = (unit: string, count: number) => {
        const u = String(unit || 'MONTH').toUpperCase();
        if (u === 'YEAR') return Math.max(1, count * 12);
        if (u === 'MONTH') return Math.max(1, count);
        if (u === 'WEEK') return Math.max(1, Math.ceil(count / 4));
        if (u === 'DAY') return Math.max(1, Math.ceil(count / 30));
        return 1;
      };
      const platformCap = 12;
      const offeredMax = Math.max(1, Number(newOffer.maxInstallments || '1'));
      const periodMonths = isSub ? monthsFromInterval(newOffer.intervalUnit, Number(newOffer.intervalCount || '1')) : 0;
      const finalMaxInstallments = isSub
        ? Math.max(1, Math.min(offeredMax, periodMonths, platformCap))
        : Math.max(1, Math.min(offeredMax, platformCap));
      const body: any = {
        name: newOffer.name || 'Nova oferta',
        priceCents: Math.round(Math.max(0, Number((newOffer.price || '0').replace(',', '.')) * 100)),
        currency: newOffer.currency,
        isSubscription: isSub,
        intervalUnit: isSub ? newOffer.intervalUnit : null,
        intervalCount: isSub ? Number(newOffer.intervalCount || 1) : null,
        trialDays: isSub ? Number(newOffer.trialDays || 0) : null,
        maxInstallments: finalMaxInstallments,
        active: true,
      };
      const res = await fetch(`/api/products/${productId}/offers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) {
        const js = await res.json().catch(() => ({}));
        const createdId = js?.offer?.id as string | undefined;
        // Auto-enable PIX and CARD by default for new offers
        if (createdId) {
          try {
            await fetch(`/api/products/${productId}/offers/${createdId}/methods`, {
              method: 'PUT', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ methods: [ { method: 'PIX', active: true }, { method: 'CARD', active: true } ] })
            });
          } catch {}
        }
        await loadOffers();
        setNewOffer({ name: 'Nova oferta', price: '', currency: 'BRL', isSubscription: isSub, intervalUnit: 'MONTH', intervalCount: '1', trialDays: '0', maxInstallments: '1' });
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err?.error || 'Erro ao criar oferta');
      }
    } catch (e) {
      console.error('Error creating offer', e);
      alert('Erro ao criar oferta');
    } finally {
      setCreatingOffer(false);
    }
  };

  const handleToggleOfferActive = async (offerId: string, active: boolean) => {
    try {
      const res = await fetch(`/api/products/${productId}/offers/${offerId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active }) });
      if (res.ok) {
        await loadOffers();
      }
    } catch {}
  };

  const handleUpdateOfferPrice = async (offerId: string, priceCents: number) => {
    try {
      const res = await fetch(`/api/products/${productId}/offers/${offerId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ priceCents }) });
      if (res.ok) await loadOffers();
    } catch {}
  };

  const handleUpdateOfferMethods = async (offerId: string, methods: Array<{ method: 'PIX'|'CARD'; active: boolean }>) => {
    try {
      const res = await fetch(`/api/products/${productId}/offers/${offerId}/methods`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ methods }) });
      if (res.ok) await loadOffers();
    } catch {}
  };

  const handleUpdateOfferCheckoutUrl = async (offerId: string, checkoutUrl: string) => {
    try {
      const res = await fetch(`/api/products/${productId}/offers/${offerId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ checkoutUrl }) });
      if (res.ok) await loadOffers();
    } catch {}
  };

  const handleDeleteOffer = async (offerId: string) => {
    try {
      const ok = confirm('Tem certeza que deseja excluir esta oferta? Esta ação não pode ser desfeita.');
      if (!ok) return;
      const res = await fetch(`/api/products/${productId}/offers/${offerId}`, { method: 'DELETE' });
      if (!res.ok) {
        const js = await res.json().catch(() => ({}));
        throw new Error(js?.error || 'Falha ao excluir oferta');
      }
      await loadOffers();
    } catch (e) {
      alert((e as Error).message || 'Falha ao excluir oferta');
    }
  };

  const handleOpenEditOffer = (of: Offer) => {
    // Navigate to the dedicated Offer edit page
    router.push(`/business/products/${productId}/offers/${of.id}`);
  };

  const getBaseUrl = () => {
    // 1) Prefer base domain (public or server) to avoid leaking localhost
    const dom = (process.env.NEXT_PUBLIC_APP_BASE_DOMAIN || process.env.APP_BASE_DOMAIN) as string | undefined;
    if (dom && dom.trim()) {
      const d = dom.trim();
      const hasProto = /^https?:\/\//i.test(d);
      const url = hasProto ? d : `https://${d}`;
      return url.replace(/\/$/, '');
    }
    // 2) Then public base URLs, but sanitize localhost
    const pub = (process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_NEXTAUTH_URL) as string | undefined;
    if (pub && /^https?:\/\//i.test(pub)) {
      const clean = pub.replace(/\/$/, '');
      if (/localhost|127\.0\.0\.1/i.test(clean)) return 'https://www.zuzz.vu';
      return clean;
    }
    // 3) Fallback: window origin, sanitize localhost
    if (typeof window !== 'undefined') {
      const origin = window.location.origin;
      if (/localhost|127\.0\.0\.1/i.test(origin)) return 'https://www.zuzz.vu';
      return origin;
    }
    return 'https://www.zuzz.vu';
  };
  const getSlug = () => (currentClinic?.slug && String(currentClinic.slug)) || 'bella-vida';
  const buildCheckoutUrl = (of: Offer) => {
    const base = getBaseUrl();
    const slug = getSlug();
    const ensureSlugPath = (path: string) => {
      // convert /checkout/:id -> /:slug/checkout/:id
      const re = /^\/checkout\/(.+)$/;
      if (re.test(path)) return `/${slug}${path}`;
      // if already slugged but different slug, replace segment
      const parts = path.split('/').filter(Boolean);
      const idx = parts.indexOf('checkout');
      if (idx > 0) {
        // something like /{something}/checkout/{id}
        parts[0] = slug; // force first segment to current slug
        return '/' + parts.join('/');
      }
      // if only id provided
      if (!path.startsWith('/')) return `/${slug}/checkout/${path}`;
      return path;
    };
    try {
      if (of.checkoutUrl) {
        // If absolute, parse and normalize; always enforce our base domain
        if (/^https?:\/\//i.test(of.checkoutUrl)) {
          const u = new URL(of.checkoutUrl);
          const base = getBaseUrl();
          const p = ensureSlugPath(u.pathname || '/');
          const url = new URL(`${base}${p}`);
          const sp = new URLSearchParams(u.search);
          if (!sp.get('offer')) sp.set('offer', of.id);
          url.search = sp.toString();
          return url.toString();
        }
        // Relative stored path
        const rawPath = of.checkoutUrl.startsWith('/') ? of.checkoutUrl : `/${of.checkoutUrl}`;
        const p = ensureSlugPath(rawPath);
        const sp = new URLSearchParams();
        sp.set('offer', of.id);
        return `${base}${p}?${sp.toString()}`;
      }
    } catch {}
    // Fallback build fresh
    return `${base}/${slug}/checkout/${productId}?offer=${of.id}`;
  };
  const handleCopyOfferLink = async (of: Offer) => {
    try {
      const url = buildCheckoutUrl(of);
      await navigator.clipboard.writeText(url);
      setCopiedOfferId(of.id);
      setTimeout(() => setCopiedOfferId(null), 2000);
    } catch (e) {
      console.error('Failed to copy', e);
    }
  };

  const handleUpdateOffer = async () => {
    if (!editingOfferId) return;
    try {
      setCreatingOffer(true);
      const isSub = originalType === 'SUBSCRIPTION';
      const monthsFromInterval = (unit: string, count: number) => {
        const u = String(unit || 'MONTH').toUpperCase();
        if (u === 'YEAR') return Math.max(1, count * 12);
        if (u === 'MONTH') return Math.max(1, count);
        if (u === 'WEEK') return Math.max(1, Math.ceil(count / 4));
        if (u === 'DAY') return Math.max(1, Math.ceil(count / 30));
        return 1;
      };
      const platformCap = 12;
      const offeredMax = Math.max(1, Number(newOffer.maxInstallments || '1'));
      const periodMonths = isSub ? monthsFromInterval(newOffer.intervalUnit, Number(newOffer.intervalCount || '1')) : 0;
      const finalMaxInstallments = isSub
        ? Math.max(1, Math.min(offeredMax, periodMonths, platformCap))
        : Math.max(1, Math.min(offeredMax, platformCap));
      const body: any = {
        name: newOffer.name || undefined,
        priceCents: Math.round(Math.max(0, Number((newOffer.price || '0').replace(',', '.')) * 100)),
        currency: newOffer.currency,
        isSubscription: isSub,
        intervalUnit: isSub ? newOffer.intervalUnit : null,
        intervalCount: isSub ? Number(newOffer.intervalCount || 1) : null,
        trialDays: isSub ? Number(newOffer.trialDays || 0) : null,
        maxInstallments: finalMaxInstallments,
      };
      const res = await fetch(`/api/products/${productId}/offers/${editingOfferId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) {
        await loadOffers();
        setEditingOfferId(null);
      } else {
        const err = await res.json();
        alert(err.error || 'Erro ao atualizar oferta');
      }
    } catch (e) {
      console.error('Error updating offer', e);
      alert('Erro ao atualizar oferta');
    } finally {
      setCreatingOffer(false);
    }
  };

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (field === 'originalPrice' || field === 'discountPrice') {
      const original = field === 'originalPrice' ? parseFloat(value as string) : parseFloat((formData.originalPrice as string));
      const discount = field === 'discountPrice' ? parseFloat(value as string) : parseFloat((formData.discountPrice as string));
      if (original && discount && original > discount) {
        const percentage = Math.round(((original - discount) / original) * 100);
        setFormData(prev => ({ ...prev, [field]: value, discountPercentage: percentage.toString() }));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) { alert('Name is required'); return; }
    try {
      setIsSaving(true);
      const payload: any = {
        name: formData.name,
        description: formData.description,
        originalPrice: formData.originalPrice ? Number(formData.originalPrice) : undefined,
        creditsPerUnit: formData.creditsPerUnit ? Number(formData.creditsPerUnit) : undefined,
        imageUrl: formData.imageUrl?.trim() ? formData.imageUrl.trim() : null,
        category: formData.category,
        categoryIds: formData.categoryIds,
        isActive: formData.isActive,
        confirmationUrl: formData.confirmationUrl?.trim() || null,
        discountPrice: formData.discountPrice ? Number(formData.discountPrice) : undefined,
        discountPercentage: formData.discountPercentage ? Number(formData.discountPercentage) : undefined,
        priority: formData.priority !== '' ? Number(formData.priority) : undefined,
      };

      // Attach subscription fields
      const effectiveType = originalType === 'SUBSCRIPTION' ? 'SUBSCRIPTION' : formData.type;
      if (effectiveType === 'SUBSCRIPTION') {
        payload.type = 'SUBSCRIPTION';
        payload.interval = formData.interval;
        payload.intervalCount = Number(formData.intervalCount || 1);
        payload.hasTrial = !!formData.hasTrial;
        payload.trialDays = formData.hasTrial ? Number(formData.trialDays || 0) : null;
        payload.autoRenew = !!formData.autoRenew;
      } else {
        payload.type = 'PRODUCT';
      }
      const response = await fetch(`/api/products/${productId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (response.ok) {
        router.push('/business/products');
      } else {
        const error = await response.json();
        alert(error.error || 'Error updating product');
      }
    } catch (error) {
      console.error('Error updating product:', error);
      alert('Error updating product');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this product? This action cannot be undone.')) return;
    try {
      setIsDeleting(true);
      const response = await fetch(`/api/products/${productId}`, { method: 'DELETE' });
      if (response.ok) {
        router.push('/business/products');
      } else {
        const error = await response.json();
        alert(error.error || 'Error deleting product');
      }
    } catch (error) {
      console.error('Error deleting product:', error);
      alert('Error deleting product');
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="select-none" aria-label="Carregando">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-gray-300 border-t-gray-600"></div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-white">
        <div className="container mx-auto p-6 lg:p-8 pt-[88px] lg:pt-8 lg:ml-64">
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
                <ShoppingBagIcon className="h-8 w-8 text-gray-400" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-gray-900">Product Not Found</h3>
                <p className="text-sm text-gray-500">The product you're looking for doesn't exist or has been removed.</p>
              </div>
              <Button asChild className="bg-[#5154e7] hover:bg-[#4145d1] text-white">
                <Link href="/business/products">Back to Products</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
            <div className="flex-1 flex items-center justify-between relative">
              <div>
                <h1 className="text-[20px] font-semibold text-gray-900 tracking-[-0.01em]">Edit Product</h1>
                <p className="text-sm text-gray-500 mt-1">Update product details</p>
                <div className="text-xs text-gray-500 mt-1">ID: <span className="font-mono text-gray-700">{product?.id || productId}</span></div>
              </div>
              <div className="flex items-center gap-2">
                {/* Small Save button at top */}
                <button type="submit" form="editProductForm" className="h-9 px-3 rounded-xl bg-gray-900 hover:bg-black text-white text-sm">Save</button>
                {/* Minimal actions menu */}
                <div className="relative">
                  <button type="button" onClick={() => setMenuOpen(prev => !prev)} aria-label="Actions" className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-gray-200 hover:bg-gray-50">
                    <EllipsisVerticalIcon className="h-5 w-5 text-gray-700" />
                  </button>
                  {menuOpen && (
                    <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-10 p-2">
                      <div className="flex items-center justify-between px-2 py-2">
                        <div className="text-sm text-gray-800">Active Product</div>
                        <Switch id="isActiveMenu" checked={formData.isActive} onCheckedChange={(checked) => handleInputChange('isActive', checked)} />
                      </div>
                      <div className="h-px bg-gray-100 my-1" />
                      <button type="button" onClick={handleDelete} disabled={isDeleting} className="w-full inline-flex items-center gap-2 px-2 py-2 text-sm rounded-lg hover:bg-red-50 text-red-700">
                        {isDeleting ? (<Loader2 className="h-4 w-4 animate-spin" />) : (<TrashIcon className="h-4 w-4" />)}
                        <span>Delete</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div>
            {/* Top navigation tabs */}
            <div className="mb-4 border-b border-gray-200">
              <nav className="flex gap-6 text-sm">
                <button type="button" onClick={() => setActiveTab('details')} className={`pb-2 -mb-px border-b-2 ${activeTab==='details' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Detalhes</button>
                <button type="button" onClick={() => setActiveTab('offers')} className={`pb-2 -mb-px border-b-2 ${activeTab==='offers' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Ofertas</button>
                <button type="button" onClick={() => setActiveTab('audit')} className={`pb-2 -mb-px border-b-2 ${activeTab==='audit' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Auditoria</button>
              </nav>
            </div>

            <form id="editProductForm" onSubmit={handleSubmit} className="space-y-6">

              {activeTab === 'details' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left: Details */}
                <Card className="bg-white border-gray-200 shadow-sm rounded-2xl">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold text-gray-900">Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="name" className="text-gray-900 font-medium">Product Name *</Label>
                      <Input id="name" value={formData.name} onChange={(e) => handleInputChange('name', e.target.value)} placeholder="e.g., Ultra Light Sunscreen" required className="mt-2 border-gray-300 focus:border-[#5154e7] focus:ring-[#5154e7] bg-white text-gray-700 placeholder:text-gray-500 rounded-xl h-10" />
                    </div>

                    <div>
                      <Label htmlFor="subtitle" className="text-gray-900 font-medium">Subtitle</Label>
                      <Input id="subtitle" value={formData.subtitle} onChange={(e) => handleInputChange('subtitle', e.target.value)} placeholder="Short product subtitle" className="mt-2 border-gray-300 focus:border-[#5154e7] focus:ring-[#5154e7] bg-white text-gray-700 placeholder:text-gray-500 rounded-xl h-10" />
                    </div>

                    <div>
                      <Label htmlFor="description" className="text-gray-900 font-medium">Description</Label>
                      <Textarea id="description" value={formData.description} onChange={(e) => handleInputChange('description', e.target.value)} placeholder="Describe the product and its benefits..." rows={4} className="mt-2 border-gray-300 focus:border-[#5154e7] focus:ring-[#5154e7] bg-white text-gray-700 placeholder:text-gray-500 rounded-xl" />
                    </div>

                    <div>
                      <Label htmlFor="category" className="text-gray-900 font-medium">Category (legacy)</Label>
                      <div className="mt-2">
                        <Select value={formData.category || ''} onValueChange={(val) => { if (val === '__create__') { setCreatingCategory(true); return; } setCreatingCategory(false); handleInputChange('category', val); }}>
                          <SelectTrigger className="border-gray-300 focus:border-[#5154e7] focus:ring-[#5154e7] bg-white text-gray-700 rounded-xl h-10">
                            <SelectValue placeholder={categoriesLoading ? 'Loading...' : 'Select a category'} />
                          </SelectTrigger>
                          <SelectContent>
                            {formData.category && !categories.some(c => c.name === formData.category) && (<SelectItem value={formData.category}>{formData.category}</SelectItem>)}
                            {categories.map(c => (<SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>))}
                            <SelectItem value="__create__">+ Create new category…</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {creatingCategory && (
                        <div className="mt-3 flex gap-2">
                          <Input id="newCategory" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="New category name" className="border-gray-300 focus:border-[#5154e7] focus:ring-[#5154e7] bg-white text-gray-700 placeholder:text-gray-500 rounded-xl h-10 flex-1" />
                          <Button type="button" className="bg-[#5154e7] hover:bg-[#4145d1] text-white rounded-xl h-10" disabled={!newCategoryName.trim()} onClick={async () => {
                            const name = newCategoryName.trim();
                            if (!name) return;
                            try {
                              const res = await fetch('/api/product-categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
                              if (res.ok) {
                                const created = await res.json();
                                const listRes = await fetch('/api/product-categories');
                                if (listRes.ok) { const list = await listRes.json(); setCategories(list || []); }
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
                          }}>Save</Button>
                          <Button type="button" variant="outline" className="border-gray-200 bg-white text-gray-700 hover:bg-gray-50 rounded-xl h-10" onClick={() => { setCreatingCategory(false); setNewCategoryName(''); }}>Cancel</Button>
                        </div>
                      )}
                      <p className="text-xs text-gray-500 mt-2">Se deixar vazio, será usada a categoria 'Geral'.</p>
                    </div>

                    <div>
                      <Label className="text-gray-900 font-medium">Categories (multiple)</Label>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {categories.map((c) => {
                          const checked = formData.categoryIds.includes(c.id);
                          return (
                            <label key={c.id} className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm cursor-pointer select-none ${checked ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                              <input type="checkbox" className="h-4 w-4" checked={checked} onChange={() => {
                                setFormData(prev => ({
                                  ...prev,
                                  categoryIds: prev.categoryIds.includes(c.id) ? prev.categoryIds.filter(cid => cid !== c.id) : [...prev.categoryIds, c.id]
                                })
                                );
                              }} />
                              <span>{c.name}</span>
                            </label>
                          );
                        })}
                        {categories.length === 0 && (<span className="text-sm text-gray-500">Nenhuma categoria. Crie uma acima.</span>)}
                      </div>
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
                        <ProtocolImagePicker selectedImage={formData.imageUrl || ''} onSelectImage={(url) => handleInputChange('imageUrl', url)} />
                      </div>
                      <p className="text-xs text-gray-500 mt-2">Upload an image or paste a URL below.</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
              )}

              {activeTab === 'offers' && (
              <Card className="bg-white border-gray-200 shadow-sm rounded-2xl">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold text-gray-900">Offers</CardTitle>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-1 rounded-full border border-gray-200 text-gray-700">{offers.length} of {offers.length}</span>
                      <Button type="button" variant="outline" className="h-8 border-gray-200 hover:bg-gray-50 text-gray-700">Filters</Button>
                      <Button type="button" onClick={() => setCreateOfferOpen(true)} className="h-8 bg-gray-900 text-white hover:bg-black">+ New offer</Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Header row */}
                  <div className="hidden md:grid grid-cols-12 text-xs text-gray-500 px-3">
                    <div className="col-span-4">Name</div>
                    <div className="col-span-2">Type</div>
                    <div className="col-span-2">Price</div>
                    <div className="col-span-2">Methods</div>
                    <div className="col-span-2 text-right">Actions</div>
                  </div>
                  {/* Offers list */}
                  <div className="space-y-2">
                    {offersLoading && (<div className="text-sm text-gray-500 px-3">Loading offers…</div>)}
                    {!offersLoading && offers.length === 0 && (
                      <div className="text-sm text-gray-500 px-3">No offers yet. Click "+ New offer" to create.</div>
                    )}
                    {offers.map((of) => {
                      const price = (Number(of.priceCents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: of.currency || 'BRL' });
                      const type = of.isSubscription ? `${of.intervalCount || 1} ${of.intervalUnit || 'MONTH'}` : 'One-time';
                      const pixOn = (of.paymentMethods || []).some(x => x.method === 'PIX' && x.active);
                      const cardOn = (of.paymentMethods || []).some(x => x.method === 'CARD' && x.active);
                      return (
                        <div
                          key={of.id}
                          className={`grid grid-cols-12 items-center border rounded-xl px-3 py-2 ${of.active ? 'border-gray-200' : 'border-amber-200'} hover:bg-gray-50/60 cursor-pointer`}
                          onDoubleClick={() => handleOpenEditOffer(of)}
                          role="button"
                          tabIndex={0}
                          title="Duplo clique para abrir"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleOpenEditOffer(of);
                          }}
                        >
                          <div className="col-span-4">
                            <div className="text-sm font-medium text-gray-900">{of.name}</div>
                            <div className="mt-0.5 flex items-center gap-2">
                              <span className="text-xs text-gray-500 font-mono break-all" title={of.id}>ID: {of.id}</span>
                              <button
                                type="button"
                                className="text-[11px] text-gray-600 hover:text-gray-800 underline-offset-2 hover:underline"
                                onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(of.id).then(() => setCopiedOfferId(of.id)); setTimeout(() => setCopiedOfferId(null), 1500); }}
                                onDoubleClick={(e) => e.stopPropagation()}
                                aria-label="Copiar ID da oferta"
                                title="Copiar ID"
                              >
                                {copiedOfferId === of.id ? 'Copiado' : 'Copiar'}
                              </button>
                            </div>
                          </div>
                          <div className="col-span-2 text-sm text-gray-700">{type}</div>
                          <div className="col-span-2">
                            <div className="text-sm text-gray-900">{price}</div>
                            <div className="text-[11px] text-gray-500">{of.currency}</div>
                          </div>
                          <div className="col-span-2">
                            <div className="flex gap-1" onDoubleClick={(e) => e.stopPropagation()}>
                              {(['PIX','CARD'] as const).map((m) => {
                                const on = m === 'PIX' ? pixOn : cardOn;
                                return (
                                  <button key={m} type="button" onClick={(e) => {
                                    e.stopPropagation();
                                    handleUpdateOfferMethods(of.id, [
                                      { method: 'PIX', active: m === 'PIX' ? !pixOn : pixOn },
                                      { method: 'CARD', active: m === 'CARD' ? !cardOn : cardOn },
                                    ]);
                                  }} onDoubleClick={(e) => e.stopPropagation()} className={`px-2 py-1 rounded-md text-[11px] border ${on ? 'bg-gray-100 border-gray-300 text-gray-800' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}>{m}</button>
                                );
                              })}
                            </div>
                          </div>
                          <div className="col-span-2 text-right flex items-center justify-end gap-2">
                            <Switch checked={of.active} onCheckedChange={(checked) => handleToggleOfferActive(of.id, checked)} onClick={(e) => e.stopPropagation()} />
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button type="button" variant="outline" className="h-8 border-gray-200 hover:bg-gray-50 text-gray-700" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                                  <EllipsisHorizontalIcon className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem onClick={() => handleOpenEditOffer(of)}>Editar</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleCopyOfferLink(of)}>{copiedOfferId === of.id ? 'Copiado' : 'Copiar link'}</DropdownMenuItem>
                                <DropdownMenuItem className="text-red-600" onClick={() => handleDeleteOffer(of.id)}>Excluir</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
              )}

              {/* Create/Edit Offer Modal */}
              {createOfferOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                  <div className="absolute inset-0 bg-black/40" onClick={() => setCreateOfferOpen(false)} />
                  <div className="relative z-10 w-full max-w-xl mx-auto bg-white rounded-2xl shadow-xl border border-gray-200 p-5">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-base font-semibold text-gray-900">{editingOfferId ? 'Edit Offer' : 'Create Offer'}</h3>
                      <button onClick={() => { setCreateOfferOpen(false); setEditingOfferId(null); }} className="text-gray-400 hover:text-gray-600" aria-label="Close">✕</button>
                    </div>
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <Label className="text-gray-900 font-medium">Name</Label>
                          <Input value={newOffer.name} onChange={(e) => setNewOffer(o => ({ ...o, name: e.target.value }))} className="mt-2 h-10" placeholder="New offer" />
                        </div>
                        <div>
                          <Label className="text-gray-900 font-medium">Price</Label>
                          <Input type="number" step="0.01" min={0} value={newOffer.price} onChange={(e) => setNewOffer(o => ({ ...o, price: e.target.value }))} className="mt-2 h-10" placeholder="99.90" />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <Label className="text-gray-900 font-medium">Type</Label>
                          <Select
                            value={(originalType === 'SUBSCRIPTION' && newOffer.isSubscription) ? 'SUBSCRIPTION' : 'PRODUCT'}
                            onValueChange={(val) => {
                              // Only allow subscription if product is SUBSCRIPTION
                              if (originalType !== 'SUBSCRIPTION' && val === 'SUBSCRIPTION') return;
                              setNewOffer(o => ({ ...o, isSubscription: val === 'SUBSCRIPTION' }));
                            }}
                          >
                            <SelectTrigger className="mt-2 h-10" disabled={originalType !== 'SUBSCRIPTION'}><SelectValue placeholder="Type" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="PRODUCT">One-time</SelectItem>
                              {originalType === 'SUBSCRIPTION' && (
                                <SelectItem value="SUBSCRIPTION">Subscription</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-gray-900 font-medium">Currency</Label>
                          <Select value={newOffer.currency} onValueChange={(val: any) => setNewOffer(o => ({ ...o, currency: val }))}>
                            <SelectTrigger className="mt-2 h-10"><SelectValue placeholder="Currency" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="BRL">BRL</SelectItem>
                              <SelectItem value="USD">USD</SelectItem>
                              <SelectItem value="EUR">EUR</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {(originalType === 'SUBSCRIPTION' && newOffer.isSubscription) ? (
                          <>
                            <div>
                              <Label className="text-gray-900 font-medium">Interval</Label>
                              <Select value={newOffer.intervalUnit} onValueChange={(val: any) => setNewOffer(o => ({ ...o, intervalUnit: val }))}>
                                <SelectTrigger className="mt-2 h-10"><SelectValue placeholder="Interval" /></SelectTrigger>
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
                              <Input type="number" min={1} value={newOffer.intervalCount} onChange={(e) => setNewOffer(o => ({ ...o, intervalCount: e.target.value }))} className="mt-2 h-10" placeholder="1" />
                            </div>
                            <div>
                              <Label className="text-gray-900 font-medium">Trial (days)</Label>
                              <Input type="number" min={0} value={newOffer.trialDays} onChange={(e) => setNewOffer(o => ({ ...o, trialDays: e.target.value }))} className="mt-2 h-10" placeholder="0" />
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <Label className="text-gray-900 font-medium">Max installments</Label>
                              <Input type="number" min={1} value={newOffer.maxInstallments} onChange={(e) => setNewOffer(o => ({ ...o, maxInstallments: e.target.value }))} className="mt-2 h-10" placeholder="1" />
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2 mt-4">
                      <Button type="button" variant="outline" className="h-9" onClick={() => { setCreateOfferOpen(false); setEditingOfferId(null); }}>Close</Button>
                      {editingOfferId ? (
                        <Button disabled={creatingOffer} onClick={async () => { await handleUpdateOffer(); setCreateOfferOpen(false); }} className="h-9 bg-gray-900 text-white hover:bg-black">{creatingOffer ? 'Saving…' : 'Save changes'}</Button>
                      ) : (
                        <Button disabled={creatingOffer} onClick={async () => { await handleCreateOffer(); setCreateOfferOpen(false); }} className="h-9 bg-gray-900 text-white hover:bg-black">{creatingOffer ? 'Creating…' : 'Create offer'}</Button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'audit' && (
              <Card className="bg-white border-gray-200 shadow-sm rounded-2xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold text-gray-900">Audit</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-gray-700 space-y-2">
                  <div><span className="font-medium">Product ID:</span> {product?.id || productId}</div>
                  <div><span className="font-medium">Created at:</span> {product?.createdAt ? new Date(product.createdAt as any).toLocaleString() : '—'}</div>
                  <div><span className="font-medium">Updated at:</span> {product?.updatedAt ? new Date(product.updatedAt as any).toLocaleString() : '—'}</div>
                  <div><span className="font-medium">Active:</span> {String(product?.isActive ?? true)}</div>
                </CardContent>
              </Card>
              )}

              {/* Status card removed; Active toggle is available in menu */}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
