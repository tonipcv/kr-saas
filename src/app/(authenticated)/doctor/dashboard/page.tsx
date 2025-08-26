'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
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
}

export default function DoctorDashboard() {
  const { data: session } = useSession();
  const router = useRouter();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalPatients: 0,
    activeProtocols: 0,
    totalProtocols: 0,
    completedToday: 0,
    revenueCollected: 0,
    referralsCount: 0,
    usersCount: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [planName, setPlanName] = useState<string | null>(null);
  const [doctorSlug, setDoctorSlug] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [rewardsSummary, setRewardsSummary] = useState<{ configured: number; pending: number; redeemed: number }>({ configured: 0, pending: 0, redeemed: 0 });

  // Simple skeleton helpers
  const SkeletonLine = ({ className = '' }: { className?: string }) => (
    <div className={`animate-pulse rounded bg-gray-200 ${className}`} />
  );
  const SkeletonBox = ({ className = '' }: { className?: string }) => (
    <div className={`animate-pulse rounded-2xl bg-gray-100 border border-gray-200 ${className}`} />
  );

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setIsLoading(true);
        // Kick off all core requests in parallel to avoid waterfall
        const dashboardPromise = fetch('/api/v2/doctor/dashboard-summary');
        const patientsPromise = fetch('/api/patients');
        const protocolsPromise = fetch('/api/protocols');

        // Non-critical (deferred) requests in parallel, will be processed after first paint
        const kpisPromise = fetch('/api/v2/doctor/referrals/kpis', { cache: 'no-store' }).catch(() => null);
        const rewardsPromise = fetch('/api/referrals/rewards').catch(() => null);

        // Await only the core requests for first render
        const [dashboardResponse, patientsResponse, protocolsResponse] = await Promise.all([
          dashboardPromise,
          patientsPromise,
          protocolsPromise,
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
        if (protocolsResponse?.ok) {
          protocolsData = await protocolsResponse.json();
        } else if (protocolsResponse) {
          console.error('Error loading protocols:', protocolsResponse.status);
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
                  revenueCollected: Number.isFinite(valorGeradoNum) ? valorGeradoNum : prev.revenueCollected,
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

          // Final safety fallback: manage stats, only if revenue/referrals still zero
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
                const leadsRes = await fetch(`/api/referrals/manage?page=1&limit=1`, { cache: 'no-store' });
                if (leadsRes.ok) {
                  const leadsJson = await leadsRes.json();
                  const obtainedValue = Number(leadsJson?.stats?.obtainedValue || 0);
                  const totalLeads = Number(leadsJson?.pagination?.total || 0);
                  setStats((prev) => ({
                    ...prev,
                    referralsCount: prev.referralsCount || totalLeads,
                    revenueCollected: prev.revenueCollected || obtainedValue,
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
  }, [session]);

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

  const publicUrl = doctorSlug
    ? `${(process.env.NEXT_PUBLIC_APP_URL as string) || (typeof window !== 'undefined' ? window.location.origin : '')}/${doctorSlug}`
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
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount || 0);

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
  const daysAgo = (n: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - n).getTime();
  const base: number[] = [0, 30, 0, 0, 360, 180, 0, 0, 210, 0, 0, 0, 1080, 170, 0, 0, 0, 980, 820, 0, 0, 0, 300, 0, 0, 0, 820, 0, 0, 60];
  const pastSeries: SeriesPoint[] = base.map((v, idx) => [daysAgo(base.length - 1 - idx), v]);
  const lastPast = base[base.length - 1] || 0;
  const projLen = 14;
  const projectionSeries: SeriesPoint[] = Array.from({ length: projLen }, (_, i) => {
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate() + (i + 1)).getTime();
    // simple deterministic projection using a gentle upward drift + occasional spike
    const val = Math.max(0, Math.round(lastPast * (1 + 0.03 * (i + 1)) + (i % 7 === 3 ? 300 : 0)));
    return [t, val];
  });

  return (
    <div className="min-h-screen bg-white">
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24 bg-gray-50">
        
          {/* Header (compact, like KPIs) */}
          <div className="flex flex-col gap-3 mb-4">
            <div className="flex items-center justify-between">
              <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">Overview</h1>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => router.push('/doctor/patients/smart-add')}
                  className="inline-flex h-8 items-center rounded-full bg-gradient-to-r from-[#5893ec] to-[#9bcef7] px-3 text-xs font-medium text-white hover:opacity-90 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#5893ec]"
                >
                  New client
                </button>
              </div>

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

          

          {/* Stats (pill cards like KPIs) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-2">
            {isLoading ? (
              <>
                <SkeletonBox className="h-16" />
                <SkeletonBox className="h-16" />
                <SkeletonBox className="h-16" />
              </>
            ) : (
              [{
                title: 'Revenue collected',
                value: formatCurrency(stats.revenueCollected),
                note: 'total'
              }, {
                title: 'Referrals',
                value: stats.referralsCount,
                note: 'last 30 days'
              }, {
                title: 'Users',
                value: stats.usersCount,
                note: 'total'
              }].map((kpi) => (
                <div key={String(kpi.title)} className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-gray-500">{kpi.title}</span>
                    <span className="text-[10px] text-gray-400">{kpi.note}</span>
                  </div>
                  <div className="mt-1 text-[22px] leading-7 font-semibold text-gray-900">{kpi.value as any}</div>
                </div>
              ))
            )}
          </div>
 
          <div className="grid lg:grid-cols-2 gap-3">
            {/* Rewards (top, spans 2 cols) */}
            <Card className="bg-white border border-gray-200 rounded-2xl col-span-2 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between px-4 py-3">
                <CardTitle className="text-sm font-semibold text-gray-900">Rewards</CardTitle>
                <div className="flex gap-2">
                  <Button asChild variant="outline" size="sm" className="h-8 border-gray-300 text-gray-800">
                    <Link href="/doctor/rewards">Manage Rewards</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="h-8 border-gray-300 text-gray-800">
                    <Link href="/doctor/rewards/approvals">Approvals</Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <div className="grid grid-cols-3 gap-3">
                  {isLoading ? (
                    <>
                      <SkeletonBox className="h-16" />
                      <SkeletonBox className="h-16" />
                      <SkeletonBox className="h-16" />
                    </>
                  ) : (
                    [
                      {label:'Configured',value:rewardsSummary.configured},
                      {label:'Pending',value:rewardsSummary.pending},
                      {label:'Redeemed',value:rewardsSummary.redeemed}
                    ].map((m) => (
                      <div key={m.label} className="px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 shadow-sm">
                        <p className="text-[11px] text-gray-600 font-medium">{m.label}</p>
                        <p className="text-[22px] leading-7 font-semibold text-gray-900">{m.value}</p>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

          

            {/* Referral projections (above Active Clients and Track Progress) */}
            <Card className="bg-white border border-gray-200 shadow-sm rounded-2xl col-span-2">
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-4">
                    <SkeletonBox className="h-80 w-full" />
                  </div>
                ) : (
                  <ProjectionLineChart 
                    title="Referral projections"
                    past={pastSeries}
                    height={320}
                  />
                )}
              </CardContent>
            </Card>

            {/* Chart removed in favor of professional projection chart above */}

            {/* Active Clients (minimal) */}
            <Card className="bg-white border border-gray-200 shadow-sm rounded-2xl">
              <CardHeader className="flex flex-row items-center justify-between px-4 py-3">
                <CardTitle className="text-sm font-semibold text-gray-900">Active Clients</CardTitle>
                <Button variant="ghost" size="sm" asChild className="h-8 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-full font-medium">
                  <Link href="/doctor/patients">View all</Link>
                </Button>
              </CardHeader>
              <CardContent className="px-2 pb-2 pt-0">
                {isLoading ? (
                  <div className="divide-y divide-gray-200">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="flex items-center justify-between py-3 px-2">
                        <div className="flex items-center gap-3 min-w-0 w-full">
                          <SkeletonLine className="h-8 w-8 rounded-lg" />
                          <div className="min-w-0 flex-1">
                            <SkeletonLine className="h-4 w-32 mb-2" />
                            <SkeletonLine className="h-3 w-48" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : patients.length === 0 ? (
                  <div className="text-center py-10">
                    <UsersIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500 mb-4 font-medium">No clients registered</p>
                    <Button className="h-8 text-white rounded-full shadow-sm text-xs font-medium bg-gradient-to-r from-[#5893ec] to-[#9bcef7] hover:opacity-90" size="sm" asChild>
                      <Link href="/doctor/patients/smart-add">Add first client</Link>
                    </Button>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {patients.slice(0, 5).map((patient) => (
                      <div key={patient.id} className="flex items-center justify-between py-3 px-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-8 w-8 rounded-lg bg-gray-100 flex items-center justify-center text-[11px] font-semibold text-gray-600">
                            {getPatientInitials(patient.name)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{patient.name || 'No name'}</p>
                            <p className="text-xs text-gray-500 truncate">{patient.email}</p>
                          </div>
                        </div>
                        <div className="shrink-0">
                          <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-full text-xs">
                            <Link href={`/doctor/patients/${patient.id}`}>View</Link>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Track Progress */}
            <Card className="bg-white border border-gray-200 shadow-sm rounded-2xl">
              <CardHeader className="flex flex-row items-center justify-between px-4 py-3">
                <CardTitle className="text-sm font-semibold text-gray-900">Track Progress</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <p className="text-xs text-gray-600 mb-3">Monitor KPIs and review clients.</p>
                <div className="flex gap-3">
                  <Button asChild variant="outline" className="h-8 border-gray-300 text-gray-800 rounded-full text-xs font-medium px-3">
                    <Link href="/doctor/referrals/kpis">View KPIs</Link>
                  </Button>
                  <Button asChild variant="outline" className="h-8 border-gray-300 text-gray-800 rounded-full text-xs font-medium px-3">
                    <Link href="/doctor/patients">View Clients</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions */}
          <Card className="mt-6 bg-white border border-gray-200 shadow-sm rounded-2xl">
            <CardHeader className="px-4 py-3">
              <CardTitle className="text-sm font-semibold text-gray-900">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <Button 
                  variant="outline" 
                  className="h-20 flex-col gap-2 border-gray-300 bg-white text-gray-700 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-300 rounded-2xl shadow-sm font-medium"
                  onClick={() => router.push('/doctor/patients/smart-add')}
                >
                  <UserPlusIcon className="h-7 w-7" />
                  <span className="text-xs">Add Client</span>
                </Button>
                <Button 
                  variant="outline" 
                  className="h-20 flex-col gap-2 border-gray-300 bg-white text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 rounded-2xl shadow-sm font-medium"
                  asChild
                >
                  <Link href="/doctor/rewards">
                    <DocumentTextIcon className="h-7 w-7" />
                    <span className="text-xs">Manage Rewards</span>
                  </Link>
                </Button>
                <Button 
                  variant="outline" 
                  className="h-20 flex-col gap-2 border-gray-300 bg-white text-gray-700 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-300 rounded-2xl shadow-sm font-medium"
                  asChild
                >
                  <Link href="/doctor/patients">
                    <UsersIcon className="h-7 w-7" />
                    <span className="text-xs">View Clients</span>
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Public company link (domain + slug) - bottom */}
          <div className="mt-6 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
            {doctorSlug ? (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] text-gray-500 font-medium">Your public link</p>
                  <code className="block text-sm text-gray-900 truncate">{publicUrl}</code>
                </div>
                <Button onClick={copyPublicUrl} variant="outline" size="sm" className="h-8 border-gray-300 text-gray-800 shrink-0">
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] text-gray-500 font-medium">Set your public link</p>
                  <p className="text-sm text-gray-900">Define your slug in Profile to get a public link.</p>
                </div>
                <Button asChild variant="outline" size="sm" className="h-8 border-gray-300 text-gray-800 shrink-0">
                  <Link href="/doctor/profile">Open Profile</Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}