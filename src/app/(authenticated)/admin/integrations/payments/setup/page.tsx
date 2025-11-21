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
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [recipientId, setRecipientId] = useState<string>('');
  const [splitPercent, setSplitPercent] = useState<string>('');
  const [platformFeeBps, setPlatformFeeBps] = useState<string>('');
  const [verifying, setVerifying] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [verifySummary, setVerifySummary] = useState<any>(null);
  const [merchant, setMerchant] = useState<any>(null);

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

  // Load current merchant for this clinic and prefill fields
  useEffect(() => {
    const run = async () => {
      if (!clinicId) return;
      try {
        const res = await fetch(`/api/admin/integrations/merchant/by-clinic?clinicId=${encodeURIComponent(clinicId)}`, { cache: 'no-store' });
        const js = await res.json().catch(() => ({}));
        if (res.ok && js?.exists) {
          setMerchant(js);
          // Prefill only if user hasn't typed yet
          if (!recipientId) setRecipientId(js?.recipientId || '');
          if (!splitPercent) setSplitPercent(js?.splitPercent != null ? String(js.splitPercent) : '');
          if (!platformFeeBps) setPlatformFeeBps(js?.platformFeeBps != null ? String(js.platformFeeBps) : '');
        } else {
          setMerchant(null);
        }
      } catch {
        setMerchant(null);
      }
    };
    run();
  }, [clinicId]);

  const isReady = Boolean(status?.ready_for_production);
  const issues: string[] = Array.isArray(status?.issues) ? status.issues : [];
  const issuesCount = issues.length;

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

                {!loading && status?.message && (
                  <div className={`mt-4 rounded-xl p-3 text-sm ${isReady ? 'border-green-200 bg-green-50 text-green-800' : 'border-yellow-200 bg-yellow-50 text-yellow-900'} border`}>
                    {status.message}
                  </div>
                )}

                {/* Always show current merchant (if exists) */}
                {merchant && (
                  <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs text-gray-800">
                    <div className="text-sm font-semibold text-gray-900 mb-2">Current merchant</div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <div>
                        <div className="text-[11px] text-gray-600">Recipient ID</div>
                        <div className="font-mono break-all">{merchant.recipientId || '-'}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-gray-600">Split %</div>
                        <div>{merchant.splitPercent ?? '-'}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-gray-600">Platform fee bps</div>
                        <div>{merchant.platformFeeBps ?? '-'}</div>
                      </div>
                    </div>
                  </div>
                )}
                {!merchant && (
                  <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs text-gray-700">
                    No merchant record found for this clinic yet. Use "Set recipient" below to create/update it.
                  </div>
                )}

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

                {!loading && !isReady && (
                  <div className="mt-4 space-y-3">
                    <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
                      <div className="text-sm font-semibold text-yellow-900">{`✗ ${issuesCount} issue(s) found. Fix these before enabling split in production.`}</div>
                      {issuesCount > 0 && (
                        <ul className="mt-2 list-disc list-inside text-sm text-yellow-900">
                          {issues.map((i, idx) => (
                            <li key={idx}>{i}</li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Admin quick actions */}
                    <div className="rounded-2xl border border-gray-200 bg-white p-4">
                      <div className="text-sm font-semibold text-gray-900 mb-3">Admin actions</div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600">Recipient ID (re_...)</label>
                          <input value={recipientId} onChange={(e) => setRecipientId(e.target.value)} placeholder="re_..." className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-black focus:outline-none" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600">Split % (optional)</label>
                          <input type="number" inputMode="numeric" value={splitPercent} onChange={(e) => setSplitPercent(e.target.value)} placeholder="80" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-black focus:outline-none" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600">Platform fee bps (optional)</label>
                          <input type="number" inputMode="numeric" value={platformFeeBps} onChange={(e) => setPlatformFeeBps(e.target.value)} placeholder="0" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-black focus:outline-none" />
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          className="h-8 px-3 rounded-full bg-white border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          onClick={async () => {
                            if (!clinicId) return;
                            try {
                              setVerifying(true);
                              setActionErr(null);
                              setActionMsg(null);
                              setVerifySummary(null);
                              const res = await fetch(`/api/admin/merchants/recipient/verify?clinicId=${encodeURIComponent(clinicId)}`);
                              const js = await res.json().catch(() => ({}));
                              if (!res.ok) throw new Error(js?.error || 'Verification failed');
                              setVerifySummary(js?.summary || js);
                              setActionMsg('Current recipient verified successfully.');
                            } catch (e: any) {
                              setActionErr(e?.message || 'Verification error');
                            } finally {
                              setVerifying(false);
                            }
                          }}
                        >
                          {verifying ? 'Verifying…' : 'Verify current recipient'}
                        </button>
                        <button
                          className="h-8 px-3 rounded-full bg-black text-white text-xs font-medium hover:bg-gray-900"
                          onClick={async () => {
                            if (!clinicId) return;
                            if (!recipientId.trim()) { setActionErr('Enter a recipientId'); return; }
                            try {
                              setSaving(true);
                              setActionErr(null);
                              setActionMsg(null);
                              const body: any = { clinicId, recipientId: recipientId.trim(), verify: true };
                              if (splitPercent !== '') body.splitPercent = Number(splitPercent);
                              if (platformFeeBps !== '') body.platformFeeBps = Number(platformFeeBps);
                              const res = await fetch('/api/admin/merchants/recipient/set', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                              const js = await res.json().catch(() => ({}));
                              if (!res.ok) throw new Error(js?.error || 'Failed to set recipient');
                              setActionMsg('Recipient saved. Rechecking status…');
                              await fetchStatus(clinicId);
                            } catch (e: any) {
                              setActionErr(e?.message || 'Save error');
                            } finally {
                              setSaving(false);
                            }
                          }}
                        >
                          {saving ? 'Saving…' : 'Set recipient'}
                        </button>
                      </div>
                      {(actionMsg || actionErr) && (
                        <div className={`mt-3 rounded-lg border p-3 text-xs ${actionErr ? 'border-red-200 bg-red-50 text-red-800' : 'border-green-200 bg-green-50 text-green-800'}`}>
                          {actionErr || actionMsg}
                        </div>
                      )}
                      {verifySummary && (
                        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-800">
                          <div className="font-medium mb-1">Recipient summary</div>
                          <pre className="whitespace-pre-wrap break-words">{JSON.stringify(verifySummary, null, 2)}</pre>
                        </div>
                      )}
                    </div>
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
