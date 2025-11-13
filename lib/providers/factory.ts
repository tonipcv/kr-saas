import { prisma } from '@/lib/prisma';
import type { PaymentProvider } from '@prisma/client';
import type { PaymentProviderClient } from './base';
import { StripeProvider } from './stripe';

export async function getProviderClient(merchantId: string, provider: PaymentProvider): Promise<PaymentProviderClient> {
  const integration = await prisma.merchantIntegration.findUnique({
    where: { merchantId_provider: { merchantId, provider } },
  });
  if (!integration || !integration.isActive) {
    throw new Error(`Integration not configured or inactive for merchant=${merchantId} provider=${provider}`);
  }
  const creds = integration.credentials as any;

  switch (provider) {
    case 'STRIPE':
      if (!creds?.apiKey) throw new Error('Stripe credentials missing: apiKey');
      return new StripeProvider({ apiKey: creds.apiKey, accountId: creds.accountId, webhookSecret: creds.webhookSecret });
    // case 'ADYEN': return new AdyenProvider({ ... });
    // case 'PAYPAL': return new PaypalProvider({ ... });
    default:
      throw new Error(`Provider ${provider} not implemented`);
  }
}
