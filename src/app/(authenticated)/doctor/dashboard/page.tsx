'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useClinic } from '@/contexts/clinic-context';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  UsersIcon, 
  DocumentTextIcon, 
  PlusIcon,
  ClockIcon,
  CheckCircleIcon,
  UserPlusIcon,
  CalendarDaysIcon,
  ArrowRightIcon,
  CurrencyDollarIcon
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import ProjectionLineChart, { SeriesPoint } from "@/components/charts/ProjectionLineChart";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Patient {
  id: string;
  name?: string;
  email?: string;
  image?: string;
  assignedProtocols: Array<{
    id: string;
    protocol: {
      id: string;
      name: string;
      duration: number;
    };
    startDate: Date;
    endDate: Date;
    isActive: boolean;
  }>;
}

interface Protocol {
  id: string;
  name: string;
  duration: number;
  description?: string;
  isTemplate: boolean;
  assignments: Array<{
    id: string;
    user: {
      id: string;
      name?: string;
      email?: string;
    };
    isActive: boolean;
  }>;
}

interface DashboardStats {
  totalPatients: number;
  activeProtocols: number;
  totalProtocols: number;
  completedToday: number;
  revenueCollected: number;
  referralsCount: number;
  usersCount: number;
  purchasesCount?: number;
  aov?: number;
}

