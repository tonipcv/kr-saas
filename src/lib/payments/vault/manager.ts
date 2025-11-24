import { prisma } from '@/lib/prisma'
import { StripeGateway } from './gateways/stripe'
import { PagarmeGateway } from './gateways/pagarme'
import { AppmaxGateway } from './gateways/appmax'

export type SaveCardParams = {
  customerId: string
  provider: 'STRIPE' | 'PAGARME' | 'APPMAX'
  token: string // pm_xxx, card_xxx, tok_xxx
  accountId?: string | null
  brand?: string | null
  last4?: string | null
  expMonth?: number | null
  expYear?: number | null
  setAsDefault?: boolean
}

export type ChargeParams = {
  customerId: string
  savedCardId: string
  amountCents: number
  currency: string
  description: string
  metadata?: Record<string, any>
}

export class VaultManager {
  
  /**
   * Salva cartão tokenizado em customer_payment_methods
   * Usa fingerprint para deduplicar por gateway
   */
  async saveCard(params: SaveCardParams) {
    const { customerId, provider, token, accountId, brand, last4, expMonth, expYear, setAsDefault } = params
    
    // Gerar fingerprint por gateway
    const fingerprint = this.generateFingerprint(provider, brand, last4, expMonth, expYear)
    
    // Verificar duplicado
    const existing = await prisma.customerPaymentMethod.findFirst({
      where: { customerId, provider: provider as any, fingerprint }
    })
    
    if (existing) {
      // Atualizar token e expiração
      return prisma.customerPaymentMethod.update({
        where: { id: existing.id },
        data: {
          providerPaymentMethodId: token,
          expMonth,
          expYear,
          isDefault: setAsDefault || existing.isDefault,
          status: 'ACTIVE' as any,
          updatedAt: new Date()
        }
      })
    }
    
    // Se setAsDefault, desmarcar outros do mesmo provider
    if (setAsDefault) {
      await prisma.customerPaymentMethod.updateMany({
        where: { customerId, provider: provider as any },
        data: { isDefault: false }
      })
    }
    
    // Criar novo
    return prisma.customerPaymentMethod.create({
      data: {
        customerId,
        provider: provider as any,
        accountId,
        providerPaymentMethodId: token,
        brand,
        last4,
        expMonth,
        expYear,
        fingerprint,
        isDefault: setAsDefault || false,
        status: 'ACTIVE' as any
      }
    })
  }
  
  /**
   * Lista cartões salvos do customer
   */
  async listCards(customerId: string, provider?: 'STRIPE' | 'PAGARME' | 'APPMAX') {
    return prisma.customerPaymentMethod.findMany({
      where: {
        customerId,
        status: 'ACTIVE' as any,
        ...(provider ? { provider: provider as any } : {})
      },
      orderBy: [
        { isDefault: 'desc' },
        { createdAt: 'desc' }
      ]
    })
  }
  
  /**
   * Cobra com cartão salvo
   */
  async charge(params: ChargeParams) {
    const { customerId, savedCardId, amountCents, currency, description, metadata } = params
    
    // Buscar cartão
    const paymentMethod = await prisma.customerPaymentMethod.findFirst({
      where: {
        id: savedCardId,
        customerId,
        status: 'ACTIVE' as any
      }
    })
    
    if (!paymentMethod) {
      throw new Error('Payment method not found or inactive')
    }
    
    // Verificar expiração
    if (this.isExpired(paymentMethod)) {
      await prisma.customerPaymentMethod.update({
        where: { id: savedCardId },
        data: { status: 'EXPIRED' as any }
      })
      throw new Error('Card expired')
    }
    
    // Buscar customer
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, merchantId: true, email: true }
    })
    
    if (!customer) {
      throw new Error('Customer not found')
    }
    
    // Delegar para gateway adapter
    const gateway = this.getGateway(paymentMethod.provider as string)
    
    const result = await gateway.chargeWithSavedCard({
      customerId: customer.id,
      merchantId: customer.merchantId,
      paymentMethodId: paymentMethod.providerPaymentMethodId!,
      accountId: paymentMethod.accountId,
      amountCents,
      currency,
      description,
      metadata
    })
    
    // Salvar transação
    const transaction = await prisma.paymentTransaction.create({
      data: {
        id: result.transactionId,
        provider: paymentMethod.provider.toString().toLowerCase(),
        provider_v2: paymentMethod.provider as any,
        providerOrderId: result.orderId,
        providerChargeId: result.chargeId,
        merchantId: customer.merchantId,
        customerId: customer.id,
        customerPaymentMethodId: savedCardId,
        amountCents,
        currency: currency.toUpperCase(),
        status: result.status,
        status_v2: result.status_v2 as any,
        paymentMethodType: 'credit_card',
        paidAt: result.paidAt,
        rawPayload: result.rawResponse as any
      }
    })
    
    return transaction
  }
  
  // Helpers
  
  private generateFingerprint(provider: string, brand?: string | null, last4?: string | null, expMonth?: number | null, expYear?: number | null): string {
    const data = `${provider}|${brand || ''}|${last4 || ''}|${expMonth || ''}|${expYear || ''}`
    return Buffer.from(data).toString('base64')
  }
  
  private isExpired(method: any): boolean {
    if (!method.expMonth || !method.expYear) return false
    const now = new Date()
    return method.expYear < now.getFullYear() ||
           (method.expYear === now.getFullYear() && method.expMonth < now.getMonth() + 1)
  }
  
  private getGateway(provider: string) {
    switch (provider.toUpperCase()) {
      case 'STRIPE':
        return new StripeGateway()
      case 'PAGARME':
      case 'KRXPAY':
        return new PagarmeGateway()
      case 'APPMAX':
        return new AppmaxGateway()
      default:
        throw new Error(`Unsupported provider: ${provider}`)
    }
  }
}
