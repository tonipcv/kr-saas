// Currency utilities: minor units conversion per currency
// Non-invasive: used by provider modules; does not change existing flows

export const CURRENCY_DECIMALS: Record<string, number> = {
  JPY: 0,
  KRW: 0,
  VND: 0,
  CLP: 0,
  KWD: 3,
  BHD: 3,
  OMR: 3,
};

export function toProviderAmount(amount: number, currency: string): number {
  const decimals = CURRENCY_DECIMALS[currency.toUpperCase()] ?? 2;
  return Math.round(amount * Math.pow(10, decimals));
}

export function fromProviderAmount(amountMinor: number, currency: string): number {
  const decimals = CURRENCY_DECIMALS[currency.toUpperCase()] ?? 2;
  return amountMinor / Math.pow(10, decimals);
}
