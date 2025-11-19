'use client';

import React, { useEffect, useState } from 'react';
import { useClinic } from '@/contexts/clinic-context';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { ShoppingBagIcon, PencilIcon, EyeIcon } from '@heroicons/react/24/outline';

interface SubscriptionRow {
  id: string;
  status: string;
  customerName: string;
  customerEmail?: string | null;
  product: string;
  startedAt: string | null;
  updatedAt: string | null;
  chargesCount: number;
  interval?: string | null;
  intervalCount?: number | null;
  internalId?: string;
}

function formatDate(v: any) {
  if (!v) return '-';
  try {
    const d = new Date(v);
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
  } catch {
    return String(v ?? '');
  }
}

function formatAmount(amountCents?: number | string | null, currency?: string | null) {
  if (amountCents == null) return '-';
  const cents = typeof amountCents === 'number' ? amountCents : Number(amountCents);
  const value = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(value);
  } catch {
    return `${value} ${currency || ''}`.trim();
  }
}

function badgeTX(status: string) {
  const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border';
  switch (status) {
    case 'PAID':
    case 'SUCCEEDED':
      return <span className={`${base} bg-green-50 text-green-700 border-green-200`}>Paid</span>;
    case 'STARTED':
    case 'PROCESSING':
      return <span className={`${base} bg-blue-50 text-blue-700 border-blue-200`}>Processing</span>;
    case 'PIX_GENERATED':
      return <span className={`${base} bg-amber-50 text-amber-700 border-amber-200`}>Pending</span>;
    case 'ABANDONED':
    case 'FAILED':
    case 'CANCELED':
      return <span className={`${base} bg-red-50 text-red-700 border-red-200`}>Failed</span>;
    default:
      return status ? <span className={`${base} bg-gray-100 text-gray-700 border-gray-200`}>{status}</span>
                    : <span className={`${base} bg-gray-100 text-gray-500 border-gray-200`}>—</span>;
  }
}

function renderStatusBadge(statusRaw?: string | null) {
  const status = String(statusRaw || '').toUpperCase();
  const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border';
  switch (status) {
    case 'ACTIVE':
      return <span className={`${base} bg-green-50 text-green-700 border-green-200`}>Active</span>;
    case 'TRIAL':
      return <span className={`${base} bg-blue-50 text-blue-700 border-blue-200`}>Trial</span>;
    case 'PAST_DUE':
    case 'INCOMPLETE':
      return <span className={`${base} bg-amber-50 text-amber-700 border-amber-200`}>Past due</span>;
    case 'CANCELED':
      return <span className={`${base} bg-gray-100 text-gray-700 border-gray-200`}>Canceled</span>;
    default:
      return status ? <span className={`${base} bg-gray-100 text-gray-700 border-gray-200`}>{status}</span>
                    : <span className={`${base} bg-gray-100 text-gray-500 border-gray-200`}>—</span>;
  }
}

