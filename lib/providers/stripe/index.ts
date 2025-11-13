import Stripe from 'stripe'
import type {
  PaymentProviderClient,
  CreateCustomerInput,
  ProviderCustomer,
  CreatePaymentInput,
  ProviderPayment,
  CreateSubscriptionInput,
  ProviderSubscription,
  UniversalPaymentStatus,
} from '../base'
import { toProviderAmount, fromProviderAmount } from '@/lib/currency/utils'
import { normalizeStripeStatus } from './status-map'

export type StripeProviderOptions = {
  apiKey: string
  accountId?: string | null
  webhookSecret?: string | null
}

export class StripeProvider implements PaymentProviderClient {
  private stripe: Stripe
  private accountId?: string | null

  constructor(opts: StripeProviderOptions) {
    this.stripe = new Stripe(opts.apiKey, { apiVersion: '2023-10-16' })
    this.accountId = opts.accountId || null
  }

  async createCustomer(input: CreateCustomerInput): Promise<ProviderCustomer> {
    const c = await this.stripe.customers.create(
      {
        email: input.email,
        name: input.name,
        phone: input.phone,
        metadata: input.metadata,
      },
      this.accountId ? { stripeAccount: this.accountId } : undefined
    )
    return { id: c.id, raw: c }
  }

  async retrieveCustomer(id: string): Promise<ProviderCustomer> {
    const c = await this.stripe.customers.retrieve(id, this.accountId ? { stripeAccount: this.accountId } : undefined)
    if ((c as any)?.deleted) {
      throw new Error('Stripe customer deleted')
    }
    return { id: (c as any).id, raw: c }
  }

  async createPayment(input: CreatePaymentInput): Promise<ProviderPayment> {
    const params: Stripe.PaymentIntentCreateParams = {
      amount: toProviderAmount(input.amount, input.currency),
      currency: input.currency.toLowerCase(),
      customer: input.customerId,
      capture_method: input.captureMethod || 'automatic',
      metadata: input.metadata,
      automatic_payment_methods: input.paymentMethodId ? undefined : { enabled: true },
      payment_method: input.paymentMethodId,
      confirm: !!input.paymentMethodId,
    }
    const intent = await this.stripe.paymentIntents.create(
      params,
      this.accountId ? { stripeAccount: this.accountId } : undefined
    )
    const status: UniversalPaymentStatus = normalizeStripeStatus(intent.status)
    return {
      id: intent.id,
      status,
      amount: fromProviderAmount(intent.amount, input.currency),
      currency: intent.currency.toUpperCase(),
      clientSecret: intent.client_secret || undefined,
      raw: intent,
    }
  }

  async capturePayment(id: string): Promise<ProviderPayment> {
    const intent = await this.stripe.paymentIntents.capture(
      id,
      {},
      this.accountId ? { stripeAccount: this.accountId } : undefined
    )
    const status: UniversalPaymentStatus = normalizeStripeStatus(intent.status)
    return {
      id: intent.id,
      status,
      amount: fromProviderAmount(intent.amount, intent.currency.toUpperCase()),
      currency: intent.currency.toUpperCase(),
      clientSecret: intent.client_secret || undefined,
      raw: intent,
    }
  }

  async cancelPayment(id: string): Promise<ProviderPayment> {
    const intent = await this.stripe.paymentIntents.cancel(
      id,
      {},
      this.accountId ? { stripeAccount: this.accountId } : undefined
    )
    const status: UniversalPaymentStatus = normalizeStripeStatus(intent.status)
    return {
      id: intent.id,
      status,
      amount: fromProviderAmount(intent.amount, intent.currency.toUpperCase()),
      currency: intent.currency.toUpperCase(),
      clientSecret: intent.client_secret || undefined,
      raw: intent,
    }
  }

  async createSubscription(input: CreateSubscriptionInput): Promise<ProviderSubscription> {
    const params: Stripe.SubscriptionCreateParams = {
      customer: input.customerId,
      items: input.priceId ? [{ price: input.priceId }] : undefined,
      trial_period_days: input.trialDays,
      metadata: input.metadata,
    }
    const sub = await this.stripe.subscriptions.create(
      params,
      this.accountId ? { stripeAccount: this.accountId } : undefined
    )
    return { id: sub.id, status: sub.status, raw: sub }
  }

  async cancelSubscription(id: string): Promise<ProviderSubscription> {
    const sub = await this.stripe.subscriptions.update(
      id,
      { cancel_at_period_end: true },
      this.accountId ? { stripeAccount: this.accountId } : undefined
    )
    return { id: sub.id, status: sub.status, raw: sub }
  }

  normalizeStatus(s: string): UniversalPaymentStatus {
    return normalizeStripeStatus(s)
  }
}
