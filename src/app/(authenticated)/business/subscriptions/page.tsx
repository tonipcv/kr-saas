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
  product: string;
  startedAt: string | null;
  updatedAt: string | null;
  chargesCount: number;
  interval?: string | null;
  intervalCount?: number | null;
}

export default function BusinessSubscriptionsPage() {
  const { currentClinic } = useClinic();
  const [items, setItems] = useState<SubscriptionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

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

  if (!currentClinic) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="lg:ml-64">
          <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24 flex items-center justify-center min-h-[calc(100vh-88px)]">
            <Card className="w-full max-w-md bg-white border-gray-200 shadow-lg rounded-2xl">
              <CardHeader className="text-center p-6">
                <CardTitle className="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">Select a Clinic</CardTitle>
                <p className="text-gray-600 font-medium mt-2">Please select a clinic from the sidebar to view subscriptions.</p>
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

          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white/70 backdrop-blur-sm shadow-sm">
            <table className="min-w-full">
              <thead className="bg-gray-50/80">
                <tr className="text-left text-xs text-gray-600">
                  <th className="py-3.5 pl-4 pr-3 font-medium sm:pl-6">Code</th>
                  <th className="px-3 py-3.5 font-medium">Contact</th>
                  <th className="px-3 py-3.5 font-medium">Product</th>
                  <th className="px-3 py-3.5 font-medium">Active</th>
                  <th className="px-3 py-3.5 font-medium">Started at</th>
                  <th className="px-3 py-3.5 font-medium">Updated at</th>
                  <th className="px-3 py-3.5 font-medium"># of Charges</th>
                  <th className="px-3 py-3.5 font-medium">Charged Every</th>
                  <th className="py-3.5 pl-3 pr-4 sm:pr-6 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-6 text-sm text-gray-500">Loading...</td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-6 text-sm text-gray-500">No subscriptions found.</td>
                  </tr>
                ) : (
                  filtered.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50/60">
                      <td className="whitespace-nowrap py-3.5 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                        <span className="font-mono text-xs text-gray-700">{row.id}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-sm text-gray-600">{row.customerName || '-'}</td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-sm text-gray-900">{row.product || '-'}</td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-sm">
                        {String(row.status || '').toLowerCase() === 'active' ? (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-800">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-gray-800" />
                            Active
                          </span>
                        ) : (
                          <span className="text-xs text-gray-500">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-sm text-gray-600">{row.startedAt ? new Date(row.startedAt).toLocaleString() : '-'}</td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-sm text-gray-600">{row.updatedAt ? new Date(row.updatedAt).toLocaleString() : '-'}</td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-sm text-gray-900">{row.chargesCount ?? 0}</td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-sm text-gray-600">{row.interval ? `${String(row.interval).toLowerCase()}${row.intervalCount && row.intervalCount > 1 ? ` x${row.intervalCount}` : ''}` : '-'}</td>
                      <td className="relative whitespace-nowrap py-3.5 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-500 hover:bg-gray-100 hover:text-gray-900" asChild>
                            <Link href={`/business/products`} title="Open products">
                              <EyeIcon className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        </div>
                      </td>
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
        </div>
      </div>
    </div>
  );
}
