'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';

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
  createdAt: string;
  updatedAt: string;
  referralsMonthlyLimit?: number | null;
  maxRewards?: number | null;
  allowCreditPerPurchase?: boolean | null;
  allowCampaigns?: boolean | null;
}

export default function PlansPage() {
  const { data: session } = useSession();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);

  // create plan form state
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    price: 0,
    maxPatients: 100,
    maxProtocols: 100,
    maxCourses: 50,
    maxProducts: 50,
    trialDays: 0,
    isDefault: false,
    referralsMonthlyLimit: 0,
    maxRewards: 0,
    allowCreditPerPurchase: false,
    allowCampaigns: false,
  });

  // edit plan form state
  const [updating, setUpdating] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    price: 0,
    maxPatients: 100,
    maxProtocols: 100,
    maxCourses: 50,
    maxProducts: 50,
    trialDays: 0,
    isDefault: false,
    referralsMonthlyLimit: 0,
    maxRewards: 0,
    allowCreditPerPurchase: false,
    allowCampaigns: false,
  });

  useEffect(() => {
    const loadPlans = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('/api/admin/plans');
        
        if (response.ok) {
          const data = await response.json();
          setPlans(data.plans || []);
        }
      } catch (error) {
        console.error('Error loading plans:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (session) {
      loadPlans();
    }
  }, [session]);

  const deletePlan = async (planId: string) => {
    const ok = window.confirm('Are you sure you want to delete this plan? This will deactivate it.');
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/plans/${planId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete plan');
      // reload list
      const response = await fetch('/api/admin/plans');
      if (response.ok) {
        const data = await response.json();
        setPlans(data.plans || []);
      }
    } catch (error) {
      console.error('Error deleting plan:', error);
    }
  };

  const openEdit = (plan: SubscriptionPlan) => {
    setSelectedPlan(plan);
    setEditForm({
      name: plan.name,
      description: plan.description,
      price: plan.price,
      maxPatients: plan.maxPatients,
      maxProtocols: plan.maxProtocols,
      maxCourses: plan.maxCourses,
      maxProducts: plan.maxProducts,
      trialDays: plan.trialDays || 0,
      isDefault: plan.isDefault,
      referralsMonthlyLimit: plan.referralsMonthlyLimit ?? 0,
      maxRewards: plan.maxRewards ?? 0,
      allowCreditPerPurchase: !!plan.allowCreditPerPurchase,
      allowCampaigns: !!plan.allowCampaigns,
    });
    setEditOpen(true);
  };

  const submitEditPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) return;
    try {
      setUpdating(true);
      const res = await fetch(`/api/admin/plans/${selectedPlan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name,
          description: editForm.description,
          price: Number(editForm.price),
          maxPatients: Number(editForm.maxPatients),
          maxProtocols: Number(editForm.maxProtocols),
          maxCourses: Number(editForm.maxCourses),
          maxProducts: Number(editForm.maxProducts),
          trialDays: Number(editForm.trialDays) || 0,
          isDefault: Boolean(editForm.isDefault),
          referralsMonthlyLimit: Number(editForm.referralsMonthlyLimit) || 0,
          maxRewards: Number(editForm.maxRewards) || 0,
          allowCreditPerPurchase: Boolean(editForm.allowCreditPerPurchase),
          allowCampaigns: Boolean(editForm.allowCampaigns),
        }),
      });
      if (!res.ok) throw new Error('Failed to update plan');

      // reload list
      const response = await fetch('/api/admin/plans');
      if (response.ok) {
        const data = await response.json();
        setPlans(data.plans || []);
      }
      setEditOpen(false);
      setSelectedPlan(null);
    } catch (err) {
      console.error(err);
    } finally {
      setUpdating(false);
    }
  };

  const submitNewPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCreating(true);
      const res = await fetch('/api/admin/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          price: Number(form.price),
          maxPatients: Number(form.maxPatients),
          maxProtocols: Number(form.maxProtocols),
          maxCourses: Number(form.maxCourses),
          maxProducts: Number(form.maxProducts),
          trialDays: Number(form.trialDays) || 0,
          isDefault: Boolean(form.isDefault),
          referralsMonthlyLimit: Number(form.referralsMonthlyLimit) || 0,
          maxRewards: Number(form.maxRewards) || 0,
          allowCreditPerPurchase: Boolean(form.allowCreditPerPurchase),
          allowCampaigns: Boolean(form.allowCampaigns),
        }),
      });
      if (!res.ok) throw new Error('Failed to create plan');

      // reload list
      const response = await fetch('/api/admin/plans');
      if (response.ok) {
        const data = await response.json();
        setPlans(data.plans || []);
      }
      setOpen(false);
      setForm({
        name: '', description: '', price: 0, maxPatients: 100, maxProtocols: 100, maxCourses: 50, maxProducts: 50, trialDays: 0, isDefault: false,
        referralsMonthlyLimit: 0, maxRewards: 0, allowCreditPerPurchase: false, allowCampaigns: false,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  // Statistics calculations
  const totalPlans = plans.length;
  const defaultPlans = plans.filter(p => p.isDefault).length;
  const premiumPlans = plans.filter(p => !p.isDefault).length;
  const averagePrice = plans.length > 0 ? Math.round(plans.reduce((sum, p) => sum + p.price, 0) / plans.length) : 0;
  const plansWithTrial = plans.filter(p => p.trialDays && p.trialDays > 0).length;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white">
        <div className="lg:ml-64">
          <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24">
            
            {/* Header Skeleton */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 mb-8">
              <div className="space-y-3">
                <div className="h-8 bg-gray-200 rounded-lg w-64 animate-pulse"></div>
                <div className="h-5 bg-gray-100 rounded-lg w-48 animate-pulse"></div>
              </div>
              <div className="flex gap-3">
                <div className="h-10 bg-gray-200 rounded-xl w-36 animate-pulse"></div>
                <div className="h-10 bg-gray-100 rounded-xl w-32 animate-pulse"></div>
              </div>
            </div>

            {/* Stats Cards Skeleton */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="bg-white border border-gray-200 shadow-lg rounded-2xl p-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-gray-100 rounded-xl animate-pulse">
                      <div className="h-6 w-6 bg-gray-200 rounded animate-pulse"></div>
                    </div>
                    <div className="space-y-2 flex-1">
                      <div className="h-4 bg-gray-200 rounded w-20 animate-pulse"></div>
                      <div className="h-7 bg-gray-100 rounded w-12 animate-pulse"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Plans List Skeleton */}
            <div className="bg-white border border-gray-200 shadow-lg rounded-2xl">
              <div className="p-6 pb-4">
                <div className="h-6 bg-gray-200 rounded w-40 animate-pulse"></div>
              </div>
              <div className="p-6 pt-0 space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="p-6 border border-gray-200 rounded-xl bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-3">
                        <div className="h-6 bg-gray-200 rounded w-48 animate-pulse"></div>
                        <div className="h-4 bg-gray-100 rounded w-64 animate-pulse"></div>
                        <div className="h-8 bg-gray-100 rounded w-32 animate-pulse"></div>
                      </div>
                      <div className="flex gap-2">
                        <div className="h-8 bg-gray-100 rounded-xl w-20 animate-pulse"></div>
                        <div className="h-8 bg-gray-200 rounded-xl w-24 animate-pulse"></div>
                      </div>
                    </div>
                  </div>
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
              <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">Subscription plans</h1>
              <div className="flex items-center gap-2">
                <Link href="/admin" className="hidden lg:inline-flex h-8 items-center rounded-full border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50">Dashboard</Link>
                <Dialog open={open} onOpenChange={setOpen}>
                  <DialogTrigger asChild>
                    <button className="inline-flex h-8 items-center rounded-full bg-gradient-to-r from-[#5893ec] to-[#9bcef7] px-3 text-xs font-medium text-white hover:opacity-90 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#5893ec]">New plan</button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[560px]">
                    <DialogHeader>
                      <DialogTitle>Create new plan</DialogTitle>
                      <DialogDescription>Define the basic details. You can edit advanced settings later.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={submitNewPlan} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2">
                          <label className="block text-sm font-medium text-gray-700">Name</label>
                          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#5893ec] focus:outline-none" placeholder="Pro, Starter..." />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-sm font-medium text-gray-700">Description</label>
                          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#5893ec] focus:outline-none" rows={2} placeholder="Short summary" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Price (USD/month)</label>
                          <input type="number" min="0" step="1" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#5893ec] focus:outline-none" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Trial days</label>
                          <input type="number" min="0" step="1" value={form.trialDays} onChange={(e) => setForm({ ...form, trialDays: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#5893ec] focus:outline-none" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Max patients</label>
                          <input type="number" min="1" step="1" value={form.maxPatients} onChange={(e) => setForm({ ...form, maxPatients: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#5893ec] focus:outline-none" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Max protocols</label>
                          <input type="number" min="1" step="1" value={form.maxProtocols} onChange={(e) => setForm({ ...form, maxProtocols: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#5893ec] focus:outline-none" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Max courses</label>
                          <input type="number" min="1" step="1" value={form.maxCourses} onChange={(e) => setForm({ ...form, maxCourses: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#5893ec] focus:outline-none" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Max products</label>
                          <input type="number" min="1" step="1" value={form.maxProducts} onChange={(e) => setForm({ ...form, maxProducts: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#5893ec] focus:outline-none" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Referrals per month</label>
                          <input type="number" min="0" step="1" value={form.referralsMonthlyLimit} onChange={(e) => setForm({ ...form, referralsMonthlyLimit: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#5893ec] focus:outline-none" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Max rewards</label>
                          <input type="number" min="0" step="1" value={form.maxRewards} onChange={(e) => setForm({ ...form, maxRewards: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#5893ec] focus:outline-none" />
                        </div>
                        <div className="sm:col-span-2 flex items-center gap-2 pt-1">
                          <input id="isDefault" type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} className="h-4 w-4 rounded border-gray-300 text-[#5893ec] focus:ring-[#5893ec]" />
                          <label htmlFor="isDefault" className="text-sm text-gray-700">Mark as default plan</label>
                        </div>
                        <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                            <input type="checkbox" checked={form.allowCreditPerPurchase} onChange={(e) => setForm({ ...form, allowCreditPerPurchase: e.target.checked })} className="h-4 w-4 rounded border-gray-300 text-[#5893ec] focus:ring-[#5893ec]" />
                            Allow credit per purchase
                          </label>
                          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                            <input type="checkbox" checked={form.allowCampaigns} onChange={(e) => setForm({ ...form, allowCampaigns: e.target.checked })} className="h-4 w-4 rounded border-gray-300 text-[#5893ec] focus:ring-[#5893ec]" />
                            Allow campaigns access
                          </label>
                        </div>
                      </div>
                      <DialogFooter>
                        <button type="button" onClick={() => setOpen(false)} className="inline-flex h-9 items-center rounded-full border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                        <button type="submit" disabled={creating} className="inline-flex h-9 items-center rounded-full bg-gradient-to-r from-[#5893ec] to-[#9bcef7] px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60">{creating ? 'Creating...' : 'Create plan'}</button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
            <div className="flex items-center gap-2 overflow-auto">
              {[
                { key: 'all', label: 'All plans', active: true },
                { key: 'default', label: 'Default' },
                { key: 'premium', label: 'Premium' }
              ].map(tab => (
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
              title: 'Total plans',
              value: totalPlans,
              note: 'all'
            }, {
              title: 'Default plans',
              value: defaultPlans,
              note: 'active'
            }, {
              title: 'Premium plans',
              value: premiumPlans,
              note: 'active'
            }, {
              title: 'Avg. price',
              value: `$ ${averagePrice}`,
              note: 'per month'
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

          {/* Plans List - compact table style, minimal badges/actions */}
          <Card className="bg-white border border-gray-200 shadow-sm rounded-2xl">
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <CardTitle className="text-lg font-semibold text-gray-900">Available Plans</CardTitle>
              <div className="text-sm text-gray-600">{plans.length} plans configured</div>
            </CardHeader>
            <CardContent className="pt-0">
              {plans.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-600 font-medium">No subscription plans found.</p>
                  <p className="text-gray-500 text-sm mt-1">Create your first plan to get started.</p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                  <table className="min-w-full">
                    <thead className="bg-gray-50/80">
                      <tr className="text-left text-xs text-gray-600">
                        <th className="py-3.5 pl-4 pr-3 font-medium sm:pl-6">Name</th>
                        <th className="px-3 py-3.5 font-medium">Price</th>
                        <th className="px-3 py-3.5 font-medium">Limits</th>
                        <th className="px-3 py-3.5 font-medium">Trial</th>
                        <th className="px-3 py-3.5 font-medium">Type</th>
                        <th className="py-3.5 pl-3 pr-4 sm:pr-6 text-right font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {plans.map((plan) => (
                        <tr key={plan.id} className="hover:bg-gray-50/60">
                          <td className="whitespace-nowrap py-3.5 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                            {plan.name}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3.5 text-sm text-gray-900">
                            ${' '}{plan.price}/month
                          </td>
                          <td className="px-3 py-3.5 text-sm text-gray-600">
                            <div className="flex flex-wrap gap-x-4 gap-y-1">
                              <span>{plan.maxPatients === 999999 ? 'Unlimited' : plan.maxPatients} patients</span>
                              <span>{plan.maxProducts === 999999 ? 'Unlimited' : plan.maxProducts} products</span>
                              {typeof plan.referralsMonthlyLimit === 'number' && (
                                <span>{plan.referralsMonthlyLimit} referrals/mo</span>
                              )}
                              {typeof plan.maxRewards === 'number' && (
                                <span>{plan.maxRewards} rewards</span>
                              )}
                              {plan.allowCreditPerPurchase ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-white text-green-700 ring-1 ring-inset ring-green-200">Credit per purchase</span>
                              ) : null}
                              {plan.allowCampaigns ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-white text-blue-700 ring-1 ring-inset ring-blue-200">Campaigns access</span>
                              ) : null}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3.5 text-sm">
                            {plan.trialDays && plan.trialDays > 0 ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-white text-gray-700 ring-1 ring-inset ring-gray-200">{plan.trialDays} days</span>
                            ) : (
                              <span className="text-gray-500">—</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3.5 text-sm">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-white text-gray-700 ring-1 ring-inset ring-gray-200">{plan.isDefault ? 'Default' : 'Premium'}</span>
                          </td>
                          <td className="relative whitespace-nowrap py-3.5 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => openEdit(plan)} className="inline-flex h-8 items-center rounded-full border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50">Edit</button>
                              <button onClick={() => deletePlan(plan.id)} className="inline-flex h-8 items-center rounded-full border border-red-200 bg-white px-3 text-xs font-medium text-red-700 hover:bg-red-50">Delete</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        {/* Edit Plan Modal (placed at page bottom to avoid nesting issues) */}
        <Dialog
          open={editOpen}
          onOpenChange={(open) => {
            setEditOpen(open);
            if (!open) setSelectedPlan(null);
          }}
        >
          <DialogContent className="sm:max-w-[560px]">
            <DialogHeader>
              <DialogTitle>Edit plan</DialogTitle>
              <DialogDescription>Update the plan details and limits.</DialogDescription>
            </DialogHeader>
            <form onSubmit={submitEditPlan} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">Name</label>
                  <input required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#5893ec] focus:outline-none" placeholder="Pro, Starter..." />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">Description</label>
                  <textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#5893ec] focus:outline-none" rows={2} placeholder="Short summary" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Price (USD/month)</label>
                  <input type="number" min="0" step="1" value={editForm.price} onChange={(e) => setEditForm({ ...editForm, price: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#5893ec] focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Trial days</label>
                  <input type="number" min="0" step="1" value={editForm.trialDays} onChange={(e) => setEditForm({ ...editForm, trialDays: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#5893ec] focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Max patients</label>
                  <input type="number" min="1" step="1" value={editForm.maxPatients} onChange={(e) => setEditForm({ ...editForm, maxPatients: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#5893ec] focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Max protocols</label>
                  <input type="number" min="1" step="1" value={editForm.maxProtocols} onChange={(e) => setEditForm({ ...editForm, maxProtocols: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#5893ec] focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Max courses</label>
                  <input type="number" min="1" step="1" value={editForm.maxCourses} onChange={(e) => setEditForm({ ...editForm, maxCourses: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#5893ec] focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Max products</label>
                  <input type="number" min="1" step="1" value={editForm.maxProducts} onChange={(e) => setEditForm({ ...editForm, maxProducts: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#5893ec] focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Referrals per month</label>
                  <input type="number" min="0" step="1" value={editForm.referralsMonthlyLimit} onChange={(e) => setEditForm({ ...editForm, referralsMonthlyLimit: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#5893ec] focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Max rewards</label>
                  <input type="number" min="0" step="1" value={editForm.maxRewards} onChange={(e) => setEditForm({ ...editForm, maxRewards: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#5893ec] focus:outline-none" />
                </div>
                <div className="sm:col-span-2 flex items-center gap-2 pt-1">
                  <input id="editIsDefault" type="checkbox" checked={editForm.isDefault} onChange={(e) => setEditForm({ ...editForm, isDefault: e.target.checked })} className="h-4 w-4 rounded border-gray-300 text-[#5893ec] focus:ring-[#5893ec]" />
                  <label htmlFor="editIsDefault" className="text-sm text-gray-700">Mark as default plan</label>
                </div>
                <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={editForm.allowCreditPerPurchase} onChange={(e) => setEditForm({ ...editForm, allowCreditPerPurchase: e.target.checked })} className="h-4 w-4 rounded border-gray-300 text-[#5893ec] focus:ring-[#5893ec]" />
                    Allow credit per purchase
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={editForm.allowCampaigns} onChange={(e) => setEditForm({ ...editForm, allowCampaigns: e.target.checked })} className="h-4 w-4 rounded border-gray-300 text-[#5893ec] focus:ring-[#5893ec]" />
                    Allow campaigns access
                  </label>
                </div>
              </div>
              <DialogFooter>
                <button type="button" onClick={() => setEditOpen(false)} className="inline-flex h-9 items-center rounded-full border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={updating} className="inline-flex h-9 items-center rounded-full bg-gradient-to-r from-[#5893ec] to-[#9bcef7] px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60">{updating ? 'Saving...' : 'Save changes'}</button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
} 