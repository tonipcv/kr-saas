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
  XCircle,
  Plus
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number | null;
  baseDoctors: number;
  basePatients: number;
  // Some API responses use maxPatients; keep it optional to satisfy both
  maxPatients?: number;
  // Stripe price id for real checkout (non-enterprise)
  priceId?: string;
  features: {
    customBranding: boolean;
    advancedReports: boolean;
    allowPurchaseCredits: boolean;
    maxReferralsPerMonth: number;
    addOns?: {
      extraDoctor?: { price: number; description: string };
      extraPatients?: { price: number; amount: number; description: string };
      advancedReports?: { price: number; description: string };
    };
  };
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
  const { data: session, status } = useSession();
  const router = useRouter();
  const [clinic, setClinic] = useState<ClinicData | null>(null);
  const [availablePlans, setAvailablePlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [annualBilling, setAnnualBilling] = useState(false);

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }
    // authenticated
    fetchData();
  }, [status, router]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch clinic data
      const clinicResponse = await fetch('/api/clinic');
      if (clinicResponse.ok) {
        const clinicData = await clinicResponse.json();
        const basicClinic = clinicData.clinic;
        // If we have an ID, refetch with clinicId to include subscription
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

  const handlePlanChange = async (plan: SubscriptionPlan) => {
    try {
      if (!plan || plan.contactOnly) return;

      const res = await fetch('/api/clinic/subscription/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // priceId é opcional no backend; ele mapeia pelo nome do plano
        body: JSON.stringify({ planId: plan.id })
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
      <div className="p-4 pt-6 pb-24">
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
    <div className="p-4 pt-16 pb-24">
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
              <Button variant="ghost" size="sm" asChild className="h-9 items-center text-sm font-medium text-gray-300 hover:bg-[#2F2F2F]">
                <Link href="/clinic">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Voltar
                </Link>
              </Button>
              {clinic?.subscription?.plan?.name?.toLowerCase() === 'free' && (
                <Button
                  asChild
                  className="h-9 rounded-lg bg-white text-black hover:bg-gray-100 font-medium"
                >
                  <a href="#plans">Upgrade agora</a>
                </Button>
              )}
            </div>
          </div>

        {/* Current Subscription (show for any plan, including Free) */}
        {clinic?.subscription && (
          <div className="mb-8">
            <div className="rounded-lg border border-[#333333] bg-[#2F2F2F] p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-lg text-white">{clinic.subscription.plan.name}</div>
                  <Badge className="bg-[#333333] text-gray-300 border-[#444444] font-normal">
                    {clinic.subscription.status === 'ACTIVE' ? 'Ativo' : clinic.subscription.status}
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

              {clinic.subscription.plan.name.toLowerCase() !== 'free' && (
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[{
                    title: 'Médicos',
                    value: clinic.subscription.maxDoctors,
                    unlimited: clinic.subscription.maxDoctors === -1
                  }, {
                    title: 'Pacientes',
                    value: clinic.subscription.plan.maxPatients,
                    unlimited: clinic.subscription.plan.maxPatients === -1
                  }, {
                    title: 'Indicações / mês',
                    value: clinic.subscription.plan.name.toLowerCase() === 'starter' ? 500 : clinic.subscription.plan.name.toLowerCase() === 'creator' ? 2000 : '-',
                    unlimited: false
                  }, {
                    title: 'Recompensas',
                    value: 50,
                    unlimited: false
                  }].map((kpi) => (
                    <div key={kpi.title} className="rounded-lg border border-[#333333] bg-[#2F2F2F] p-4">
                      <div className="text-sm text-gray-400">{kpi.title}</div>
                      <div className="mt-1 text-lg font-medium text-white">
                        {kpi.unlimited ? 'Ilimitado' : kpi.value}
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
              const isCurrentPlan = clinic?.subscription?.plan.name === plan.name;
              const isEnterprise = plan.contactOnly || plan.monthlyPrice === null;

              return (
                <div key={plan.id} className={`relative flex flex-col rounded-lg border ${isCurrentPlan ? 'border-white bg-[#2F2F2F] ring-1 ring-white' : 'border-[#333333] bg-[#2F2F2F] hover:border-[#444444]'} transition-all duration-200`}>
                  {isCurrentPlan && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-white text-black border-transparent font-medium">Plano atual</Badge>
                    </div>
                  )}
                  <div className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="text-lg text-white">{plan.name}</div>
                    </div>

                    <p className="mt-2 text-sm text-gray-400">{plan.description}</p>

                    <div className="mt-4">
                      {isEnterprise ? (
                        <div className="text-2xl font-medium text-white">Personalizado</div>
                      ) : (
                        <div className="flex items-baseline">
                          <span className="text-2xl font-medium text-white">$</span>
                          <span className="text-2xl font-medium text-white">{plan.monthlyPrice}</span>
                          <span className="ml-1 text-gray-400">/mês</span>
                        </div>
                      )}
                    </div>

                    <Button
                      onClick={isEnterprise ? () => window.open('https://calendly.com/getcxlus/free-consultation-to-implement-zuzz', '_blank') : () => handlePlanChange(plan)}
                      className={`mt-6 w-full h-10 rounded-lg ${
                        isCurrentPlan 
                          ? 'bg-[#333333] text-gray-400 cursor-not-allowed' 
                          : 'bg-white text-black hover:bg-gray-100'
                      }`}
                      disabled={isCurrentPlan}
                    >
                      {isCurrentPlan ? 'Plano atual' : isEnterprise ? 'Agendar demo' : 'Assinar'}
                    </Button>
                  </div>

                  <div className="px-6 pb-6">
                    <div className="h-px bg-[#333333] -mx-6 mb-6"></div>
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-sm font-medium text-white mb-4">O que está incluído</h4>
                        <ul className="space-y-3">
                          <li className="flex items-start">
                            <CheckCircle className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                            <span className="ml-3 text-sm text-gray-400">
                              {plan.baseDoctors === -1 ? 'Médicos ilimitados' : `Até ${plan.baseDoctors} médicos`}
                            </span>
                          </li>
                          <li className="flex items-start">
                            <CheckCircle className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                            <span className="ml-3 text-sm text-gray-400">
                              {plan.basePatients === -1 ? 'Pacientes ilimitados' : `Até ${plan.basePatients} pacientes`}
                            </span>
                          </li>
                          <li className="flex items-start">
                            <CheckCircle className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                            <span className="ml-3 text-sm text-gray-400">
                              {plan.features.maxReferralsPerMonth === -1 
                                ? 'Indicações ilimitadas' 
                                : `${plan.features.maxReferralsPerMonth} indicações/mês`}
                            </span>
                          </li>
                          {plan.features.customBranding && (
                            <li className="flex items-start">
                              <CheckCircle className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                              <span className="ml-3 text-sm text-gray-400">Custom branding</span>
                            </li>
                          )}
                          {plan.features.advancedReports && (
                            <li className="flex items-start">
                              <CheckCircle className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                              <span className="ml-3 text-sm text-gray-400">Relatórios avançados</span>
                            </li>
                          )}
                        </ul>
                      </div>

                      {plan.features.addOns && (
                        <div>
                          <h4 className="text-sm font-medium text-white mb-4">Add-ons disponíveis</h4>
                          <ul className="space-y-3">
                            {plan.features.addOns.extraDoctor && (
                              <li className="flex items-start">
                                <Plus className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                                <span className="ml-3 text-sm text-gray-400">
                                  Médico extra: $20/mês
                                </span>
                              </li>
                            )}
                            {plan.features.addOns.extraPatients && (
                              <li className="flex items-start">
                                <Plus className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                                <span className="ml-3 text-sm text-gray-400">
                                  +500 pacientes: $40/mês
                                </span>
                              </li>
                            )}
                          </ul>
                        </div>
                      )}
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