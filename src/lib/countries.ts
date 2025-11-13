export type Country = { code: string; name: string }
export type Region = { key: string; label: string; countries: Country[] }

// ISO 3166-1 alpha-2 grouped by region (curated). Keep codes uppercase.
// Note: Territories and special regions omitted for brevity of UI.
export const REGIONAL_COUNTRIES: Region[] = [
  {
    key: 'americas',
    label: 'Americas',
    countries: [
      { code: 'US', name: 'United States' },
      { code: 'CA', name: 'Canada' },
      { code: 'MX', name: 'Mexico' },
      { code: 'BR', name: 'Brazil' },
      { code: 'AR', name: 'Argentina' },
      { code: 'CL', name: 'Chile' },
      { code: 'CO', name: 'Colombia' },
      { code: 'PE', name: 'Peru' },
      { code: 'UY', name: 'Uruguay' },
      { code: 'PY', name: 'Paraguay' },
      { code: 'BO', name: 'Bolivia' },
      { code: 'EC', name: 'Ecuador' },
      { code: 'VE', name: 'Venezuela' },
      { code: 'CR', name: 'Costa Rica' },
      { code: 'PA', name: 'Panama' },
      { code: 'GT', name: 'Guatemala' },
      { code: 'SV', name: 'El Salvador' },
      { code: 'HN', name: 'Honduras' },
      { code: 'NI', name: 'Nicaragua' },
      { code: 'DO', name: 'Dominican Republic' },
      { code: 'PR', name: 'Puerto Rico' }
    ]
  },
  {
    key: 'europe',
    label: 'Europe',
    countries: [
      { code: 'PT', name: 'Portugal' },
      { code: 'ES', name: 'Spain' },
      { code: 'FR', name: 'France' },
      { code: 'DE', name: 'Germany' },
      { code: 'IT', name: 'Italy' },
      { code: 'NL', name: 'Netherlands' },
      { code: 'BE', name: 'Belgium' },
      { code: 'IE', name: 'Ireland' },
      { code: 'GB', name: 'United Kingdom' },
      { code: 'CH', name: 'Switzerland' },
      { code: 'AT', name: 'Austria' },
      { code: 'SE', name: 'Sweden' },
      { code: 'NO', name: 'Norway' },
      { code: 'DK', name: 'Denmark' },
      { code: 'FI', name: 'Finland' },
      { code: 'PL', name: 'Poland' },
      { code: 'CZ', name: 'Czechia' },
      { code: 'HU', name: 'Hungary' },
      { code: 'RO', name: 'Romania' },
      { code: 'GR', name: 'Greece' }
    ]
  },
  {
    key: 'asia',
    label: 'Asia',
    countries: [
      { code: 'JP', name: 'Japan' },
      { code: 'CN', name: 'China' },
      { code: 'KR', name: 'South Korea' },
      { code: 'IN', name: 'India' },
      { code: 'SG', name: 'Singapore' },
      { code: 'HK', name: 'Hong Kong' },
      { code: 'ID', name: 'Indonesia' },
      { code: 'MY', name: 'Malaysia' },
      { code: 'TH', name: 'Thailand' },
      { code: 'PH', name: 'Philippines' },
      { code: 'AE', name: 'United Arab Emirates' },
      { code: 'SA', name: 'Saudi Arabia' },
      { code: 'IL', name: 'Israel' },
      { code: 'TR', name: 'Türkiye' }
    ]
  },
  {
    key: 'africa',
    label: 'Africa',
    countries: [
      { code: 'ZA', name: 'South Africa' },
      { code: 'NG', name: 'Nigeria' },
      { code: 'EG', name: 'Egypt' },
      { code: 'MA', name: 'Morocco' },
      { code: 'KE', name: 'Kenya' },
      { code: 'GH', name: 'Ghana' },
      { code: 'TZ', name: 'Tanzania' }
    ]
  },
  {
    key: 'oceania',
    label: 'Oceania',
    countries: [
      { code: 'AU', name: 'Australia' },
      { code: 'NZ', name: 'New Zealand' }
    ]
  },
  {
    key: 'others',
    label: 'Others',
    countries: [
      { code: 'RU', name: 'Russia' },
      { code: 'UA', name: 'Ukraine' },
      { code: 'IS', name: 'Iceland' },
      { code: 'LI', name: 'Liechtenstein' },
      { code: 'MC', name: 'Monaco' },
      { code: 'SM', name: 'San Marino' },
      { code: 'VA', name: 'Vatican City' }
    ]
  }
]

export function flagEmoji(code: string) {
  try {
    const cc = String(code || '').toUpperCase()
    if (!/^[A-Z]{2}$/.test(cc)) return '🏳️'
    const A = 0x1F1E6
    const base = 'A'.charCodeAt(0)
    return String.fromCodePoint(A + (cc.charCodeAt(0) - base)) + String.fromCodePoint(A + (cc.charCodeAt(1) - base))
  } catch {
    return '🏳️'
  }
}
