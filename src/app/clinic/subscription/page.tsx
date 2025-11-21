'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number | null;
  monthlyTxLimit?: number;
  // Plan tier (e.g., STARTER, GROWTH, CREATOR, ENTERPRISE)
  tier?: string;
  // Stripe price id for real checkout (non-enterprise)
  priceId?: string;
  features: {
    [key: string]: any;
  };
  contactOnly?: boolean;
  requireCard?: boolean;
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

function SubscriptionManagement() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [clinic, setClinic] = useState<ClinicData | null>(null);
  const [availablePlans, setAvailablePlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [annualBilling, setAnnualBilling] = useState(false);
  // Trial is available for onboarding new clinic flows only
  const isNewClinic = (searchParams?.get('newClinic') === '1') || (pathname?.includes('/clinic/planos-trial') ?? false);
  const [redirectingPlanId, setRedirectingPlanId] = useState<string | null>(null);
  const [eligibleTrial, setEligibleTrial] = useState<boolean>(true);

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }
    // authenticated
    fetchData();
  }, [status, router]);

  // No trial toggle. Trial is chosen via explicit button per plan.

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Choose the clinic to manage subscription:
      // 0) If clinicId is provided via query string, use it (highest priority)
      // 1) Otherwise try /api/clinics/current (best active/paid clinic for the user)
      // 2) Fallback to /api/clinic default (may auto-create a trial clinic if none exists)
      let selectedClinicId: string | null = null;
      const forcedClinicId = searchParams?.get('clinicId');

      if (forcedClinicId) {
        selectedClinicId = forcedClinicId;
      } else {
        try {
          const bestRes = await fetch('/api/clinics/current', { cache: 'no-store' });
          if (bestRes.ok) {
            const best = await bestRes.json();
            selectedClinicId = best?.clinic?.id || null;
          }
        } catch {}
      }

      if (selectedClinicId) {
        const clinicWithSubRes = await fetch(`/api/clinic?clinicId=${selectedClinicId}`);
        if (clinicWithSubRes.ok) {
          const clinicWithSubData = await clinicWithSubRes.json();
          setClinic(clinicWithSubData.clinic);
        }
      } else {
        // Fallback
        const clinicResponse = await fetch('/api/clinic');
        if (clinicResponse.ok) {
          const clinicData = await clinicResponse.json();
          const basicClinic = clinicData.clinic;
          if (basicClinic?.id) {
            const clinicWithSubRes = await fetch(`/api/clinic?clinicId=${basicClinic.id}`);
            if (clinicWithSubRes.ok) {
              const clinicWithSubData = await clinicWithSubRes.json();
              setClinic(clinicWithSubData.clinic);
            } else {
              setClinic(basicClinic);
            }
          } else {
            setClinic(basicClinic);
          }
        }
      }

      // Fetch available plans (public endpoint)
      const plansRes = await fetch('/api/plans', { cache: 'no-store' });
      if (plansRes.ok) {
        const data = await plansRes.json();
        setAvailablePlans(Array.isArray(data?.plans) ? data.plans : []);
      } else {
        setAvailablePlans([]);
      }

      // Trial is ONLY available when creating a NEW clinic and eligibility is true.
      if (isNewClinic) {
        try {
          const eligRes = await fetch('/api/clinic/subscription/eligibility', { cache: 'no-store' });
          if (eligRes.ok) {
            const ej = await eligRes.json();
            setEligibleTrial(Boolean(ej?.eligibleForTrial));
          } else {
            setEligibleTrial(false);
          }
        } catch {
          setEligibleTrial(false);
        }
      } else {
        setEligibleTrial(false);
      }

    } catch (error) {
      console.error('Error loading subscription data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePlanChange = async (plan: SubscriptionPlan, trial?: boolean) => {
    try {
      if (!plan || plan.contactOnly) return;
      setRedirectingPlanId(plan.id);

      const res = await fetch('/api/clinic/subscription/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // priceId é opcional no backend; ele mapeia pelo nome do plano
        // Quando é nova clínica, não enviamos clinicId para forçar criação de rascunho no backend
        body: JSON.stringify({ 
          planId: plan.id, 
          // If we already have a clinic loaded (e.g., created as draft in onboarding), always use its ID
          clinicId: clinic?.id || undefined,
          newClinic: !clinic?.id && isNewClinic ? true : undefined,
          // Only allow trial for brand new clinic with eligibility
          trial: (isNewClinic && trial && eligibleTrial) ? true : undefined,
          // Ensure the newly created clinic (if any) uses the intended name from onboarding
          clinicName: (isNewClinic ? (clinic?.name || searchParams?.get('clinicName') || undefined) : (clinic?.name || undefined)),
          subdomain: (isNewClinic ? (searchParams?.get('subdomain') || clinic?.name ? undefined : undefined) : undefined)
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Falha ao iniciar checkout');
      }

      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url as string;
      } else {
        throw new Error('URL de checkout não recebida');
      }
    } catch (e: any) {
      console.error('Checkout error:', e);
      alert(e?.message || 'Erro ao redirecionar para o checkout');
    } finally {
      // Se não redirecionar, reabilita botão
      setRedirectingPlanId(null);
    }
  };

  // Filter and sort plans (Free excluded, Enterprise last)
  const displayPlans = availablePlans
    .filter(p => p?.name?.toLowerCase() !== 'free')
    .sort((a, b) => {
      // Enterprise always last
      if (a.contactOnly || a.monthlyPrice === null) return 1;
      if (b.contactOnly || b.monthlyPrice === null) return -1;
      // Sort by price otherwise
      return (a.monthlyPrice || 0) - (b.monthlyPrice || 0);
    });

  if (loading) {
    return (
      <div className="min-h-screen bg-[#111] p-4 pt-6 pb-24">
        <div className="max-w-5xl mx-auto">
                      {/* Header skeleton */}
            <div className="flex flex-col gap-8 mb-12">
              <div className="flex justify-center">
                <div className="h-10 w-[120px] bg-[#2F2F2F] rounded animate-pulse" />
              </div>
              <div className="flex items-center gap-4">
                <div className="h-8 w-48 bg-[#2F2F2F] rounded animate-pulse" />
                <div className="h-9 w-24 bg-[#2F2F2F] rounded animate-pulse" />
              </div>
            </div>

          {/* Current plan skeleton */}
          <div className="mb-8">
            <div className="rounded-lg border border-[#333333] bg-[#2F2F2F] p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="h-6 w-48 bg-[#333333] rounded animate-pulse" />
                <div className="h-6 w-24 bg-[#333333] rounded animate-pulse" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="rounded-lg border border-[#333333] bg-[#2F2F2F] p-4">
                    <div className="h-4 w-24 bg-[#333333] rounded animate-pulse mb-2" />
                    <div className="h-6 w-16 bg-[#333333] rounded animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Plans skeleton */}
          <div className="mb-8">
            <div className="h-8 w-48 bg-[#2F2F2F] rounded animate-pulse mb-8" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="rounded-lg border border-[#333333] bg-[#2F2F2F] p-6">
                  <div className="h-6 w-32 bg-[#333333] rounded animate-pulse mb-4" />
                  <div className="h-4 w-48 bg-[#333333] rounded animate-pulse mb-4" />
                  <div className="h-8 w-24 bg-[#333333] rounded animate-pulse mb-6" />
                  <div className="h-10 w-full bg-[#333333] rounded animate-pulse mb-6" />
                  <div className="h-px bg-[#333333] -mx-6 mb-6" />
                  <div className="space-y-3">
                    {[...Array(5)].map((_, j) => (
                      <div key={j} className="h-4 w-full bg-[#333333] rounded animate-pulse" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#111] p-4 pt-16 pb-24">
      <div className="max-w-5xl mx-auto">
                  <div className="flex flex-col gap-8 mb-12">
            <div className="flex justify-center">
              <Image 
                src="/logo.png" 
                alt="Logo" 
                width={30} 
                height={10} 
                className="invert" // Isso faz a logo ficar branca
              />
            </div>
            <div className="flex items-center gap-4">
              {clinic?.subscription?.plan?.name?.toLowerCase() !== 'free' && (
                <Button variant="ghost" size="sm" asChild className="h-9 items-center text-sm font-medium text-gray-300 hover:bg-[#2F2F2F]">
                  <Link href="/clinic">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                  </Link>
                </Button>
              )}
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: '/auth/signin' })}
                className="px-2 py-1 text-sm font-medium text-gray-300 hover:text-white rounded-lg focus:outline-none"
              >
                Sign out
              </button>
            </div>
            {isNewClinic && (
              <div className="rounded-lg border border-[#333333] bg-[#232323] p-4 text-gray-200">
                <div className="text-sm font-medium">Select a plan for your new clinic</div>
                <div className="text-xs text-gray-400 mt-1">You're creating a new clinic. After selecting a plan, we'll start checkout and activate your clinic once payment is confirmed.</div>
              </div>
            )}
          </div>

        {/* Current Subscription (show for any plan, including Free) */}
        {!isNewClinic && clinic?.subscription && (
          <div className="mb-8">
            <div className="rounded-lg border border-[#333333] bg-[#2F2F2F] p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-lg text-white">{clinic.subscription.plan.name}</div>
                  {/* Tier chip (if available) */}
                  {typeof (clinic.subscription.plan as any)?.tier !== 'undefined' && (
                    <span className="inline-flex items-center rounded-md border border-[#3a3a3a] bg-[#232323] px-2 py-1 text-[11px] text-gray-300">
                      Tier: {String((clinic.subscription.plan as any).tier).toUpperCase()}
                    </span>
                  )}
                  <Badge className="bg-[#333333] text-gray-300 border-[#444444] font-normal">
                    {clinic.subscription.status === 'ACTIVE' ? 'Active' : clinic.subscription.status}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  className="text-gray-300 hover:bg-[#333333] hover:text-white"
                  onClick={() => window.location.href = '#plans'}
                >
                  Upgrade
                </Button>
              </div>

              {/* Legacy KPIs removed to reflect new plan schema */}
            </div>
          </div>
        )}

        {/* Available Plans */}
        <div className="max-w-5xl mx-auto" id="plans">
          <div className="mb-8">
            <h2 className="text-2xl font-medium text-white">Todos os planos</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {displayPlans.map((plan: SubscriptionPlan) => {
              const isCurrentPlan = !isNewClinic && clinic?.subscription?.plan.name === plan.name;
              const isEnterprise = plan.contactOnly || plan.monthlyPrice === null;

              return (
                <div key={plan.id} className={`relative flex flex-col rounded-lg border ${isCurrentPlan ? 'border-white bg-[#2F2F2F] ring-1 ring-white' : 'border-[#333333] bg-[#2F2F2F] hover:border-[#444444]'} transition-all duration-200`}>
                  {isCurrentPlan && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-white text-black border-transparent font-medium">Current plan</Badge>
                    </div>
                  )}
                  <div className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="text-lg text-white">{plan.name}</div>
                    </div>

                    <p className="mt-2 text-sm text-gray-400">{plan.description}</p>

                    <div className="mt-4">
                      {isEnterprise ? (
                        <div className="text-2xl font-medium text-white">Custom</div>
                      ) : (
                        <div className="flex items-baseline">
                          <span className="text-2xl font-medium text-white">$</span>
                          <span className="text-2xl font-medium text-white">{plan.monthlyPrice}</span>
                          <span className="ml-1 text-gray-400">/month</span>
                        </div>
                      )}
                    </div>

                    {/* Tier badge */}
                    {plan.tier && (
                      <div className="mt-2 inline-flex items-center rounded-md border border-[#3a3a3a] bg-[#232323] px-2 py-1">
                        <span className="text-[11px] tracking-wide text-gray-300">Tier: {String(plan.tier).toUpperCase()}</span>
                      </div>
                    )}

                    {/* Plan core limits (new schema) */}
                    <div className="mt-4 grid grid-cols-1 gap-2">
                      <div className="rounded-lg border border-[#3a3a3a] bg-[#232323] px-3 py-2">
                        <div className="text-[11px] text-gray-400">Monthly transactions</div>
                        <div className="text-sm text-white font-medium">
                          {(() => {
                            const lim = (plan as any).monthlyTxLimit;
                            if (lim === -1) return 'Unlimited';
                            if (typeof lim === 'number') return `${lim}`;
                            return '-';
                          })()}
                        </div>
                      </div>
                    </div>

                    <div className="mt-6">
                      <Button
                        onClick={isEnterprise ? () => window.open('https://calendly.com/getcxlus/free-consultation-to-implement-zuzz', '_blank') : () => handlePlanChange(plan, true)}
                        className={`w-full h-10 rounded-lg transition-colors ${
                          isCurrentPlan
                            ? 'bg-[#333333] text-gray-400 cursor-not-allowed'
                            : 'bg-white text-black border border-white/20 hover:bg-white/90'
                        }`}
                        disabled={isCurrentPlan || (!isEnterprise && redirectingPlanId === plan.id)}
                      >
                        {isCurrentPlan
                          ? 'Current plan'
                          : isEnterprise
                            ? 'Book a demo'
                            : (redirectingPlanId === plan.id ? 'Redirecting…' : (eligibleTrial ? 'Start 14-day trial' : 'Subscribe now'))}
                      </Button>
                    </div>
                  </div>

                  <div className="px-6 pb-6">
                    <div className="h-px bg-[#333333] -mx-6 mb-6"></div>
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-sm font-medium text-white mb-4">What’s included</h4>
                        <ul className="space-y-2">
                          <li className="text-sm text-gray-300">
                            {(() => {
                              const lim = (plan as any).monthlyTxLimit;
                              if (lim === -1) return 'Transações mensais: Ilimitadas';
                              if (typeof lim === 'number') return `Transações mensais: até ${lim}`;
                              return 'Transações mensais conforme plano';
                            })()}
                          </li>
                          {(() => {
                            const f = (plan?.features || {}) as Record<string, any>;
                            const enabled = Object.entries(f)
                              .filter(([k, v]) => typeof v === 'boolean' && v)
                              .map(([k]) => k.replace(/([A-Z])/g, ' $1').replace(/^\w/, (c) => c.toUpperCase()));
                            return enabled.map((label) => (
                              <li key={label} className="text-sm text-gray-300">{label}</li>
                            ));
                          })()}
                        </ul>
                      </div>
                      {/* Optional: you can render specific add-ons if present in features.addOns */}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#111] text-white flex items-center justify-center">Carregando…</div>}>
      <SubscriptionManagement />
    </Suspense>
  );
}