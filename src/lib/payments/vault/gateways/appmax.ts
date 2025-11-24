import { prisma } from '@/lib/prisma'
import { buildAppmaxClientForMerchant } from '@/lib/payments/appmax/sdk'
import { PaymentGateway, ChargeWithSavedCardParams, ChargeResult } from './types'

export class AppmaxGateway implements PaymentGateway {
  
  async chargeWithSavedCard(params: ChargeWithSavedCardParams): Promise<ChargeResult> {
    const { customerId, merchantId, paymentMethodId, amountCents, description, metadata } = params
    
    // Buscar customer_provider (appmax customer_id)
    const customerProvider = await prisma.customerProvider.findFirst({
      where: { customerId, provider: 'APPMAX' as any }
    })
    
    if (!customerProvider) {
      throw new Error('Appmax customer not found. Create customer first.')
    }
    
    const appmaxCustomerId = customerProvider.providerCustomerId
    
    // Buscar customer para pegar document
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { document: true }
    })
    
    // Build Appmax client
    const client = await buildAppmaxClientForMerchant(merchantId)
    
    // Criar order
    const orderId = Date.now()
    const order = await client.ordersCreate({
      total: amountCents / 100, // Appmax usa REAIS
      products: [{
        sku: metadata?.productId || 'charge',
        name: description || 'Cobrança',
        qty: 1,
        price: amountCents / 100
      }],
      customer_id: appmaxCustomerId
    })
    
    const appmaxOrderId = order?.order_id || order?.id
    
    // Cobrar com token salvo
    const payment = await client.paymentsCreditCard({
      cart: { order_id: appmaxOrderId },
      customer: { customer_id: appmaxCustomerId },
      payment: {
        CreditCard: {
          token: paymentMethodId, // tok_xxx salvo
          document_number: customer?.document || '',
          installments: 1,
          soft_descriptor: 'KRXLABS'
        }
      }
    })
    
    const status = payment?.status || 'processing'
    const status_v2 = status === 'paid' || status === 'approved' ? 'SUCCEEDED' :
                      status === 'failed' || status === 'rejected' ? 'FAILED' :
                      'PROCESSING'
    
    return {
      transactionId: payment?.transaction_id || `appmax_${appmaxOrderId}`,
      orderId: String(appmaxOrderId),
      chargeId: payment?.id || null,
      status,
      status_v2,
      paidAt: status === 'paid' || status === 'approved' ? new Date() : null,
      rawResponse: { order, payment }
    }
  }
}
