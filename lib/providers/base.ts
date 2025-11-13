// Generic payment provider abstraction (non-invasive)
// Does not change any existing flow; new modules can adopt this interface progressively.

export type UniversalPaymentStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'REQUIRES_ACTION'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELED'
  | 'EXPIRED'
  | 'REFUNDING'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

export type CreateCustomerInput = {
  email: string;
  name?: string;
  phone?: string;
  metadata?: Record<string, string>;
};

export type ProviderCustomer = {
  id: string;
  raw?: any;
};

export type CreatePaymentInput = {
  amount: number; // major units (e.g., 10.50)
  currency: string; // ISO 4217
  customerId?: string; // provider customer id
  paymentMethodId?: string;
  captureMethod?: 'automatic' | 'manual';
  metadata?: Record<string, string>;
};

export type ProviderPayment = {
  id: string;
  status: UniversalPaymentStatus;
  amount: number; // major units
  currency: string;
  clientSecret?: string;
  raw?: any;
};

export type CreateSubscriptionInput = {
  customerId: string; // provider customer id
  priceId?: string; // provider price id (Stripe)
  amount?: number; // major units (if priceId not used)
  currency?: string;
  interval?: 'day' | 'week' | 'month' | 'year';
  intervalCount?: number;
  trialDays?: number;
  paymentMethodId?: string;
  metadata?: Record<string, string>;
};

export type ProviderSubscription = {
  id: string;
  status: string;
  raw?: any;
};

export interface PaymentProviderClient {
  // customers
  createCustomer(input: CreateCustomerInput): Promise<ProviderCustomer>;
  retrieveCustomer(id: string): Promise<ProviderCustomer>;

  // payments
  createPayment(input: CreatePaymentInput): Promise<ProviderPayment>;
  capturePayment(id: string): Promise<ProviderPayment>;
  cancelPayment(id: string): Promise<ProviderPayment>;

  // subscriptions
  createSubscription(input: CreateSubscriptionInput): Promise<ProviderSubscription>;
  cancelSubscription(id: string): Promise<ProviderSubscription>;

  // utils
  normalizeStatus(providerStatus: string): UniversalPaymentStatus;
}
