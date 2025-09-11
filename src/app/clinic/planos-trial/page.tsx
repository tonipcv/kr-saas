'use client';

// Render the same UI as /clinic/subscription. The subscription page already
// enables trial by default when pathname includes '/clinic/planos-trial'.
import SubscriptionManagement from '../subscription/page';

export default function ClinicTrialPlans() {
  return <SubscriptionManagement />;
}