export default function BusinessSubscriptionsPage() {
  const { currentClinic } = useClinic();
  const [items, setItems] = useState<SubscriptionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  const [txOpen, setTxOpen] = useState(false);
  const [txLoading, setTxLoading] = useState(false);
  const [txRows, setTxRows] = useState<any[]>([]);
  const [txSub, setTxSub] = useState<SubscriptionRow | null>(null);

  useEffect(() => {
    const load = async (p = 1) => {
      if (!currentClinic) return;
      try {
        setIsLoading(true);
        const res = await fetch(`/api/subscriptions?clinicId=${currentClinic.id}&page=${p}&page_size=${pageSize}`, { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          const data = Array.isArray(json?.data) ? json.data : [];
          setItems(data);
          const totalRemote = Number(json?.pagination?.total || data.length);
          setTotal(totalRemote);
          setPage(p);
        } else {
          setItems([]);
          setTotal(0);
        }
      } finally {
        setIsLoading(false);
      }
    };
    load(1);
  }, [currentClinic]);

  const filtered = items.filter(p =>
    p.product.toLowerCase().includes(search.toLowerCase()) ||
    p.customerName.toLowerCase().includes(search.toLowerCase()) ||
    p.id.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil((total || filtered.length) / pageSize));

  // If no clinic selected yet, show same loading container as other pages
  if (!currentClinic) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="lg:ml-64">
          <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24">
            <div className="overflow-auto rounded-2xl border border-gray-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50/80 text-xs text-gray-600">
                  <tr>
                    <th className="px-2 py-2 text-left">Code</th>
                    <th className="px-2 py-2 text-left">Contact</th>
                    <th className="px-2 py-2 text-left">Product</th>
                    <th className="px-2 py-2 text-left">Status</th>
                    <th className="px-2 py-2 text-left">Started</th>
                    <th className="px-2 py-2 text-left">Updated</th>
                    <th className="px-2 py-2 text-left"># of Charges</th>
                    <th className="px-2 py-2 text-left">Charged Every</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr><td colSpan={8} className="px-3 py-6 text-gray-500">Loading...</td></tr>
                </tbody>
              </table>
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
          <div className="mb-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <h1 className="text-[20px] font-semibold text-gray-900 tracking-[-0.01em]">Subscriptions</h1>
                <p className="text-sm text-gray-500 mt-1">Manage recurring subscriptions for your products</p>
              </div>
            </div>
          </div>

          <div className="mb-3">
            <input
              type="text"
              className="block w-full h-10 rounded-xl border border-gray-200 bg-white px-3 text-[14px] text-gray-900 shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="Search subscriptions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="overflow-auto rounded-2xl border border-gray-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50/80 text-xs text-gray-600">
                <tr>
                  <th className="px-2 py-2 text-left">Code</th>
                  <th className="px-2 py-2 text-left">Contact</th>
                  <th className="px-2 py-2 text-left">Product</th>
                  <th className="px-2 py-2 text-left">Status</th>
                  <th className="px-2 py-2 text-left">Started</th>
                  <th className="px-2 py-2 text-left">Updated</th>
                  <th className="px-2 py-2 text-left"># of Charges</th>
                  <th className="px-2 py-2 text-left">Charged Every</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr><td colSpan={8} className="px-3 py-6 text-gray-500">Loading...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} className="px-3 py-6 text-gray-500">No subscriptions found.</td></tr>
                ) : (
                  filtered.map((row) => (
                    <tr
                      key={row.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onDoubleClick={async () => {
                        if (!row.internalId) return;
                        setTxOpen(true);
                        setTxSub(row);
                        setTxLoading(true);
                        try {
                          const res = await fetch(`/api/subscriptions/${row.internalId}/transactions`, { cache: 'no-store' });
                          const json = await res.json();
                          setTxRows(Array.isArray(json?.data) ? json.data : []);
                        } catch {
                          setTxRows([]);
                        } finally {
                          setTxLoading(false);
                        }
                      }}
                    >
                      <td className="px-2 py-2 whitespace-nowrap"><span className="text-xs text-gray-700">{row.id}</span></td>
                      <td className="px-2 py-2 whitespace-nowrap text-gray-900">
                        <div className="flex flex-col">
                          <span>{row.customerName || '-'}</span>
                          {row.customerEmail ? (
                            <span className="text-xs text-gray-500">{row.customerEmail}</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-gray-900">{row.product || '-'}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{renderStatusBadge(row.status)}</td>
                      <td className="px-2 py-2 whitespace-nowrap text-gray-500">{formatDate(row.startedAt)}</td>
                      <td className="px-2 py-2 whitespace-nowrap text-gray-500">{formatDate(row.updatedAt)}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{row.chargesCount ?? 0}</td>
                      <td className="px-2 py-2 whitespace-nowrap text-gray-600">{row.interval ? `${String(row.interval).toLowerCase()}${row.intervalCount && row.intervalCount > 1 ? ` x${row.intervalCount}` : ''}` : '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {filtered.length > 0 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-gray-600">Page {page} of {totalPages}</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-8 text-gray-700 hover:bg-gray-50" disabled={page <= 1} onClick={() => setPage(p => { const np = Math.max(1, p - 1); (async()=>{ if(currentClinic) await fetch(`/api/subscriptions?clinicId=${currentClinic.id}&page=${np}&page_size=${pageSize}`).then(r=>r.json()).then(json=>{ setItems(Array.isArray(json?.data)?json.data:[]); setTotal(Number(json?.pagination?.total || 0)); }); })(); return np; })}>
                  Prev
                </Button>
                <Button variant="outline" size="sm" className="h-8 text-gray-700 hover:bg-gray-50" disabled={page >= totalPages} onClick={() => setPage(p => { const np = Math.min(totalPages, p + 1); (async()=>{ if(currentClinic) await fetch(`/api/subscriptions?clinicId=${currentClinic.id}&page=${np}&page_size=${pageSize}`).then(r=>r.json()).then(json=>{ setItems(Array.isArray(json?.data)?json.data:[]); setTotal(Number(json?.pagination?.total || 0)); }); })(); return np; })}>
                  Next
                </Button>
              </div>
            </div>
          )}

          {txOpen && (
            <div className="fixed inset-0 z-50">
              <div className="absolute inset-0 bg-black/30" onClick={() => setTxOpen(false)} />
              <div className="absolute left-1/2 top-12 -translate-x-1/2 w-[min(100%-24px,1100px)] rounded-2xl border border-gray-200 bg-white shadow-xl">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <div className="text-sm text-gray-500">Transactions for</div>
                    <div className="text-[15px] font-semibold text-gray-900">{txSub?.customerName || '-'} <span className="text-gray-500 font-normal">•</span> <span className="text-gray-600">{txSub?.product}</span></div>
                    <div className="text-xs text-gray-500 mt-0.5">Subscription: <span>{txSub?.id}</span></div>
                  </div>
                  <div>
                    <Button variant="outline" size="sm" onClick={() => setTxOpen(false)}>Close</Button>
                  </div>
                </div>
                <div className="p-3">
                  <div className="overflow-auto rounded-xl border border-gray-200">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50/80 text-xs text-gray-600">
                        <tr>
                          <th className="px-2 py-2 text-left">Created</th>
                          <th className="px-2 py-2 text-left">Amount</th>
                          <th className="px-2 py-2 text-left">Currency</th>
                          <th className="px-2 py-2 text-left">Status</th>
                          <th className="px-2 py-2 text-left">Order</th>
                          <th className="px-2 py-2 text-left">Charge</th>
                          <th className="px-2 py-2 text-left">Product</th>
                          <th className="px-2 py-2 text-left">Client</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {txLoading ? (
                          <tr><td colSpan={8} className="px-3 py-6 text-gray-500">Loading...</td></tr>
                        ) : (txRows.length === 0 ? (
                          <tr><td colSpan={8} className="px-3 py-6 text-gray-500">No transactions.</td></tr>
                        ) : txRows.map((t) => (
                          <tr key={t.id} className="hover:bg-gray-50">
                            <td className="px-2 py-2 text-gray-500 whitespace-nowrap">{formatDate(t.created_at)}</td>
                            <td className="px-2 py-2 whitespace-nowrap">{formatAmount(t.amount_cents, t.currency)}</td>
                            <td className="px-2 py-2 whitespace-nowrap">{t.currency}</td>
                            <td className="px-2 py-2 whitespace-nowrap">{badgeTX(String(t.status_v2 || t.status || '').toUpperCase())}</td>
                            <td className="px-2 py-2 whitespace-nowrap">{t.provider_order_id || '—'}</td>
                            <td className="px-2 py-2 whitespace-nowrap">{t.provider_charge_id || '—'}</td>
                            <td className="px-2 py-2 whitespace-nowrap">{t.product_name || t.product_id || '—'}</td>
                            <td className="px-2 py-2 whitespace-nowrap">{t.client_name || t.client_email || '—'}</td>
                          </tr>
                        )))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
