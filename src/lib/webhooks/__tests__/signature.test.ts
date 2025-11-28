import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { signPayload, verifySignature } from '../signature'

describe('Webhook Signature', () => {
  const secret = 'whsec_test123456789'
  const payload = { id: '123', type: 'test', data: { foo: 'bar' } }
  const payloadStr = JSON.stringify(payload)

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('signPayload', () => {
    it('should generate signature with timestamp', () => {
      const timestamp = Math.floor(Date.now() / 1000)
      const signature = signPayload(secret, payloadStr, timestamp)
      
      expect(typeof signature).toBe('string')
      expect(signature).toContain('t=')
      expect(signature).toContain('v1=')
      expect(signature.length).toBeGreaterThan(0)
    })

    it('should generate different signatures for different payloads', () => {
      const timestamp = Math.floor(Date.now() / 1000)
      const payload2 = JSON.stringify({ ...payload, id: '456' })
      
      const sig1 = signPayload(secret, payloadStr, timestamp)
      const sig2 = signPayload(secret, payload2, timestamp)
      
      expect(sig1).not.toBe(sig2)
    })

    it('should generate different signatures for different secrets', () => {
      const timestamp = Math.floor(Date.now() / 1000)
      
      const sig1 = signPayload(secret, payloadStr, timestamp)
      const sig2 = signPayload('whsec_different', payloadStr, timestamp)
      
      expect(sig1).not.toBe(sig2)
    })

    it('should generate consistent signatures for same input', () => {
      const timestamp = Math.floor(Date.now() / 1000)
      
      const sig1 = signPayload(secret, payloadStr, timestamp)
      const sig2 = signPayload(secret, payloadStr, timestamp)
      
      expect(sig1).toBe(sig2)
    })
  })

  describe('verifySignature', () => {
    it('should verify valid signature', () => {
      const timestamp = Math.floor(Date.now() / 1000)
      const signature = signPayload(secret, payloadStr, timestamp)
      
      const isValid = verifySignature(secret, payloadStr, signature)
      expect(isValid).toBe(true)
    })

    it('should reject invalid signature', () => {
      const isValid = verifySignature(secret, payloadStr, 't=1234567890,v1=invalid')
      expect(isValid).toBe(false)
    })

    it('should reject expired timestamp (> 5 minutes)', () => {
      const timestamp = Math.floor(Date.now() / 1000)
      const signature = signPayload(secret, payloadStr, timestamp)
      
      // Avançar 6 minutos
      vi.advanceTimersByTime(6 * 60 * 1000)
      
      const isValid = verifySignature(secret, payloadStr, signature)
      expect(isValid).toBe(false)
    })

    it('should accept timestamp within tolerance (< 5 minutes)', () => {
      const timestamp = Math.floor(Date.now() / 1000)
      const signature = signPayload(secret, payloadStr, timestamp)
      
      // Avançar 4 minutos (dentro do limite de 5)
      vi.advanceTimersByTime(4 * 60 * 1000)
      
      const isValid = verifySignature(secret, payloadStr, signature)
      expect(isValid).toBe(true)
    })

    it('should reject wrong secret', () => {
      const timestamp = Math.floor(Date.now() / 1000)
      const signature = signPayload(secret, payloadStr, timestamp)
      
      const isValid = verifySignature('whsec_wrong', payloadStr, signature)
      expect(isValid).toBe(false)
    })

    it('should reject tampered payload', () => {
      const timestamp = Math.floor(Date.now() / 1000)
      const signature = signPayload(secret, payloadStr, timestamp)
      
      const tamperedPayload = JSON.stringify({ ...payload, id: '999' })
      const isValid = verifySignature(secret, tamperedPayload, signature)
      expect(isValid).toBe(false)
    })

    it('should handle edge case: exactly 5 minutes', () => {
      const timestamp = Math.floor(Date.now() / 1000)
      const signature = signPayload(secret, payloadStr, timestamp)
      
      // Avançar exatamente 5 minutos e 1 segundo
      vi.advanceTimersByTime((5 * 60 * 1000) + 1000)
      
      const isValid = verifySignature(secret, payloadStr, signature)
      // Should be invalid (> 300 seconds)
      expect(isValid).toBe(false)
    })

    it('should handle future timestamps (clock skew)', () => {
      // Simular timestamp futuro (2 minutos à frente)
      const futureTimestamp = Math.floor(Date.now() / 1000) + (2 * 60)
      const signature = signPayload(secret, payloadStr, futureTimestamp)
      
      // Verificar com timestamp atual (2 minutos atrás do signature)
      const isValid = verifySignature(secret, payloadStr, signature)
      // Should still be valid (within tolerance of 5 minutes)
      expect(isValid).toBe(true)
    })

    it('should handle malformed signature gracefully', () => {
      const isValid = verifySignature(secret, payloadStr, 'malformed')
      expect(isValid).toBe(false)
    })
  })
})
