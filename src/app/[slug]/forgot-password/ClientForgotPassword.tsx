'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';

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

export default function ClientForgotPassword({ slug, initialBranding }: { slug: string; initialBranding: ClinicBranding }) {
  const [doctor, setDoctor] = useState<DoctorPublic | null>(null);
  const [clinic, setClinic] = useState<{ name?: string | null; logo?: string | null; theme?: 'LIGHT'|'DARK'; buttonColor?: string | null; buttonTextColor?: string | null } | null>(null);
  const [loadingDoctor, setLoadingDoctor] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showNotMemberModal, setShowNotMemberModal] = useState(false);

  // Prime clinic from initialBranding (ensures logo shows immediately on subdomain)
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

  useEffect(() => {
    const fetchBranding = async () => {
      try {
        setLoadingDoctor(true);
        // Clinic
        try {
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
        } catch {}
        // Doctor fallback
        const res = await fetch(`/api/v2/doctor-link/${slug}`, { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json?.success && json?.data) {
          setDoctor(json.data as DoctorPublic);
          setError(null);
        } else {
          setDoctor(null);
        }
      } catch (e) {
        setError('Error loading information');
      } finally {
        setLoadingDoctor(false);
      }
    };
    if (slug) fetchBranding();
  }, [slug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // 1) Validate membership by email for this slug
      try {
        const res = await fetch(`/api/v2/patient/is-member-by-email/${slug}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json?.success) {
          if (!json.isMember) {
            setShowNotMemberModal(true);
            return; // Stop here, don't send reset email
          }
        }
        // If endpoint fails, continue as fallback
      } catch {}

      // 2) Send standard forgot-password
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, slug }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Something went wrong');
      setIsSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  const displayTheme = clinic?.theme ?? initialBranding.theme ?? 'LIGHT';
  const btnBg = clinic?.buttonColor ?? initialBranding.buttonColor ?? '#111827';
  const btnFg = clinic?.buttonTextColor ?? initialBranding.buttonTextColor ?? '#ffffff';

  // Back to login href: if on subdomain, prefer '/login' instead of '/{slug}/login'
  const backToLoginHref = useMemo(() => {
    try {
      const base = (process.env.NEXT_PUBLIC_APP_BASE_DOMAIN || '').toLowerCase();
      if (typeof window === 'undefined' || !base) return `/${slug}/login`;
      const host = window.location.host.toLowerCase().split(':')[0];
      if (!host.endsWith(base)) return `/${slug}/login`;
      const sub = host.slice(0, -base.length).replace(/\.$/, '');
      return sub ? '/login' : `/${slug}/login`;
    } catch {
      return `/${slug}/login`;
    }
  }, [slug]);

  if (isSubmitted) {
    return (
      <div className={`${displayTheme === 'DARK' ? 'min-h-screen bg-[#0b0b0b] text-gray-100' : 'min-h-screen bg-gradient-to-b from-gray-50 to-white text-gray-900'} font-normal tracking-[-0.03em] relative z-10`} style={{ ['--btn-bg' as any]: btnBg, ['--btn-fg' as any]: btnFg } as any}>
        <div className="min-h-screen flex flex-col items-center justify-center p-4">
          <div className={`w-full max-w-[420px] ${displayTheme === 'DARK' ? 'bg-[#111111] border-gray-800 text-gray-100' : 'bg-white border-gray-200 text-gray-900'} rounded-2xl border p-8 shadow-lg relative z-20`}>
            {loadingDoctor ? (
              <div>
                <div className="text-center mb-6">
                  <div className="flex justify-center items-center mb-4 min-h-16">
                    <div className="w-28 h-28 sm:w-32 sm:h-32 bg-gray-200 rounded-xl animate-pulse" />
                  </div>
                  <div className="mx-auto h-5 w-40 bg-gray-200 rounded animate-pulse" />
                </div>
                <div className="space-y-4">
                  <div className="h-16 bg-gray-100 rounded-2xl animate-pulse" />
                  <div className="h-10 bg-gray-300 rounded-lg animate-pulse" />
                </div>
              </div>
            ) : (
              <>
                <div className="text-center mb-6">
                  <div className="flex justify-center items-center mb-4 min-h-16">
                    {(clinic?.logo ?? initialBranding.logo) ? (
                      <div className="w-28 h-28 sm:w-32 sm:h-32 relative rounded-xl overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`${(clinic?.logo ?? initialBranding.logo)!}${(clinic?.logo ?? initialBranding.logo)!.includes('?') ? '&' : '?'}v=${typeof window !== 'undefined' ? Date.now() : '1'}`} alt={(clinic?.name ?? initialBranding.name) || 'Clinic'} className="w-full h-full object-contain" />
                      </div>
                    ) : doctor?.image ? (
                      <div className="w-16 h-16 relative rounded-full overflow-hidden">
                        <Image src={doctor.image} alt={doctor?.name || 'Doctor'} fill className="object-cover rounded-full" />
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                        <span className="text-white text-lg font-bold">
                          {(clinic?.name || doctor?.name || 'D').charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-medium">Email sent!</h2>
                  <p className="text-gray-500 text-sm">We've sent a password recovery link to your email.</p>
                </div>
                <Link href={backToLoginHref} className="w-full py-2.5 px-4 text-sm font-medium rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-300" style={{ backgroundColor: 'var(--btn-bg)', color: 'var(--btn-fg)' }}>
                  <ArrowLeft className="h-4 w-4" />
                  Back to login
                </Link>
              </>
            )}
          </div>
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

  return (
    <div className={`${displayTheme === 'DARK' ? 'min-h-screen bg-[#0b0b0b] text-gray-100' : 'min-h-screen bg-gradient-to-b from-gray-50 to-white text-gray-900'} font-normal tracking-[-0.03em] relative z-10`} style={{ ['--btn-bg' as any]: btnBg, ['--btn-fg' as any]: btnFg } as any}>
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className={`w-full max-w-[420px] ${displayTheme === 'DARK' ? 'bg-[#111111] border-gray-800 text-gray-100' : 'bg-white border-gray-200 text-gray-900'} rounded-2xl border p-8 shadow-lg relative z-20`}>
          {loadingDoctor ? (
            <div>
              <div className="text-center mb-6">
                <div className="flex justify-center items-center mb-4 min-h-16">
                  <div className="w-28 h-28 sm:w-32 sm:h-32 bg-gray-200 rounded-xl animate-pulse" />
                </div>
                <div className="mx-auto h-5 w-40 bg-gray-200 rounded animate-pulse" />
              </div>
              <div className="space-y-4">
                <div className="h-10 bg-gray-200 rounded animate-pulse" />
                <div className="h-10 bg-gray-200 rounded animate-pulse" />
                <div className="h-10 bg-gray-300 rounded animate-pulse" />
              </div>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <div className="flex justify-center items-center mb-4 min-h-16">
                  {(clinic?.logo ?? initialBranding.logo) ? (
                    <div className="w-28 h-28 sm:w-32 sm:h-32 relative rounded-xl overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`${(clinic?.logo ?? initialBranding.logo)!}${(clinic?.logo ?? initialBranding.logo)!.includes('?') ? '&' : '?'}v=${typeof window !== 'undefined' ? Date.now() : '1'}`} alt={(clinic?.name ?? initialBranding.name) || 'Clinic'} className="w-full h-full object-contain" />
                    </div>
                  ) : doctor?.image ? (
                    <div className="w-16 h-16 relative rounded-full overflow-hidden">
                      <Image src={doctor.image} alt={doctor?.name || 'Doctor'} fill className="object-cover rounded-full" />
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                      <span className="text-white text-lg font-bold">
                        {(clinic?.name || doctor?.name || 'D').charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {error && (
                <div className="mb-6 text-red-600 text-center text-sm">{error}</div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium mb-2">Email</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="off"
                    className={`w-full px-4 py-2.5 text-sm ${displayTheme === 'DARK' ? 'bg-[#0f0f0f] border-gray-700 text-gray-100 placeholder:text-gray-400 focus:ring-gray-700 focus:border-gray-600' : 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-500 focus:ring-[#5154e7]/20 focus:border-[#5154e7]'} border rounded-lg transition-all duration-200`}
                    placeholder="m@example.com"
                  />
                </div>
                <button type="submit" className="w-full py-2.5 px-4 text-sm font-medium rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-300 disabled:opacity-60 disabled:cursor-not-allowed" style={{ backgroundColor: 'var(--btn-bg)', color: 'var(--btn-fg)' }} disabled={isLoading}>
                  {isLoading ? 'Sending link...' : 'Reset password'}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>

              <div className="mt-6 text-center space-y-3">
                <Link href={backToLoginHref} className="text-sm hover:opacity-90 transition-colors duration-200 flex items-center justify-center gap-2">
                  <ArrowLeft className="h-3 w-3" />
                  Back to login
                </Link>
              </div>
            </>
          )}
        </div>
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
