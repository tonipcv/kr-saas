"use client";

import { useEffect, useMemo, useState } from "react";
import { formatISO, subDays } from "date-fns";
import { useClinic } from "@/contexts/clinic-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
 

interface MetricBucket {
  date: string;
  total: number;
  byType: Record<string, number>;
}

interface MetricsResponse {
  success: boolean;
  summary: { total: number; byType: Record<string, number> };
  series: MetricBucket[];
  window: { from: string; to: string; groupBy: string };
}

interface RecentEventRow {
  id: string;
  eventType: string;
  actor: string;
  timestamp: string;
  customerId: string | null;
  metadata: any;
}

export default function DoctorEventsPage() {
  const { currentClinic } = useClinic();
  const clinicId = currentClinic?.id || "";

  const [from, setFrom] = useState<string>(() => formatISO(subDays(new Date(), 30)));
  const [to, setTo] = useState<string>(() => formatISO(new Date()));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MetricsResponse | null>(null);
  // Recent events
  const [recent, setRecent] = useState<RecentEventRow[]>([]);
  const [recentLimit, setRecentLimit] = useState<number>(50);
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentError, setRecentError] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (clinicId) params.set("clinicId", clinicId);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    params.set("groupBy", "day");
    return `/api/events/metrics?${params.toString()}`;
  }, [clinicId, from, to]);

  useEffect(() => {
    let mounted = true;
    async function run() {
      if (!clinicId) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(query, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: MetricsResponse = await res.json();
        if (mounted) setData(json);
      } catch (e: any) {
        if (mounted) setError(e?.message || "Failed to load metrics");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    run();
    return () => { mounted = false; };
  }, [query, clinicId]);

  // Load recent events list
  useEffect(() => {
    let mounted = true;
    async function run() {
      if (!clinicId) return;
      setRecentLoading(true);
      setRecentError(null);
      try {
        const url = `/api/events/recent?clinicId=${encodeURIComponent(clinicId)}&limit=${recentLimit}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (mounted) setRecent(Array.isArray(json?.data) ? json.data : []);
      } catch (e: any) {
        if (mounted) setRecentError(e?.message || "Failed to load recent events");
      } finally {
        if (mounted) setRecentLoading(false);
      }
    }
    run();
    return () => { mounted = false; };
  }, [clinicId, recentLimit]);

  

  const topTypes = useMemo(() => {
    const map = data?.summary?.byType || {};
    return Object.entries(map)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
      .slice(0, 8);
  }, [data]);

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24 bg-gray-50">

          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">Events</h1>
              <p className="text-xs text-gray-500">Key metrics for the selected clinic</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="datetime-local"
                value={from.slice(0, 16)}
                onChange={(e) => setFrom(new Date(e.target.value).toISOString())}
                className="h-8 rounded-lg border border-gray-300 bg-white px-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
              <span className="text-gray-400">→</span>
              <input
                type="datetime-local"
                value={to.slice(0, 16)}
                onChange={(e) => setTo(new Date(e.target.value).toISOString())}
                className="h-8 rounded-lg border border-gray-300 bg-white px-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
              <Button variant="outline" size="sm" className="h-8 border-gray-300 text-gray-800" onClick={() => { setFrom(formatISO(subDays(new Date(), 30))); setTo(formatISO(new Date())); }}>Last 30d</Button>
            </div>
          </div>

          {!clinicId && (
            <div className="mb-4 rounded-2xl px-4 py-3 text-gray-700 bg-white border border-gray-200 shadow-sm">
              Select a clinic to load metrics.
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-2xl px-4 py-3 text-red-700 bg-red-50 border border-red-200 shadow-sm text-sm">{error}</div>
          )}

          {/* KPI pills */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-gray-500">Total events</span>
                <span className="text-[10px] text-gray-400">{from.slice(0,10)} → {to.slice(0,10)}</span>
              </div>
              <div className="mt-1 text-[22px] leading-7 font-semibold text-gray-900">{loading ? '…' : (data?.summary?.total ?? 0)}</div>
            </div>
            {topTypes.map(([type, count]) => (
              <div key={type} className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-gray-500">{type}</span>
                  <span className="text-[10px] text-gray-400">events</span>
                </div>
                <div className="mt-1 text-[22px] leading-7 font-semibold text-gray-900">{count}</div>
              </div>
            ))}
          </div>

          {/* Daily Activity */}
          <Card className="bg-white border border-gray-200 shadow-sm rounded-2xl">
            <CardHeader className="px-4 py-3 border-b border-gray-100">
              <CardTitle className="text-sm font-semibold text-gray-900">Daily activity</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-3">
              {loading ? (
                <div className="text-sm text-gray-500">Loading…</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500">
                        <th className="py-2 pr-4">Date</th>
                        <th className="py-2 pr-4">Total</th>
                        <th className="py-2">Top types</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.series || []).map((b) => {
                        const sorted = Object.entries(b.byType || {}).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).slice(0, 4);
                        return (
                          <tr key={b.date} className="border-t">
                            <td className="py-2 pr-4">{new Date(b.date).toLocaleDateString()}</td>
                            <td className="py-2 pr-4 font-medium">{b.total}</td>
                            <td className="py-2">
                              <div className="flex flex-wrap gap-2">
                                {sorted.map(([t, c]) => (
                                  <span key={t} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700">
                                    {t}: {c}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {(!data?.series || data.series.length === 0) && (
                        <tr>
                          <td className="py-6 text-gray-500" colSpan={3}>No data for the selected period.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Events */}
          <Card className="mt-3 bg-white border border-gray-200 shadow-sm rounded-2xl">
            <CardHeader className="px-4 py-3 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-gray-900">Recent events</CardTitle>
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <span>Limit</span>
                  <select
                    className="h-8 rounded-lg border border-gray-300 bg-white px-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300"
                    value={recentLimit}
                    onChange={(e) => setRecentLimit(Number(e.target.value) || 50)}
                  >
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-3">
              {recentError && (
                <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{recentError}</div>
              )}
              {recentLoading ? (
                <div className="text-sm text-gray-500">Loading…</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500">
                        <th className="py-2 pr-4">Timestamp</th>
                        <th className="py-2 pr-4">Type</th>
                        <th className="py-2 pr-4">Actor</th>
                        <th className="py-2 pr-4">Customer</th>
                        <th className="py-2">Metadata</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((ev) => (
                        <tr key={ev.id} className="border-t align-top">
                          <td className="py-2 pr-4 whitespace-nowrap">{new Date(ev.timestamp).toLocaleString()}</td>
                          <td className="py-2 pr-4 font-medium text-gray-900">{ev.eventType}</td>
                          <td className="py-2 pr-4">{ev.actor}</td>
                          <td className="py-2 pr-4">{ev.customerId || '—'}</td>
                          <td className="py-2">
                            <pre className="max-h-40 overflow-auto rounded-md border border-gray-200 bg-gray-50 p-2 text-xs text-gray-800">
{JSON.stringify(ev.metadata ?? {}, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      ))}
                      {recent.length === 0 && (
                        <tr>
                          <td className="py-6 text-gray-500" colSpan={5}>No events found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

        </div>
      </div>
      
    </div>
  );
}
