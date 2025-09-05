'use client';

import Navigation from '@/components/Navigation';
import { ClinicProvider } from '@/contexts/clinic-context';

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClinicProvider>
      <div className="min-h-[100dvh] h-full">
        <Navigation />
        <main className="h-full">
          {children}
        </main>
      </div>
    </ClinicProvider>
  );
} 