'use client';

import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  }, []);

  const loadProducts = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/products');
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white">
        <div className="lg:ml-64">
          <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24">
            
            {/* Header Skeleton */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 mb-8">
              <div className="space-y-3">
                <div className="h-8 bg-gray-200 rounded-lg w-32 animate-pulse"></div>
                <div className="h-5 bg-gray-100 rounded-lg w-80 animate-pulse"></div>
              </div>
              <div className="h-12 bg-gray-100 rounded-xl w-40 animate-pulse"></div>
            </div>

            {/* Search Skeleton */}
            <div className="bg-white border border-gray-200 shadow-lg rounded-2xl p-6 mb-8">
              <div className="h-12 bg-gray-100 rounded-xl animate-pulse"></div>
            </div>

            {/* Products Grid Skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="bg-white border border-gray-200 shadow-lg rounded-2xl p-6">
                  <div className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2 flex-1">
                        <div className="h-6 bg-gray-200 rounded w-3/4 animate-pulse"></div>
                        <div className="h-4 bg-gray-100 rounded w-1/2 animate-pulse"></div>
                      </div>
                      <div className="h-6 bg-gray-100 rounded-xl w-16 animate-pulse"></div>
                    </div>
                    <div className="w-full h-40 bg-gray-100 rounded-xl animate-pulse"></div>
                    <div className="h-4 bg-gray-100 rounded w-full animate-pulse"></div>
                    <div className="h-4 bg-gray-100 rounded w-2/3 animate-pulse"></div>
                    <div className="flex items-center justify-between">
                      <div className="h-4 bg-gray-100 rounded w-20 animate-pulse"></div>
                      <div className="h-4 bg-gray-100 rounded w-16 animate-pulse"></div>
                    </div>
                    <div className="flex gap-3">
                      <div className="h-10 bg-gray-100 rounded-xl flex-1 animate-pulse"></div>
                      <div className="h-10 bg-gray-100 rounded-xl flex-1 animate-pulse"></div>
                    </div>
                  </div>
                </div>
              ))}
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
                <p className="text-sm text-gray-500 mt-1">Manage products recommended in your protocols</p>
              </div>
              <Button asChild className="bg-gradient-to-r from-[#5893ec] to-[#9bcef7] hover:opacity-90 text-white shadow-sm rounded-xl h-9 px-4 font-medium">
                <Link href="/doctor/products/create">
                  <PlusIcon className="h-4 w-4 mr-2" />
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
                    <Button size="sm" className="h-8 bg-gradient-to-r from-[#5893ec] to-[#9bcef7] text-white hover:opacity-90 rounded-lg" onClick={openPlansModal}>
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
                    className="bg-gradient-to-r from-[#5893ec] to-[#9bcef7] hover:opacity-90 text-white shadow-sm rounded-xl font-medium"
                  >
                    <Link href="/doctor/products/create">
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
                    className="block w-full h-10 rounded-xl border border-gray-200 bg-white pl-10 pr-3 text-[14px] text-gray-900 shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#5154e7]"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" className="h-9 rounded-xl border-gray-200 text-gray-700 hover:bg-gray-50">
                  <span className="text-sm">Filters</span>
                </Button>
                <Button variant="outline" className="h-9 rounded-xl border-gray-200 text-gray-700 hover:bg-gray-50">
                  <span className="text-sm">Sort</span>
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
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => loadProductDetails(product.id)}
                            className="text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg h-8 w-8 p-0"
                            disabled={isLoadingProduct}
                          >
                            <EyeIcon className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => duplicateProduct(product.id)}
                            className="text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg h-8 w-8 p-0"
                            disabled={duplicatingId === product.id}
                            title="Duplicar produto (ficará inativo)"
                          >
                            <DocumentDuplicateIcon className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                            className="text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg h-8 w-8 p-0"
                          >
                            <Link href={`/doctor/products/${product.id}/edit`}>
                              <PencilIcon className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteProduct(product.id)}
                            className="text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg h-8 w-8 p-0"
                            disabled={deletingId === product.id}
                            title="Excluir produto"
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
                  className="h-9 rounded-xl border-gray-200 text-gray-700 hover:bg-gray-50"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                </Button>
                <span className="text-sm text-gray-700">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-xl border-gray-200 text-gray-700 hover:bg-gray-50"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRightIcon className="h-4 w-4" />
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
                        <Button variant="outline" size="sm" asChild className="border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:text-gray-900 rounded-xl h-9 px-3 shadow-sm font-medium">
                          <a href={selectedProduct.purchaseUrl} target="_blank" rel="noopener noreferrer">
                            <LinkIcon className="h-4 w-4 mr-2" />
                            Abrir link
                          </a>
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
                              <Button variant="outline" size="sm" asChild className="border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:text-gray-900 rounded-lg h-8 px-3">
                                <Link href={`/doctor/protocols/${pp.protocol.id}`}>Ver</Link>
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
                  <div className="flex gap-3 pt-4">
                    <Button 
                      variant="outline" 
                      className="flex-1 border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:text-gray-900 rounded-xl h-11 shadow-sm font-medium" 
                      asChild
                    >
                      <Link href={`/doctor/products/${selectedProduct.id}/edit`}>
                        <PencilIcon className="h-4 w-4 mr-2" />
                        Editar produto
                      </Link>
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => setIsModalOpen(false)}
                      className="border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:text-gray-900 rounded-xl h-11 px-5 shadow-sm font-medium"
                    >
                      <XMarkIcon className="h-4 w-4 mr-2" />
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