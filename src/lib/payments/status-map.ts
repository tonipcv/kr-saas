// Centralized provider -> internal PaymentStatus mapping
// Do not import Prisma enums here to avoid client build coupling. Return string literals matching the DB enum.

export type InternalPaymentStatus =
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED'
  | 'PROCESSING'
  | 'PENDING'
  | 'REQUIRES_ACTION'
  | 'REFUNDING'
  | 'CHARGEBACK'
  | 'DISPUTED'
  | 'EXPIRED';

export type Provider = 'STRIPE' | 'PAGARME' | 'APPMAX' | string;

// Legacy textual status used in payment_transactions.status
export type LegacyStatus =
  | 'paid'
  | 'failed'
  | 'canceled'
  | 'refunded'
  | 'processing'
  | 'pending'
  | 'authorized'
  | 'underpaid'
  | 'overpaid'
  | 'chargedback';

export function providerStatusToInternal(provider: Provider, raw: string): InternalPaymentStatus {
  const p = String(provider || '').toUpperCase();
  const v = String(raw || '').toLowerCase();

  // Stripe event-driven: map common raw statuses when available
  if (p === 'STRIPE') {
    if (v === 'succeeded' || v === 'paid' || v === 'captured') return 'SUCCEEDED';
    if (v === 'requires_action' || v === 'requires_payment_method' || v === 'requires_confirmation') return 'REQUIRES_ACTION';
    if (v === 'processing') return 'PROCESSING';
    if (v === 'requires_capture' || v === 'authorized') return 'PROCESSING';
    if (v === 'canceled') return 'CANCELED';
    if (v === 'refunded') return 'REFUNDED';
    if (v === 'failed' || v === 'payment_failed') return 'FAILED';
  }

  // Pagar.me
  if (p === 'PAGARME') {
    if (v === 'paid' || v === 'approved' || v === 'captured' || v === 'integrated') return 'SUCCEEDED';
    if (v === 'processing' || v === 'pending') return 'PROCESSING';
    if (v === 'refused' || v === 'failed') return 'FAILED';
    if (v === 'canceled' || v === 'cancelled') return 'CANCELED';
    if (v === 'refunded' || v === 'estornado') return 'REFUNDED';
    if (v === 'chargedback') return 'CHARGEBACK';
    if (v === 'underpaid' || v === 'overpaid') return 'PROCESSING';
  }

  // Appmax (Portuguese fragments common in payloads)
  if (p === 'APPMAX') {
    if (v.includes('aprov')) return 'SUCCEEDED'; // aprovado
    if (v.includes('autor')) return 'PROCESSING'; // autorizado
    if (v.includes('pend')) return 'PENDING';
    if (v.includes('integr')) return 'SUCCEEDED';
    if (v.includes('estorn') || v.includes('refun')) return 'REFUNDED';
    if (v.includes('cancel')) return 'CANCELED';
    if (v.includes('falh') || v.includes('recus') || v.includes('fail')) return 'FAILED';
  }

  // Fallbacks
  if (v === 'paid') return 'SUCCEEDED';
  if (v === 'refunded') return 'REFUNDED';
  if (v === 'canceled' || v === 'cancelled') return 'CANCELED';
  if (v === 'failed') return 'FAILED';
  if (v === 'pending') return 'PENDING';
  if (v === 'processing') return 'PROCESSING';

  // Default conservative
  return 'PROCESSING';
}

// Map internal PaymentStatus -> legacy textual status column
export function internalToLegacyStatus(s: InternalPaymentStatus): LegacyStatus {
  switch (s) {
    case 'SUCCEEDED':
      return 'paid';
    case 'FAILED':
      return 'failed';
    case 'CANCELED':
      return 'canceled';
    case 'REFUNDED':
      return 'refunded';
    case 'PARTIALLY_REFUNDED':
      return 'paid'; // keep legacy paid + refunded_cents for partial
    case 'PENDING':
    case 'PROCESSING':
    case 'REQUIRES_ACTION':
      return 'processing';
    case 'CHARGEBACK':
      return 'chargedback';
    default:
      return 'processing';
  }
}

// Convenience helper that normalizes a provider raw status into both models
export function normalizeProviderStatus(provider: Provider, raw: string): {
  internal: InternalPaymentStatus;
  legacy: LegacyStatus;
} {
  const internal = providerStatusToInternal(provider, raw);
  const legacy = internalToLegacyStatus(internal);
  return { internal, legacy };
}
