'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

export default function AdminPaymentsSetupPage() {
  const search = useSearchParams();
  const router = useRouter();
  const qsClinicId = search.get('clinicId');
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const selected = qsClinicId || (typeof window !== 'undefined' ? localStorage.getItem('selectedClinicId') : null);
    if (selected) setClinicId(selected);
  }, [qsClinicId]);

  const fetchStatus = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/payments/pagarme/config/status?clinic_id=${encodeURIComponent(id)}`, { cache: 'no-store' });
      const js = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(js?.message || js?.error || 'Failed to fetch status');
      }
      setStatus(js);
    } catch (e: any) {
      setError(e?.message || 'Unknown error');
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (clinicId) fetchStatus(clinicId);
  }, [clinicId]);

  const isReady = Boolean(status?.ready_for_production);
  const issues: string[] = Array.isArray(status?.issues) ? status.issues : [];

  return (
    <div className="min-h-screen bg-white">
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24 bg-gray-50">
          <div className="flex flex-col gap-3 mb-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div>
                <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">Payments integration</h1>
                <p className="text-gray-600 mt-0.5 text-sm">Configure Pagar.me for the selected business</p>
              </div>
              <div className="flex gap-2">
                <Link href="/admin/clinics" className="inline-flex items-center h-8 px-3 rounded-full border border-gray-200 bg-white text-gray-800 hover:bg-white hover:text-gray-900 text-xs font-medium">Back to Manage Business</Link>
              </div>
            </div>
          </div>

          <div className="grid gap-3">
            {!clinicId && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                No clinic selected. Open Manage Business and click Integrate on a row.
              </div>
            )}

            {clinicId && (
              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-gray-500">Clinic ID</div>
                    <div className="text-sm font-medium text-gray-900">{clinicId}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="h-8 px-3 rounded-full bg-white border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      onClick={() => clinicId && fetchStatus(clinicId)}
                    >
                      {loading ? 'Checking…' : 'Recheck status'}
                    </button>
                    <button
                      className="h-8 px-3 rounded-full bg-black text-white text-xs font-medium hover:bg-gray-900"
                      onClick={() => router.push(`/business/integrations/pagarme/setup?clinicId=${encodeURIComponent(clinicId)}`)}
                    >
                      Open Pagar.me setup
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="text-[11px] font-medium text-gray-500">Status</div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">
                      {loading ? 'Checking…' : isReady ? 'Integrated' : 'Not integrated'}
                    </div>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="text-[11px] font-medium text-gray-500">API version</div>
                    <div className="mt-1 text-sm text-gray-900">{String(status?.api_version?.status || '-')}</div>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="text-[11px] font-medium text-gray-500">Split enabled</div>
                    <div className="mt-1 text-sm text-gray-900">{String(status?.split_enabled ?? '-')}</div>
                  </div>
                </div>

                {error && (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
                )}

                {!loading && !isReady && issues.length > 0 && (
                  <div className="mt-4 rounded-xl border border-yellow-200 bg-yellow-50 p-4">
                    <div className="text-sm font-semibold text-yellow-900">Issues to fix</div>
                    <ul className="mt-2 list-disc list-inside text-sm text-yellow-900">
                      {issues.map((i, idx) => (
                        <li key={idx}>{i}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-4 text-xs text-gray-500">
                  This admin flow lets you diagnose and start the setup. The Pagar.me onboarding form itself opens in the business integrations page.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
