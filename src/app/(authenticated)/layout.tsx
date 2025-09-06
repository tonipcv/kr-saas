'use client';

import Navigation from '@/components/Navigation';
import { ClinicProvider } from '@/contexts/clinic-context';
import { useClinic } from '@/contexts/clinic-context';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

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
  const { currentClinic, isLoading } = useClinic();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) return;
    // Do not enforce subscription on admin routes
    if (pathname?.startsWith('/admin')) return;
    // Allow subscription management page itself
    if (pathname?.startsWith('/clinic/subscription')) return;

    const sub = currentClinic?.subscription;
    const planName = sub?.plan?.name?.toLowerCase();
    const isFree = planName === 'free';
    const hasActive = sub?.status === 'ACTIVE' && !isFree;

    // If no subscription or free plan, force redirect to subscription page
    if (!hasActive) {
      router.replace('/clinic/subscription');
    }
  }, [currentClinic?.subscription, isLoading, pathname, router]);

  return (
    <div className="min-h-[100dvh] h-full">
      <Navigation />
      <main className="h-full">
        {children}
      </main>
    </div>
  );
}