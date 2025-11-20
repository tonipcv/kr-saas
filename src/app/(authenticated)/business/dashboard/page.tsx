'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useClinic } from '@/contexts/clinic-context';
import TransactionsTable from '@/components/business/TransactionsTable';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const ApexChart = dynamic(() => import('react-apexcharts'), { ssr: false }) as any;

type TxRow = {
  id: string;
  provider_order_id: string | null;
  provider_charge_id: string | null;
  doctor_id: string | null;
  doctor_name?: string | null;
  patient_profile_id: string | null;
  patient_name?: string | null;
  patient_email?: string | null;
  clinic_id: string | null;
  clinic_name?: string | null;
  product_id: string | null;
  product_name?: string | null;
  amount_cents: number | null;
  currency: string | null;
  installments: number | null;
  payment_method_type: string | null;
  status: string | null;
  created_at: string | Date | null;
  raw_payload?: any;
};

type RevenueSummary = {
  total: number;
  purchasesCount: number;
  aov: number;
};

function RevenueLineChart({ series, height = 220 }: { series: Array<[number, number]>; height?: number }) {
  const hasData = Array.isArray(series) && series.length > 0;
  const data = useMemo(() => {
    if (!hasData) return [];
    return series.map(([t, v]) => ({ x: new Date(t).getTime(), y: Math.max(0, Number(v) || 0) }));
  }, [series, hasData]);

  const options = useMemo(() => ({
    chart: { type: 'area', animations: { enabled: true, easing: 'easeinout', speed: 400 }, toolbar: { show: false }, zoom: { enabled: false } },
    stroke: { curve: 'smooth', width: 3 },
    colors: ['#16A34A'],
    fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.1, stops: [0, 90, 100] } },
    grid: { borderColor: '#E5E7EB', strokeDashArray: 4, xaxis: { lines: { show: false } }, yaxis: { lines: { show: true } } },
    xaxis: { type: 'datetime', labels: { style: { colors: '#6B7280', fontSize: '11px' }, datetimeUTC: false }, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { labels: { style: { colors: '#6B7280', fontSize: '11px' }, formatter: (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val || 0) }, min: 0, forceNiceScale: true },
    dataLabels: { enabled: false }, markers: { size: 0, hover: { size: 4 } }, tooltip: { x: { format: 'dd/MM/yyyy' }, y: { formatter: (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0) } }, legend: { show: false }
  }), []);

  if (!hasData || data.length === 0) {
    return <div className="flex items-center justify-center text-sm text-gray-500" style={{ height: `${height}px` }}>No data for the period</div>;
  }

  return <ApexChart type="area" height={height} options={options} series={[{ name: 'Revenue', data }]} />;
}

function DonutBreakdown({ title, data, palette }: { title: string; data: Array<[string, number]>; palette?: string[] }) {
  const labels = useMemo(() => data.map(([k]) => k), [data]);
  const values = useMemo(() => data.map(([, v]) => Number(v) || 0), [data]);
  const hasData = values.some((v) => v > 0);
  const defaultPalette = palette && palette.length ? palette : ['#16A34A', '#F59E0B', '#EF4444', '#60A5FA', '#A78BFA', '#10B981', '#F472B6'];

  const options = useMemo(() => ({
    chart: { type: 'donut' },
    labels,
    colors: defaultPalette,
    legend: { show: true, position: 'right', fontSize: '12px', labels: { colors: '#6B7280' }, markers: { width: 10, height: 10, radius: 12 } },
    dataLabels: { enabled: false },
    stroke: { width: 0 },
    plotOptions: { pie: { donut: { size: '68%' }, expandOnClick: false } },
    tooltip: { enabled: true },
  }), [labels, defaultPalette]);

  return (
    <div>
      <div className="text-sm font-medium text-gray-900 mb-2">{title}</div>
      {hasData ? (
        <ApexChart type="donut" height={240} series={values} options={options as any} />
      ) : (
        <div className="h-[220px] flex items-center justify-center text-sm text-gray-500">No data</div>
      )}
    </div>
  );
}

