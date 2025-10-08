'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useClinic } from '@/contexts/clinic-context';
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CheckCircleIcon, PlusIcon, ChevronLeftIcon as PageLeftIcon, ChevronRightIcon as PageRightIcon, TrashIcon, EllipsisHorizontalIcon } from '@heroicons/react/24/outline';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

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
  const { currentClinic } = useClinic();
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
  const [planName, setPlanName] = useState<string | null>(null);
  const [isPlansOpen, setIsPlansOpen] = useState(false);
  const [plansLoading, setPlansLoading] = useState(false);
  const [availablePlans, setAvailablePlans] = useState<any[]>([]);

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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTargetId, setConfirmTargetId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editQuantity, setEditQuantity] = useState<string>('1');
  const [editNotes, setEditNotes] = useState<string>('');
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Derived flags
  const isFree = (planName || '').toLowerCase() === 'free';

  // Plans modal loader
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

  const openEdit = (p: PurchaseItem) => {
    setEditError(null);
    setEditId(p.id);
    setEditQuantity(String(p.quantity ?? '1'));
    setEditNotes(p.notes || '');
    setEditOpen(true);
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editId) return;
    try {
      setEditing(true);
      setEditError(null);
      const qty = Number(editQuantity);
      if (!Number.isFinite(qty) || qty < 1) throw new Error('Quantidade inválida');
      const res = await fetch(`/api/purchases/${encodeURIComponent(editId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: qty, notes: editNotes || null })
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || 'Falha ao atualizar');
      await loadPurchases(page);
      setEditOpen(false);
    } catch (e: any) {
      setEditError(e?.message || 'Erro inesperado');
    } finally {
      setEditing(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        setError(null);

        if (!currentClinic) {
          setPatients([]);
          setProducts([]);
          return;
        }

        // Load clients (same GET used by /doctor/patients) and products
        const [patientsRes, productsRes] = await Promise.all([
          fetch(`/api/patients?clinicId=${currentClinic.id}`, { cache: 'no-store' }),
          fetch(`/api/products?clinicId=${currentClinic.id}`, { cache: 'no-store' })
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
  }, [currentClinic]);

  // Check plan (same approach as products page)
  useEffect(() => {
    const checkPlan = async () => {
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
      }
    };
    checkPlan();
  }, []);

  // Load purchases list
  const loadPurchases = async (targetPage = 1) => {
    try {
      setIsLoadingPurchases(true);
      setPurchasesError(null);
      if (!currentClinic) {
        setPurchases([]);
        return;
      }
      const res = await fetch(`/api/purchases?page=${targetPage}&page_size=20&clinicId=${currentClinic.id}`, { cache: 'no-store' });
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
  }, [currentClinic]);

  const selectedProduct = useMemo(() => products.find(p => p.id === productId), [products, productId]);

  const deletePurchaseInner = async (id: string) => {
    try {
      setDeleteError(null);
      setDeletingId(id);
      const res = await fetch(`/api/purchases/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || 'Falha ao apagar compra');
      await loadPurchases(page);
    } catch (e: any) {
      setDeleteError(e?.message || 'Erro inesperado ao apagar');
    } finally {
      setDeletingId(null);
    }
  };

  const openDelete = (id: string) => {
    setDeleteError(null);
    setConfirmTargetId(id);
    setConfirmOpen(true);
  };

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

  // Show loading when no clinic is selected
  if (!currentClinic) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="lg:ml-64">
          <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24 flex items-center justify-center min-h-[calc(100vh-88px)]">
            <Card className="w-full max-w-md bg-white border-gray-200 shadow-lg rounded-2xl">
              <CardHeader className="text-center p-6">
                <CardTitle className="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
                  Select a Clinic
                </CardTitle>
                <p className="text-gray-600 font-medium mt-2">
                  Please select a clinic from the sidebar to view purchases.
                </p>
              </CardHeader>
            </Card>
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
                <h1 className="text-[20px] font-semibold text-gray-900 tracking-[-0.01em]">Purchases</h1>
                <p className="text-sm text-gray-500 mt-1">Record a client purchase and automatically award points</p>
              </div>
              <div className="flex items-center gap-2">
                {isFree ? (
                  <Button
                    onClick={openPlansModal}
                    size="sm"
                    className="h-8 bg-gray-900 hover:bg-black text-white"
                  >
                    <PlusIcon className="h-3.5 w-3.5 mr-1.5" />
                    Record Purchase
                  </Button>
                ) : (
                  <Button
                    onClick={() => setIsModalOpen(true)}
                    size="sm"
                    className="h-8 bg-gray-900 hover:bg-black text-white"
                  >
                    <PlusIcon className="h-3.5 w-3.5 mr-1.5" />
                    Record Purchase
                  </Button>
                )}
                <Button asChild variant="outline" size="sm" className="h-8 text-gray-700 hover:bg-gray-50">
                  <Link href="/business/products">Manage Products</Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="h-8 text-gray-700 hover:bg-gray-50">
                  <Link href="/business/payments">Payments Data</Link>
                </Button>
              </div>
            </div>
          </div>

          {/* Free plan banner */}
          {planName && planName.toLowerCase() === 'free' && (
            <div className="mb-4 rounded-2xl px-4 py-4 text-white bg-gradient-to-r from-[#5893ec] to-[#9bcef7] shadow-sm">
              <p className="text-sm font-semibold">You're on the Free plan — access to the Purchases page is not included.</p>
              <p className="text-xs mt-1 opacity-95">Upgrade to a paid plan to unlock this feature.</p>
              <div className="mt-3">
                <Button size="sm" variant="outline" className="h-8 text-gray-700 hover:bg-gray-50" onClick={openPlansModal}>
                  See plans
                </Button>
              </div>
            </div>
          )}

          {/* Page-level errors */}
          {error && (
            <div className="mb-3 rounded-xl border border-red-200 bg-red-50 text-red-800 px-4 py-2 text-sm">
              {error}
            </div>
          )}

          {/* Purchases Table */}
          {isFree ? (
            <div className="relative">
              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white/50 backdrop-blur-md shadow-sm min-h-56" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center px-4">
                  <p className="text-sm font-semibold text-gray-800">Purchases are locked on the Free plan.</p>
                  <p className="text-xs text-gray-600 mt-1">Upgrade to record and view purchases.</p>
                  <div className="mt-3">
                    <Button size="sm" className="h-8 bg-gradient-to-r from-[#5893ec] to-[#9bcef7] text-white hover:opacity-90" onClick={openPlansModal}>
                      See plans
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white text-sm">
              <table className="min-w-full">
                <thead className="bg-gray-50/80">
                  <tr className="text-left text-xs text-gray-600">
                    <th className="py-2 pl-3 pr-2 font-medium sm:pl-4">Date</th>
                    <th className="px-2 py-2 font-medium">Client</th>
                    <th className="px-2 py-2 font-medium">Product</th>
                    <th className="px-2 py-2 font-medium text-right">Qty</th>
                    <th className="px-2 py-2 font-medium text-right">Unit</th>
                    <th className="px-2 py-2 font-medium text-right">Total</th>
                    <th className="px-2 py-2 font-medium text-right">Points</th>
                    <th className="px-2 py-2 font-medium">Notes</th>
                    <th className="relative py-2 pl-2 pr-3 sm:pr-4 w-10">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white text-sm">
                  {isLoadingPurchases ? (
                    Array.from({ length: 20 }).map((_, i) => (
                      <tr key={`sk-${i}`}>
                        <td className="py-2 pl-3 pr-2">
                          <div className="h-4 w-28 bg-gray-100 rounded animate-pulse" />
                        </td>
                        <td className="px-2 py-2">
                          <div className="h-4 w-36 bg-gray-100 rounded animate-pulse" />
                        </td>
                        <td className="px-2 py-2">
                          <div className="h-4 w-40 bg-gray-100 rounded animate-pulse" />
                        </td>
                        <td className="px-2 py-2">
                          <div className="h-4 w-10 bg-gray-100 rounded animate-pulse" />
                        </td>
                        <td className="px-2 py-2">
                          <div className="h-4 w-16 bg-gray-100 rounded animate-pulse" />
                        </td>
                        <td className="px-2 py-2">
                          <div className="h-4 w-16 bg-gray-100 rounded animate-pulse" />
                        </td>
                        <td className="px-2 py-2">
                          <div className="h-4 w-12 bg-gray-100 rounded animate-pulse" />
                        </td>
                        <td className="px-2 py-2">
                          <div className="h-4 w-24 bg-gray-100 rounded animate-pulse" />
                        </td>
                        <td className="py-2 pl-2 pr-3 sm:pr-4 text-right">
                          <div className="h-8 w-8 bg-gray-100 rounded-lg animate-pulse inline-block" />
                        </td>
                      </tr>
                    ))
                  ) : purchases.length === 0 ? (
                    <tr><td className="px-6 py-6 text-sm text-gray-500" colSpan={8}>No purchases yet.</td></tr>
                  ) : (
                    purchases.map((p) => {
                      const d = new Date(p.createdAt);
                      const fmt = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d);
                      const toNum = (v: any) => typeof v === 'number' ? v : Number(v);
                      return (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="whitespace-nowrap px-2 py-2 text-gray-500">
                            {new Date(p.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 text-gray-700 truncate max-w-[120px]">{p.user?.name || p.user?.email || '-'}</td>
                          <td className="whitespace-nowrap px-2 py-2 text-gray-700 truncate max-w-[120px]">{p.product?.name || '-'}</td>
                          <td className="whitespace-nowrap px-2 py-2 text-gray-900 text-right">{p.quantity}</td>
                          <td className="whitespace-nowrap px-2 py-2 text-gray-900 text-right">{formatPrice(toNum(p.unitPrice)) || '-'}</td>
                          <td className="whitespace-nowrap px-2 py-2 text-gray-900 text-right">{formatPrice(toNum(p.totalPrice)) || '-'}</td>
                          <td className="whitespace-nowrap px-2 py-2 text-gray-900 text-right">{toNum(p.pointsAwarded)}</td>
                          <td className="whitespace-nowrap px-2 py-2 text-gray-600 truncate max-w-[150px]">{p.notes || '-'}</td>
                          <td className="relative whitespace-nowrap py-2 pl-2 pr-3 text-right sm:pr-4">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                  <EllipsisHorizontalIcon className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40">
                                <DropdownMenuItem onClick={() => openEdit(p)}>Editar</DropdownMenuItem>
                                <DropdownMenuItem
                                  className={`text-red-600 ${deletingId ? 'opacity-50 pointer-events-none' : ''}`}
                                  onClick={() => { if (!deletingId) openDelete(p.id); }}
                                >
                                  Excluir
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {purchasesError && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 text-red-800 px-4 py-2 text-sm">
              {purchasesError}
            </div>
          )}
          {deleteError && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 text-red-800 px-4 py-2 text-sm">
              {deleteError}
            </div>
          )}

          {/* Delete Confirmation Modal */}
          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogContent className="max-w-md bg-white border border-gray-200 rounded-2xl">
              <DialogHeader>
                <DialogTitle className="text-[18px] font-semibold text-gray-900">Confirmar exclusão</DialogTitle>
              </DialogHeader>
              <div className="text-sm text-gray-700">
                Esta ação apagará a compra e ajustará os pontos do paciente. Deseja continuar?
              </div>
              <div className="flex items-center gap-2 justify-end">
                <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setConfirmOpen(false)} disabled={!!deletingId}>Cancel</Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="h-8"
                  onClick={async () => {
                    if (!confirmTargetId) return;
                    await deletePurchaseInner(confirmTargetId);
                    setConfirmOpen(false);
                    setConfirmTargetId(null);
                  }}
                  disabled={!!deletingId}
                >
                  {deletingId ? 'Apagando…' : 'Apagar'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Edit Purchase Modal */}
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogContent className="max-w-md bg-white border border-gray-200 rounded-2xl">
              <DialogHeader>
                <DialogTitle className="text-[18px] font-semibold text-gray-900">Editar compra</DialogTitle>
              </DialogHeader>
              <form onSubmit={submitEdit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade</label>
                  <Input type="number" min={1} step={1} value={editQuantity} onChange={(e) => setEditQuantity(e.target.value)} className="h-10 rounded-xl" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                  <Textarea rows={3} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="rounded-xl" />
                </div>
                {editError && <div className="text-sm text-red-600">{editError}</div>}
                <div className="flex items-center gap-2 justify-end">
                  <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setEditOpen(false)} disabled={editing}>Cancel</Button>
                  <Button type="submit" size="sm" className="h-8 bg-gray-900 text-white" disabled={editing}>{editing ? 'Saving…' : 'Save'}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          {/* Pagination */}
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-gray-600">Page {page} of {totalPages} • {totalItems} records</p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-gray-700 hover:bg-gray-50"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <PageLeftIcon className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-gray-700 hover:bg-gray-50"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                <PageRightIcon className="h-3.5 w-3.5" />
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
                  <Button 
                    type="submit" 
                    size="sm"
                    disabled={isSubmitting || !patientId || !productId} 
                    className="h-8 bg-gray-900 hover:bg-black text-white"
                  >
                    {isSubmitting ? 'Saving...' : 'Save Purchase'}
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    disabled={isSubmitting} 
                    className="h-8" 
                    onClick={() => { 
                      setPatientId(''); 
                      setProductId(''); 
                      setQuantity('1'); 
                      setNotes(''); 
                      setMessage(null); 
                      setError(null); 
                    }}
                  >
                    Clear
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          {/* Plans Modal */}
          <Dialog open={isPlansOpen} onOpenChange={setIsPlansOpen}>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Choose a plan</DialogTitle>
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
                          <div className="text-sm font-semibold text-gray-900">{plan.name}</div>
                          <p className="text-xs text-gray-600">{plan.description}</p>
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
                          <Button 
                            size="sm" 
                            className="w-full h-8 bg-gradient-to-r from-[#5893ec] to-[#9bcef7] text-white hover:opacity-90"
                          >
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
