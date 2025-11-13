import type { UniversalPaymentStatus } from '../base';

export function normalizeStripeStatus(s: string): UniversalPaymentStatus {
  const map: Record<string, UniversalPaymentStatus> = {
    requires_payment_method: 'PENDING',
    requires_confirmation: 'PENDING',
    requires_action: 'REQUIRES_ACTION',
    processing: 'PROCESSING',
    requires_capture: 'PROCESSING',
    canceled: 'CANCELED',
    succeeded: 'SUCCEEDED',
  };
  return map[s] || 'PENDING';
}
