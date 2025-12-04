import { describe, it, expect } from 'vitest';
import { normalizePaymentMethod, labelForPaymentMethod, normalizeForDB } from '../normalize';
import { PaymentMethod } from '@/lib/providers/types';

describe('Payment Method Normalization', () => {
  describe('normalizePaymentMethod', () => {
    it('normalizes credit card variants', () => {
      expect(normalizePaymentMethod('credit_card')).toBe(PaymentMethod.CREDIT_CARD);
      expect(normalizePaymentMethod('CREDIT_CARD')).toBe(PaymentMethod.CREDIT_CARD);
      expect(normalizePaymentMethod('creditcard')).toBe(PaymentMethod.CREDIT_CARD);
      expect(normalizePaymentMethod('CREDITCARD')).toBe(PaymentMethod.CREDIT_CARD);
      expect(normalizePaymentMethod('credit-card')).toBe(PaymentMethod.CREDIT_CARD);
      expect(normalizePaymentMethod('CREDIT-CARD')).toBe(PaymentMethod.CREDIT_CARD);
      expect(normalizePaymentMethod('card')).toBe(PaymentMethod.CREDIT_CARD);
      expect(normalizePaymentMethod('CARD')).toBe(PaymentMethod.CREDIT_CARD);
      expect(normalizePaymentMethod('cartao')).toBe(PaymentMethod.CREDIT_CARD);
      expect(normalizePaymentMethod('CARTAO')).toBe(PaymentMethod.CREDIT_CARD);
      expect(normalizePaymentMethod('Cartão')).toBe(PaymentMethod.CREDIT_CARD);
      expect(normalizePaymentMethod('CARTÃO')).toBe(PaymentMethod.CREDIT_CARD);
    });

    it('normalizes debit card variants', () => {
      expect(normalizePaymentMethod('debit_card')).toBe(PaymentMethod.DEBIT_CARD);
      expect(normalizePaymentMethod('DEBIT_CARD')).toBe(PaymentMethod.DEBIT_CARD);
      expect(normalizePaymentMethod('debitcard')).toBe(PaymentMethod.DEBIT_CARD);
      expect(normalizePaymentMethod('DEBITCARD')).toBe(PaymentMethod.DEBIT_CARD);
      expect(normalizePaymentMethod('debit-card')).toBe(PaymentMethod.DEBIT_CARD);
      expect(normalizePaymentMethod('debit')).toBe(PaymentMethod.DEBIT_CARD);
    });

    it('normalizes PIX', () => {
      expect(normalizePaymentMethod('pix')).toBe(PaymentMethod.PIX);
      expect(normalizePaymentMethod('PIX')).toBe(PaymentMethod.PIX);
      expect(normalizePaymentMethod('Pix')).toBe(PaymentMethod.PIX);
    });

    it('normalizes boleto variants', () => {
      expect(normalizePaymentMethod('boleto')).toBe(PaymentMethod.BOLETO);
      expect(normalizePaymentMethod('BOLETO')).toBe(PaymentMethod.BOLETO);
      expect(normalizePaymentMethod('bank_slip')).toBe(PaymentMethod.BOLETO);
      expect(normalizePaymentMethod('BANK_SLIP')).toBe(PaymentMethod.BOLETO);
      expect(normalizePaymentMethod('bankslip')).toBe(PaymentMethod.BOLETO);
    });

    it('returns null for invalid/null/undefined', () => {
      expect(normalizePaymentMethod(null)).toBe(null);
      expect(normalizePaymentMethod(undefined)).toBe(null);
      expect(normalizePaymentMethod('')).toBe(null);
      expect(normalizePaymentMethod('invalid')).toBe(null);
      expect(normalizePaymentMethod('unknown')).toBe(null);
    });
  });

  describe('labelForPaymentMethod', () => {
    it('returns user-friendly labels', () => {
      expect(labelForPaymentMethod(PaymentMethod.CREDIT_CARD)).toBe('Cartão');
      expect(labelForPaymentMethod(PaymentMethod.DEBIT_CARD)).toBe('Débito');
      expect(labelForPaymentMethod(PaymentMethod.PIX)).toBe('PIX');
      expect(labelForPaymentMethod(PaymentMethod.BOLETO)).toBe('Boleto');
    });

    it('normalizes input before labeling', () => {
      expect(labelForPaymentMethod('credit_card')).toBe('Cartão');
      expect(labelForPaymentMethod('CREDITCARD')).toBe('Cartão');
      expect(labelForPaymentMethod('card')).toBe('Cartão');
      expect(labelForPaymentMethod('CARTAO')).toBe('Cartão');
      expect(labelForPaymentMethod('pix')).toBe('PIX');
      expect(labelForPaymentMethod('boleto')).toBe('Boleto');
      expect(labelForPaymentMethod('bank_slip')).toBe('Boleto');
    });

    it('returns fallback for invalid values', () => {
      expect(labelForPaymentMethod(null)).toBe('—');
      expect(labelForPaymentMethod(undefined)).toBe('—');
      expect(labelForPaymentMethod('')).toBe('—');
      expect(labelForPaymentMethod('unknown')).toBe('UNKNOWN');
    });
  });

  describe('normalizeForDB', () => {
    it('returns canonical enum string for database storage', () => {
      expect(normalizeForDB('CREDITCARD')).toBe('credit_card');
      expect(normalizeForDB('card')).toBe('credit_card');
      expect(normalizeForDB('CARTAO')).toBe('credit_card');
      expect(normalizeForDB('pix')).toBe('pix');
      expect(normalizeForDB('PIX')).toBe('pix');
      expect(normalizeForDB('boleto')).toBe('boleto');
      expect(normalizeForDB('BANK_SLIP')).toBe('boleto');
      expect(normalizeForDB('debit_card')).toBe('debit_card');
    });

    it('returns null for invalid values', () => {
      expect(normalizeForDB(null)).toBe(null);
      expect(normalizeForDB(undefined)).toBe(null);
      expect(normalizeForDB('')).toBe(null);
      expect(normalizeForDB('invalid')).toBe(null);
    });
  });

  describe('Integration scenarios', () => {
    it('handles dashboard aggregation scenario', () => {
      const transactions = [
        { payment_method_type: 'credit_card' },
        { payment_method_type: 'CREDITCARD' },
        { payment_method_type: 'card' },
        { payment_method_type: 'CARTAO' },
        { payment_method_type: 'pix' },
        { payment_method_type: 'PIX' },
      ];

      const map = new Map<string, number>();
      for (const t of transactions) {
        const key = labelForPaymentMethod(t.payment_method_type);
        map.set(key, (map.get(key) || 0) + 1);
      }

      // Should aggregate all card variants into one
      expect(map.get('Cartão')).toBe(4);
      expect(map.get('PIX')).toBe(2);
      expect(map.size).toBe(2);
    });

    it('handles webhook normalization scenario', () => {
      const webhookData = { payment_method: 'CREDITCARD' };
      const normalized = normalizeForDB(webhookData.payment_method);
      expect(normalized).toBe('credit_card');
    });
  });
});
