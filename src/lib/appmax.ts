import { prisma } from '@/lib/prisma'

type AppmaxOptions = { testMode?: boolean, baseURL?: string }

export class AppmaxClient {
  private apiKey: string
  private baseURL: string

  constructor(apiKey: string, opts?: AppmaxOptions) {
    this.apiKey = apiKey
    const explicit = opts?.baseURL
    const test = opts?.testMode === true
    this.baseURL = explicit || (test ? 'https://homolog.sandboxappmax.com.br/api/v3' : 'https://api.appmax.com.br/api/v3')
  }

  private async post<T = any>(path: string, body: Record<string, any>): Promise<T> {
    const url = `${this.baseURL}${path}`
    const payload = { ...(body || {}), ['access-token']: this.apiKey }
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const text = await res.text()
    let json: any = null
    try { json = text ? JSON.parse(text) : null } catch { json = { raw: text } }
    if (!res.ok) {
      const err: any = new Error(json?.message || 'appmax_error')
      err.status = res.status
      err.response = json
      throw err
    }
    return json as T
  }

  customersCreate(body: Record<string, any>) {
    return this.post('/customer', body)
  }

  ordersCreate(body: Record<string, any>) {
    return this.post('/order', body)
  }

  paymentsCreditCard(body: Record<string, any>) {
    return this.post('/payment/credit-card', body)
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
