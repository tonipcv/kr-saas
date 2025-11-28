import { describe, it, expect } from 'vitest'
import {
  providerStatusToInternal,
  internalToLegacyStatus,
  normalizeProviderStatus
} from '../status-map'

describe('providerStatusToInternal', () => {
  describe('STRIPE', () => {
    it('should map succeeded to SUCCEEDED', () => {
      expect(providerStatusToInternal('STRIPE', 'succeeded')).toBe('SUCCEEDED')
    })

    it('should map requires_payment_method to REQUIRES_ACTION', () => {
      expect(providerStatusToInternal('STRIPE', 'requires_payment_method')).toBe('REQUIRES_ACTION')
    })

    it('should map canceled to CANCELED', () => {
      expect(providerStatusToInternal('STRIPE', 'canceled')).toBe('CANCELED')
    })

    it('should map processing to PROCESSING', () => {
      expect(providerStatusToInternal('STRIPE', 'processing')).toBe('PROCESSING')
    })

    it('should default to PROCESSING for unknown status', () => {
      expect(providerStatusToInternal('STRIPE', 'unknown_status')).toBe('PROCESSING')
    })

    it('should handle empty string', () => {
      expect(providerStatusToInternal('STRIPE', '')).toBe('PROCESSING')
    })
  })

  describe('PAGARME', () => {
    it('should map paid to SUCCEEDED', () => {
      expect(providerStatusToInternal('PAGARME', 'paid')).toBe('SUCCEEDED')
    })

    it('should map canceled to CANCELED', () => {
      expect(providerStatusToInternal('PAGARME', 'canceled')).toBe('CANCELED')
    })

    it('should map chargedback to CHARGEBACK', () => {
      expect(providerStatusToInternal('PAGARME', 'chargedback')).toBe('CHARGEBACK')
    })

    it('should map refunded to REFUNDED', () => {
      expect(providerStatusToInternal('PAGARME', 'refunded')).toBe('REFUNDED')
    })

    it('should map failed to FAILED', () => {
      expect(providerStatusToInternal('PAGARME', 'failed')).toBe('FAILED')
    })

    it('should default to PROCESSING for unknown status', () => {
      expect(providerStatusToInternal('PAGARME', 'weird_status')).toBe('PROCESSING')
    })
  })

  describe('APPMAX', () => {
    it('should map aprovado to SUCCEEDED (case insensitive)', () => {
      expect(providerStatusToInternal('APPMAX', 'aprovado')).toBe('SUCCEEDED')
      expect(providerStatusToInternal('APPMAX', 'APROVADO')).toBe('SUCCEEDED')
      expect(providerStatusToInternal('APPMAX', 'Aprovado')).toBe('SUCCEEDED')
    })

    it('should map "Pagamento Aprovado" to SUCCEEDED', () => {
      expect(providerStatusToInternal('APPMAX', 'Pagamento Aprovado')).toBe('SUCCEEDED')
      expect(providerStatusToInternal('APPMAX', 'pagamento aprovado')).toBe('SUCCEEDED')
    })

    it('should map cancelado to CANCELED', () => {
      expect(providerStatusToInternal('APPMAX', 'cancelado')).toBe('CANCELED')
      expect(providerStatusToInternal('APPMAX', 'CANCELADO')).toBe('CANCELED')
    })

    it('should map recusado to FAILED', () => {
      expect(providerStatusToInternal('APPMAX', 'recusado')).toBe('FAILED')
      expect(providerStatusToInternal('APPMAX', 'recusada')).toBe('FAILED')
    })

    it('should map estornado to REFUNDED', () => {
      expect(providerStatusToInternal('APPMAX', 'estornado')).toBe('REFUNDED')
    })

    it('should default to PROCESSING for unknown status', () => {
      expect(providerStatusToInternal('APPMAX', 'status_desconhecido')).toBe('PROCESSING')
    })
  })
})

describe('internalToLegacyStatus', () => {
  it('should map SUCCEEDED to paid', () => {
    expect(internalToLegacyStatus('SUCCEEDED')).toBe('paid')
  })

  it('should map FAILED to failed', () => {
    expect(internalToLegacyStatus('FAILED')).toBe('failed')
  })

  it('should map CANCELED to canceled', () => {
    expect(internalToLegacyStatus('CANCELED')).toBe('canceled')
  })

  it('should map REFUNDED to refunded', () => {
    expect(internalToLegacyStatus('REFUNDED')).toBe('refunded')
  })

  it('should map PARTIALLY_REFUNDED to paid (legacy keeps paid)', () => {
    expect(internalToLegacyStatus('PARTIALLY_REFUNDED')).toBe('paid')
  })

  it('should map PROCESSING to processing', () => {
    expect(internalToLegacyStatus('PROCESSING')).toBe('processing')
  })

  it('should map CHARGEBACK to chargedback', () => {
    expect(internalToLegacyStatus('CHARGEBACK')).toBe('chargedback')
  })

  it('should default to processing for unknown status', () => {
    expect(internalToLegacyStatus('UNKNOWN' as any)).toBe('processing')
  })
})

describe('normalizeProviderStatus', () => {
  it('should return both internal and legacy status for STRIPE', () => {
    const result = normalizeProviderStatus('STRIPE', 'succeeded')
    expect(result).toEqual({
      internal: 'SUCCEEDED',
      legacy: 'paid'
    })
  })

  it('should handle PAGARME statuses', () => {
    const result = normalizeProviderStatus('PAGARME', 'canceled')
    expect(result).toEqual({
      internal: 'CANCELED',
      legacy: 'canceled'
    })
  })

  it('should handle APPMAX statuses', () => {
    const result = normalizeProviderStatus('APPMAX', 'recusado')
    expect(result).toEqual({
      internal: 'FAILED',
      legacy: 'failed'
    })
  })

  it('should handle empty strings gracefully', () => {
    const result = normalizeProviderStatus('STRIPE', '')
    expect(result).toEqual({
      internal: 'PROCESSING',
      legacy: 'processing'
    })
  })

  it('should handle null/undefined gracefully', () => {
    const result1 = normalizeProviderStatus('STRIPE', null as any)
    const result2 = normalizeProviderStatus('STRIPE', undefined as any)
    
    expect(result1.internal).toBe('PROCESSING')
    expect(result2.internal).toBe('PROCESSING')
  })
})
