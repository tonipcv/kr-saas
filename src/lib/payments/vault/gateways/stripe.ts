import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { PaymentGateway, ChargeWithSavedCardParams, ChargeResult } from './types'

export class StripeGateway implements PaymentGateway {
  
  async chargeWithSavedCard(params: ChargeWithSavedCardParams): Promise<ChargeResult> {
    const { customerId, merchantId, paymentMethodId, accountId, amountCents, currency, description, metadata } = params
    
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' })
    
    // Buscar ou criar customer_provider (stripeCustomerId)
    let customerProvider = await prisma.customerProvider.findFirst({
      where: { customerId, provider: 'STRIPE' as any }
    })
    
    if (!customerProvider) {
      // Buscar customer email
      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
        select: { email: true, name: true }
      })
      
      // Criar customer no Stripe
      const stripeCustomer = await stripe.customers.create({
        email: customer?.email || undefined,
        name: customer?.name || undefined,
        metadata: { customerId, merchantId }
      }, accountId ? { stripeAccount: accountId } : undefined)
      
      // Salvar no banco
      customerProvider = await prisma.customerProvider.create({
        data: {
          customerId,
          provider: 'STRIPE' as any,
          providerCustomerId: stripeCustomer.id,
          accountId
        }
      })
    }
    
    const stripeCustomerId = customerProvider.providerCustomerId
    
    // Anexar PaymentMethod ao Customer (se ainda não estiver)
    try {
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: stripeCustomerId
      }, accountId ? { stripeAccount: accountId } : undefined)
    } catch (e: any) {
      // Ignorar se já estiver anexado
      if (!e?.message?.includes('already been attached')) {
        throw e
      }
    }
    
    // Criar PaymentIntent com off_session
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: currency.toLowerCase(),
      customer: stripeCustomerId,
      payment_method: paymentMethodId,
      off_session: true, // Cobrança sem cliente presente
      confirm: true, // Processar imediatamente
      description,
      metadata: metadata || {}
    }, accountId ? { stripeAccount: accountId } : undefined)
    
    const status_v2 = paymentIntent.status === 'succeeded' ? 'SUCCEEDED' :
                      paymentIntent.status === 'processing' ? 'PROCESSING' :
                      paymentIntent.status === 'requires_action' ? 'PROCESSING' :
                      'FAILED'
    
    return {
      transactionId: paymentIntent.id,
      chargeId: paymentIntent.charges?.data?.[0]?.id || null,
      status: paymentIntent.status,
      status_v2,
      paidAt: paymentIntent.status === 'succeeded' ? new Date() : null,
      rawResponse: paymentIntent
    }
  }
}
