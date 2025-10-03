// Centralized platform pricing model (fixed)
// All values are fixed and must not be overridden at runtime.

export const PRICING = {
  // 1) Plataforma (Hotmart-like)
  // Seller pays: 9.9% + R$ 1,00 por venda. MDR/gateway embutido.
  PLATFORM_PERCENT_FEE_BPS: 990, // 9.9%
  PLATFORM_FIXED_FEE_CENTS: 100, // R$1,00 (centavos BRL)
  PLATFORM_FEE_CURRENCY: 'BRL',

  // 2) Parcelamento (cliente paga juros)
  // Taxa cobrada ao cliente (APR mensal fixa)
  INSTALLMENT_CUSTOMER_APR_MONTHLY: 0.029, // 2.9% a.m. fixo
  INSTALLMENT_MAX_INSTALLMENTS: 12,

  // 3) Antecipação
  // Cobrada do seller quando optar por antecipar. APR mensal fixa.
  ANTICIPATION_SELLER_APR_MONTHLY: 0.025, // 2.5% a.m. fixo

  // 4) Taxas extras
  WITHDRAWAL_FIXED_FEE_CENTS: 490, // R$ 4,90
  WITHDRAWAL_FEE_CURRENCY: 'BRL',

  // Serviços premium opcionais
  PREMIUM_ADDON_PERCENT_BPS: 150, // +1.5%

  // Observações (documentação)
  NOTES: {
    PLATFORM_FEE_NOTE:
      'A taxa da plataforma (9,9% + R$1,00) já considera o MDR/gateway do Pagar.me. Não exibir MDR separado.',
    INSTALLMENTS_NOTE:
      'Checkout configurado como parcelado com juros: cliente paga. APR mensal fixa aplicada ao cliente.',
    ANTICIPATION_NOTE:
      'Antecipação opcional: cobrada do seller a 2,5% a.m. Spread sobre custo do Pagar.me não é exposto.',
    WITHDRAWAL_NOTE:
      'Saque manual cobra taxa fixa por saque.',
    PREMIUM_NOTE:
      'Serviços premium adicionam +1,5% ao seller (ex.: white-label, relatórios, saque instantâneo).',
  },
} as const;

export type PricingModel = typeof PRICING;
