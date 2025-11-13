export type CurrencyCode = 'USD'|'BRL'|'EUR'|'MXN'|'ARS'|'CLP'|'COP'|'GBP'|'CAD'|'AUD'|'JPY'|'CHF'|'ZAR';

const countryToCurrency: Record<string, CurrencyCode> = {
  BR: 'BRL',
  US: 'USD',
  PT: 'EUR',
  MX: 'MXN',
  AR: 'ARS',
  CL: 'CLP',
  CO: 'COP',
  GB: 'GBP',
  CA: 'CAD',
  AU: 'AUD',
  JP: 'JPY',
  CH: 'CHF',
  ZA: 'ZAR',
  DE: 'EUR',
  FR: 'EUR',
  ES: 'EUR',
  IT: 'EUR',
  NL: 'EUR',
  BE: 'EUR',
  IE: 'EUR',
  AT: 'EUR'
};

export function getCurrencyForCountry(code: string): CurrencyCode {
  const cc = String(code || '').toUpperCase();
  return countryToCurrency[cc] || 'USD';
}

export function hasCurrencyMapping(code: string): boolean {
  const cc = String(code || '').toUpperCase();
  return !!countryToCurrency[cc];
}
