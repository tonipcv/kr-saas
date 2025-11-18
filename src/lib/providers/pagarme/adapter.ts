import {
  PaymentProvider,
  PaymentProviderAdapter,
  CreateSubscriptionInput,
  SubscriptionResult,
  PaymentStatus,
} from '../types';
import { createPagarmeSubscription } from './legacy';

export class PagarmeAdapter implements PaymentProviderAdapter {
  readonly provider = PaymentProvider.PAGARME;

  constructor(private clinicId: string) {}

  async createSubscription(input: CreateSubscriptionInput): Promise<SubscriptionResult> {
    // Input log
    try {
      console.log('[PagarmeAdapter] Creating subscription', {
        clinicId: this.clinicId,
        offerId: input.offerId,
        amount: input.amount,
        currency: input.currency,
        method: input.paymentMethod?.type,
      });
    } catch {}

    try {
      const result = await createPagarmeSubscription({
        clinicId: this.clinicId,
        customerId: input.customerId,
        offerId: input.offerId,
        amount: input.amount,
        currency: input.currency,
        interval: input.interval,
        customer: input.customer,
        paymentMethod: input.paymentMethod,
        metadata: input.metadata,
      });

      if (!result || !result.id) {
        throw new Error('Invalid subscription result from Pagar.me');
      }

      try {
        console.log('[PagarmeAdapter] Subscription created', { subscriptionId: result.id, status: result.status });
      } catch {}

      return {
        id: result.id,
        provider: PaymentProvider.PAGARME,
        status: this.mapStatus(result.status),
        customerId: result.customerId,
        amount: result.amount,
        currency: result.currency,
        createdAt: new Date(result.createdAt),
        currentPeriodStart: result.currentPeriodStart ? new Date(result.currentPeriodStart) : undefined,
        currentPeriodEnd: result.currentPeriodEnd ? new Date(result.currentPeriodEnd) : undefined,
        providerData: {
          subscriptionId: result.subscriptionId,
          chargeId: result.chargeId,
          ...result.raw,
        },
        metadata: result.metadata,
      };
    } catch (error: any) {
      try {
        console.error('[PagarmeAdapter] Subscription creation failed', {
          clinicId: this.clinicId,
          offerId: input.offerId,
          error: error?.message,
        });
      } catch {}
      throw new Error(`Failed to create Pagar.me subscription: ${error?.message || String(error)}`);
    }
  }

  private mapStatus(pagarmeStatus: string): PaymentStatus {
    const normalized = pagarmeStatus?.toLowerCase?.().trim?.() || '';
    const map: Record<string, PaymentStatus> = {
      paid: PaymentStatus.PAID,
      authorized: PaymentStatus.AUTHORIZED,
      active: PaymentStatus.PAID,
      trial: PaymentStatus.PENDING,
      trialing: PaymentStatus.PENDING,
      pending: PaymentStatus.PENDING,
      processing: PaymentStatus.PENDING,
      waiting_payment: PaymentStatus.PENDING,
      analyzing: PaymentStatus.PENDING,
      pending_review: PaymentStatus.PENDING,
      failed: PaymentStatus.FAILED,
      refused: PaymentStatus.FAILED,
      canceled: PaymentStatus.CANCELED,
      cancelled: PaymentStatus.CANCELED,
      chargedback: PaymentStatus.CANCELED,
      refunded: PaymentStatus.REFUNDED,
      pending_refund: PaymentStatus.REFUNDED,
    };
    const mapped = map[normalized];
    if (!mapped) {
      try { console.warn('[PagarmeAdapter] Unknown status, defaulting to PENDING', { originalStatus: pagarmeStatus, normalized }); } catch {}
      return PaymentStatus.PENDING;
    }
    return mapped;
  }
}
