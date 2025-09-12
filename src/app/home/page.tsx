import Link from 'next/link';
import Image from 'next/image';
import ReferralStepper from '@/components/ReferralStepper';
import { headers, cookies } from 'next/headers';
import CookieConsent from '@/components/CookieConsent';

type Locale = 'en' | 'pt';

function detectFromHeaders(h: { get(name: string): string | null }): { locale: Locale; country?: string } {
  // Country-based detection (Vercel/Cloudflare common headers)
  const country =
    h.get('x-vercel-ip-country') ||
    h.get('x-country') ||
    h.get('cf-ipcountry') ||
    h.get('x-geo-country') ||
    '';
  if (country.toUpperCase() === 'BR') return { locale: 'pt', country: 'BR' };

  // Fallback: Accept-Language
  const accept = h.get('accept-language') || '';
  if (/\bpt(-BR)?\b/i.test(accept)) return { locale: 'pt', country: country ? country.toUpperCase() : undefined };
  // Dev/local fallback via env (e.g., DEFAULT_LOCALE=pt)
  const envDefault = (process.env.DEFAULT_LOCALE || process.env.NEXT_PUBLIC_DEFAULT_LOCALE || '').toLowerCase();
  if (envDefault.startsWith('pt')) return { locale: 'pt', country: country ? country.toUpperCase() : undefined };
  if (envDefault.startsWith('en')) return { locale: 'en', country: country ? country.toUpperCase() : undefined };
  return { locale: 'en', country: country ? country.toUpperCase() : undefined };
}

