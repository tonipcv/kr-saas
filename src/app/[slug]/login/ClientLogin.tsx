'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { useMemo } from 'react';

type DoctorPublic = {
  id: string;
  name: string | null;
  image: string | null;
  email: string;
};

export type ClinicBranding = {
  theme?: 'LIGHT' | 'DARK';
  buttonColor?: string | null;
  buttonTextColor?: string | null;
  name?: string | null;
  logo?: string | null;
};

export default function ClientLogin({ slug, initialBranding }: { slug: string; initialBranding: ClinicBranding }) {
  const router = useRouter();

  const [doctor, setDoctor] = useState<DoctorPublic | null>(null);
  const [clinic, setClinic] = useState<{
    name?: string | null;
    logo?: string | null;
    theme?: 'LIGHT' | 'DARK';
    buttonColor?: string | null;
    buttonTextColor?: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [showNotMemberModal, setShowNotMemberModal] = useState(false);

  // Prime clinic state from initialBranding for immediate logo/theme display
  useEffect(() => {
    if (initialBranding) {
      setClinic({
        name: initialBranding.name ?? null,
        logo: initialBranding.logo ?? null,
        theme: initialBranding.theme,
        buttonColor: initialBranding.buttonColor ?? null,
        buttonTextColor: initialBranding.buttonTextColor ?? null,
      });
    }
  }, [initialBranding?.name, initialBranding?.logo, initialBranding?.theme, initialBranding?.buttonColor, initialBranding?.buttonTextColor]);

  // Fetch clinic or doctor public info (prefer clinic branding if slug is clinic)
  useEffect(() => {
    const fetchBranding = async () => {
      try {
        setLoading(true);
        // Clinic by slug (server API currently resolves only by slug)
        const clinicRes = await fetch(`/api/clinic/by-slug/${slug}`, { cache: 'no-store' });
        if (clinicRes.ok) {
          const cj = await clinicRes.json().catch(() => ({}));
          if (cj?.success && cj?.clinic) {
            setClinic({
              name: cj.clinic.name,
              logo: cj.clinic.logo,
              theme: cj.clinic.theme,
              buttonColor: cj.clinic.buttonColor,
              buttonTextColor: cj.clinic.buttonTextColor,
            });
          }
        }
        // Doctor fallback
        const res = await fetch(`/api/v2/doctor-link/${slug}`, { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json?.success && json?.data) {
          setDoctor(json.data as DoctorPublic);
        } else {
          setDoctor(null);
        }
        setError(null);
      } catch (e) {
        setError('Erro ao carregar informações da clínica');
      } finally {
        setLoading(false);
      }
    };
    if (slug) fetchBranding();
  }, [slug]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSigningIn(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError('Email ou senha incorretos');
      } else if (result?.ok) {
        try {
          const res = await fetch(`/api/v2/patient/is-member/${slug}`, { headers: { 'Cache-Control': 'no-cache' } });
          const json = await res.json().catch(() => ({}));
          if (res.ok && json?.success) {
            if (json.isMember) {
              setTimeout(() => {
                router.replace(`/${slug}/referrals`);
                router.refresh();
              }, 200);
            } else {
              setShowNotMemberModal(true);
            }
          } else {
            setError('Não foi possível verificar seu vínculo com este médico. Tente novamente.');
          }
        } catch {
          setError('Erro ao verificar vínculo com o médico.');
        }
      }
    } catch (err) {
      setError('Erro durante o login');
    } finally {
      setIsSigningIn(false);
    }
  };

  const displayTheme = clinic?.theme ?? initialBranding.theme ?? 'LIGHT';
  const btnBg = clinic?.buttonColor ?? initialBranding.buttonColor ?? '#111827';
  const btnFg = clinic?.buttonTextColor ?? initialBranding.buttonTextColor ?? '#ffffff';

  // Compute forgot-password href: if host is subdomain, use '/forgot-password'; otherwise '/{slug}/forgot-password'
  const forgotHref = useMemo(() => {
    try {
      const base = (process.env.NEXT_PUBLIC_APP_BASE_DOMAIN || '').toLowerCase();
      if (typeof window === 'undefined' || !base) return `/${slug}/forgot-password`;
      const host = window.location.host.toLowerCase().split(':')[0];
      if (!host.endsWith(base)) return `/${slug}/forgot-password`;
      const sub = host.slice(0, -base.length).replace(/\.$/, '');
      return sub ? '/forgot-password' : `/${slug}/forgot-password`;
    } catch {
      return `/${slug}/forgot-password`;
    }
  }, [slug]);

  return (
    <div
      className={`${displayTheme === 'DARK' ? 'min-h-screen bg-[#0b0b0b] text-gray-100' : 'min-h-screen bg-gradient-to-b from-gray-50 to-white text-gray-900'} font-normal tracking-[-0.03em] relative z-10`}
      style={{ ['--btn-bg' as any]: btnBg, ['--btn-fg' as any]: btnFg } as any}
    >
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className={`w-full max-w-[420px] ${displayTheme === 'DARK' ? 'bg-[#111111] border-gray-800 text-gray-100' : 'bg-white border-gray-200 text-gray-900'} rounded-2xl border p-8 shadow-lg relative z-20`}>
          {loading ? (
            <div>
              {/* Skeleton header */}
              <div className="text-center mb-6">
                <div className="flex justify-center items-center mb-4 min-h-16">
                  <div className="w-28 h-28 sm:w-32 sm:h-32 bg-gray-200 rounded-xl animate-pulse" />
                </div>
                <div className="mx-auto h-5 w-40 bg-gray-200 rounded animate-pulse" />
              </div>
              {/* Skeleton form */}
              <div className="space-y-4">
                <div className="h-10 bg-gray-200 rounded animate-pulse" />
                <div className="h-10 bg-gray-200 rounded animate-pulse" />
                <div className="h-10 bg-gray-300 rounded animate-pulse" />
              </div>
            </div>
          ) : (
            <>
              {/* Branding header: only logo, no name text */}
              <div className="text-center mb-6">
                <div className="flex justify-center items-center mb-4 min-h-16">
                  {(clinic?.logo ?? initialBranding.logo) ? (
                    <div className="w-28 h-28 sm:w-32 sm:h-32 relative rounded-xl overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`${(clinic?.logo ?? initialBranding.logo)!}${(clinic?.logo ?? initialBranding.logo)!.includes('?') ? '&' : '?'}v=${typeof window !== 'undefined' ? Date.now() : '1'}`}
                        alt={(clinic?.name ?? initialBranding.name) || 'Clinic'}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ) : doctor?.image && !clinic ? (
                    <div className="w-16 h-16 relative rounded-full overflow-hidden">
                      <Image src={doctor.image} alt={doctor?.name || 'Médico'} fill className="object-cover rounded-full" />
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-gray-200" />
                  )}
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="mb-6 text-red-600 text-center text-sm">{error}</div>
              )}

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    required
                    autoComplete="off"
                    className={`w-full px-4 py-2.5 text-sm ${displayTheme === 'DARK' ? 'bg-[#0f0f0f] border-gray-700 text-gray-100 placeholder:text-gray-400 focus:ring-gray-700 focus:border-gray-600' : 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-500 focus:ring-[#5154e7]/20 focus:border-[#5154e7]'} border rounded-lg transition-all duration-200`}
                    placeholder="m@example.com"
                  />
                </div>
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    required
                    autoComplete="current-password"
                    className={`w-full px-4 py-2.5 text-sm ${displayTheme === 'DARK' ? 'bg-[#0f0f0f] border-gray-700 text-gray-100 placeholder:text-gray-400 focus:ring-gray-700 focus:border-gray-600' : 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-500 focus:ring-[#5154e7]/20 focus:border-[#5154e7]'} border rounded-lg transition-all duration-200`}
                    placeholder="Enter your password"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 px-4 text-sm font-medium rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-300 disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{ backgroundColor: 'var(--btn-bg)', color: 'var(--btn-fg)' }}
                  disabled={isSigningIn}
                >
                  {isSigningIn ? 'Signing in...' : 'Sign in'}
                </button>
              </form>
            </>
          )}

          {/* Footer links */}
          <div className="mt-6 text-center space-y-3">
            <div className="text-sm text-gray-700">Don’t have an account?</div>
            <Link
              href={`/${slug}`}
              className="text-sm text-blue-600 hover:text-blue-700 transition-colors duration-200 block"
            >
              Ver produtos e serviços
            </Link>
            <Link
              href={forgotHref}
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors duration-200 block"
            >
              Forgot your password?
            </Link>
          </div>
        </div>
        {/* Modal: Não é membro */}
        {showNotMemberModal && (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md bg-white rounded-xl shadow-xl p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Você não está cadastrado como paciente deste médico</h2>
              <p className="text-sm text-gray-600 mb-6">
                Para continuar, você pode conhecer os produtos e serviços disponíveis desta clínica.
              </p>
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900"
                  onClick={() => setShowNotMemberModal(false)}
                >
                  Fechar
                </button>
                <button
                  type="button"
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                  onClick={() => { setShowNotMemberModal(false); router.push(`/${slug}`); }}
                >
                  Ver produtos
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Page Footer: Powered by (small, at bottom) */}
        <footer className="absolute bottom-4 left-0 right-0">
          <div className={`flex items-center justify-center gap-2 ${displayTheme === 'DARK' ? 'text-gray-400' : 'text-gray-400'}`}>
            <span className="text-[10px]">Powered by</span>
            <Image src="/logo.png" alt="Sistema" width={28} height={8} className={`object-contain opacity-60 ${displayTheme === 'DARK' ? 'invert' : ''}`} />
          </div>
        </footer>
      </div>
    </div>
  );
}
