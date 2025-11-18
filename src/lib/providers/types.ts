export enum PaymentProvider {
  PAGARME = 'pagarme',
  STRIPE = 'stripe',
  APPMAX = 'appmax',
}

export enum PaymentStatus {
  PENDING = 'pending',
  AUTHORIZED = 'authorized',
  PAID = 'paid',
  FAILED = 'failed',
  CANCELED = 'canceled',
  REFUNDED = 'refunded',
}

export enum PaymentMethod {
  CREDIT_CARD = 'credit_card',
  DEBIT_CARD = 'debit_card',
  PIX = 'pix',
  BOLETO = 'boleto',
}

export interface CreateSubscriptionInput {
  clinicId: string;
  customerId: string;
  offerId: string;

  amount: number; // cents
  currency: string; // e.g. 'BRL'
  interval: 'month' | 'year';

  customer: {
    name: string;
    email: string;
    document: string;
    phone?: string;
  };

  paymentMethod: {
    type: PaymentMethod;
    token?: string; // card token or saved id
  };

  metadata?: Record<string, any>;
}

export interface SubscriptionResult {
  id: string; // internal id or same as provider id
  provider: PaymentProvider;
  status: PaymentStatus;

  customerId: string;
  amount: number;
  currency: string;

  createdAt: Date;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;

  providerData: {
    subscriptionId: string;
    chargeId?: string;
    [key: string]: any;
  };

  metadata?: Record<string, any>;
}

export interface PaymentProviderAdapter {
  readonly provider: PaymentProvider;

  createSubscription(input: CreateSubscriptionInput): Promise<SubscriptionResult>;
  // Future extensions:
  // createCharge(input: CreateChargeInput): Promise<ChargeResult>;
  // refund(input: RefundInput): Promise<RefundResult>;
  // handleWebhook(req: Request): Promise<WebhookResult>;
}
