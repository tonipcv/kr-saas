'use client';

import Navigation from '@/components/Navigation';
import { ClinicProvider } from '@/contexts/clinic-context';
import { useClinic } from '@/contexts/clinic-context';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClinicProvider>
      <EnforceSubscription>{children}</EnforceSubscription>
    </ClinicProvider>
  );
}

function EnforceSubscription({ children }: { children: React.ReactNode }) {
  const { currentClinic, availableClinics, isLoading, switchClinic } = useClinic();
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [showBlocker, setShowBlocker] = useState(false);
  const [showAccessModal, setShowAccessModal] = useState(false);
  const isDoctorArea = pathname?.startsWith('/doctor') || pathname?.startsWith('/clinic');
  const isSubscriptionPage = pathname?.startsWith('/clinic/subscription') || pathname?.startsWith('/clinic/planos-trial');
  const isMerchantApplication = pathname?.startsWith('/business/merchant-application');

  useEffect(() => {
    if (isLoading) return;
    // Only enforce inside doctor/clinic area
    if (!isDoctorArea) return;
    // Do not enforce subscription on admin routes
    if (pathname?.startsWith('/admin')) return;
    // Allow subscription management and trial pages
    if (isSubscriptionPage) return;

    // 1) If user has no clinics yet, force them to the clinic creation/management page
    if (!availableClinics || availableClinics.length === 0) {
      router.replace('/business/clinic');
      setShowBlocker(false);
      return;
    }

    const sub = currentClinic?.subscription;
    const planName = sub?.plan?.name?.toLowerCase();
    const isFree = planName === 'free';
    const hasActive = sub?.status === 'ACTIVE' && !isFree;

    // If current clinic is not active, but there exists another active paid clinic, switch to it
    if (!hasActive && availableClinics?.length) {
      const hasActivePaid = (c: any) => {
        const n = c?.subscription?.plan?.name?.toLowerCase();
        const free = n === 'free';
        return c?.subscription?.status === 'ACTIVE' && !free;
      };
      const best = availableClinics.find(hasActivePaid);
      // Respect user's saved selection: only auto-switch if user hasn't chosen a clinic explicitly
      const savedClinicId = typeof window !== 'undefined' ? localStorage.getItem('selectedClinicId') : null;
      const userHasSavedSelection = Boolean(savedClinicId);
      if (best && best.id !== currentClinic?.id && !userHasSavedSelection) {
        switchClinic(best.id);
        // allow state to update before deciding blocker visibility
        return;
      }
    }

    // 2) If there is a clinic but no active paid plan, force redirect to subscription instead of blocker
    if (!hasActive) {
      const id = currentClinic?.id;
      const base = shouldOfferTrial ? '/clinic/planos-trial' : '/clinic/subscription';
      const url = id ? `${base}?clinicId=${encodeURIComponent(id)}#plans` : `${base}#plans`;
      router.replace(url);
      setShowBlocker(false);
      return;
    }

    // Otherwise, allow normal rendering
    setShowBlocker(false);
  }, [
    currentClinic?.id,
    currentClinic?.subscription,
    availableClinics,
    isLoading,
    pathname,
    router,
    switchClinic,
    isDoctorArea,
    isSubscriptionPage,
  ]);

  const activePaidClinics = useMemo(() => {
    return (availableClinics || []).filter((c: any) => {
      const n = c?.subscription?.plan?.name?.toLowerCase();
      const free = n === 'free';
      return c?.subscription?.status === 'ACTIVE' && !free;
    });
  }, [availableClinics]);

  // Heuristic: onboarding (first-time) if none of the clinics has a paid active subscription
  const shouldOfferTrial = useMemo(() => {
    const list = availableClinics || [];
    if (!list.length) return true;
    const anyPaid = list.some((c: any) => {
      const n = c?.subscription?.plan?.name?.toLowerCase();
      const free = n === 'free';
      return c?.subscription?.status === 'ACTIVE' && !free;
    });
    return !anyPaid;
  }, [availableClinics]);

  // Intercept clicks globally when access is pending to show modal instead of navigating
  useEffect(() => {
    if ((session?.user as any)?.accessGranted !== false) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const anchor = target.closest('a') as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute('href') || '';
      const isInternal = href.startsWith('/') && !href.startsWith('/auth') && !href.startsWith('/admin') && !href.startsWith('/business/merchant-application');
      if (isInternal) {
        e.preventDefault();
        setShowAccessModal(true);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [session?.user]);

  return (
    <div className="min-h-[100dvh] h-full">
      <Navigation />
      <main className="h-full">
        {children}
      </main>

      {/* Global access gating modal (client-side) */}
      <Dialog
        open={((session?.user as any)?.accessGranted === false) && !isMerchantApplication && !pathname?.startsWith('/admin')}
        onOpenChange={(open) => setShowAccessModal(open)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{(typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('pt')) ? 'Complete seu cadastro' : 'Complete your registration'}</DialogTitle>
            <DialogDescription>
              {(typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('pt'))
                ? 'Para acessar os recursos, finalize seu cadastro com os dados do negócio e documentos necessários.'
                : 'To access features, please complete your onboarding with business details and required documents.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-start">
            <div className="flex gap-2">
              <Link href="/business/merchant-application" className="w-full">
                <Button className="w-full">{(typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('pt')) ? 'Preencher dados' : 'Fill details'}</Button>
              </Link>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => signOut({ callbackUrl: '/auth/signin' })}
              >
                {(typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('pt')) ? 'Sair' : 'Sign out'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Blocking modal when clinic is Free or without active paid plan */}
      {showBlocker && isDoctorArea && !pathname?.startsWith('/admin') && !isSubscriptionPage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative z-[101] max-w-md w-[90%] rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-gray-900">Plano necessário</h2>
            <p className="mt-2 text-sm text-gray-600">
              Sua clínica atual está no plano Free. Para acessar estes recursos, faça o upgrade do seu plano.
            </p>

            {activePaidClinics.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium text-gray-800">Você tem outra clínica ativa:</p>
                <div className="mt-2 space-y-2">
                  {activePaidClinics.map((c: any) => (
                    <button
                      key={c.id}
                      className="w-full text-left px-3 py-2 rounded-md border border-gray-200 hover:bg-gray-50 text-sm"
                      onClick={() => {
                        switchClinic(c.id);
                        setShowBlocker(false);
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-900 truncate">{c.name}</span>
                        <span className="ml-2 text-xs rounded-full bg-green-100 text-green-700 px-2 py-0.5">Ativa</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                className="w-full px-4 h-10 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50"
                onClick={() => {
                  const id = currentClinic?.id;
                  const base = shouldOfferTrial ? '/clinic/planos-trial' : '/clinic/subscription';
                  const url = id ? `${base}?clinicId=${encodeURIComponent(id)}#plans` : `${base}#plans`;
                  router.replace(url);
                }}
              >
                Fazer upgrade
              </button>
              <button
                className="w-full px-4 h-10 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50"
                onClick={() => router.replace('/doctor/clinic')}
              >
                Gerenciar clínica
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}