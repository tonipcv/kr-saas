import { PaymentProvider } from './types';

export interface PaymentsConfig {
  usePlanlessSubscription: boolean;
  enableSplit: boolean;
  webhookAsync: boolean;
  defaultProvider: PaymentProvider;
}

export function getPaymentsConfig(): PaymentsConfig {
  const requiredEnvs = ['PAGARME_API_KEY', 'DATABASE_URL'];
  const missing = requiredEnvs.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const config: PaymentsConfig = {
    usePlanlessSubscription:
      String(process.env.PAGARME_USE_PLANLESS || process.env.USE_PLANLESS_SUBSCRIPTION || '').toLowerCase() === 'true',
    enableSplit: String(process.env.PAGARME_ENABLE_SPLIT || '').toLowerCase() === 'true',
    webhookAsync: String(process.env.WEBHOOK_ASYNC || '').toLowerCase() === 'true',
    defaultProvider: PaymentProvider.PAGARME,
  };

  if (process.env.NODE_ENV === 'development') {
    try { console.log('[PaymentsConfig] Loaded configuration:', config); } catch {}
  }
  if (config.enableSplit && !process.env.PLATFORM_RECIPIENT_ID && !process.env.PAGARME_PLATFORM_RECIPIENT_ID) {
    try { console.warn('[PaymentsConfig] Split enabled but PLATFORM_RECIPIENT_ID not set'); } catch {}
  }
  return config;
}

export function resolveProvider(params: { clinicId: string; productId?: string }): PaymentProvider {
  // TODO: add routing rules per clinic/product when needed
  return PaymentProvider.PAGARME;
}
