import { PaymentMethod } from '@/lib/providers/types';

/**
 * Normalizes raw payment method strings to the canonical PaymentMethod enum.
 * Handles various formats: credit_card, CREDITCARD, card, Cartão, etc.
 */
export function normalizePaymentMethod(raw?: string | null): PaymentMethod | null {
  if (!raw) return null;
  
  const normalized = String(raw).toUpperCase().trim();
  
  // Card variants
  if (
    normalized === 'CREDIT_CARD' ||
    normalized === 'CREDITCARD' ||
    normalized === 'CREDIT-CARD' ||
    normalized === 'CARD' ||
    normalized === 'CARTAO' ||
    normalized === 'CARTÃO'
  ) {
    return PaymentMethod.CREDIT_CARD;
  }
  
  // Debit card
  if (
    normalized === 'DEBIT_CARD' ||
    normalized === 'DEBITCARD' ||
    normalized === 'DEBIT-CARD' ||
    normalized === 'DEBIT'
  ) {
    return PaymentMethod.DEBIT_CARD;
  }
  
  // PIX
  if (normalized === 'PIX') {
    return PaymentMethod.PIX;
  }
  
  // Boleto
  if (
    normalized === 'BOLETO' ||
    normalized === 'BANK_SLIP' ||
    normalized === 'BANKSLIP'
  ) {
    return PaymentMethod.BOLETO;
  }
  
  return null;
}

/**
 * Returns a user-friendly label for a payment method.
 * Used for display in charts, tables, and UI components.
 */
export function labelForPaymentMethod(method: PaymentMethod | string | null): string {
  if (!method) return '—';
  
  const normalized = normalizePaymentMethod(method);
  
  switch (normalized) {
    case PaymentMethod.CREDIT_CARD:
      return 'Cartão';
    case PaymentMethod.DEBIT_CARD:
      return 'Débito';
    case PaymentMethod.PIX:
      return 'PIX';
    case PaymentMethod.BOLETO:
      return 'Boleto';
    default:
      return String(method).toUpperCase();
  }
}

/**
 * Returns the canonical enum value as a string (for database storage).
 * Use this when writing payment_method_type to ensure consistency.
 */
export function canonicalPaymentMethod(raw?: string | null): string | null {
  const normalized = normalizePaymentMethod(raw);
  return normalized ? normalized : null;
}

/**
 * Normalizes a payment method for database insertion.
 * Returns 'credit_card', 'pix', 'boleto', 'debit_card', or null.
 * Use this helper when inserting/updating payment_transactions.payment_method_type
 */
export function normalizeForDB(raw?: string | null): string | null {
  return canonicalPaymentMethod(raw);
}
