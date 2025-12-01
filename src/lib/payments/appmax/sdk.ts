// Lazy-load Prisma from '@/lib/prisma' only when needed to avoid bundler import-time initialization

type AppmaxOptions = { testMode?: boolean, baseURL?: string }

export class AppmaxClient {
  private apiKey: string
  private baseURL: string

  constructor(apiKey: string, opts?: AppmaxOptions) {
    this.apiKey = (apiKey || '').trim()
    const explicit = opts?.baseURL
    const test = opts?.testMode === true
    // Produção usa admin.appmax.com.br (não api.appmax.com.br)
    this.baseURL = explicit || (test ? 'https://homolog.sandboxappmax.com.br/api/v3' : 'https://admin.appmax.com.br/api/v3')
  }

  private async post<T = any>(path: string, body: Record<string, any>, retryAttempts: number = 2): Promise<T> {
    const url = `${this.baseURL}${path}`
    // Token vai no header, não no body (padrão Appmax oficial)
    const payload = { ...(body || {}) }
    const headers: Record<string, string> = { 
      'Content-Type': 'application/json',
      'access-token': this.apiKey
    }
    const sanitize = (obj: any) => {
      try {
        const c = JSON.parse(JSON.stringify(obj || {}))
        if (c && typeof c === 'object') {
          if ('access-token' in c) c['access-token'] = '***'
          if (c.payment && c.payment.CreditCard && c.payment.CreditCard.number) c.payment.CreditCard.number = '****'
          if (c.payment && c.payment.pix && c.payment.pix.document_number) c.payment.pix.document_number = '****'
        }
        return c
      } catch {
        return obj
      }
    }

    let lastErr: any = null
    for (let attempt = 1; attempt <= Math.max(1, retryAttempts); attempt++) {
      const controller = new AbortController()
      const timeoutMs = 20000
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      const start = Date.now()
      try {
        const tokenLen = this.apiKey ? this.apiKey.length : 0
        const tokenPreview = this.apiKey ? `${this.apiKey.slice(0, 8)}...${this.apiKey.slice(-8)}` : 'MISSING'
        console.log('[appmax][request]', { 
          url, 
          path, 
          attempt, 
          tokenLen,
          tokenPreview,
          headersPresent: Object.keys(headers),
          payload: sanitize(payload) 
        })
        const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload), signal: controller.signal })
        const text = await res.text()
        let json: any = null
        try { json = text ? JSON.parse(text) : null } catch { json = { raw: text } }
        const durationMs = Date.now() - start
        console.log('[appmax][response]', { url, path, attempt, status: res.status, durationMs, body: sanitize(json) })
        if (!res.ok) {
          const err: any = new Error(json?.message || 'appmax_error')
          err.status = res.status
          err.response = json
          throw err
        }
        clearTimeout(timer)
        return json as T
      } catch (e: any) {
        clearTimeout(timer)
        lastErr = e
        const durationMs = Date.now() - start
        console.error('[appmax][error]', { url, path, attempt, durationMs, message: e?.message, status: e?.status, response: sanitize(e?.response) })
        const retriable = e?.name === 'AbortError' || (Number(e?.status) >= 500)
        if (attempt < Math.max(1, retryAttempts) && retriable) {
          await new Promise(r => setTimeout(r, 500))
          continue
        }
        break
      }
    }
    if (lastErr) throw lastErr
    throw new Error('appmax_error')
  }

  customersCreate(body: Record<string, any>) {
    return this.post('/customer', body)
  }

  ordersCreate(body: Record<string, any>) {
    return this.post('/order', body)
  }

  paymentsCreditCard(body: Record<string, any>) {
    return this.post('/payment/credit-card', body, 2)
  }

  // Important: avoid automatic retry for payments, as the gateway may cancel the order after a failed attempt
  paymentsCreditCardNoRetry(body: Record<string, any>) {
    return this.post('/payment/credit-card', body, 1)
  }

  paymentsPix(body: Record<string, any>) {
    return this.post('/payment/pix', body)
  }

  paymentsBillet(body: Record<string, any>) {
    return this.post('/payment/billet', body)
  }

  tokenizeCard(body: Record<string, any>) {
    return this.post('/tokenize/card', body)
  }

  refund(body: Record<string, any>) {
    return this.post('/refund', body)
  }
}

export async function buildAppmaxClientForMerchant(merchantId: string) {
  const { prisma } = await import('@/lib/prisma');
  const integ = await prisma.merchantIntegration.findUnique({
    where: { merchantId_provider: { merchantId: String(merchantId), provider: 'APPMAX' as any } },
    select: { credentials: true, isActive: true },
  })
  if (!integ || !integ.isActive) throw new Error('appmax_integration_inactive')
  const creds = (integ.credentials || {}) as any
  const apiKey: string | undefined = creds?.apiKey
  const testMode: boolean = !!creds?.testMode
  if (!apiKey) throw new Error('appmax_api_key_missing')
  return new AppmaxClient(apiKey, { testMode })
}