const dict: Record<Locale, any> = {
  en: {
    signIn: 'Sign in',
    createAccount: 'Create account',
    heroTitle: 'Grow with Rewards',
    heroSubtitle: 'Launch referrals, reward points, and redeemable codes in minutes. Simple, minimal, and built to scale.',
    startNow: 'Start now',
    emailPlaceholder: 'Enter your email',
    productBadge: 'Product',
    featureTitle: 'Rewards done right.',
    featureSubtitle: 'Build Referral, Points, and Rewards Code programs in one place — simple to configure, easy to scale.',
    referralsTitle: 'Referrals',
    referralsDesc: 'Track invites, conversions, and rewards with clear attribution.',
    referralsBullets: ['Unique links per creator or customer', 'Flexible conversion events'],
    pointsTitle: 'Points',
    pointsDesc: 'Award points for actions and allow redemptions with rules.',
    pointsBullets: ['Any action → points mapping', 'Redeem with guardrails'],
    rewardsCodesTitle: 'Rewards Codes',
    rewardsCodesDesc: 'Generate unique codes and control redemption limits.',
    rewardsCodesBullets: ['Single-use or multi-use', 'Expiry and redemption caps'],
    ctaTitle: 'Launch your rewards in minutes',
    ctaSubtitle: 'Referrals, points, and codes — one setup, built to scale.',
    ctaButton: 'Create free account',
    footerTagline: 'The simple way to run referrals, points, and rewards codes.',
    footerCols: [
      { title: 'Product', links: ['Referrals', 'Points', 'Rewards Codes', 'Pricing'] },
      { title: 'Resources', links: ['Integrations', 'Support', 'Docs'] },
      { title: 'Company', links: ['About', 'Privacy', 'Terms'] },
    ],
    copyright: (year: number) => `© ${year} Zuzz Rewards. All rights reserved.`,
  },
  pt: {
    signIn: 'Entrar',
    createAccount: 'Criar conta',
    heroTitle: 'Cresça com Recompensas',
    heroSubtitle: 'Lance indicações, pontos e códigos resgatáveis em minutos. Simples, minimalista e pronto para escalar.',
    startNow: 'Começar agora',
    emailPlaceholder: 'Digite seu e-mail',
    productBadge: 'Produto',
    featureTitle: 'Recompensas do jeito certo.',
    featureSubtitle: 'Construa programas de Indicações, Pontos e Códigos de Recompensa em um só lugar — simples de configurar e fácil de escalar.',
    referralsTitle: 'Indicações',
    referralsDesc: 'Acompanhe convites, conversões e recompensas com atribuição clara.',
    referralsBullets: ['Links únicos por criador ou cliente', 'Eventos de conversão flexíveis'],
    pointsTitle: 'Pontos',
    pointsDesc: 'Conceda pontos por ações e permita resgates com regras.',
    pointsBullets: ['Qualquer ação → mapeamento de pontos', 'Resgate com restrições'],
    rewardsCodesTitle: 'Códigos de Recompensa',
    rewardsCodesDesc: 'Gere códigos únicos e controle limites de resgate.',
    rewardsCodesBullets: ['Uso único ou múltiplo', 'Validade e limites de resgate'],
    ctaTitle: 'Lance suas recompensas em minutos',
    ctaSubtitle: 'Indicações, pontos e códigos — uma configuração, pronta para escalar.',
    ctaButton: 'Criar conta gratuita',
    footerTagline: 'A maneira simples de rodar indicações, pontos e códigos de recompensa.',
    footerCols: [
      { title: 'Produto', links: ['Indicações', 'Pontos', 'Códigos de Recompensa', 'Preços'] },
      { title: 'Recursos', links: ['Integrações', 'Suporte', 'Documentação'] },
      { title: 'Empresa', links: ['Sobre', 'Privacidade', 'Termos'] },
    ],
    copyright: (year: number) => `© ${year} Zuzz Rewards. Todos os direitos reservados.`,
  },
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PublicHome({ searchParams }: PageProps) {
  const h = await headers();
  const ck = await cookies();
  const { locale: detectedLocale, country: detectedCountry } = detectFromHeaders(h as any);
  const sp = await searchParams;
  const rawLang = Array.isArray(sp.lang) ? sp.lang[0] : sp.lang || '';
  const override = (rawLang || '').toString().toLowerCase();
  const cookieLang = (ck.get('lang')?.value || '').toLowerCase();
  const cookieCountry = ck.get('country')?.value;

  let locale: Locale = detectedLocale;
  if (cookieLang === 'pt' || cookieLang === 'pt-br') locale = 'pt';
  if (cookieLang === 'en') locale = 'en';
  if (override === 'pt' || override === 'pt-br') locale = 'pt';
  if (override === 'en') locale = 'en';

  const country = (cookieCountry || detectedCountry || '').toString().toUpperCase() || undefined;

  const t = dict[locale];

  return (
    <main className="min-h-screen bg-white flex flex-col">
      {/* Top bar (minimal) */}
      <header className="w-full">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="relative w-8 h-8">
              <Image src="/logo.png" alt="Logo" fill className="object-contain" priority />
            </div>
          </div>
          <nav className="flex items-center gap-2">
            <Link href="/auth/signin" className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:text-gray-900">
              {t.signIn}
            </Link>
            <Link
              href="/auth/register"
              className="hidden sm:inline-flex px-4 py-2 text-sm font-semibold text-white rounded-md shadow-sm bg-gradient-to-r from-[#1d2b64] to-[#2b5876] hover:from-[#192455] hover:to-[#244861]"
            >
              {t.createAccount}
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero (expanded, centered) */}
      <section className="relative overflow-hidden">
        {/* Soft blue glow background */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-16 -left-24 h-80 w-80 rounded-full bg-[#eaf2ff] blur-3xl opacity-70" />
          <div className="absolute top-32 -right-24 h-96 w-96 rounded-full bg-[#eef4ff] blur-3xl opacity-70" />
        </div>
        <div className="max-w-7xl mx-auto px-4 py-36 md:py-48">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl md:text-7xl font-extrabold tracking-tight leading-tight bg-gradient-to-b from-[#2d3238] to-[#545860] bg-clip-text text-transparent motion-safe:animate-fade-up">
              {t.heroTitle}
            </h1>
            <p className="mt-5 md:mt-6 text-gray-600 text-base md:text-2xl max-w-3xl mx-auto motion-safe:animate-fade-up [animation-delay:120ms]">
              {t.heroSubtitle}
            </p>
            <div className="mt-10 md:mt-12 flex flex-col sm:flex-row items-center justify-center gap-3 w-full motion-safe:animate-fade-up [animation-delay:240ms]">
              <form action="/auth/register/email" method="GET" className="w-full sm:w-auto flex items-stretch gap-2">
                <input
                  type="email"
                  name="email"
                  required
                  placeholder={t.emailPlaceholder}
                  className="flex-1 min-w-0 sm:w-80 px-4 py-3 md:py-4 text-sm md:text-base bg-white border border-gray-300 rounded-lg md:rounded-xl focus:ring-2 focus:ring-[#5154e7]/20 focus:border-[#5154e7] transition-all duration-200 text-gray-900 placeholder-gray-500"
                />
                <button
                  type="submit"
                  className="flex-none whitespace-nowrap px-5 md:px-6 py-3 md:py-4 rounded-lg md:rounded-xl text-sm md:text-lg text-white font-semibold shadow-sm bg-gradient-to-r from-[#1d2b64] to-[#2b5876] hover:from-[#192455] hover:to-[#244861]"
                >
                  {t.startNow}
                </button>
              </form>
              <Link href="/auth/signin" className="w-full sm:w-auto px-6 py-3 md:px-8 md:py-4 rounded-lg md:rounded-xl bg-white text-gray-900 text-sm md:text-lg font-semibold ring-1 ring-inset ring-gray-200 hover:bg-gray-50">
                {t.signIn}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Cookie consent banner */}
      <CookieConsent locale={locale} country={country} />

      {/* Feature list (professional) */}
      <section className="py-20 md:py-32 border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center">
            <div className="hidden sm:inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-gray-200 text-gray-600 bg-white">{t.productBadge}</div>
            <h2 className="mt-2 text-2xl md:text-4xl font-extrabold text-gray-900">{t.featureTitle}</h2>
            <p className="mt-2 md:mt-3 text-gray-600 max-w-2xl mx-auto text-sm md:text-base">
              {t.featureSubtitle}
            </p>
          </div>

          <div className="mt-8 md:mt-12 grid md:grid-cols-3 gap-4 md:gap-6">
            {/* Referrals */}
            <div className="rounded-xl md:rounded-2xl p-5 md:p-7 bg-white ring-1 ring-gray-200 shadow-sm">
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] md:text-[11px] font-medium ring-1 ring-gray-200 text-gray-600 bg-white">01</span>
              <h3 className="mt-3 text-base md:text-lg font-semibold text-gray-900 tracking-tight">{t.referralsTitle}</h3>
              <p className="mt-2 text-sm text-gray-600">{t.referralsDesc}</p>
              <ul className="mt-3 space-y-1.5 text-sm text-gray-600 list-disc list-inside">
                <li>{t.referralsBullets[0]}</li>
                <li>{t.referralsBullets[1]}</li>
              </ul>
            </div>

            {/* Points */}
            <div className="rounded-xl md:rounded-2xl p-5 md:p-7 bg-white ring-1 ring-gray-200 shadow-sm">
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] md:text-[11px] font-medium ring-1 ring-gray-200 text-gray-600 bg-white">02</span>
              <h3 className="mt-3 text-base md:text-lg font-semibold text-gray-900 tracking-tight">{t.pointsTitle}</h3>
              <p className="mt-2 text-sm text-gray-600">{t.pointsDesc}</p>
              <ul className="mt-3 space-y-1.5 text-sm text-gray-600 list-disc list-inside">
                <li>{t.pointsBullets[0]}</li>
                <li>{t.pointsBullets[1]}</li>
              </ul>
            </div>

            {/* Rewards Codes */}
            <div className="rounded-xl md:rounded-2xl p-5 md:p-7 bg-white ring-1 ring-gray-200 shadow-sm">
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] md:text-[11px] font-medium ring-1 ring-gray-200 text-gray-600 bg-white">03</span>
              <h3 className="mt-3 text-base md:text-lg font-semibold text-gray-900 tracking-tight">{t.rewardsCodesTitle}</h3>
              <p className="mt-2 text-sm text-gray-600">{t.rewardsCodesDesc}</p>
              <ul className="mt-3 space-y-1.5 text-sm text-gray-600 list-disc list-inside">
                <li>{t.rewardsCodesBullets[0]}</li>
                <li>{t.rewardsCodesBullets[1]}</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Social proof (minimal) */}

      {/* Referrals stepper */}
      <ReferralStepper />

      {/* CTA (refined) */}
      <section className="py-24 md:py-32 border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4">
          <div className="rounded-2xl p-6 md:p-10 bg-white ring-1 ring-gray-200 text-center">
            <h3 className="text-xl md:text-3xl font-extrabold text-gray-900">{t.ctaTitle}</h3>
            <p className="mt-2 text-gray-600 text-sm md:text-base">{t.ctaSubtitle}</p>
            <div className="mt-6">
              <Link href="/auth/register" className="inline-flex items-center justify-center px-5 py-2.5 md:px-6 md:py-3 rounded-lg bg-gradient-to-r from-[#1d2b64] to-[#2b5876] hover:from-[#192455] hover:to-[#244861] text-white text-sm md:text-base font-semibold shadow-sm">
                {t.ctaButton}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 py-10 grid md:grid-cols-5 gap-8 text-sm">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2">
              <div className="relative w-7 h-7">
                <Image src="/logo.png" alt="Logo" fill className="object-contain" />
              </div>
            </div>
            <p className="mt-3 text-gray-600">{t.footerTagline}</p>
          </div>
          {t.footerCols.map((col: { title: string; links: string[] }, i: number) => (
            <div key={i}>
              <h6 className="font-semibold text-gray-900">{col.title}</h6>
              <ul className="mt-3 space-y-2 text-gray-600">
                {col.links.map((l) => (
                  <li key={l}><a className="hover:text-gray-900" href="#">{l}</a></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-100 py-6 text-center text-xs text-gray-500">
          {dict[locale].copyright(new Date().getFullYear())}
        </div>
      </footer>
    </main>
  );
}
