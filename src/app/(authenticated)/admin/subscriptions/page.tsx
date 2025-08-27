'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  maxPatients: number;
  maxProtocols: number;
  maxCourses: number;
  maxProducts: number;
  trialDays: number | null;
  isDefault: boolean;
}

interface DoctorSubscription {
  id: string;
  status: string;
  startDate: string;
  endDate?: string;
  trialEndDate?: string;
  autoRenew: boolean;
  doctor?: {
    id: string;
    name: string;
    email: string;
  };
  plan?: SubscriptionPlan;
}

export default function SubscriptionsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [subscriptions, setSubscriptions] = useState<DoctorSubscription[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [doctors, setDoctors] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<{ doctorId: string; planId: string; status: 'TRIAL' | 'ACTIVE'; autoRenew: boolean }>({ doctorId: '', planId: '', status: 'TRIAL', autoRenew: true });

  const loadData = async () => {
      try {
        setIsLoading(true);
        const [subscriptionsResponse, plansResponse, doctorsResponse] = await Promise.all([
          fetch('/api/admin/subscriptions'),
          fetch('/api/admin/plans'),
          fetch('/api/admin/doctors')
        ]);
        
        if (subscriptionsResponse.ok) {
          const subscriptionsData = await subscriptionsResponse.json();
          setSubscriptions(subscriptionsData.subscriptions || []);
        }
        
        if (plansResponse.ok) {
          const plansData = await plansResponse.json();
          setPlans(plansData.plans || []);
        }
        if (doctorsResponse.ok) {
          const doctorsData = await doctorsResponse.json();
          setDoctors((doctorsData.doctors || []).map((d: any) => ({ id: d.id, name: d.name || 'Sem nome', email: d.email })));
        }
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setIsLoading(false);
      }
    };

  useEffect(() => {
    if (!session) return;
    loadData();
  }, [session]);

  // If doctorId is present in the URL, try to auto-redirect to that doctor's latest subscription edit page
  useEffect(() => {
    const doctorId = searchParams?.get('doctorId');
    if (!doctorId || isLoading || subscriptions.length === 0) return;

    const forDoctor = subscriptions.filter(s => s.doctor?.id === doctorId);
    if (forDoctor.length === 0) {
      // If doctor has no subscription, open create modal preselected
      setCreateForm((prev) => ({ ...prev, doctorId }));
      setShowCreate(true);
      return;
    }

    // Prefer the most recent by startDate desc
    const sorted = [...forDoctor].sort((a, b) => {
      const da = a.startDate ? new Date(a.startDate).getTime() : 0;
      const db = b.startDate ? new Date(b.startDate).getTime() : 0;
      return db - da;
    });
    const target = sorted[0];
    if (target?.id) {
      router.push(`/admin/subscriptions/${target.id}/edit`);
    }
  }, [searchParams, subscriptions, isLoading, router]);

  // Statistics calculations
  const activeCount = subscriptions.filter(s => s.status === 'ACTIVE').length;
  const trialCount = subscriptions.filter(s => s.status === 'TRIAL').length;
  const expiredCount = subscriptions.filter(s => s.status === 'EXPIRED').length;
  const expiringSoon = subscriptions.filter(s => {
    if (s.status !== 'TRIAL' || !s.trialEndDate) return false;
    const daysLeft = Math.ceil((new Date(s.trialEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return daysLeft <= 3;
  }).length;

  const totalRevenue = subscriptions
    .filter(s => s.status === 'ACTIVE')
    .reduce((sum, s) => sum + (s.plan?.price || 0), 0);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-100 text-green-800';
      case 'TRIAL': return 'bg-blue-100 text-blue-800';
      case 'EXPIRED': return 'bg-red-100 text-red-800';
      case 'SUSPENDED': return 'bg-yellow-100 text-yellow-800';
      case 'CANCELLED': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'Active';
      case 'TRIAL': return 'Trial';
      case 'EXPIRED': return 'Expired';
      case 'SUSPENDED': return 'Suspended';
      case 'CANCELLED': return 'Cancelled';
      default: return status;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="lg:ml-64">
          <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24">
            
            {/* Header Skeleton */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 mb-8">
              <div className="space-y-3">
                <div className="h-8 bg-gray-200 rounded-lg w-64 animate-pulse"></div>
                <div className="h-5 bg-gray-100 rounded-lg w-80 animate-pulse"></div>
              </div>
              <div className="h-10 bg-gray-200 rounded-xl w-40 animate-pulse"></div>
            </div>

            {/* Stats Cards Skeleton */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                  <div className="text-[11px] text-gray-500 font-medium mb-2">Carregando...</div>
                  <div className="h-6 w-24 bg-gray-100 rounded animate-pulse" />
                </div>
              ))}
            </div>

            {/* Subscriptions List Skeleton */}
            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl mb-6">
              <div className="p-6 pb-4">
                <div className="h-6 bg-gray-200 rounded w-40 animate-pulse"></div>
              </div>
              <div className="p-6 pt-0 space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-10 bg-gray-50 border border-gray-100 rounded-lg animate-pulse" />
                ))}
              </div>
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
          
          {/* Header - minimal, like KPIs */}
          <div className="flex flex-col gap-3 mb-4">
            <div className="flex items-center justify-between">
              <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">Subscriptions</h1>
              <div className="flex items-center gap-2">
                <Link href="/admin" className="hidden lg:inline-flex h-8 items-center rounded-full border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50">Dashboard</Link>
                <Link href="/admin/plans" className="inline-flex h-8 items-center rounded-full bg-gradient-to-r from-[#5893ec] to-[#9bcef7] px-3 text-xs font-medium text-white hover:opacity-90 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#5893ec]">Plans</Link>
                <button
                  onClick={() => setShowCreate(true)}
                  className="inline-flex h-8 items-center rounded-full border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  New Subscription
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 overflow-auto">
              {[{ key: 'all', label: 'All', active: true }, { key: 'active', label: 'Active' }, { key: 'trial', label: 'Trial' }, { key: 'expired', label: 'Expired' }].map(tab => (
                <span
                  key={tab.key}
                  className={[
                    'whitespace-nowrap text-xs font-medium rounded-full border px-3 py-1',
                    tab.active
                      ? 'bg-white border-gray-200 text-gray-900 shadow-sm'
                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-white'
                  ].join(' ')}
                >
                  {tab.label}
                </span>
              ))}
            </div>
          </div>

          {/* Quick Statistics - minimal like KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {[{
              title: 'Total',
              value: subscriptions.length,
              note: 'all'
            }, {
              title: 'Active',
              value: activeCount,
              note: 'current'
            }, {
              title: 'Trial',
              value: trialCount,
              note: 'current'
            }, {
              title: 'Revenue/month',
              value: `R$ ${totalRevenue}`,
              note: 'active'
            }].map((kpi) => (
              <div key={kpi.title} className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-gray-500">{kpi.title}</span>
                  <span className="text-[10px] text-gray-400">{kpi.note}</span>
                </div>
                <div className="mt-1 text-[22px] leading-7 font-semibold text-gray-900">{kpi.value}</div>
              </div>
            ))}
          </div>

          {/* Optional Expiring Note - toned down */}
          {expiringSoon > 0 && (
            <div className="mb-4 text-xs text-gray-600">{expiringSoon} trial subscriptions expiring in the next 3 days.</div>
          )}

          {/* Subscriptions - compact table style */}
          <Card className="mb-6 bg-white border border-gray-200 shadow-sm rounded-2xl">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-gray-900">All Subscriptions</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {subscriptions.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-600 font-medium">No subscriptions found.</p>
                  <p className="text-gray-500 text-sm mt-1">Subscriptions will appear here once doctors are registered.</p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                  <table className="min-w-full">
                    <thead className="bg-gray-50/80">
                      <tr className="text-left text-xs text-gray-600">
                        <th className="py-3.5 pl-4 pr-3 font-medium sm:pl-6">Doctor</th>
                        <th className="px-3 py-3.5 font-medium">Email</th>
                        <th className="px-3 py-3.5 font-medium">Plan</th>
                        <th className="px-3 py-3.5 font-medium">Status</th>
                        <th className="px-3 py-3.5 font-medium">Term</th>
                        <th className="px-3 py-3.5 font-medium">Price</th>
                        <th className="py-3.5 pl-3 pr-4 sm:pr-6 text-right font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {subscriptions.map((s) => {
                        const isTrial = s.status === 'TRIAL';
                        const daysLeft = isTrial && s.trialEndDate
                          ? Math.ceil((new Date(s.trialEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                          : null;
                        return (
                          <tr key={s.id} className="hover:bg-gray-50/60">
                            <td className="whitespace-nowrap py-3.5 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">{s.doctor?.name || 'Doctor'}</td>
                            <td className="whitespace-nowrap px-3 py-3.5 text-sm text-gray-600">{s.doctor?.email}</td>
                            <td className="whitespace-nowrap px-3 py-3.5 text-sm text-gray-900">{s.plan?.name || 'Basic'}</td>
                            <td className="whitespace-nowrap px-3 py-3.5 text-sm">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-white text-gray-700 ring-1 ring-inset ring-gray-200">{getStatusText(s.status)}</span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-3.5 text-sm text-gray-600">
                              {isTrial && daysLeft !== null ? (daysLeft > 0 ? `${daysLeft} days left` : 'Expired') : (s.endDate ? `Renews ${new Date(s.endDate).toLocaleDateString('en-US')}` : '—')}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3.5 text-sm text-gray-900">{s.plan?.price ? `R$ ${s.plan.price}/month` : '—'}</td>
                            <td className="relative whitespace-nowrap py-3.5 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                              <Link href={`/admin/subscriptions/${s.id}/edit`} className="inline-flex h-8 items-center rounded-full border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50">Edit</Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Create Subscription Modal */}
          {showCreate && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/30" onClick={() => !creating && setShowCreate(false)} />
              <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
                <div className="mb-3">
                  <h2 className="text-base font-semibold text-gray-900">New Subscription</h2>
                  <p className="text-xs text-gray-600">Create a subscription for a doctor</p>
                </div>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      setCreating(true);
                      const res = await fetch('/api/admin/subscriptions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          doctorId: createForm.doctorId,
                          planId: createForm.planId,
                          status: createForm.status,
                          autoRenew: createForm.autoRenew,
                        })
                      });
                      if (!res.ok) {
                        const data = await res.json().catch(() => ({}));
                        throw new Error(data.error || 'Failed to create');
                      }
                      await loadData();
                      setShowCreate(false);
                      setCreateForm({ doctorId: '', planId: '', status: 'TRIAL', autoRenew: true });
                    } catch (err) {
                      console.error(err);
                      alert((err as Error).message);
                    } finally {
                      setCreating(false);
                    }
                  }}
                  className="space-y-3"
                >
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Doctor</label>
                    <select
                      value={createForm.doctorId}
                      onChange={(e) => setCreateForm({ ...createForm, doctorId: e.target.value })}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="" disabled>Select a doctor</option>
                      {doctors.map((d) => (
                        <option key={d.id} value={d.id}>{d.name} — {d.email}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Plan</label>
                    <select
                      value={createForm.planId}
                      onChange={(e) => setCreateForm({ ...createForm, planId: e.target.value })}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="" disabled>Select a plan</option>
                      {plans.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} {p.price ? `(R$ ${p.price}/month)` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                      <select
                        value={createForm.status}
                        onChange={(e) => setCreateForm({ ...createForm, status: e.target.value as any })}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="TRIAL">Trial</option>
                        <option value="ACTIVE">Active</option>
                      </select>
                    </div>
                    <div className="flex items-end">
                      <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                        <input
                          type="checkbox"
                          checked={createForm.autoRenew}
                          onChange={(e) => setCreateForm({ ...createForm, autoRenew: e.target.checked })}
                          className="rounded border-gray-300"
                        />
                        Auto-renew
                      </label>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button type="button" onClick={() => !creating && setShowCreate(false)} className="inline-flex h-8 items-center rounded-full border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                    <button type="submit" disabled={creating || !createForm.doctorId || !createForm.planId} className="inline-flex h-8 items-center rounded-full bg-blue-600 px-3 text-xs font-medium text-white disabled:opacity-50">{creating ? 'Creating…' : 'Create'}</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}