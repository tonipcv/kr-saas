'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CheckCircleIcon, PlusIcon, ChevronLeftIcon as PageLeftIcon, ChevronRightIcon as PageRightIcon } from '@heroicons/react/24/outline';

interface Patient {
  id: string;
  name: string;
  email?: string;
}

interface Product {
  id: string;
  name: string;
  brand?: string;
  creditsPerUnit?: number;
  price?: number;
}

export default function PurchasesPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [patientId, setPatientId] = useState<string>('');
  const [productId, setProductId] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('1');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Purchases list state
  interface PurchaseItem {
    id: string;
    createdAt: string;
    quantity: number;
    unitPrice: number | string;
    totalPrice: number | string;
    pointsAwarded: number | string;
    notes?: string | null;
    product?: { id: string; name: string } | null;
    user?: { id: string; name?: string | null; email?: string | null } | null;
  }
  const [purchases, setPurchases] = useState<PurchaseItem[]>([]);
  const [isLoadingPurchases, setIsLoadingPurchases] = useState(true);
  const [purchasesError, setPurchasesError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Load clients (same GET used by /doctor/patients) and products
        const [patientsRes, productsRes] = await Promise.all([
          fetch('/api/patients', { cache: 'no-store' }),
          fetch('/api/products', { cache: 'no-store' })
        ]);

        if (patientsRes.ok) {
          const pjson = await patientsRes.json();
          const data = Array.isArray(pjson)
            ? pjson
            : (Array.isArray(pjson?.data) ? pjson.data : (pjson?.data?.items || pjson?.items || []));
          setPatients(data.map((p: any) => ({ id: p.id, name: p.name || p.full_name || p.email || 'Unnamed', email: p.email })));
        } else {
          const msg = await patientsRes.text();
          console.error('Failed clients load', patientsRes.status, msg);
          setError('Failed to load clients');
        }

        if (productsRes.ok) {
          const prods = await productsRes.json();
          setProducts(Array.isArray(prods) ? prods : (prods?.data?.items || []));
        } else {
          const msg = await productsRes.text();
          console.error('Failed products load', productsRes.status, msg);
          setError('Failed to load products');
        }
      } catch (e) {
        console.error('Error loading data for purchases page', e);
        setError('Failed to load clients/products');
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, []);

  // Load purchases list
  const loadPurchases = async (targetPage = 1) => {
    try {
      setIsLoadingPurchases(true);
      setPurchasesError(null);
      const res = await fetch(`/api/purchases?page=${targetPage}&page_size=10`, { cache: 'no-store' });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(`Failed to load purchases (${res.status}): ${msg}`);
      }
      const json = await res.json();
      const data = json?.data || {};
      setPurchases(data.items || []);
      const pag = data.pagination || {};
      setPage(pag.page || targetPage);
      setTotalPages(pag.total_pages || 1);
      setTotalItems(pag.total || (data.items?.length || 0));
    } catch (e: any) {
      console.error('Purchases load error:', e?.message || e);
      setPurchasesError(e?.message || 'Erro ao carregar compras');
    } finally {
      setIsLoadingPurchases(false);
    }
  };

  useEffect(() => {
    loadPurchases(1);
  }, []);

  const selectedProduct = useMemo(() => products.find(p => p.id === productId), [products, productId]);

  const formatPrice = (price?: number) => {
    if (price == null) return undefined;
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price);
    } catch {
      return String(price);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      if (!patientId) throw new Error('Select a client');
      if (!productId) throw new Error('Select a product');
      const qty = Number(quantity);
      if (!Number.isFinite(qty) || qty < 1) throw new Error('Quantity must be >= 1');

      const idempotency_key = `web_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

      const res = await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: patientId,
          product_id: productId,
          quantity: qty,
          notes: notes || undefined,
          idempotency_key,
        })
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || 'Failed to save purchase');

      setMessage('Purchase recorded successfully.');
      // Reset minimal fields, keep selections
      setQuantity('1');
      setNotes('');
      // Refresh list and close modal
      await loadPurchases(page);
      setIsModalOpen(false);
    } catch (err: any) {
      setError(err?.message || 'Unexpected error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24">
          {/* Header */}
          <div className="mb-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <h1 className="text-[20px] font-semibold text-gray-900 tracking-[-0.01em]">Purchases</h1>
                <p className="text-sm text-gray-500 mt-1">Record a client purchase and automatically award points</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setIsModalOpen(true)}
                  className="bg-gradient-to-r from-[#5893ec] to-[#9bcef7] hover:opacity-90 text-white shadow-sm rounded-xl h-9 px-4 font-medium"
                >
                  <PlusIcon className="h-4 w-4 mr-2" />
                  Record Purchase
                </Button>
                <Button asChild variant="outline" className="h-9 rounded-xl border-gray-200 text-gray-700 hover:bg-gray-50">
                  <Link href="/doctor/products">Manage Products</Link>
                </Button>
              </div>
            </div>
          </div>

          {/* Page-level errors */}
          {error && (
            <div className="mb-3 rounded-xl border border-red-200 bg-red-50 text-red-800 px-4 py-2 text-sm">
              {error}
            </div>
          )}

          {/* Purchases Table */}
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full">
              <thead className="bg-gray-50/80">
                <tr className="text-left text-xs text-gray-600">
                  <th className="py-3.5 pl-4 pr-3 font-medium sm:pl-6">Date & Time</th>
                  <th className="px-3 py-3.5 font-medium">Client</th>
                  <th className="px-3 py-3.5 font-medium">Product</th>
                  <th className="px-3 py-3.5 font-medium">Qty</th>
                  <th className="px-3 py-3.5 font-medium">Unit</th>
                  <th className="px-3 py-3.5 font-medium">Total</th>
                  <th className="px-3 py-3.5 font-medium">Points</th>
                  <th className="py-3.5 pl-3 pr-4 sm:pr-6 text-right font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoadingPurchases ? (
                  <tr><td className="px-6 py-6 text-sm text-gray-500" colSpan={8}>Loading purchases...</td></tr>
                ) : purchases.length === 0 ? (
                  <tr><td className="px-6 py-6 text-sm text-gray-500" colSpan={8}>No purchases yet.</td></tr>
                ) : (
                  purchases.map((p) => {
                    const d = new Date(p.createdAt);
                    const fmt = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d);
                    const toNum = (v: any) => typeof v === 'number' ? v : Number(v);
                    return (
                      <tr key={p.id} className="hover:bg-gray-50/60">
                        <td className="whitespace-nowrap py-3.5 pl-4 pr-3 text-sm text-gray-900 sm:pl-6">{fmt}</td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-sm text-gray-700">{p.user?.name || p.user?.email || '-'}</td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-sm text-gray-700">{p.product?.name || '-'}</td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-sm text-gray-900">{p.quantity}</td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-sm text-gray-900">{formatPrice(toNum(p.unitPrice)) || '-'}</td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-sm text-gray-900">{formatPrice(toNum(p.totalPrice)) || '-'}</td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-sm text-gray-900">{toNum(p.pointsAwarded)} pts</td>
                        <td className="relative whitespace-nowrap py-3.5 pl-3 pr-4 text-right text-sm text-gray-600 sm:pr-6">{p.notes || '-'}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {purchasesError && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 text-red-800 px-4 py-2 text-sm">
              {purchasesError}
            </div>
          )}

          {/* Pagination */}
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-gray-600">Page {page} of {totalPages} • {totalItems} records</p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-9 rounded-xl border-gray-200 text-gray-700 hover:bg-gray-50"
                onClick={() => { const t = Math.max(1, page - 1); setPage(t); loadPurchases(t); }}
                disabled={page === 1}
              >
                <PageLeftIcon className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9 rounded-xl border-gray-200 text-gray-700 hover:bg-gray-50"
                onClick={() => { const t = Math.min(totalPages, page + 1); setPage(t); loadPurchases(t); }}
                disabled={page === totalPages}
              >
                <PageRightIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Record Purchase Modal */}
          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogContent className="max-w-xl bg-white border border-gray-200 rounded-2xl">
              <DialogHeader>
                <DialogTitle className="text-[18px] font-semibold text-gray-900 tracking-[-0.01em]">
                  Record Purchase
                </DialogTitle>
              </DialogHeader>

              <form onSubmit={onSubmit} className="space-y-4">
                {/* Client */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Client</label>
                  <Select value={patientId} onValueChange={setPatientId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={isLoading ? 'Loading clients...' : 'Select a client'} />
                    </SelectTrigger>
                    <SelectContent>
                      {patients.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}{p.email ? ` • ${p.email}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Product */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Product</label>
                  <Select value={productId} onValueChange={setProductId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={isLoading ? 'Loading products...' : 'Select a product'} />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}{p.brand ? ` • ${p.brand}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Quantity */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="h-10 rounded-xl"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g., Payment via Stripe, order #1234"
                    rows={3}
                    className="rounded-xl"
                  />
                </div>

                {error && (
                  <div className="text-sm text-red-600">{error}</div>
                )}
                {message && (
                  <div className="flex items-center gap-2 text-sm text-green-700">
                    <CheckCircleIcon className="h-4 w-4" />
                    {message}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Button type="submit" disabled={isSubmitting || !patientId || !productId} className="bg-gradient-to-r from-[#5893ec] to-[#9bcef7] hover:opacity-90 text-white shadow-sm rounded-xl h-10 px-4 font-medium">
                    {isSubmitting ? 'Saving...' : 'Save Purchase'}
                  </Button>
                  <Button type="button" variant="outline" disabled={isSubmitting} className="h-10 rounded-xl" onClick={() => { setPatientId(''); setProductId(''); setQuantity('1'); setNotes(''); setMessage(null); setError(null); }}>
                    Clear
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
