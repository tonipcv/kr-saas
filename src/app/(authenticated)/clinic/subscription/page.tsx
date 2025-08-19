'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  CreditCard,
  Calendar,
  Users,
  CheckCircle,
  Crown,
  XCircle
} from 'lucide-react';
import Link from 'next/link';

interface SubscriptionPlan {
  id: string;
  name: string;
  maxPatients: number;
  maxProtocols: number;
  maxCourses: number;
  price: number | null;
  description: string;
  contactOnly?: boolean;
}

interface ClinicSubscription {
  id: string;
  status: string;
  maxDoctors: number;
  startDate: string;
  endDate: string | null;
  plan: SubscriptionPlan;
}

interface ClinicData {
  id: string;
  name: string;
  subscription: ClinicSubscription | null;
}

export default function SubscriptionManagement() {
  const { data: session } = useSession();
  const router = useRouter();
  const [clinic, setClinic] = useState<ClinicData | null>(null);
  const [availablePlans, setAvailablePlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [annualBilling, setAnnualBilling] = useState(false);

  useEffect(() => {
    if (!session?.user?.id) {
      router.push('/auth/signin');
      return;
    }

    fetchData();
  }, [session, router]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch clinic data
      const clinicResponse = await fetch('/api/clinic');
      if (clinicResponse.ok) {
        const clinicData = await clinicResponse.json();
        setClinic(clinicData.clinic);
      }

      // Fetch available plans (public endpoint)
      const plansRes = await fetch('/api/plans', { cache: 'no-store' });
      if (plansRes.ok) {
        const data = await plansRes.json();
        setAvailablePlans(Array.isArray(data?.plans) ? data.plans : []);
      } else {
        setAvailablePlans([]);
      }

    } catch (error) {
      console.error('Error loading subscription data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePlanChange = (planId: string) => {
    // TODO: implement change plan action
    alert(`Plan change to ${planId} will be implemented soon!`);
  };

  // Filter available plans to exclude the Free plan from display
  const displayPlans = availablePlans.filter(
    (p) => p?.name?.toLowerCase() !== 'free'
  );

  if (loading) {
    return (
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24 bg-gray-50">
          {/* Header skeleton */}
          <div className="flex items-center justify-between mb-4">
            <div className="h-6 w-36 bg-gray-100 rounded animate-pulse" />
            <div className="h-8 w-28 bg-gray-100 rounded-full animate-pulse" />
          </div>
          {/* Pills skeleton */}
          <div className="flex items-center gap-2 mb-4">
            {[1,2,3].map(i => (
              <div key={i} className="h-7 w-40 bg-white border border-gray-200 rounded-full shadow-sm" />
            ))}
          </div>
          {/* KPI cards skeleton */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                <div className="text-[11px] text-gray-500 font-medium mb-2">Loading...</div>
                <div className="h-6 w-24 bg-gray-100 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lg:ml-64">
      <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24 bg-gray-50">
        {/* Header */}
        <div className="flex flex-col gap-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" asChild className="hidden lg:inline-flex h-8 items-center rounded-full border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50">
                <Link href="/clinic">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Link>
              </Button>
              <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">Clinic subscription</h1>
            </div>
            <div className="flex items-center gap-2">
              <button className="inline-flex h-8 items-center rounded-full bg-gradient-to-r from-[#5893ec] to-[#9bcef7] px-3 text-xs font-medium text-white hover:opacity-90 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#5893ec]">Upgrade</button>
            </div>
          </div>
          {/* Top Tab (only Plans) */}
          <div className="flex items-center gap-2 overflow-auto">
            <span className="whitespace-nowrap text-xs font-medium rounded-full border px-3 py-1 bg-white border-gray-200 text-gray-900 shadow-sm">
              Plans
            </span>
          </div>
        </div>

        {/* Current Subscription (hidden if plan is Free) */}
        {clinic?.subscription && clinic.subscription.plan.name.toLowerCase() !== 'free' && (
          <div className="mb-4">
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="px-4 py-3 border-b border-gray-100 rounded-t-2xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Crown className="h-5 w-5 text-yellow-600" />
                    <span className="text-sm font-semibold text-gray-900">Current plan</span>
                    <Badge className="bg-blue-100 text-blue-700 border-blue-200">{clinic.subscription.plan.name}</Badge>
                  </div>
                  <Badge
                    variant={clinic.subscription.status === 'ACTIVE' ? 'default' : 'secondary'}
                    className={clinic.subscription.status === 'ACTIVE' ? 'bg-green-100 text-green-700 border-green-200' : ''}
                  >
                    {clinic.subscription.status}
                  </Badge>
                </div>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-2">
                  {[{
                    title: 'Doctors',
                    value: clinic.subscription.maxDoctors,
                    color: 'text-blue-600'
                  }, {
                    title: 'Clients',
                    value: clinic.subscription.plan.maxPatients,
                    color: 'text-green-600'
                  }, {
                    title: 'Referrals / mo',
                    value: clinic.subscription.plan.name.toLowerCase() === 'starter' ? 500 : clinic.subscription.plan.name.toLowerCase() === 'creator' ? 2000 : '-',
                    color: 'text-purple-600'
                  }, {
                    title: 'Rewards limit',
                    value: 50,
                    color: 'text-orange-600'
                  }].map((kpi) => (
                    <div key={kpi.title} className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-gray-500">{kpi.title}</span>
                        {/* Using Users icon for simplicity; can swap for specific icons if desired */}
                        <Users className={`h-4 w-4 ${kpi.color}`} />
                      </div>
                      <div className="mt-1 text-[22px] leading-7 font-semibold text-gray-900">{kpi.value}</div>
                    </div>
                  ))}
                </div>

                {/* Billing panel removed to focus on plans */}
              </div>
            </div>
          </div>
        )}

        {/* Available Plans */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-900">Available plans</h2>
            {/* Annual toggle (visual only) */}
            <label className="flex items-center gap-2 text-xs text-gray-700">
              <span>Annual</span>
              <button
                type="button"
                onClick={() => setAnnualBilling(v => !v)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${annualBilling ? 'bg-blue-500' : 'bg-gray-200'}`}
                aria-pressed={annualBilling}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${annualBilling ? 'translate-x-4' : 'translate-x-1'}`} />
              </button>
            </label>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {displayPlans.map((plan: SubscriptionPlan) => {
              const isCurrentPlan = clinic?.subscription?.plan.name === plan.name;

              return (
                <div key={plan.id} className={`rounded-2xl border border-gray-200 bg-white shadow-sm ${isCurrentPlan ? 'ring-2 ring-blue-500' : ''}`}>
                  <div className="px-4 py-4 border-b border-gray-100 rounded-t-2xl">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-sm font-semibold text-gray-900">{plan.name}</div>
                        <p className="text-xs text-gray-600">{plan.description}</p>
                      </div>
                      {isCurrentPlan && (
                        <Badge className="bg-blue-100 text-blue-700 border-blue-200">Current</Badge>
                      )}
                    </div>
                    <div className="mt-3">
                      {plan.contactOnly || plan.price === null ? (
                        <div>
                          <div className="text-2xl font-bold text-gray-900">Flexible billing</div>
                          <div className="text-xs text-gray-600">Custom plans</div>
                        </div>
                      ) : (
                        <div className="flex items-end gap-2">
                          <div className="text-3xl font-bold text-gray-900">$ {plan.price}</div>
                          <div className="text-xs text-gray-600 mb-1">per month</div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="mb-3">
                      {plan.contactOnly || plan.price === null ? (
                        <Button asChild className="w-full bg-gradient-to-r from-[#5893ec] to-[#9bcef7] text-white hover:opacity-90">
                          <a href="/contact" target="_self">Book a demo</a>
                        </Button>
                      ) : (
                        <Button onClick={() => handlePlanChange(plan.id)} className="w-full bg-gradient-to-r from-[#5893ec] to-[#9bcef7] text-white hover:opacity-90">
                          {isCurrentPlan ? 'Current plan' : 'Upgrade'}
                        </Button>
                      )}
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span>{plan.maxPatients} clients</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span>{plan.name.toLowerCase() === 'starter' ? '500 referrals / month' : plan.name.toLowerCase() === 'creator' ? '2000 referrals / month' : 'Referrals / month as per plan'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span>Credit by purchase access</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span>Up to 50 rewards</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <XCircle className="h-4 w-4 text-gray-400" />
                        <span>No access to Campaigns</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Billing history removed to keep the page focused on plans */}
      </div>
    </div>
  );
} 