export default function BusinessDashboard() {
  const { data: session } = useSession();
  const { currentClinic, isLoading } = useClinic();
  const router = useRouter();
  const [paymentsReady, setPaymentsReady] = useState<boolean | null>(null);
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });
  const [dateTo, setDateTo] = useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });
  const [summary, setSummary] = useState<RevenueSummary>({ total: 0, purchasesCount: 0, aov: 0 });
  const [seriesApi, setSeriesApi] = useState<Array<[number, number]>>([]);
  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const pageLoading = useMemo(() => {
    return isLoading || loading || paymentsReady === null || !currentClinic;
  }, [isLoading, loading, paymentsReady, currentClinic]);

  useEffect(() => {
    const load = async () => {
      if (!session || !currentClinic?.id) return;
      setLoading(true);
      try {
        const qs = new URLSearchParams({ clinicId: currentClinic.id, from: dateFrom, to: dateTo });
        const [revRes, revSeriesRes, txRes] = await Promise.all([
          fetch(`/api/business/revenue?${qs.toString()}`, { cache: 'no-store' }),
          fetch(`/api/business/revenue/series?${qs.toString()}`, { cache: 'no-store' }),
          fetch(`/api/business/transactions?${qs.toString()}&limit=100`, { cache: 'no-store' }),
        ]);
        if (revRes.ok) {
          const rj = await revRes.json();
          setSummary({
            total: Number(rj?.data?.total || 0) || 0,
            purchasesCount: Number(rj?.data?.purchasesCount || 0) || 0,
            aov: Number(rj?.data?.aov || 0) || 0,
          });
        }
        if (revSeriesRes.ok) {
          const sj = await revSeriesRes.json();
          const arr = Array.isArray(sj?.data?.series) ? sj.data.series : [];
          setSeriesApi(arr);
        }
        if (txRes.ok) {
          const tj = await txRes.json();
          const items: TxRow[] = Array.isArray(tj?.data?.items) ? tj.data.items : (Array.isArray(tj?.items) ? tj.items : []);
          setTransactions(items);
        }
      } catch (e) {
        console.error('Failed to load business dashboard', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [session, currentClinic, dateFrom, dateTo]);

  // Check payment integration readiness; if not ready, redirect to waiting list
  useEffect(() => {
    const checkPayments = async () => {
      if (!currentClinic?.id) return;
      try {
        const res = await fetch(`/api/payments/pagarme/config/status?clinic_id=${encodeURIComponent(currentClinic.id)}`, { cache: 'no-store' });
        const js = await res.json().catch(() => ({}));
        const ready = res.ok && js?.ready_for_production === true;
        setPaymentsReady(ready);
      } catch {
        setPaymentsReady(false);
      }
    };
    if (currentClinic?.id) checkPayments();
  }, [currentClinic?.id, router]);

  const formatBRL = (amount: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount || 0);

  // Build daily revenue series from transactions for the selected period
  const revenueSeries = useMemo(() => {
    try {
      const fromD = new Date(dateFrom + 'T00:00:00');
      const toD = new Date(dateTo + 'T23:59:59');
      const dayMs = 24 * 60 * 60 * 1000;
      const start = new Date(fromD.getFullYear(), fromD.getMonth(), fromD.getDate()).getTime();
      const end = new Date(toD.getFullYear(), toD.getMonth(), toD.getDate()).getTime();
      // Prefer API series from purchases if available
      if (Array.isArray(seriesApi) && seriesApi.length) {
        const buckets = new Map<number, number>();
        for (let t = start; t <= end; t += dayMs) buckets.set(t, 0);
        for (const [t, v] of seriesApi) {
          if (t < start || t > end) continue;
          const key = new Date(new Date(t).getFullYear(), new Date(t).getMonth(), new Date(t).getDate()).getTime();
          if (!buckets.has(key)) continue;
          const val = Number(v) || 0;
          if (Number.isFinite(val)) buckets.set(key, (buckets.get(key) || 0) + val);
        }
        return Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]);
      }
      const buckets = new Map<number, number>();
      for (let t = start; t <= end; t += dayMs) buckets.set(t, 0);
      for (const t of transactions) {
        if (!t?.created_at) continue;
        const d = new Date(t.created_at as any);
        const key = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        if (!buckets.has(key)) continue;
        // Prefer clinic_amount_cents; fallback to amount_cents - platform_amount_cents; else amount_cents
        const hasClinic = typeof (t as any).clinic_amount_cents === 'number';
        const hasPlatform = typeof (t as any).platform_amount_cents === 'number';
        const hasAmount = typeof (t as any).amount_cents === 'number';
        const fallback = hasAmount && hasPlatform ? ((t as any).amount_cents as number) - ((t as any).platform_amount_cents as number) : undefined;
        const cents = hasClinic 
          ? ((t as any).clinic_amount_cents as number)
          : (typeof fallback === 'number' ? fallback : ((t as any).amount_cents as number) || 0);
        const val = Number(cents) / 100;
        if (Number.isFinite(val)) buckets.set(key, (buckets.get(key) || 0) + val);
      }
      return Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]);
    } catch {
      return [] as Array<[number, number]>;
    }
  }, [seriesApi, transactions, dateFrom, dateTo]);

  // Breakdowns (normalized)
  const normalizeMethod = (raw?: string | null) => {
    const k = String(raw || '—').toUpperCase();
    if (k === 'PIX') return 'PIX';
    if (k === 'BOLETO' || k === 'BANK_SLIP') return 'Boleto';
    if (k === 'CREDIT_CARD' || k === 'CARD') return 'Cartão';
    return k || '—';
  };
  const normalizeStatus = (raw?: string | null) => {
    const k = String(raw || '—').toUpperCase();
    if (k === 'CANCELLED') return 'CANCELED';
    if (k === 'REFUSED') return 'FAILED';
    if (k === 'ACTIVE') return 'PENDING';
    return k || '—';
  };
  const methodBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of transactions) {
      const key = normalizeMethod(t.payment_method_type);
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a,b)=>b[1]-a[1]);
  }, [transactions]);
  const statusBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of transactions) {
      const key = normalizeStatus(t.status);
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a,b)=>b[1]-a[1]);
  }, [transactions]);

  const visibleCount = 10;
  const visibleTransactions = useMemo(() => transactions.slice(0, visibleCount), [transactions]);
  // Disable redirect when no clinic is selected
  useEffect(() => {
    return;
  }, [isLoading, currentClinic, router]);
  // Keep rendering and use overlay while loading to avoid flicker and partially rendered navigation

  // Locale-aware strings for the access gating modal
  const isPT = typeof navigator !== 'undefined' && navigator.language && navigator.language.toLowerCase().startsWith('pt');
  const i18n = {
    title: isPT ? 'Complete seu cadastro' : 'Complete your registration',
    description: isPT
      ? 'Para acessar o dashboard, finalize seu cadastro com os dados do negócio e documentos necessários.'
      : 'To access the dashboard, please complete your onboarding with business details and required documents.',
    primary: isPT ? 'Preencher dados' : 'Fill details',
    secondary: isPT ? 'Sair' : 'Sign out',
  };

  return (
    <div className="min-h-screen bg-white">
      {pageLoading && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/95">
          <div className="flex flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={currentClinic?.logo || "/logo.png"} alt="Clinic" className="h-8 w-auto object-contain opacity-80" />
            <div className="h-6 w-6 rounded-full border-2 border-gray-300 border-t-transparent animate-spin" />
          </div>
        </div>
      )}
      {/* Access gating modal disabled */}
      <Dialog open={false} onOpenChange={() => { /* disabled */ }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{i18n.title}</DialogTitle>
            <DialogDescription>
              {i18n.description}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-start">
            <div className="flex gap-2">
              <Link href="/business/merchant-application" className="w-full">
                <Button className="w-full">{i18n.primary}</Button>
              </Link>
              <Link href="/auth/signout" className="w-full">
                <Button variant="outline" className="w-full">{i18n.secondary}</Button>
              </Link>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24 bg-gray-50">
          {/* Header */}
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h1 className="text-[20px] font-semibold text-gray-900 tracking-tight">Dashboard</h1>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-8 rounded-md border border-gray-300 bg-white px-2 text-sm"
              />
              <span className="text-gray-500 text-sm">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-8 rounded-md border border-gray-300 bg-white px-2 text-sm"
              />
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-3">
              <div className="text-[11px] text-gray-500">Revenue</div>
              <div className="text-[22px] font-semibold text-gray-900">{formatBRL(summary.total)}</div>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-3">
              <div className="text-[11px] text-gray-500">Transactions</div>
              <div className="text-[22px] font-semibold text-gray-900">{summary.purchasesCount}</div>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-3">
              <div className="text-[11px] text-gray-500">Average order value</div>
              <div className="text-[22px] font-semibold text-gray-900">{formatBRL(summary.aov)}</div>
            </div>
          </div>

          {/* Chart full width + Breakdowns below */}
          <div className="space-y-3 mb-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium text-gray-900">Revenue per day</div>
                <div className="text-xs text-gray-500">{revenueSeries.length} days</div>
              </div>
              <RevenueLineChart series={revenueSeries} height={260} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-2xl border border-gray-200 bg-white p-3">
                <DonutBreakdown title="Methods" data={methodBreakdown} palette={["#22C55E", "#60A5FA", "#F59E0B", "#9CA3AF"]} />
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-3">
                <DonutBreakdown title="Status" data={statusBreakdown} palette={["#16A34A", "#F59E0B", "#EF4444", "#93C5FD", "#A78BFA"]} />
              </div>
            </div>
          </div>

          {/* Recent transactions */}
          <div className="rounded-2xl border border-gray-200 bg-white p-3">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-medium text-gray-900">Recent transactions</div>
                <div className="text-xs text-gray-500">Showing {Math.min(transactions.length, visibleCount)} of {transactions.length}</div>
              </div>
              <Link
                href="/business/payments"
                className="inline-flex items-center h-8 px-3 rounded-md text-xs font-medium bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              >View more</Link>
            </div>
            <TransactionsTable transactions={visibleTransactions as any} />
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniLineChart({ series, height = 140 }: { series: Array<[number, number]>; height?: number }) {
  const width = 640; // fixed container width; SVG will scale in CSS if needed
  // Apply sqrt transform to reduce outlier domination and reveal smaller variations
  const rawValues = series.map(([, v]) => Math.max(0, Number(v) || 0));
  const values = rawValues.map((v) => Math.sqrt(v));
  const tvals = series.map(([t]) => t);
  const minVraw = values.length ? Math.min(...values) : 0;
  const maxVraw = values.length ? Math.max(...values) : 1;
  const pad = (maxVraw - minVraw) * 0.1; // 10% padding
  const minV = minVraw - pad;
  const maxV = maxVraw + pad || 1;
  const minT = tvals.length ? tvals[0] : 0;
  const maxT = tvals.length ? tvals[tvals.length - 1] : 1;
  const scaleX = (t: number) => {
    if (maxT === minT) return 0;
    return ((t - minT) / (maxT - minT)) * width;
  };
  const scaleY = (vTransformed: number) => {
    if (maxV === minV) return height / 2;
    return height - ((vTransformed - minV) / (maxV - minV)) * height;
  };
  const path = useMemo(() => {
    if (!series.length) return '';
    const pts = series.map(([t, v], i) => {
      const vt = Math.sqrt(Math.max(0, Number(v) || 0));
      return `${i === 0 ? 'M' : 'L'} ${scaleX(t)},${scaleY(vt)}`;
    }).join(' ');
    return pts;
  }, [series, minV, maxV, minT, maxT]);
  const gridY = 4;
  const gridLines = Array.from({ length: gridY + 1 }, (_, i) => Math.round((i / gridY) * height));
  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[140px]">
        {/* grid */}
        {gridLines.map((y) => (
          <line key={y} x1={0} x2={width} y1={y} y2={y} stroke="#E5E7EB" strokeWidth={1} />
        ))}
        {/* line */}
        <path d={path} fill="none" stroke="#111827" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function BreakdownList({ title, data, colors }: { title: string; data: Array<[string, number]>; colors?: string[] }) {
  const values = useMemo(() => data.map(([, v]) => v), [data]);
  const max = useMemo(() => (values.length ? Math.max(...values) : 0), [values]);
  return (
    <div>
      <div className="text-sm font-medium text-gray-900 mb-2">{title}</div>
      <div className="space-y-2">
        {data.length === 0 ? (
          <div className="text-sm text-gray-500">Sem dados</div>
        ) : (
          data.map(([label, v], idx) => {
            const pct = max > 0 ? Math.max(6, Math.round((v / max) * 100)) : 0; // min 6% for visibility
            const barColor = colors && colors[idx] ? colors[idx] : '#111827';
            return (
              <div key={label} className="text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-700">{label}</span>
                  <span className="text-gray-900 font-medium">{v}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-gray-100">
                  <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
