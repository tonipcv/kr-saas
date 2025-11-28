import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildTransactionPayload } from '../payload'

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    paymentTransaction: {
      findUnique: vi.fn()
    },
    product: {
      findUnique: vi.fn()
    },
    offer: {
      findFirst: vi.fn()
    }
  }
}))

import { prisma } from '@/lib/prisma'

describe('buildTransactionPayload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should build complete payload with all relations', async () => {
    const mockTransaction = {
      id: 'tx_123',
      clinicId: 'clinic_123',
      status: 'paid',
      status_v2: 'SUCCEEDED',
      provider: 'stripe',
      provider_v2: 'STRIPE',
      providerOrderId: 'pi_123',
      providerChargeId: 'ch_123',
      amountCents: 10000,
      currency: 'USD',
      installments: 1,
      paymentMethodType: 'credit_card',
      productId: 'prod_123',
      customerId: 'cust_123',
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
      paidAt: new Date('2025-01-01'),
      refundedAt: null,
      checkoutSession: { 
        id: 'co_123', 
        email: 'test@test.com',
        phone: '11999999999',
        name: 'Test User',
        status: 'completed'
      },
      product: { 
        id: 'prod_123', 
        name: 'Product Test',
        type: 'DIGITAL'
      },
      offer: { 
        id: 'off_123', 
        name: 'Offer Test',
        priceCents: 10000
      }
    }

    vi.mocked(prisma.paymentTransaction.findUnique).mockResolvedValue(mockTransaction as any)
    vi.mocked(prisma.product.findUnique).mockResolvedValue(mockTransaction.product as any)
    vi.mocked(prisma.offer.findFirst).mockResolvedValue(mockTransaction.offer as any)

    const result = await buildTransactionPayload('tx_123')

    expect(result).toBeDefined()
    expect(result?.transaction).toMatchObject({
      id: 'tx_123',
      status: 'paid',
      status_v2: 'SUCCEEDED',
      provider: 'stripe',
      amountCents: 10000
    })
    expect(result?.checkout).toMatchObject({ id: 'co_123' })
    expect(result?.product).toMatchObject({ id: 'prod_123' })
    expect(result?.offer).toMatchObject({ id: 'off_123' })
  })

  it('should throw error for non-existent transaction', async () => {
    vi.mocked(prisma.paymentTransaction.findUnique).mockResolvedValue(null)

    await expect(buildTransactionPayload('invalid_id')).rejects.toThrow('Transaction invalid_id not found')
  })

  it('should not include raw_payload in transaction', async () => {
    const mockTransaction = {
      id: 'tx_123',
      clinicId: 'clinic_123',
      raw_payload: { sensitive: 'data', secret: 'key' }, // Deve ser removido
      status: 'paid',
      status_v2: 'SUCCEEDED',
      provider: 'stripe',
      amountCents: 10000,
      currency: 'BRL',
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
      checkoutSession: null
    }

    vi.mocked(prisma.paymentTransaction.findUnique).mockResolvedValue(mockTransaction as any)

    const result = await buildTransactionPayload('tx_123')

    expect(result?.transaction).not.toHaveProperty('raw_payload')
  })

  it('should handle transaction without relations', async () => {
    const mockTransaction = {
      id: 'tx_456',
      clinicId: 'clinic_456',
      status: 'pending',
      status_v2: 'PROCESSING',
      provider: 'pagarme',
      amountCents: 5000,
      currency: 'BRL',
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
      productId: null,
      checkoutSession: null
    }

    vi.mocked(prisma.paymentTransaction.findUnique).mockResolvedValue(mockTransaction as any)

    const result = await buildTransactionPayload('tx_456')

    expect(result?.transaction.id).toBe('tx_456')
    expect(result?.checkout).toBeUndefined()
    expect(result?.product).toBeUndefined()
    expect(result?.offer).toBeUndefined()
  })

  it('should include all required transaction fields', async () => {
    const mockTransaction = {
      id: 'tx_789',
      clinicId: 'clinic_789',
      status: 'paid',
      status_v2: 'SUCCEEDED',
      provider: 'appmax',
      provider_v2: 'APPMAX',
      providerOrderId: 'order_789',
      amountCents: 15000,
      currency: 'BRL',
      installments: 3,
      paymentMethodType: 'credit_card',
      createdAt: new Date('2025-01-15'),
      updatedAt: new Date('2025-01-15'),
      paidAt: new Date('2025-01-15')
    }

    vi.mocked(prisma.paymentTransaction.findUnique).mockResolvedValue(mockTransaction as any)

    const result = await buildTransactionPayload('tx_789')

    expect(result?.transaction).toMatchObject({
      id: 'tx_789',
      clinicId: 'clinic_789',
      status: 'paid',
      status_v2: 'SUCCEEDED',
      provider: 'appmax',
      providerOrderId: 'order_789',
      amountCents: 15000,
      currency: 'BRL',
      installments: 3,
      paymentMethodType: 'credit_card'
    })
  })
})