export default function DoctorDashboard() {
  const { data: session } = useSession();
  const router = useRouter();
  const { currentClinic } = useClinic();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalPatients: 0,
    activeProtocols: 0,
    totalProtocols: 0,
    completedToday: 0,
    revenueCollected: 0,
    referralsCount: 0,
    usersCount: 0,
    purchasesCount: 0,
    aov: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [planName, setPlanName] = useState<string | null>(null);
  const [doctorSlug, setDoctorSlug] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [rewardsSummary, setRewardsSummary] = useState<{ configured: number; pending: number; redeemed: number }>({ configured: 0, pending: 0, redeemed: 0 });
  const [showLinksPanel, setShowLinksPanel] = useState(false);
  const [showRegisterQr, setShowRegisterQr] = useState(false);
  const [showQrPanel, setShowQrPanel] = useState(false);
  const [purchases, setPurchases] = useState<any[]>([]);
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

  // Simple skeleton helpers
  const SkeletonLine = ({ className = '' }: { className?: string }) => (
    <div className={`animate-pulse rounded bg-gray-200 ${className}`} />
  );
  const SkeletonBox = ({ className = '' }: { className?: string }) => (
    <div className={`animate-pulse rounded-2xl bg-gray-100 border border-gray-200 ${className}`} />
  );

  useEffect(() => {
    const loadDashboardData = async () => {
      if (!currentClinic) return;
      
      try {
        setIsLoading(true);
        // Kick off all core requests in parallel to avoid waterfall
        const dashboardPromise = fetch(`/api/v2/doctor/dashboard-summary?clinicId=${currentClinic.id}`);
        const patientsPromise = fetch(`/api/patients?clinicId=${currentClinic.id}`);
        const disableProtocols = process.env.NEXT_PUBLIC_DISABLE_PROTOCOLS === '1';
        const protocolsPromise = disableProtocols ? null : fetch(`/api/protocols?clinicId=${currentClinic.id}`);
        const managePromise = fetch(`/api/referrals/manage?page=1&limit=1&clinicId=${encodeURIComponent(currentClinic.id)}`, { cache: 'no-store' });
        // New: purchases for table/aux only; revenue will use server aggregation
        const purchasesPromise = fetch(`/api/purchases?clinicId=${encodeURIComponent(currentClinic.id)}&page_size=100`, { cache: 'no-store' });

        // Non-critical (deferred) requests in parallel, will be processed after first paint
        const kpisPromise = fetch(`/api/v2/doctor/referrals/kpis?clinicId=${currentClinic.id}`, { cache: 'no-store' }).catch(() => null);
        const rewardsPromise = fetch('/api/referrals/rewards').catch(() => null);

        // Await only the core requests for first render
        const [dashboardResponse, patientsResponse, protocolsResponse, manageResponse, purchasesResponse] = await Promise.all([
          dashboardPromise,
          patientsPromise,
          protocolsPromise || Promise.resolve(null as any),
          managePromise,
          purchasesPromise,
        ]);

        let dashboardData: any = { success: false };
        if (dashboardResponse?.ok) {
          dashboardData = await dashboardResponse.json();
        } else if (dashboardResponse) {
          console.error('Error loading dashboard stats:', dashboardResponse.status);
        }

        let patientsData: any[] = [];
        if (patientsResponse?.ok) {
          patientsData = await patientsResponse.json();
        } else if (patientsResponse) {
          console.error('Error loading clients:', patientsResponse.status);
        }

        let protocolsData: any[] = [];
        if (protocolsResponse && (protocolsResponse as Response).ok) {
          protocolsData = await (protocolsResponse as Response).json();
        } else if (protocolsResponse) {
          console.error('Error loading protocols:', (protocolsResponse as Response).status);
        }

        // Transform patients data to match expected format
        const transformedPatients = Array.isArray(patientsData) ? patientsData.map((p: any) => ({
          id: p.id,
          name: p.name,
          email: p.email,
          image: p.image || null,
          assignedProtocols: p.assignedProtocols?.map((protocol: any) => ({
            id: protocol.id,
            protocol: protocol.protocol,
            startDate: protocol.startDate ? new Date(protocol.startDate) : new Date(),
            endDate: protocol.endDate ? new Date(protocol.endDate) : new Date(new Date().setDate(new Date().getDate() + 30)),
            isActive: protocol.isActive
          })) || []
        })) : [];

        // Transform protocols data to match expected format
        const transformedProtocols = Array.isArray(protocolsData) ? protocolsData.map((p: any) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          duration: p.duration || 30,
          isTemplate: p.is_template,
          assignments: p.assignments?.map((assignment: any) => ({
            id: assignment.id,
            user: assignment.user,
            isActive: assignment.isActive
          })) || []
        })) : [];

        setPatients(transformedPatients);
        setProtocols(transformedProtocols);

        // Manage totals (to match /doctor/referrals page): referrals total and obtained value by clinic
        if (manageResponse?.ok) {
          try {
            const manageJson = await manageResponse.json();
            const obtainedValue = Number(manageJson?.stats?.obtainedValue || 0);
            const totalLeads = Number(manageJson?.pagination?.total || 0);
            setStats((prev) => ({
              ...prev,
              referralsCount: totalLeads,
              // Do not overwrite revenueCollected here; authoritative value comes from /api/business/revenue
            }));
          } catch (e) {
            console.error('Failed parsing manage totals', e);
          }
        }

        // Populate recent purchases list (independent from revenue)
        try {
          if (purchasesResponse?.ok) {
            const pr = await purchasesResponse.json();
            const items = Array.isArray(pr?.data?.items) ? pr.data.items : (Array.isArray(pr?.items) ? pr.items : []);
            const fromD = new Date(dateFrom + 'T00:00:00');
            const toD = new Date(dateTo + 'T23:59:59');
            const filtered = items.filter((it: any) => {
              const raw = it?.createdAt || it?.created_at || it?.date;
              const d = new Date(raw);
              return d >= fromD && d <= toD;
            });
            setPurchases(filtered.slice(0, 100));
          }
        } catch (e) {
          console.error('Failed loading purchases list', e);
        }

        // Authoritative revenue aggregation (sum of all sales) via API
        // Note: revenue aggregation is fetched in the date-range effect below to avoid duplicate calls on mount

        // Set dashboard statistics from the dashboard endpoint
        if (dashboardData.success && dashboardData.data) {
          setStats((prev) => ({
            ...prev,
            totalPatients: dashboardData.data.totalPatients,
            activeProtocols: dashboardData.data.activeProtocols,
            totalProtocols: dashboardData.data.totalProtocols,
            completedToday: dashboardData.data.completedToday,
            // Map users to totalPatients
            usersCount: dashboardData.data.totalPatients
          }));
        } else {
          // Fallback to calculated stats if dashboard endpoint fails
          const totalPatients = transformedPatients.length || 0;
          const totalProtocols = transformedProtocols.length || 0;
          const activeProtocols = transformedPatients.reduce(
            (count: number, patient: Patient) => count + patient.assignedProtocols.filter((p: {isActive: boolean}) => p.isActive).length, 
            0
          );
          
          setStats((prev) => ({
            ...prev,
            totalPatients,
            activeProtocols,
            totalProtocols,
            completedToday: 0,
            revenueCollected: prev.revenueCollected || 0,
            referralsCount: prev.referralsCount || 0,
            usersCount: totalPatients
          }));
        }

        // Process deferred requests without blocking first render
        Promise.allSettled([kpisPromise, rewardsPromise]).then(async (results) => {
          const [kpisResSet, rewardsResSet] = results;

          // KPIs
          try {
            const kpisRes = (kpisResSet as PromiseFulfilledResult<Response>)?.value;
            if (kpisRes && kpisRes.ok) {
              const kpisJson = await kpisRes.json();
              const kdata = kpisJson?.success && kpisJson?.data ? kpisJson.data : null;
              if (kdata) {
                const leadsRecebidosNum = Number(kdata.leadsRecebidos);
                const valorGeradoNum = Number(kdata.valorGerado);
                setStats((prev) => ({
                  ...prev,
                  referralsCount: Number.isFinite(leadsRecebidosNum) ? leadsRecebidosNum : prev.referralsCount,
                  // Do not overwrite revenueCollected with KPIs; keep aggregated revenue
                }));
              }
            }
          } catch (e) {
            console.error('Error loading referral KPIs (deferred):', e);
          }

          // Rewards
          try {
            const rewardsRes = (rewardsResSet as PromiseFulfilledResult<Response>)?.value;
            if (rewardsRes && rewardsRes.ok) {
              const rewardsJson = await rewardsRes.json();
              const rewards = Array.isArray(rewardsJson?.rewards) ? rewardsJson.rewards : [];
              const configured = rewards.filter((r: any) => r.isActive).length;
              const pending = rewards.reduce((sum: number, r: any) => sum + (Array.isArray(r.redemptions) ? r.redemptions.filter((rd: any) => rd.status === 'PENDING').length : 0), 0);
              const redeemed = rewards.reduce((sum: number, r: any) => sum + (Array.isArray(r.redemptions) ? r.redemptions.filter((rd: any) => rd.status === 'FULFILLED').length : 0), 0);
              setRewardsSummary({ configured, pending, redeemed });
            }
          } catch (e) {
            console.error('Error loading rewards summary (deferred):', e);
          }

          // Final safety fallback: manage stats (scoped to clinic), only if revenue/referrals still zero
          try {
            if (typeof window !== 'undefined') {
              const needRevenueOrReferrals = (prev: DashboardStats) => !prev.revenueCollected || !prev.referralsCount;
              // lightweight re-check of current stats
              let shouldFetchManage = false;
              setStats((prev) => {
                shouldFetchManage = needRevenueOrReferrals(prev);
                return prev;
              });
              if (shouldFetchManage) {
                const leadsRes = await fetch(`/api/referrals/manage?page=1&limit=1&clinicId=${encodeURIComponent(currentClinic.id)}`, { cache: 'no-store' });
                if (leadsRes.ok) {
                  const leadsJson = await leadsRes.json();
                  const obtainedValue = Number(leadsJson?.stats?.obtainedValue || 0);
                  const totalLeads = Number(leadsJson?.pagination?.total || 0);
                  setStats((prev) => ({
                    ...prev,
                    referralsCount: prev.referralsCount || totalLeads,
                    // Only set revenue if still zero (e.g., revenue API failed)
                    revenueCollected: prev.revenueCollected && prev.revenueCollected > 0 ? prev.revenueCollected : obtainedValue,
                  }));
                }
              }
            }
          } catch (e) {
            console.error('Error computing revenue fallback from manage stats (deferred):', e);
          }
        });

      } catch (error) {
        console.error('Error loading dashboard data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (session) {
      loadDashboardData();
    }
  }, [session, currentClinic]);

  // Load doctor slug for public link
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const res = await fetch('/api/profile');
        if (res.ok) {
          const data = await res.json();
          setDoctorSlug(data?.doctor_slug || null);
        }
      } catch (e) {
        console.error('Error loading profile:', e);
      }
    };
    loadProfile();
  }, [session]);

  // Base domain for multi-tenant subdomains (e.g., zuzz.vu or 127.0.0.1.nip.io)
  const baseDomain = (process.env.NEXT_PUBLIC_APP_BASE_DOMAIN as string) || '';

  // Prefer clinic subdomain; fallback to doctorSlug (legacy)
  const tenantSlug = (currentClinic as any)?.subdomain || doctorSlug || '';

  // Build subdomain URL if base domain is configured; otherwise fallback to path-based
  const buildTenantUrl = (path: string = '/') => {
    if (!tenantSlug) return '';
    if (baseDomain) {
      const proto = typeof window !== 'undefined' ? window.location.protocol : 'https:';
      const port = typeof window !== 'undefined' && window.location.port ? `:${window.location.port}` : '';
      return `${proto}//${tenantSlug}.${baseDomain}${port}${path}`;
    }
    const origin = (process.env.NEXT_PUBLIC_APP_URL as string) || (typeof window !== 'undefined' ? window.location.origin : '');
    return `${origin}/${tenantSlug}${path}`;
  };

  const publicUrl = buildTenantUrl('/');
  const patientLoginUrl = buildTenantUrl('/login');
  const patientRegisterUrl = buildTenantUrl('/register');

  const qrPngUrl = patientRegisterUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=360x360&data=${encodeURIComponent(patientRegisterUrl)}`
    : '';
  const qrLoginPngUrl = patientLoginUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=360x360&data=${encodeURIComponent(patientLoginUrl)}`
    : '';

  const copyPublicUrl = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error('Failed to copy public URL:', e);
    }
  };

  const copyPatientLoginUrl = async () => {
    if (!patientLoginUrl) return;
    try {
      await navigator.clipboard.writeText(patientLoginUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error('Failed to copy patient login URL:', e);
    }
  };

  const copyPatientRegisterUrl = async () => {
    if (!patientRegisterUrl) return;
    try {
      await navigator.clipboard.writeText(patientRegisterUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error('Failed to copy patient register URL:', e);
    }
  };

  // Load subscription to detect Free plan
  useEffect(() => {
    const loadSubscription = async () => {
      try {
        const res = await fetch('/api/subscription/current');
        if (res.ok) {
          const data = await res.json();
          setPlanName(data?.planName || null);
        }
      } catch (e) {
        console.error('Error loading subscription status:', e);
      }
    };
    loadSubscription();
  }, [session]);

  const getPatientInitials = (name?: string) => {
    if (!name) return 'C';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getActiveProtocolForPatient = (patient: Patient) => {
    return patient.assignedProtocols.find(p => p.isActive);
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(amount || 0);

  // Build daily revenue series from purchases for the selected date range (use local calendar days)
  const buildDailyRevenue = () => {
    try {
      const fromD = new Date(dateFrom + 'T00:00:00');
      const toD = new Date(dateTo + 'T23:59:59');
      const dayMs = 24 * 60 * 60 * 1000;
      // Build buckets for each day (start-of-day local time in ms)
      const times: number[] = [];
      const totals: number[] = [];
      for (let t = new Date(fromD.getFullYear(), fromD.getMonth(), fromD.getDate()).getTime(); t <= new Date(toD.getFullYear(), toD.getMonth(), toD.getDate()).getTime(); t += dayMs) {
        times.push(t);
        totals.push(0);
      }
      const idxMap = new Map(times.map((t, i) => [t, i]));
      for (const it of purchases) {
        const raw = String(it?.createdAt || it?.created_at || it?.date || '');
        let keyTime: number | null = null;
        const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) {
          const yy = Number(m[1]);
          const mm = Number(m[2]);
          const dd = Number(m[3]);
          keyTime = new Date(yy, mm - 1, dd).getTime();
        } else {
          const d = new Date(raw || Date.now());
          keyTime = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        }
        if (keyTime == null) continue;
        const idx = idxMap.get(keyTime);
        if (idx == null) continue;
        const val = Number(it?.totalPrice ?? it?.total_price ?? 0);
        if (Number.isFinite(val)) totals[idx] += val;
      }
      return { times, totals };
    } catch {
      return { times: [], totals: [] };
    }
  };

  // Recompute revenue KPIs and refresh purchases when date range changes
  useEffect(() => {
    const refetchRevenue = async () => {
      if (!currentClinic) return;
      try {
        const qs = new URLSearchParams({ clinicId: currentClinic.id, from: dateFrom, to: dateTo });
        const revRes = await fetch(`/api/business/revenue?${qs.toString()}`, { cache: 'no-store' });
        if (revRes.ok) {
          const rjson = await revRes.json();
          const total = Number(rjson?.data?.total ?? 0);
          const purchasesCount = Number(rjson?.data?.purchasesCount ?? 0);
          const aov = Number(rjson?.data?.aov ?? 0);
          setStats((prev) => ({ ...prev, revenueCollected: total, purchasesCount, aov }));
        }
      } catch {}
    };
    const refetchPurchases = async () => {
      if (!currentClinic) return;
      try {
        const prRes = await fetch(`/api/purchases?clinicId=${encodeURIComponent(currentClinic.id)}&page_size=100`, { cache: 'no-store' });
        if (prRes.ok) {
          const pr = await prRes.json();
          const items = Array.isArray(pr?.data?.items) ? pr.data.items : (Array.isArray(pr?.items) ? pr.items : []);
          const fromD = new Date(dateFrom + 'T00:00:00');
          const toD = new Date(dateTo + 'T23:59:59');
          const filtered = items.filter((it: any) => {
            const raw = it?.createdAt || it?.created_at || it?.date;
            const d = new Date(raw);
            return d >= fromD && d <= toD;
          });
          setPurchases(filtered.slice(0, 100));
        }
      } catch {}
    };
    refetchRevenue();
    refetchPurchases();
  }, [dateFrom, dateTo, currentClinic]);

  // Simple sparkline data (replace with real API data when available)
  const referralsTrend = [5, 9, 7, 14, 10, 12, 15];
  const maxY = Math.max(...referralsTrend, 1);
  const minY = Math.min(...referralsTrend, 0);
  const buildPath = (values: number[], width = 100, height = 40) => {
    if (values.length === 0) return '';
    const stepX = width / (values.length - 1 || 1);
    const scaleY = (v: number) => {
      if (maxY === minY) return height / 2;
      return height - ((v - minY) / (maxY - minY)) * height;
    };
    const points = values.map((v, i) => `${i * stepX},${scaleY(v)}`);
    return `M ${points[0]} L ${points.slice(1).join(' ')}`;
  };

  // Professional chart data: build past 30 days + projection 14 days (placeholder; hook to API later)
  const today = new Date();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const daysAgo = (n: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - n).getTime();
  const base: number[] = [0, 30, 0, 0, 360, 180, 0, 0, 210, 0, 0, 0, 1080, 170, 0, 0, 0, 980, 820, 0, 0, 0, 300, 0, 0, 0, 820, 0, 0, 60];
  const [pastSeries, setPastSeries] = useState<SeriesPoint[]>(base.map((v, idx) => [daysAgo(base.length - 1 - idx), v]));
  const lastPast = pastSeries.length ? (pastSeries[pastSeries.length - 1][1] as number) : 0;
  const projLen = 14;
  const projectionSeries: SeriesPoint[] = Array.from({ length: projLen }, (_, i) => {
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate() + (i + 1)).getTime();
    // simple deterministic projection using a gentle upward drift + occasional spike
    const val = Math.max(0, Math.round(lastPast * (1 + 0.03 * (i + 1)) + (i % 7 === 3 ? 300 : 0)));
    return [t, val];
  });

  // Load real referrals time series (client-side aggregation) without changing chart design
  useEffect(() => {
    const loadReferralsSeries = async () => {
      if (!currentClinic) return;
      try {
        const to = new Date();
        const from = new Date(to.getTime() - 30 * oneDayMs);
        const qs = new URLSearchParams({ page: '1', limit: '1000', clinicId: currentClinic.id });
        const res = await fetch(`/api/referrals/manage?${qs.toString()}`, { cache: 'no-store' });
        if (!res.ok) return; // keep placeholder
        const json = await res.json().catch(() => null);
        const items = json?.leads || json?.data?.items || json?.items || [];
        // build empty day buckets [from..to]
        const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
        const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
        const buckets = new Map<number, number>();
        for (let t = start.getTime(); t <= end.getTime(); t += oneDayMs) {
          buckets.set(t, 0);
        }
        // aggregate by calendar date from the record (YYYY-MM-DD), independent of timezone
        for (const it of items) {
          const raw = String(it.createdAt || it.created_at || it.date || it.timestamp || '');
          let keyTime: number | null = null;
          // Try to extract YYYY-MM-DD to avoid timezone shifts
          const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
          if (m) {
            const yy = Number(m[1]);
            const mm = Number(m[2]);
            const dd = Number(m[3]);
            keyTime = new Date(yy, mm - 1, dd).getTime();
          } else {
            const d = new Date(raw || Date.now());
            keyTime = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
          }
          if (keyTime == null) continue;
          if (keyTime < start.getTime() || keyTime > end.getTime()) continue;
          if (buckets.has(keyTime)) buckets.set(keyTime, (buckets.get(keyTime) || 0) + 1);
        }
        const series: SeriesPoint[] = Array.from(buckets.entries()).sort((a,b)=>a[0]-b[0]).map(([t,v]) => [t, v]);
        if (series.length) setPastSeries(series);
      } catch {
        // ignore, keep placeholder series
      }
    };
    loadReferralsSeries();
  }, [currentClinic]);

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24 bg-gray-50">
        
          {/* Header (compact, like KPIs) */}
          <div className="flex flex-col gap-3 mb-4">
            <div className="flex items-center justify-between relative">
              <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">Overview</h1>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => router.push('/doctor/patients?add=1')}
                  className="inline-flex h-8 items-center rounded-full bg-gray-900 px-3 text-xs font-medium text-white hover:bg-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 transition-colors"
                >
                  New client
                </button>
                <button
                  onClick={() => { setShowLinksPanel((v) => !v); if (!showLinksPanel) setShowQrPanel(false); }}
                  className="inline-flex h-8 items-center rounded-full px-3 text-xs font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-300"
                >
                  Your links
                </button>
                <button
                  onClick={() => { setShowQrPanel((v) => !v); if (!showQrPanel) setShowLinksPanel(false); }}
                  className="inline-flex h-8 items-center rounded-full px-3 text-xs font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-300"
                >
                  Your QR Codes
                </button>
              </div>

              {showLinksPanel && (
                <div className="absolute right-0 top-10 z-20 w-[360px] rounded-xl border border-gray-200 bg-white shadow-xl p-4">
                  <p className="text-[11px] text-gray-500 font-medium mb-2">Links públicos</p>
                  <div className="space-y-3">
                    <div>
                      <p className="text-[11px] text-gray-600 mb-1">Login para pacientes</p>
                      <div className="flex items-center gap-2">
                        <code className="block text-[11px] text-gray-900 truncate border border-gray-200 rounded px-2 py-1 bg-gray-50 max-w-[240px]">{patientLoginUrl || 'Defina seu slug no perfil'}</code>
                        {patientLoginUrl && (
                          <>
                            <button onClick={copyPatientLoginUrl} className="text-[11px] text-gray-600 hover:text-gray-900">Copiar</button>
                            <a href={patientLoginUrl} target="_blank" className="text-[11px] text-blue-600 hover:text-blue-700">Abrir</a>
                          </>
                        )}

              {showQrPanel && (
                <div className="absolute right-0 top-10 z-20 w-[380px] rounded-xl border border-gray-200 bg-white shadow-xl p-4">
                  <p className="text-[11px] text-gray-500 font-medium mb-2">QR Codes</p>
                  <div className="space-y-4">
                    <div>
                      <p className="text-[11px] text-gray-600 mb-1">Login para pacientes</p>
                      {patientLoginUrl ? (
                        <div className="flex items-start gap-3">
                          <div className="relative h-24 w-24">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={qrLoginPngUrl} alt="Login QR" className="h-24 w-24" />
                            {currentClinic?.logo && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={currentClinic.logo}
                                alt="Clinic logo"
                                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 rounded-md bg-white p-0.5 shadow"
                              />
                            )}
                          </div>
                          <div className="flex-1">
                            <code className="block text-[11px] text-gray-900 truncate border border-gray-200 rounded px-2 py-1 bg-gray-50">{patientLoginUrl}</code>
                            <div className="mt-2 flex items-center gap-2">
                              <button onClick={copyPatientLoginUrl} className="text-[11px] text-gray-600 hover:text-gray-900">Copiar</button>
                              <a href={patientLoginUrl} target="_blank" className="text-[11px] text-blue-600 hover:text-blue-700">Abrir</a>
                              <a href={qrLoginPngUrl} download={`login-qr.png`} className="text-[11px] text-gray-600 hover:text-gray-900">Baixar QR</a>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-[11px] text-gray-600">Defina seu slug no perfil</div>
                      )}
                    </div>
                    <div>
                      <p className="text-[11px] text-gray-600 mb-1">Cadastro de pacientes</p>
                      {patientRegisterUrl ? (
                        <div className="flex items-start gap-3">
                          <div className="relative h-24 w-24">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={qrPngUrl} alt="Register QR" className="h-24 w-24" />
                            {currentClinic?.logo && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={currentClinic.logo}
                                alt="Clinic logo"
                                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 rounded-md bg-white p-0.5 shadow"
                              />
                            )}
                          </div>
                          <div className="flex-1">
                            <code className="block text-[11px] text-gray-900 truncate border border-gray-200 rounded px-2 py-1 bg-gray-50">{patientRegisterUrl}</code>
                            <div className="mt-2 flex items-center gap-2">
                              <button onClick={copyPatientRegisterUrl} className="text-[11px] text-gray-600 hover:text-gray-900">Copiar</button>
                              <a href={patientRegisterUrl} target="_blank" className="text-[11px] text-blue-600 hover:text-blue-700">Abrir</a>
                              <a href={qrPngUrl} download={`register-qr.png`} className="text-[11px] text-gray-600 hover:text-gray-900">Baixar QR</a>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-[11px] text-gray-600">Defina seu slug no perfil</div>
                      )}
                    </div>
                  </div>
                </div>
              )}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] text-gray-600 mb-1">Cadastro de pacientes</p>
                      <div className="flex items-center gap-2">
                        <code className="block text-[11px] text-gray-900 truncate border border-gray-200 rounded px-2 py-1 bg-gray-50 max-w-[240px]">{patientRegisterUrl || 'Defina seu slug no perfil'}</code>
                        {patientRegisterUrl && (
                          <>
                            <button onClick={copyPatientRegisterUrl} className="text-[11px] text-gray-600 hover:text-gray-900">Copiar</button>
                            <a href={patientRegisterUrl} target="_blank" className="text-[11px] text-blue-600 hover:text-blue-700">Abrir</a>
                            <button onClick={() => setShowRegisterQr(true)} className="text-[11px] text-gray-600 hover:text-gray-900">QR Code</button>
                          </>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] text-gray-600 mb-1">Página pública da clínica</p>
                      <div className="flex items-center gap-2">
                        <code className="block text-[11px] text-gray-900 truncate border border-gray-200 rounded px-2 py-1 bg-gray-50 max-w-[240px]">{publicUrl || 'Defina seu slug no perfil'}</code>
                        {publicUrl && (
                          <>
                            <button onClick={copyPublicUrl} className="text-[11px] text-gray-600 hover:text-gray-900">Copiar</button>
                            <a href={publicUrl} target="_blank" className="text-[11px] text-blue-600 hover:text-blue-700">Abrir</a>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-3">Cada paciente receberá um link individualizado para indicações baseado nas campanhas criadas.</p>
                </div>
              )}

              {showQrPanel && (
                <div className="absolute right-0 top-10 z-20 w-[380px] rounded-xl border border-gray-200 bg-white shadow-xl p-4">
                  <p className="text-[11px] text-gray-500 font-medium mb-2">QR Codes</p>
                  <div className="space-y-4">
                    <div>
                      <p className="text-[11px] text-gray-600 mb-1">Login para pacientes</p>
                      {patientLoginUrl ? (
                        <div className="flex items-start gap-3">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={qrLoginPngUrl} alt="Login QR" className="h-24 w-24" />
                          <div className="flex-1">
                            <code className="block text-[11px] text-gray-900 truncate border border-gray-200 rounded px-2 py-1 bg-gray-50">{patientLoginUrl}</code>
                            <div className="mt-2 flex items-center gap-2">
                              <button onClick={copyPatientLoginUrl} className="text-[11px] text-gray-600 hover:text-gray-900">Copiar</button>
                              <a href={patientLoginUrl} target="_blank" className="text-[11px] text-blue-600 hover:text-blue-700">Abrir</a>
                              <a href={qrLoginPngUrl} download={`login-qr.png`} className="text-[11px] text-gray-600 hover:text-gray-900">Baixar QR</a>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-[11px] text-gray-600">Defina seu slug no perfil</div>
                      )}
                    </div>
                    <div>
                      <p className="text-[11px] text-gray-600 mb-1">Cadastro de pacientes</p>
                      {patientRegisterUrl ? (
                        <div className="flex items-start gap-3">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={qrPngUrl} alt="Register QR" className="h-24 w-24" />
                          <div className="flex-1">
                            <code className="block text-[11px] text-gray-900 truncate border border-gray-200 rounded px-2 py-1 bg-gray-50">{patientRegisterUrl}</code>
                            <div className="mt-2 flex items-center gap-2">
                              <button onClick={copyPatientRegisterUrl} className="text-[11px] text-gray-600 hover:text-gray-900">Copiar</button>
                              <a href={patientRegisterUrl} target="_blank" className="text-[11px] text-blue-600 hover:text-blue-700">Abrir</a>
                              <a href={qrPngUrl} download={`register-qr.png`} className="text-[11px] text-gray-600 hover:text-gray-900">Baixar QR</a>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-[11px] text-gray-600">Defina seu slug no perfil</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* Free plan banner */}
          {(planName ?? '').toLowerCase() === 'free' && (
            <div className="mb-4 rounded-2xl px-4 py-4 text-white bg-gradient-to-r from-[#5893ec] to-[#9bcef7] shadow-sm">
              <p className="text-sm font-semibold">You are on the Free plan — limited features.</p>
              <p className="text-xs mt-1 opacity-95">Upgrade to unlock all features.</p>
              <div className="mt-3">
                <Link href="/clinic/subscription">
                  <Button size="sm" variant="secondary" className="h-8 rounded-lg bg-white text-gray-800 hover:bg-gray-100">View plans</Button>
                </Link>
              </div>
            </div>
          )}

          {/* Revenue date range picker (last 30 days default) */}
          <div className="mb-4 bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-semibold text-gray-900">Receita</h2>
                <p className="text-[12px] text-gray-500">Período selecionado em BRL</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2">
                  <label className="text-[12px] text-gray-600">De</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-8 rounded-lg border border-gray-300 px-2 text-[12px]"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[12px] text-gray-600">Até</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="h-8 rounded-lg border border-gray-300 px-2 text-[12px]"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Stripe-like KPIs: Revenue, Purchases, AOV */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
              <p className="text-[11px] text-gray-500 font-medium">Receita</p>
              {isLoading ? (
                <SkeletonLine className="mt-2 h-6 w-24" />
              ) : (
                <p className="mt-1 text-2xl font-semibold text-gray-900">{formatCurrency(stats.revenueCollected)}</p>
              )}
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
              <p className="text-[11px] text-gray-500 font-medium">Pedidos</p>
              {isLoading ? (
                <SkeletonLine className="mt-2 h-6 w-16" />
              ) : (
                <p className="mt-1 text-2xl font-semibold text-gray-900">{stats.purchasesCount || 0}</p>
              )}
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
              <p className="text-[11px] text-gray-500 font-medium">Ticket médio (AOV)</p>
              {isLoading ? (
                <SkeletonLine className="mt-2 h-6 w-20" />
              ) : (
                <p className="mt-1 text-2xl font-semibold text-gray-900">{formatCurrency(Math.round(stats.aov || 0))}</p>
              )}
            </div>
          </div>

          {/* Revenue trend (daily sales) */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm mb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[13px] font-semibold text-gray-900">Vendas por dia</p>
              <p className="text-[12px] text-gray-500">
                {format(new Date(dateFrom + 'T00:00:00'), 'd MMM', { locale: ptBR })}
                {' — '}
                {format(new Date(dateTo + 'T00:00:00'), 'd MMM', { locale: ptBR })}
              </p>
            </div>
            {isLoading ? (
              <SkeletonBox className="h-[220px] w-full" />
            ) : (() => {
              const { times, totals } = buildDailyRevenue();
              const hasData = totals.some((v) => Number(v) > 0);
              if (!hasData) {
                return (
                  <div className="h-[220px] w-full flex items-center justify-center text-[12px] text-gray-500">
                    Sem dados no período selecionado
                  </div>
                );
              }
              const pts = times.map((t, i) => [t + 12 * 60 * 60 * 1000, Number(totals[i] || 0)]) as SeriesPoint[];
              const max = Math.max(1, ...totals.map(Number));
              return (
                <div className="w-full">
                  <ProjectionLineChart
                    past={pts}
                    title={undefined}
                    height={220}
                    pastName="Vendas"
                    colors={["#86efac"]}
                    yFormatter={(v) => formatCurrency(Math.round(v || 0))}
                  />
                  <div className="text-[11px] text-gray-500 mt-1">Máximo no período: {formatCurrency(max)}</div>
                </div>
              );
            })()}
          </div>

          

          {/* KPI cards removed as requested */}


          {/* Quick Actions removed as requested */}

          
        </div>
      </div>

      {/* Register QR Dialog */}
      <Dialog open={showRegisterQr} onOpenChange={setShowRegisterQr}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>QR Code – Patient Register</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {patientRegisterUrl ? (
              <>
                <div className="flex items-center justify-center">
                  <div className="relative h-56 w-56">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrPngUrl} alt="QR Code" className="h-56 w-56" />
                    {currentClinic?.logo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={currentClinic.logo}
                        alt="Clinic logo"
                        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-12 w-12 rounded-lg bg-white p-1 shadow"
                      />
                    )}
                  </div>
                </div>
                <div className="rounded border border-gray-200 bg-gray-50 p-2">
                  <code className="text-[11px] break-all">{patientRegisterUrl}</code>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button onClick={() => navigator.clipboard.writeText(patientRegisterUrl)} className="text-sm px-3 py-1.5 rounded border border-gray-300 text-gray-800 bg-white hover:bg-gray-50">Copiar link</button>
                  <a href={qrPngUrl} download={`register-qr.png`} className="text-sm px-3 py-1.5 rounded bg-gray-900 text-white hover:bg-gray-800">Baixar PNG</a>
                </div>
              </>
            ) : (
              <div className="text-sm text-gray-600">Defina seu slug no perfil para gerar o QR Code.</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}