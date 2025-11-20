'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useClinic } from '@/contexts/clinic-context';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { MagnifyingGlassIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

type ProviderInfo = {
  provider: string;
  accountId?: string | null;
  providerCustomerId?: string | null;
};

type CustomerRow = {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  document?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  providers: ProviderInfo[];
  txTotal: number;
  txPaid: number;
};

export default function BusinessCustomersPage() {
  const { currentClinic } = useClinic();
  const [items, setItems] = useState<CustomerRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [total, setTotal] = useState<number>(0);
  const pageSize = 20;
  const router = useRouter();

  useEffect(() => {
    const load = async (p = 1) => {
      if (!currentClinic?.id) return;
      try {
        setIsLoading(true);
        const res = await fetch(`/api/business/customers?clinicId=${encodeURIComponent(currentClinic.id)}&page=${p}&page_size=${pageSize}&complete=1`, { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          const data: CustomerRow[] = Array.isArray(json?.data) ? json.data : [];
          setItems(data);
          setTotal(Number(json?.pagination?.total || data.length));
          setPage(p);
        } else {
          setItems([]);
          setTotal(0);
        }
      } finally {
        setIsLoading(false);
      }
    };
    load(page);
  }, [currentClinic?.id, page]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q) ||
      (c.document || '').toLowerCase().includes(q)
    );
  }, [items, search]);

  const totalPages = Math.max(1, Math.ceil((total || filtered.length) / pageSize));

  if (!currentClinic) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="lg:ml-64"><div className="p-4 pt-[88px]">Select a clinic to view customers</div></div>
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
                <h1 className="text-[20px] font-semibold text-gray-900 tracking-[-0.01em]">Customers</h1>
              </div>
              <div className="w-full max-w-sm">
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search customers..."
                    className="block w-full h-10 rounded-xl border border-gray-200 bg-white pl-10 pr-3 text-[14px] text-gray-900 shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-visible rounded-2xl border border-gray-200 bg-white/70 backdrop-blur-sm shadow-sm">
            <table className="min-w-full">
              <thead className="bg-gray-50/80">
                <tr className="text-left text-xs text-gray-600">
                  <th className="py-3.5 pl-4 pr-3 font-medium sm:pl-6">Name</th>
                  <th className="px-3 py-3.5 font-medium">Email</th>
                  <th className="px-3 py-3.5 font-medium">Phone</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr><td colSpan={3} className="px-4 py-6 text-sm text-gray-500">Loading...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={3} className="px-4 py-6 text-sm text-gray-500">No customers</td></tr>
                ) : (
                  filtered.map((c) => (
                    <tr
                      key={c.id}
                      className="hover:bg-gray-50/60 cursor-pointer"
                      onDoubleClick={() => router.push(`/business/clients/${c.id}`)}
                    >
                      <td className="whitespace-nowrap py-3.5 pl-4 pr-3 text-sm text-gray-900 sm:pl-6">
                        <span className="hover:underline cursor-pointer select-none" onClick={(e) => { e.stopPropagation(); router.push(`/business/clients/${c.id}`); }}>{c.name || '-'}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-sm text-gray-700">{c.email || '-'}</td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-sm text-gray-700">{c.phone || '-'}</td>
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
                <Button variant="outline" size="sm" className="h-8 text-gray-700 hover:bg-gray-50" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                  <ChevronLeftIcon className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="sm" className="h-8 text-gray-700 hover:bg-gray-50" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                  <ChevronRightIcon className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">{title}</div>
      <div className="rounded-xl border border-gray-200">
        {children}
      </div>
    </div>
  );
}
