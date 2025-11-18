import { PaymentProvider, PaymentProviderAdapter } from './types';
import { resolveProvider } from './config';
import { PagarmeAdapter } from './pagarme/adapter';

export async function getAdapter(provider: PaymentProvider, clinicId: string): Promise<PaymentProviderAdapter> {
  switch (provider) {
    case PaymentProvider.PAGARME:
      return new PagarmeAdapter(clinicId);
    case PaymentProvider.STRIPE:
      throw new Error('Stripe adapter not implemented yet');
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

export async function getAdapterForClinic(clinicId: string): Promise<PaymentProviderAdapter> {
  const provider = resolveProvider({ clinicId });
  return getAdapter(provider, clinicId);
}
