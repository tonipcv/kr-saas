import { prisma } from '@/lib/prisma'
import { pagarmeCreateOrder } from '@/lib/payments/pagarme/sdk'
import { PaymentGateway, ChargeWithSavedCardParams, ChargeResult } from './types'

export class PagarmeGateway implements PaymentGateway {
  
  async chargeWithSavedCard(params: ChargeWithSavedCardParams): Promise<ChargeResult> {
    const { customerId, merchantId, paymentMethodId, amountCents, description, metadata } = params
    
    // Buscar customer_provider (pagarme customer_id)
    const customerProvider = await prisma.customerProvider.findFirst({
      where: { customerId, provider: 'PAGARME' as any }
    })
    
    if (!customerProvider) {
      throw new Error('Pagarme customer not found. Create customer first.')
    }
    
    const pagarmeCustomerId = customerProvider.providerCustomerId
    
    // Criar order com card_id salvo
    const order = await pagarmeCreateOrder({
      customer: { id: pagarmeCustomerId },
      items: [{
        amount: amountCents,
        description: description || 'Cobrança',
        quantity: 1,
        code: metadata?.productId || 'charge'
      }],
      payments: [{
        payment_method: 'credit_card',
        credit_card: {
          card_id: paymentMethodId, // card_xxx salvo
          statement_descriptor: 'KRXLABS'
        }
      }],
      metadata: metadata || {}
    })
    
    const status_v2 = order.status === 'paid' ? 'SUCCEEDED' :
                      order.status === 'pending' ? 'PROCESSING' :
                      order.status === 'processing' ? 'PROCESSING' :
                      'FAILED'
    
    return {
      transactionId: order.id,
      orderId: order.id,
      chargeId: order.charges?.[0]?.id || null,
      status: order.status,
      status_v2,
      paidAt: order.status === 'paid' ? new Date() : null,
      rawResponse: order
    }
  }
}
