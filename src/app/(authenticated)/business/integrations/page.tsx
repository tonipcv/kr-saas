'use client';

import React, { Suspense } from 'react';
import DoctorIntegrationsPage from '@/app/(authenticated)/doctor/integrations/page';

export default function BusinessIntegrationsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-600">Loading…</div>}>
      <DoctorIntegrationsPage />
    </Suspense>
  );
}
