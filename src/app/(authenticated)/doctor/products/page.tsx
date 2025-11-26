'use client';

import React, { useState, useEffect } from 'react';
import { useClinic } from '@/contexts/clinic-context';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { 
  PlusIcon,
  MagnifyingGlassIcon,
  ShoppingBagIcon,
  PencilIcon,
  EyeIcon,
  XMarkIcon,
  LinkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DocumentDuplicateIcon,
  TrashIcon
} from '@heroicons/react/24/outline';
import Link from 'next/link';

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
  usageStats: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt?: Date;
  doctorId?: string;
  category?: string;
  creditsPerUnit?: number;
  _count: {
    protocolProducts: number;
  };
  protocolProducts?: Array<{
    protocol: {
      id: string;
      name: string;
    };
  }>;
}

export default function ProductsPage() {
  const { currentClinic } = useClinic();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoadingProduct, setIsLoadingProduct] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [planName, setPlanName] = useState<string | null>(null);
  const [isPlansOpen, setIsPlansOpen] = useState(false);
  const [plansLoading, setPlansLoading] = useState(false);
  const [availablePlans, setAvailablePlans] = useState<any[]>([]);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const checkPlanAndLoad = async () => {
      if (!currentClinic) return;
      
      try {
        const res = await fetch('/api/subscription/current', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const name = (data?.planName || '').toString();
          setPlanName(name);
        } else if (res.status === 404) {
          setPlanName('Free');
        }
      } catch (e) {
        console.error('Failed to check subscription', e);
      } finally {
        loadProducts();
      }
    };
    checkPlanAndLoad();
  }, [currentClinic]);

  const loadProducts = async () => {
    if (!currentClinic) return;
    
    try {
      setIsLoading(true);
      const response = await fetch(`/api/products?clinicId=${currentClinic.id}`);
      if (response.ok) {
        const data = await response.json();
        setProducts(data);
      }
    } catch (error) {
      console.error('Error loading products:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Open plans modal and fetch available plans (exclude Free)
  const openPlansModal = async () => {
    try {
      setIsPlansOpen(true);
      setPlansLoading(true);
      const res = await fetch('/api/plans', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const plans = Array.isArray(data?.plans) ? data.plans : [];
        const filtered = plans.filter((p: any) => p?.name?.toLowerCase() !== 'free');
        setAvailablePlans(filtered);
      } else {
        setAvailablePlans([]);
      }
    } catch (e) {
      console.error('Failed to load plans', e);
      setAvailablePlans([]);
    } finally {
      setPlansLoading(false);
    }
  };

  const loadProductDetails = async (productId: string) => {
    try {
      setIsLoadingProduct(true);
      const response = await fetch(`/api/products/${productId}`);
      if (response.ok) {
        const data = await response.json();
        setSelectedProduct(data);
        setIsModalOpen(true);
      }
    } catch (error) {
      console.error('Error loading product details:', error);
    } finally {
      setIsLoadingProduct(false);
    }
  };

  const duplicateProduct = async (productId: string) => {
    try {
      setDuplicatingId(productId);
      const res = await fetch(`/api/products/${productId}/duplicate`, {
        method: 'POST'
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || 'Failed to duplicate product');
      }
      await loadProducts();
    } catch (e) {
      console.error('Failed to duplicate product', e);
    } finally {
      setDuplicatingId(null);
    }
  };

  const deleteProduct = async (productId: string) => {
    const ok = confirm('Tem certeza que deseja excluir este produto? Esta ação não pode ser desfeita.');
    if (!ok) return;
    try {
      setDeletingId(productId);
      const res = await fetch(`/api/products/${productId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || 'Erro ao excluir produto');
      }
      await loadProducts();
    } catch (e) {
      console.error('Failed to delete product', e);
      alert((e as Error).message || 'Erro ao excluir produto');
    } finally {
      setDeletingId(null);
    }
  };

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.brand?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalProducts = filteredProducts.length;
  const totalPages = Math.ceil(totalProducts / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentProducts = filteredProducts.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const formatPrice = (price?: number) => {
    if (!price) return null;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(price);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric'
    }).format(new Date(date));
  };

  // Unlock products for all plans
  const isFree = false;

  // Helper to build base URL preferring env configuration
  const getBaseUrl = () => {
    // Prefer explicit base URLs
    const pub = (process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_NEXTAUTH_URL) as string | undefined;
    if (pub && /^https?:\/\//i.test(pub)) return pub.replace(/\/$/, '');
    // Prefer base domain
    const dom = (process.env.NEXT_PUBLIC_APP_BASE_DOMAIN || process.env.APP_BASE_DOMAIN) as string | undefined;
    if (dom && dom.trim()) {
      const d = dom.trim();
      const hasProto = /^https?:\/\//i.test(d);
      const url = hasProto ? d : `https://${d}`;
      return url.replace(/\/$/, '');
    }
    // Fallback: if on localhost, force production domain
    if (typeof window !== 'undefined') {
      const origin = window.location.origin;
      if (/localhost|127\.0\.0\.1/i.test(origin)) return 'https://www.zuzz.vu';
      return origin;
    }
    return 'https://www.zuzz.vu';
  };

  const getSlug = () => (currentClinic?.slug && String(currentClinic.slug)) || 'bella-vida';

  // Show loading when no clinic is selected
  if (!currentClinic) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/95">
          <div className="flex flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Loading" className="h-8 w-auto object-contain opacity-80" />
            <div className="h-6 w-6 rounded-full border-2 border-gray-300 border-t-transparent animate-spin" />
          </div>
        </div>
        <div className="lg:ml-64">
          <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24" />
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white">
        <div className="lg:ml-64">
          <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24">

            {/* Header skeleton (matches title + New Product button) */}
            <div className="mb-4">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="space-y-2">
                  <div className="h-6 w-40 bg-gray-200 rounded animate-pulse" />
                  <div className="h-4 w-64 bg-gray-100 rounded animate-pulse" />
                </div>
                <div className="h-8 w-36 bg-gray-100 rounded-xl animate-pulse" />
              </div>
            </div>

            {/* Toolbar skeleton (search + filters + sort) */}
            <div className="mb-3 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1">
                <div className="h-10 w-full bg-gray-100 rounded-xl animate-pulse" />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-8 w-20 bg-gray-100 rounded-lg animate-pulse" />
                <div className="h-8 w-20 bg-gray-100 rounded-lg animate-pulse" />
              </div>
            </div>

            {/* Table skeleton (matches Name, Brand, Price, Points, Status, Actions) */}
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white/70 backdrop-blur-sm shadow-sm">
              <div className="bg-gray-50/80 border-b border-gray-100">
                <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs text-gray-600">
                  <div className="col-span-3 h-3 bg-gray-100 rounded" />
                  <div className="col-span-2 h-3 bg-gray-100 rounded" />
                  <div className="col-span-2 h-3 bg-gray-100 rounded" />
                  <div className="col-span-2 h-3 bg-gray-100 rounded" />
                  <div className="col-span-2 h-3 bg-gray-100 rounded" />
                  <div className="col-span-1 h-3 bg-gray-100 rounded" />
                </div>
              </div>
              <div className="divide-y divide-gray-100">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 px-4 py-3 items-center">
                    {/* Name with avatar */}
                    <div className="col-span-3 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-gray-100 border border-gray-200 animate-pulse" />
                      <div className="flex-1">
                        <div className="h-4 w-32 bg-gray-100 rounded animate-pulse" />
                        <div className="mt-1 h-3 w-20 bg-gray-100 rounded animate-pulse" />
                      </div>
                    </div>
                    {/* Brand */}
                    <div className="col-span-2">
                      <div className="h-4 w-20 bg-gray-100 rounded animate-pulse" />
                    </div>
                    {/* Price */}
                    <div className="col-span-2">
                      <div className="h-4 w-16 bg-gray-100 rounded animate-pulse" />
                    </div>
                    {/* Points */}
                    <div className="col-span-2">
                      <div className="h-4 w-24 bg-gray-100 rounded animate-pulse" />
                    </div>
                    {/* Status */}
                    <div className="col-span-2">
                      <div className="h-5 w-16 bg-gray-100 rounded-full animate-pulse" />
                    </div>
                    {/* Actions */}
                    <div className="col-span-1 flex justify-end gap-1">
                      <div className="h-7 w-7 bg-gray-100 rounded-lg animate-pulse" />
                      <div className="h-7 w-7 bg-gray-100 rounded-lg animate-pulse" />
                      <div className="h-7 w-7 bg-gray-100 rounded-lg animate-pulse" />
                      <div className="h-7 w-7 bg-gray-100 rounded-lg animate-pulse" />
                      <div className="h-7 w-7 bg-gray-100 rounded-lg animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Pagination skeleton */}
            <div className="mt-4 flex items-center justify-between">
              <div className="h-4 w-40 bg-gray-100 rounded animate-pulse" />
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 bg-gray-100 rounded-lg animate-pulse" />
                <div className="h-4 w-24 bg-gray-100 rounded animate-pulse" />
                <div className="h-8 w-8 bg-gray-100 rounded-lg animate-pulse" />
              </div>
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
        
          {/* Header */}
          <div className="mb-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <h1 className="text-[20px] font-semibold text-gray-900 tracking-[-0.01em]">Products</h1>
              </div>
              <Button asChild size="sm" className="h-8 bg-gray-900 hover:bg-black text-white shadow-sm">
                <Link href="/business/products/create" className="flex items-center">
                  <PlusIcon className="h-3.5 w-3.5 mr-1.5" />
                  New Product
                </Link>
              </Button>
            </div>
          </div>

          {false && (
            <div className="mb-4 rounded-2xl px-4 py-4 text-white bg-gradient-to-r from-[#5893ec] to-[#9bcef7] shadow-sm" />
          )}

          {/* Toolbar rendered only when products exist */}

          {/* Products Table */}
          {isFree ? (
            <div className="relative">
              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white/50 backdrop-blur-md shadow-sm min-h-56" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center px-4">
                  <p className="text-sm font-semibold text-gray-800">Products list is locked on the Free plan.</p>
                  <p className="text-xs text-gray-600 mt-1">Upgrade to view and manage your products.</p>
                  <div className="mt-3">
                    <Button
                    size="sm"
                    className="h-8 bg-gray-900 text-white hover:bg-black rounded-lg focus:ring-gray-900"
                    onClick={openPlansModal}
                  >
                    See plans
                  </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-12">
              <div className="mb-4">
                <ShoppingBagIcon className="mx-auto h-12 w-12 text-gray-400" />
              </div>
              <h3 className="mt-2 text-sm font-semibold text-gray-900">
                {searchTerm ? 'No products found' : 'No products registered'}
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {searchTerm 
                  ? 'Try adjusting your search terms.' 
                  : 'Start by creating your first product to recommend to clients.'
                }
              </p>
              {!searchTerm && (
                <div className="mt-6">
                  <Button
                    asChild
                    className="bg-gray-900 hover:bg-black text-white shadow-sm rounded-xl font-medium"
                  >
                    <Link href="/business/products/create">
                      <PlusIcon className="h-4 w-4 mr-2" />
                      Create First Product
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <>
            {/* Toolbar */}
            <div className="mb-3 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1">
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search products..."
                    className="block w-full h-10 rounded-xl border border-gray-200 bg-white pl-10 pr-3 text-[14px] text-gray-900 shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-8 text-gray-700 hover:bg-gray-50">
                  Filters
                </Button>
                <Button variant="outline" size="sm" className="h-8 text-gray-700 hover:bg-gray-50">
                  Sort
                </Button>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white/70 backdrop-blur-sm shadow-sm">
              <table className="min-w-full">
                <thead className="bg-gray-50/80">
                  <tr className="text-left text-xs text-gray-600">
                    <th className="py-3.5 pl-4 pr-3 font-medium sm:pl-6">Name</th>
                    <th className="px-3 py-3.5 font-medium">Brand</th>
                    <th className="px-3 py-3.5 font-medium">Price</th>
                    <th className="px-3 py-3.5 font-medium">Points per purchase</th>
                    <th className="px-3 py-3.5 font-medium">Status</th>
                    <th className="py-3.5 pl-3 pr-4 sm:pr-6 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {currentProducts.map((product) => (
                    <tr key={product.id} className="hover:bg-gray-50/60">
                      <td className="whitespace-nowrap py-3.5 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 flex items-center justify-center">
                            {product.imageUrl ? (
                              // Use a regular img to avoid Next/Image domain restrictions inside app table
                              <img
                                src={product.imageUrl}
                                alt={product.name}
                                className="h-full w-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <ShoppingBagIcon className="h-5 w-5 text-gray-400" />
                            )}
                          </div>
                          <div className="flex flex-col">
                            <span>{product.name}</span>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-sm text-gray-600">
                        {product.brand || '-'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-sm text-gray-900">
                        {product.discountPrice && product.originalPrice
                          ? `${formatPrice(product.discountPrice)} `
                          : formatPrice(product.originalPrice || product.discountPrice) || '-'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-sm text-gray-900">
                        {product.creditsPerUnit !== undefined && product.creditsPerUnit !== null ? (
                          <span>{Number(product.creditsPerUnit)} pts/unit</span>
                        ) : '-'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-sm">
                        {product.isActive ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 ring-1 ring-inset ring-green-200">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-700 ring-1 ring-inset ring-gray-200">
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="relative whitespace-nowrap py-3.5 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                            onClick={() => loadProductDetails(product.id)}
                            title="View details"
                          >
                            <EyeIcon className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                            title="Copiar link de checkout"
                            onClick={async () => {
                              const base = getBaseUrl();
                              const slug = getSlug();
                              const path = `/${slug}/checkout/${product.id}`;
                              const full = `${base}${path}`;
                              try {
                                await navigator.clipboard.writeText(full);
                              } catch {
                                await navigator.clipboard.writeText(path);
                              }
                            }}
                          >
                            <LinkIcon className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                            onClick={() => duplicateProduct(product.id)}
                            title="Duplicate product"
                          >
                            <DocumentDuplicateIcon className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            asChild
                            className="h-7 w-7 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                          >
                            <Link href={`/business/products/${product.id}/edit`}>
                              <PencilIcon className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-500 hover:bg-red-50 hover:text-red-600"
                            onClick={() => deleteProduct(product.id)}
                            title="Delete product"
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}

          {/* Pagination */}
          {filteredProducts.length > 0 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-gray-600">
                Showing {startIndex + 1}-{Math.min(endIndex, totalProducts)} of {totalProducts}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-gray-700 hover:bg-gray-50"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeftIcon className="h-3.5 w-3.5" />
                </Button>
                <span className="text-sm text-gray-700">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-gray-700 hover:bg-gray-50"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRightIcon className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* Product Details Modal */}
          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-white border border-gray-200 rounded-2xl">
              <DialogHeader>
                <DialogTitle className="text-[18px] font-semibold text-gray-900 tracking-[-0.01em]">
                  Product details
                </DialogTitle>
              </DialogHeader>

              {selectedProduct && (
                <div className="space-y-6">
                  {/* Top section: Image + Title/Status */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-1 w-full h-40 rounded-xl bg-gray-100 flex items-center justify-center overflow-hidden">
                      {selectedProduct.imageUrl ? (
                        <img src={selectedProduct.imageUrl} alt={selectedProduct.name} className="w-full h-full object-cover" />
                      ) : (
                        <ShoppingBagIcon className="h-10 w-10 text-gray-400" />
                      )}
                    </div>
                    <div className="md:col-span-2 flex flex-col justify-between">
                      <div>
                        <h3 className="text-[18px] font-semibold text-gray-900">{selectedProduct.name}</h3>
                        {selectedProduct.brand && (
                          <p className="text-sm text-[#5154e7] font-semibold mt-1">{selectedProduct.brand}</p>
                        )}
                        {selectedProduct.description && (
                          <p className="text-sm text-gray-600 mt-2">{selectedProduct.description}</p>
                        )}
                      </div>
                      <div className="mt-3">
                        {selectedProduct.isActive ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 ring-1 ring-inset ring-green-200">Active</span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-700 ring-1 ring-inset ring-gray-200">Inactive</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Info grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-gray-200 p-4">
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">Pricing</h4>
                      <div className="text-sm text-gray-700">
                        {selectedProduct.discountPrice && selectedProduct.originalPrice ? (
                          <div className="flex items-center gap-2">
                            <span className="text-base font-semibold text-[#5154e7]">{formatPrice(selectedProduct.discountPrice)}</span>
                            <span className="text-sm text-gray-400 line-through">{formatPrice(selectedProduct.originalPrice)}</span>
                            {selectedProduct.discountPercentage && (
                              <Badge className="bg-[#5154e7] text-white border-[#5154e7] font-semibold">-{selectedProduct.discountPercentage}%</Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-base font-semibold text-gray-900">{formatPrice(selectedProduct.originalPrice || selectedProduct.discountPrice) || '-'}</span>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 p-4">
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">Points per purchase</h4>
                      <p className="text-sm text-gray-900">{selectedProduct.creditsPerUnit !== undefined && selectedProduct.creditsPerUnit !== null ? `${Number(selectedProduct.creditsPerUnit)} pts/unit` : '-'}</p>
                    </div>

                    <div className="rounded-xl border border-gray-200 p-4">
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">Categoria</h4>
                      <p className="text-sm text-gray-700">{(selectedProduct as any).category || '-'}</p>
                    </div>

                    <div className="rounded-xl border border-gray-200 p-4">
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">Compra</h4>
                      {selectedProduct.purchaseUrl ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(selectedProduct.purchaseUrl as string);
                            } catch {}
                          }}
                        >
                          <LinkIcon className="h-3.5 w-3.5 mr-1.5" />
                          Copiar link
                        </Button>
                      ) : (
                        <span className="text-sm text-gray-500">Sem link</span>
                      )}
                    </div>

                    <div className="rounded-xl border border-gray-200 p-4 md:col-span-2">
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">Protocolos associados</h4>
                      <p className="text-sm text-gray-700 mb-3">{selectedProduct._count?.protocolProducts || 0} protocolos</p>
                      {(selectedProduct as any).protocolProducts && (selectedProduct as any).protocolProducts.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {(selectedProduct as any).protocolProducts.map((pp: any) => (
                            <div key={pp.protocol.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200">
                              <span className="text-sm font-medium text-gray-900">{pp.protocol.name}</span>
                              <Button variant="outline" size="sm" className="h-7 border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:text-gray-900">
                                <Link href={`/doctor/protocols/${pp.protocol.id}`} className="text-xs">Ver</Link>
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-gray-200 p-4">
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">Criado em</h4>
                      <p className="text-sm text-gray-700">{formatDate(selectedProduct.createdAt)}</p>
                    </div>
                    <div className="rounded-xl border border-gray-200 p-4">
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">Atualizado em</h4>
                      <p className="text-sm text-gray-700">{selectedProduct.updatedAt ? formatDate(selectedProduct.updatedAt as unknown as Date) : '-'}</p>
                    </div>

                    <div className="rounded-xl border border-gray-200 p-4">
                      <h4 className="text-sm font-semibold text-gray-900 mb-1">ID</h4>
                      <p className="text-xs text-gray-600 break-all">{selectedProduct.id}</p>
                    </div>
                    <div className="rounded-xl border border-gray-200 p-4">
                      <h4 className="text-sm font-semibold text-gray-900 mb-1">Doctor ID</h4>
                      <p className="text-xs text-gray-600 break-all">{(selectedProduct as any).doctorId || '-'}</p>
                    </div>

                    <div className="rounded-xl border border-gray-200 p-4 md:col-span-2">
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">Uso por clientes</h4>
                      <p className="text-sm text-gray-700">{typeof selectedProduct.usageStats === 'number' ? `${selectedProduct.usageStats}% dos clientes` : '-'}</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-4">
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="h-8 border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:text-gray-900" 
                      asChild
                    >
                      <Link href={`/business/products/${selectedProduct.id}/edit`} className="flex items-center">
                        <PencilIcon className="h-3.5 w-3.5 mr-1.5" />
                        Editar
                      </Link>
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setIsModalOpen(false)}
                      className="h-8 border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                    >
                      Fechar
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

          {/* Plans Modal */}
          <Dialog open={isPlansOpen} onOpenChange={setIsPlansOpen}>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Choose a plan</DialogTitle>
                <DialogDescription>
                  {planName ? (
                    <span>You're currently on plan: <span className="font-medium">{planName}</span></span>
                  ) : (
                    <span>Select a plan that fits your clinic.</span>
                  )}
                </DialogDescription>
              </DialogHeader>
              {plansLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[1,2].map(i => (
                    <div key={i} className="rounded-2xl border border-gray-200 bg-white p-4">
                      <div className="h-4 w-24 bg-gray-100 rounded animate-pulse mb-2" />
                      <div className="h-3 w-40 bg-gray-100 rounded animate-pulse mb-4" />
                      <div className="h-8 w-full bg-gray-100 rounded animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {availablePlans.map((plan: any) => {
                    const isCurrent = planName && planName.toLowerCase() === plan.name?.toLowerCase();
                    return (
                      <div key={plan.id} className={`rounded-2xl border border-gray-200 bg-white shadow-sm ${isCurrent ? 'ring-2 ring-blue-500' : ''}`}>
                        <div className="px-4 py-4 border-b border-gray-100 rounded-t-2xl">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="text-sm font-semibold text-gray-900">{plan.name}</div>
                              <p className="text-xs text-gray-600">{plan.description}</p>
                            </div>
                            {isCurrent && (
                              <Badge className="bg-blue-100 text-blue-700 border-blue-200">Current</Badge>
                            )}
                          </div>
                          <div className="mt-3">
                            {plan.contactOnly || plan.price === null ? (
                              <div>
                                <div className="text-xl font-bold text-gray-900">Flexible billing</div>
                                <div className="text-xs text-gray-600">Custom plans</div>
                              </div>
                            ) : (
                              <div className="flex items-end gap-2">
                                <div className="text-2xl font-bold text-gray-900">$ {plan.price}</div>
                                <div className="text-xs text-gray-600 mb-1">per month</div>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="p-4">
                          <Button className="w-full bg-gradient-to-r from-[#5893ec] to-[#9bcef7] text-white hover:opacity-90">
                            {isCurrent ? 'Current plan' : 'Upgrade'}
                          </Button>
                          <div className="mt-3 space-y-2">
                            {plan.maxPatients != null && (
                              <div className="text-xs text-gray-700">Up to {plan.maxPatients} clients</div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </DialogContent>
          </Dialog>

          
        </div>
      </div>
    </div>
  );
}