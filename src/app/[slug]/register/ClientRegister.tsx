'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { PhoneInput } from 'react-international-phone';
import 'react-international-phone/style.css';
import { signIn } from 'next-auth/react';

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

export default function ClientRegister({ slug, initialBranding }: { slug: string; initialBranding: ClinicBranding }) {
  const [doctor, setDoctor] = useState<DoctorPublic | null>(null);
  const [clinic, setClinic] = useState<ClinicBranding | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phone, setPhone] = useState('+55');
  const [lang, setLang] = useState<'pt'|'en'|'es'>('pt');

  // Simple i18n dictionary
  const i18n: Record<'pt'|'en'|'es', Record<string, string>> = {
    pt: {
      name: 'Nome',
      email: 'Email',
      birthDate: 'Data de nascimento',
      phone: 'Telefone',
      password: 'Senha',
      createAccount: 'Criar conta',
      creatingAccount: 'Criando conta…',
      alreadyHave: 'Já tem uma conta? Entrar',
      placeholderName: 'Seu nome',
      placeholderEmail: 'm@exemplo.com',
      placeholderPassword: 'Digite sua senha',
    },
    en: {
      name: 'Name',
      email: 'Email',
      birthDate: 'Birth Date',
      phone: 'Phone',
      password: 'Password',
      createAccount: 'Create account',
      creatingAccount: 'Creating account…',
      alreadyHave: 'Already have an account? Sign in',
      placeholderName: 'Your name',
      placeholderEmail: 'm@example.com',
      placeholderPassword: 'Enter your password',
    },
    es: {
      name: 'Nombre',
      email: 'Correo',
      birthDate: 'Fecha de nacimiento',
      phone: 'Teléfono',
      password: 'Contraseña',
      createAccount: 'Crear cuenta',
      creatingAccount: 'Creando cuenta…',
      alreadyHave: '¿Ya tienes una cuenta? Iniciar sesión',
      placeholderName: 'Tu nombre',
      placeholderEmail: 'm@ejemplo.com',
      placeholderPassword: 'Ingresa tu contraseña',
    },
  };

  // Detect browser language on mount
  useEffect(() => {
    try {
      const l = typeof navigator !== 'undefined' ? (navigator.language || navigator.languages?.[0] || 'pt').toLowerCase() : 'pt';
      setLang(l.startsWith('pt') ? 'pt' : l.startsWith('es') ? 'es' : 'en');
    } catch { setLang('pt'); }
  }, []);

  // Prime clinic state from initialBranding immediately to avoid flicker
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
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        // Refresh clinic data (in case of updates)
        try {
          const cRes = await fetch(`/api/clinic/by-slug/${slug}`, { cache: 'no-store' });
          if (cRes.ok) {
            const cj = await cRes.json().catch(() => ({}));
            if (cj?.clinic) {
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
        // Doctor fallback for avatar/name when no clinic logo
        try {
          const res = await fetch(`/api/v2/doctor-link/${slug}`, { cache: 'no-store' });
          const json = await res.json();
          if (res.ok && json?.success) {
            setDoctor(json.data as DoctorPublic);
          } else {
            setDoctor(null);
          }
        } catch {}
      } catch (e) {
        setError('Error loading clinic/doctor information');
      } finally {
        setLoading(false);
      }
    };
    if (slug) fetchData();
  }, [slug]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    const submittedPhone = (formData.get('phone') as string) || phone;
    const birthDate = formData.get('birthDate') as string;
    const password = formData.get('password') as string;

    try {
      // 1) Create/Link patient publicly via slug
      const res = await fetch(`/api/v2/public/register/${encodeURIComponent(slug)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone: submittedPhone, password, birthDate }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || 'Erro ao criar conta');
      }

      // 2) Auto sign-in
      const si = await signIn('credentials', { email, password, redirect: false });
      if (si?.error) {
        throw new Error('Conta criada, mas falha ao entrar automaticamente');
      }

      // 3) Persist patient profile fields
      try {
        await fetch('/api/patient/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, phone: submittedPhone, birthDate }),
        });
      } catch {}

      // 4) Redirect to referrals
      window.location.replace(`/${slug}/referrals`);
      return;
    } catch (err) {
      setError('Error during registration');
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayTheme = clinic?.theme ?? initialBranding.theme ?? 'LIGHT';
  const btnBg = clinic?.buttonColor ?? initialBranding.buttonColor ?? '#111827';
  const btnFg = clinic?.buttonTextColor ?? initialBranding.buttonTextColor ?? '#ffffff';
  const inputBg = displayTheme === 'DARK' ? '#0f0f0f' : '#ffffff';
  const inputFg = displayTheme === 'DARK' ? '#f3f4f6' : '#111827';
  const borderColor = displayTheme === 'DARK' ? '#374151' : '#d1d5db';
  const focusRing = displayTheme === 'DARK' ? '#4b5563' : '#5154e7';
  const labelClass = displayTheme === 'DARK' ? 'text-gray-300' : 'text-gray-700';
  const linkPrimary = displayTheme === 'DARK' ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700';
  const linkMuted = displayTheme === 'DARK' ? 'text-gray-300 hover:text-gray-100' : 'text-gray-700 hover:text-gray-900';

  return (
    <div
      className={`${displayTheme === 'DARK' ? 'min-h-screen bg-[#0b0b0b] text-gray-100' : 'min-h-screen bg-gradient-to-b from-gray-50 to-white text-gray-900'} font-normal tracking-[-0.03em] relative z-10`}
      style={{ ['--btn-bg' as any]: btnBg, ['--btn-fg' as any]: btnFg, ['--input-bg' as any]: inputBg, ['--input-fg' as any]: inputFg, ['--border-color' as any]: borderColor } as any}
    >
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className={`w-full max-w-[420px] ${displayTheme === 'DARK' ? 'bg-[#111111] border-gray-800 text-gray-100' : 'bg-white border-gray-200 text-gray-900'} rounded-2xl border p-8 shadow-lg relative z-20`}>
          {/* Header with clinic-first branding (falls back to doctor) */}
          <div className="text-center mb-6">
            <div className="flex justify-center items-center mb-4 min-h-16">
              {loading ? (
                <div className="w-28 h-28 sm:w-32 sm:h-32 bg-gray-200 rounded-xl animate-pulse" />
              ) : (clinic?.logo ?? initialBranding.logo) ? (
                <div className="w-32 h-32 sm:w-36 sm:h-36 relative rounded-xl overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${(clinic?.logo ?? initialBranding.logo)!}${(clinic?.logo ?? initialBranding.logo)!.includes('?') ? '&' : '?'}v=${typeof window !== 'undefined' ? Date.now() : '1'}`}
                    alt={(clinic?.name ?? initialBranding.name) || 'Clinic'}
                    className="w-full h-full object-contain"
                  />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                  <span className="text-white text-lg font-bold">
                    {(clinic?.name || doctor?.name || 'C').charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>
            {/* No name below logo on register, just the logo */}
          </div>

          {error && (
            <div className="mb-6 text-red-600 text-center text-sm">{error}</div>
          )}

          {/* Register form */}
          <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off">
            <div>
              <label htmlFor="name" className={`block text-sm font-medium ${labelClass} mb-2`}>{i18n[lang].name}</label>
              <input
                type="text"
                id="name"
                name="name"
                required
                className={`w-full px-4 py-2.5 text-sm ${displayTheme === 'DARK' ? 'bg-[#0f0f0f] border-gray-700 text-gray-100 placeholder:text-gray-400 focus:ring-gray-700 focus:border-gray-600' : 'bg-white border-gray-300 text-gray-900 focus:ring-[#5154e7]/20 focus:border-[#5154e7]'} border rounded-lg transition-all duration-200`}
                placeholder={i18n[lang].placeholderName}
              />
            </div>
            <div>
              <label htmlFor="email" className={`block text-sm font-medium ${labelClass} mb-2`}>{i18n[lang].email}</label>
              <input
                type="email"
                id="email"
                name="email"
                required
                className={`w-full px-4 py-2.5 text-sm ${displayTheme === 'DARK' ? 'bg-[#0f0f0f] border-gray-700 text-gray-100 placeholder:text-gray-400 focus:ring-gray-700 focus:border-gray-600' : 'bg-white border-gray-300 text-gray-900 focus:ring-[#5154e7]/20 focus:border-[#5154e7]'} border rounded-lg transition-all duration-200`}
                placeholder={i18n[lang].placeholderEmail}
              />
            </div>
            <div>
              <label htmlFor="birthDate" className={`block text-sm font-medium ${labelClass} mb-2`}>{i18n[lang].birthDate}</label>
              <input
                type="date"
                id="birthDate"
                name="birthDate"
                className={`w-full px-4 py-2.5 text-sm ${displayTheme === 'DARK' ? 'bg-[#0f0f0f] border-gray-700 text-gray-100 placeholder:text-gray-400 focus:ring-gray-700 focus:border-gray-600' : 'bg-white border-gray-300 text-gray-900 focus:ring-[#5154e7]/20 focus:border-[#5154e7]'} border rounded-lg transition-all duration-200`}
              />
            </div>
            <div>
              <label htmlFor="phone" className={`block text-sm font-medium ${labelClass} mb-2`}>{i18n[lang].phone}</label>
              <div className="phoneInput">
                <PhoneInput
                  defaultCountry={lang === 'pt' ? 'br' : lang === 'es' ? 'es' : 'us'}
                  value={phone}
                  onChange={(val) => setPhone(val)}
                  className="w-full"
                  inputProps={{ id: 'phone', placeholder: displayTheme === 'DARK' ? '' : '' }}
                />
              </div>
              <input type="hidden" name="phone" value={phone} />
            </div>
            <div>
              <label htmlFor="password" className={`block text-sm font-medium ${labelClass} mb-2`}>{i18n[lang].password}</label>
              <input
                type="password"
                id="password"
                name="password"
                required
                className={`w-full px-4 py-2.5 text-sm ${displayTheme === 'DARK' ? 'bg-[#0f0f0f] border-gray-700 text-gray-100 placeholder:text-gray-400 focus:ring-gray-700 focus:border-gray-600' : 'bg-white border-gray-300 text-gray-900 focus:ring-[#5154e7]/20 focus:border-[#5154e7]'} border rounded-lg transition-all duration-200`}
                placeholder={i18n[lang].placeholderPassword}
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 px-4 text-sm font-medium rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-300"
              style={{ backgroundColor: 'var(--btn-bg)', color: 'var(--btn-fg)' }}
              disabled={isSubmitting}
            >
              {isSubmitting ? i18n[lang].creatingAccount : i18n[lang].createAccount}
            </button>
          </form>

          {/* Footer links */}
          <div className="mt-6 text-center space-y-3">
            <Link
              href={`/${slug}/login`}
              className={`text-sm ${linkPrimary} transition-colors duration-200 block`}
            >
              {i18n[lang].alreadyHave}
            </Link>
          </div>
        </div>
      </div>
      {/* Page Footer: Powered by (small, at bottom) */}
      <footer className="absolute bottom-4 left-0 right-0">
        <div className={`flex items-center justify-center gap-2 ${displayTheme === 'DARK' ? 'text-gray-400' : 'text-gray-400'}`}>
          <span className="text-[10px]">Powered by</span>
          <Image src="/logo.png" alt="Sistema" width={28} height={8} className={`object-contain opacity-60 ${displayTheme === 'DARK' ? 'invert' : ''}`} />
        </div>
      </footer>

      {/* Autofill styles to prevent white background */}
      <style jsx global>{`
        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus,
        textarea:-webkit-autofill,
        textarea:-webkit-autofill:hover,
        textarea:-webkit-autofill:focus,
        select:-webkit-autofill,
        select:-webkit-autofill:hover,
        select:-webkit-autofill:focus {
          -webkit-text-fill-color: var(--input-fg) !important;
          caret-color: var(--input-fg) !important;
          transition: background-color 9999s ease-in-out 0s;
          box-shadow: 0 0 0px 1000px var(--input-bg) inset !important;
        }
        /* PhoneInput unified styles */
        .phoneInput .react-international-phone-input-container {
          width: 100% !important;
          display: flex !important;
          align-items: stretch !important;
        }
        .phoneInput .react-international-phone-input {
          background: var(--input-bg) !important;
          color: var(--input-fg) !important;
          border: 1px solid var(--border-color) !important;
          border-left: none !important; /* merge with button */
          border-top-right-radius: 0.5rem !important; /* rounded-r-lg */
          border-bottom-right-radius: 0.5rem !important;
          border-top-left-radius: 0 !important;
          border-bottom-left-radius: 0 !important;
          height: 42px !important;
          padding: 0.625rem 0.75rem !important; /* px-3 py-2.5 */
          width: 100% !important;
          box-sizing: border-box !important;
        }
        .phoneInput .react-international-phone-input::placeholder {
          color: ${displayTheme === 'DARK' ? '#9ca3af' : '#6b7280'} !important;
        }
        .phoneInput .react-international-phone-input:focus {
          outline: none !important;
          border-color: ${focusRing} !important;
          box-shadow: 0 0 0 3px ${displayTheme === 'DARK' ? 'rgba(75,85,99,0.4)' : 'rgba(81,84,231,0.2)'} !important;
        }
        .phoneInput .react-international-phone-country-selector-button {
          background: var(--input-bg) !important;
          color: var(--input-fg) !important;
          border: 1px solid var(--border-color) !important;
          border-right: none !important; /* merge with input */
          border-top-left-radius: 0.5rem !important; /* rounded-l-lg */
          border-bottom-left-radius: 0.5rem !important;
          border-top-right-radius: 0 !important;
          border-bottom-right-radius: 0 !important;
          height: 42px !important;
          margin-right: 0 !important;
          width: 56px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 6px !important;
        }
        .phoneInput .react-international-phone-country-selector-button .react-international-phone-flag-emoji {
          font-size: 18px !important;
          line-height: 1 !important;
          display: inline-block !important;
        }
        .phoneInput .react-international-phone-country-selector-button .react-international-phone-country-selector-button__dropdown-arrow {
          opacity: 0.7 !important;
        }
        .phoneInput .react-international-phone-country-selector-button:focus {
          outline: none !important;
          border-color: ${focusRing} !important;
          box-shadow: 0 0 0 3px ${displayTheme === 'DARK' ? 'rgba(75,85,99,0.4)' : 'rgba(81,84,231,0.2)'} !important;
        }
        .phoneInput .react-international-phone-country-selector-dropdown {
          z-index: 50 !important;
          background: ${displayTheme === 'DARK' ? '#111111' : '#ffffff'} !important;
          color: var(--input-fg) !important;
          border: 1px solid var(--border-color) !important;
        }
        .phoneInput .react-international-phone-country-selector-dropdown li:hover {
          background: ${displayTheme === 'DARK' ? '#1f2937' : '#f3f4f6'} !important;
        }
      `}</style>
    </div>
  );
}
