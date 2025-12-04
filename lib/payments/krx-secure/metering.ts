// KRX Secure Metering & Pricing

import { prisma } from '@/lib/prisma';
import type { KRXSecureOperation } from './types';

// Custos Evervault (base interna - estimados)
const EVERVAULT_UNIT_COSTS: Record<KRXSecureOperation, number> = {
  'inspect': 0.005,
  'card.create': 0.10,
  'network-token.create': 0.15,
  'cryptogram.create': 0.05,
  '3ds-session.create': 0.10,
  '3ds-session.get': 0.02,
  'insights.full': 0.01,
};

// KRX Secure pricing (com margem 3-5x)
const KRX_SECURE_PRICING: Record<KRXSecureOperation, number> = {
  'inspect': 0.02,
  'card.create': 0.30,
  'network-token.create': 0.45,
  'cryptogram.create': 0.15,
  '3ds-session.create': 0.40,
  '3ds-session.get': 0.10,
  'insights.full': 0.03,
};

export type KRXSecureUsageEvent = {
  merchantId: string;
  customerId?: string;
  paymentTxId?: string;
  operation: KRXSecureOperation;
  evervaultCost: number;
  krxPrice: number;
  margin: number;
  metadata?: Record<string, any>;
};

export class KRXSecureMetering {
  /**
   * Record a KRX Secure operation usage
   */
  async record(event: Omit<KRXSecureUsageEvent, 'margin'>): Promise<void> {
    const margin = event.krxPrice - event.evervaultCost;

    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO krx_secure_usage (
          id, merchant_id, customer_id, payment_tx_id,
          operation, evervault_cost, krx_price, margin,
          metadata, created_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3,
          $4, $5, $6, $7,
          $8::jsonb, NOW()
        )`,
        event.merchantId,
        event.customerId || null,
        event.paymentTxId || null,
        event.operation,
        event.evervaultCost,
        event.krxPrice,
        margin,
        JSON.stringify(event.metadata || {})
      );
    } catch (error) {
      console.error('[KRXSecureMetering] Failed to record usage:', error);
      // Non-blocking: don't fail the payment if metering fails
    }
  }

  /**
   * Get unit cost for an operation
   */
  getUnitCost(operation: KRXSecureOperation): {
    evervaultCost: number;
    krxPrice: number;
    margin: number;
  } {
    const evervaultCost = EVERVAULT_UNIT_COSTS[operation] || 0;
    const krxPrice = KRX_SECURE_PRICING[operation] || 0;
    return {
      evervaultCost,
      krxPrice,
      margin: krxPrice - evervaultCost,
    };
  }

  /**
   * Get monthly usage summary for a merchant
   */
  async getMonthlySummary(merchantId: string, month: Date): Promise<any> {
    const startOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
    const endOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59);

    const results = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
        operation,
        COUNT(*) as count,
        SUM(evervault_cost) as total_evervault_cost,
        SUM(krx_price) as total_krx_price,
        SUM(margin) as total_margin
      FROM krx_secure_usage
      WHERE merchant_id = $1
        AND created_at >= $2
        AND created_at <= $3
      GROUP BY operation
      ORDER BY total_krx_price DESC`,
      merchantId,
      startOfMonth,
      endOfMonth
    );

    const byOperation = results.reduce((acc, row) => {
      acc[row.operation] = {
        count: Number(row.count),
        evervaultCost: Number(row.total_evervault_cost),
        krxPrice: Number(row.total_krx_price),
        margin: Number(row.total_margin),
      };
      return acc;
    }, {} as Record<string, any>);

    const totals = results.reduce(
      (acc, row) => ({
        evervaultCost: acc.evervaultCost + Number(row.total_evervault_cost),
        krxPrice: acc.krxPrice + Number(row.total_krx_price),
        margin: acc.margin + Number(row.total_margin),
      }),
      { evervaultCost: 0, krxPrice: 0, margin: 0 }
    );

    return {
      merchantId,
      month: startOfMonth,
      byOperation,
      totals,
    };
  }
}
