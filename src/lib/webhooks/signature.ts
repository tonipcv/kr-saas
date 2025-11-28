import crypto from 'crypto'

export function signPayload(secret: string, body: string, timestamp: number): string {
  const base = `t=${timestamp}.${body}`
  const hmac = crypto.createHmac('sha256', secret).update(base).digest('hex')
  return `t=${timestamp},v1=${hmac}`
}

export function verifySignature(secret: string, body: string, signature: string, toleranceSeconds = 300): boolean {
  try {
    const [tPart, v1Part] = signature.split(',')
    const timestamp = parseInt(tPart.split('=')[1], 10)
    const received = (v1Part.split('=')[1] || '').trim()
    if (!Number.isFinite(timestamp)) return false
    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - timestamp) > toleranceSeconds) return false
    const base = `t=${timestamp}.${body}`
    const computed = crypto.createHmac('sha256', secret).update(base).digest('hex')
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(received))
  } catch {
    return false
  }
}

export function generateSecret(): string {
  return `whsec_${crypto.randomBytes(32).toString('hex')}`
}
