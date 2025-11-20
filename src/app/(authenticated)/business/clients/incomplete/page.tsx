'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useClinic } from '@/contexts/clinic-context';
import { useRouter } from 'next/navigation';

type CustomerRow = {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  document?: string | null;
};

export default function IncompleteCustomersPage() {
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
        const res = await fetch(`/api/business/customers?clinicId=${encodeURIComponent(currentClinic.id)}&page=${p}&page_size=${pageSize}&incomplete=1`, { cache: 'no-store' });
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
            <div className="flex items-center justify-between gap-3">
              <div>
                <h1 className="text-[20px] font-semibold text-gray-900 tracking-[-0.01em]">Incomplete Customers</h1>
                <p className="text-sm text-gray-500 mt-1">Missing name, email or phone</p>
              </div>
              <div className="flex items-center">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search..."
                  className="h-8 w-52 px-2 rounded-md border border-gray-200 text-[13px] bg-white shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/5"
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-3">
            <div className="flex items-center justify-end mb-2">
              <div className="text-xs text-gray-500">Total: {total || filtered.length}</div>
            </div>

            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50/80 text-xs text-gray-600">
                  <tr>
                    <th className="px-2 py-2 text-left">Name</th>
                    <th className="px-2 py-2 text-left">Email</th>
                    <th className="px-2 py-2 text-left">Phone</th>
                    <th className="px-2 py-2 text-left">Document</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {isLoading ? (
                    <tr><td colSpan={4} className="px-3 py-6 text-gray-500">Loading...</td></tr>
                  ) : (
                    filtered.length === 0 ? (
                      <tr><td colSpan={4} className="px-3 py-6 text-gray-500">No customers</td></tr>
                    ) : (
                      filtered.map((c) => (
                        <tr
                          key={c.id}
                          className="hover:bg-gray-50/70 cursor-pointer"
                          onDoubleClick={() => router.push(`/business/clients/${c.id}`)}
                        >
                          <td className="px-2 py-2">{c.name || '-'}</td>
                          <td className="px-2 py-2">{c.email || '-'}</td>
                          <td className="px-2 py-2">{c.phone || '-'}</td>
                          <td className="px-2 py-2">{c.document || '-'}</td>
                        </tr>
                      ))
                    )
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between mt-3">
              <div className="text-xs text-gray-500">Page {page} of {totalPages}</div>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm disabled:opacity-50">Prev</button>
                <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm disabled:opacity-50">Next</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
