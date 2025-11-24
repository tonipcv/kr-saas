export type ChargeResult = {
  transactionId: string
  orderId?: string | null
  chargeId?: string | null
  status: string
  status_v2: 'SUCCEEDED' | 'PROCESSING' | 'FAILED'
  paidAt?: Date | null
  rawResponse: any
}

export type ChargeWithSavedCardParams = {
  customerId: string
  merchantId: string
  paymentMethodId: string // pm_xxx, card_xxx, tok_xxx
  accountId?: string | null
  amountCents: number
  currency: string
  description: string
  metadata?: Record<string, any>
}

export interface PaymentGateway {
  chargeWithSavedCard(params: ChargeWithSavedCardParams): Promise<ChargeResult>
}
