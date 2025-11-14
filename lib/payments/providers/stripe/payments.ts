export type CreateOneTimePaymentInput = {
  merchantId: string
  amountMinor: number
  currency: string
  customer: {
    email?: string
    name?: string
    phone?: string
  }
  metadata?: Record<string, any>
}

export type CreateOneTimePaymentResult = {
  provider: 'STRIPE'
  payment_intent_id: string
  client_secret?: string | null
  currency: string
  amount_minor: number
}

export async function createOneTimePayment(_input: CreateOneTimePaymentInput): Promise<CreateOneTimePaymentResult> {
  throw new Error('stripe.createOneTimePayment not wired yet')
}
