'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, UserPlus, CheckCircle, AlertCircle, Users, Star, Heart, Shield } from 'lucide-react';

interface DoctorInfo {
  id: string;
  name: string;
  image?: string;
}

interface DoctorStats {
  totalPatients: number;
}

interface ReferrerInfo {
  name: string;
}

// Textos em diferentes idiomas
const translations = {
  pt: {
    referredBy: (name: string) => `${name} indicou você para uma consulta com`,
    referredGeneric: 'Você foi indicado para uma consulta com',
    withPriority: 'com prioridade',
    patientsServed: (count: number) => `${count}+ pessoas atendidas`,
    fullName: 'Nome completo',
    email: 'Email',
    phone: 'Telefone',
    scheduleConsultation: 'Agendar consulta',
    loading: 'Carregando...',
    somethingWrong: 'Ops, algo deu errado',
    requestSent: 'Solicitação enviada!',
    contactSoon: 'Nossa equipe entrará em contato em breve.',
    redirectingIn: (seconds: number) => `Redirecionando em ${seconds} segundo${seconds !== 1 ? 's' : ''}...`,
    accessAccount: 'Acessar minha conta',
    newRequest: 'Nova solicitação',
    sending: 'Enviando...',
    personalizedCare: 'Atendimento personalizado e de qualidade',
    fullNamePlaceholder: 'Seu nome completo',
    emailPlaceholder: 'seu@email.com',
    phonePlaceholder: '(11) 99999-9999'
  },
  en: {
    referredBy: (name: string) => `${name} referred you for a consultation with`,
    referredGeneric: 'You have been referred for a consultation with',
    withPriority: 'with priority',
    patientsServed: (count: number) => `${count}+ patients served`,
    fullName: 'Full name',
    email: 'Email',
    phone: 'Phone',
    scheduleConsultation: 'Schedule consultation',
    loading: 'Loading...',
    somethingWrong: 'Oops, something went wrong',
    requestSent: 'Request sent!',
    contactSoon: 'Our team will contact you soon.',
    redirectingIn: (seconds: number) => `Redirecting in ${seconds} second${seconds !== 1 ? 's' : ''}...`,
    accessAccount: 'Access my account',
    newRequest: 'New request',
    sending: 'Sending...',
    personalizedCare: 'Personalized and quality care',
    fullNamePlaceholder: 'Your full name',
    emailPlaceholder: 'your@email.com',
    phonePlaceholder: '+1 (555) 123-4567'
  }
};

export default function ReferralPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const doctorId = params.doctorId as string;
  const referrerCode = searchParams.get('code');
  const style = searchParams.get('style') || 'default'; // 'default', 'wellness', 'professional'

  const [doctor, setDoctor] = useState<DoctorInfo | null>(null);
  const [stats, setStats] = useState<DoctorStats | null>(null);
  const [referrer, setReferrer] = useState<ReferrerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(5);
  const [leadReferralCode, setLeadReferralCode] = useState<string | null>(null);
  const [language, setLanguage] = useState<'pt' | 'en'>('pt');

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    referrerCode: referrerCode || ''
  });

  // Detectar idioma do navegador
  useEffect(() => {
    const browserLanguage = navigator.language || navigator.languages?.[0] || 'pt';
    const detectedLang = browserLanguage.toLowerCase().startsWith('en') ? 'en' : 'pt';
    setLanguage(detectedLang);
  }, []);

  const t = translations[language];

  // Configuração única e minimalista
  const styleConfig = {
    bgClass: 'bg-gradient-to-br from-gray-50 via-white to-gray-100',
    cardClass: 'bg-white/80 backdrop-blur-sm border border-gray-200/50 shadow-xl',
    titleClass: 'bg-gradient-to-b from-gray-800 via-gray-600 to-gray-500 bg-clip-text text-transparent',
    subtitleClass: 'bg-gradient-to-b from-gray-600 via-gray-500 to-gray-400 bg-clip-text text-transparent',
    buttonClass: 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white shadow-lg hover:shadow-xl',
    ctaText: 'Agendar consulta'
  };

  // Redirecionar legacy /referral/[doctorId] -> /[doctor_slug]?code=
  useEffect(() => {
    let cancelled = false;
    async function redirectToSlug() {
      try {
        const url = `/api/referrals/doctor/${doctorId}${referrerCode ? `?code=${referrerCode}` : ''}`;
        const response = await fetch(url);
        const data = await response.json();

        if (response.ok && data?.doctor?.doctor_slug) {
          const dest = `/${encodeURIComponent(data.doctor.doctor_slug)}${referrerCode ? `?code=${encodeURIComponent(referrerCode)}` : ''}`;
          if (!cancelled) {
            window.location.replace(dest);
          }
          return;
        }

        // fallback: render old UI if we cannot resolve slug
        if (!cancelled) {
          setDoctor(data.doctor || null);
          setStats(data.stats || null);
          setReferrer(data.referrer || null);
        }
      } catch (err) {
        // fallback to old UI
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (doctorId) redirectToSlug();
    return () => { cancelled = true; };
  }, [doctorId, referrerCode]);

  // Redirecionamento automático após sucesso (contexto da clínica)
  useEffect(() => {
    if (!success || !leadReferralCode) return;
    let cancelled = false;
    async function goToClinicReferrals() {
      try {
        const url = `/api/referrals/doctor/${doctorId}`;
        const res = await fetch(url);
        const data = await res.json().catch(() => ({}));
        const slug = (data?.doctor?.doctor_slug || '').trim();
        if (!cancelled && slug) {
          const qs = new URLSearchParams({ code: String(leadReferralCode) });
          // Preserve coupon if present in current URL
          try {
            const u = new URL(window.location.href);
            const coupon = u.searchParams.get('cupom') || u.searchParams.get('coupon');
            if (coupon) qs.set('cupom', coupon);
          } catch {}
          window.location.replace(`/${encodeURIComponent(slug)}/referrals?${qs.toString()}`);
          return;
        }
      } catch {}
      // Fallback: go to root if we cannot resolve slug
      if (!cancelled) window.location.replace('/');
    }
    goToClinicReferrals();
    return () => { cancelled = true; };
  }, [success, leadReferralCode, doctorId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/referrals/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          doctorId
        }),
      });

      const data = await response.json();

      if (response.ok) {
        if (data?.referralCode) setLeadReferralCode(String(data.referralCode));
        setSuccess(true);
        setFormData({ name: '', email: '', phone: '', referrerCode: referrerCode || '' });
      } else {
        setError(data.error || 'Erro ao enviar indicação');
      }
    } catch (err) {
      setError('Erro de conexão. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  if (loading) {
    return (
      <div className={`min-h-screen ${styleConfig.bgClass} relative overflow-hidden`}>
        <div className="absolute inset-0 bg-gradient-to-br from-gray-200/20 via-transparent to-gray-300/20" />
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gray-400/10 via-transparent to-transparent" />
        
        <div className="relative max-w-md mx-auto px-6 py-20">
          {/* Skeleton da imagem do médico */}
          <div className="text-center mb-12">
            <div className="relative mb-8">
              <div className="relative w-32 h-32 mx-auto">
                <div className="absolute inset-0 bg-gradient-to-r from-gray-300 to-gray-400 rounded-full opacity-50 blur-lg animate-pulse" />
                <div className="relative w-full h-full rounded-full bg-gradient-to-r from-gray-300 to-gray-400 border-4 border-white/30 shadow-2xl animate-pulse" />
              </div>
            </div>
            
            {/* Skeleton dos textos */}
            <div className="space-y-3">
              <div className="h-6 bg-gradient-to-r from-gray-300 to-gray-400 rounded-lg mx-auto w-4/5 animate-pulse" />
              <div className="h-8 bg-gradient-to-r from-gray-400 to-gray-500 rounded-lg mx-auto w-3/4 animate-pulse" />
              <div className="h-5 bg-gradient-to-r from-gray-300 to-gray-400 rounded-lg mx-auto w-2/3 animate-pulse" />
              <div className="h-4 bg-gradient-to-r from-gray-200 to-gray-300 rounded-lg mx-auto w-1/2 animate-pulse" />
            </div>
          </div>

          {/* Skeleton do formulário */}
          <div className={`${styleConfig.cardClass} rounded-3xl p-8 shadow-2xl`}>
            <div className="space-y-6">
              <div className="space-y-5">
                {/* Campo Nome */}
                <div>
                  <div className="h-4 bg-gradient-to-r from-gray-300 to-gray-400 rounded w-1/3 mb-2 animate-pulse" />
                  <div className="h-12 bg-gradient-to-r from-gray-200 to-gray-300 rounded-xl animate-pulse" />
                </div>

                {/* Campo Email */}
                <div>
                  <div className="h-4 bg-gradient-to-r from-gray-300 to-gray-400 rounded w-1/4 mb-2 animate-pulse" />
                  <div className="h-12 bg-gradient-to-r from-gray-200 to-gray-300 rounded-xl animate-pulse" />
                </div>

                {/* Campo Telefone */}
                <div>
                  <div className="h-4 bg-gradient-to-r from-gray-300 to-gray-400 rounded w-1/3 mb-2 animate-pulse" />
                  <div className="h-12 bg-gradient-to-r from-gray-200 to-gray-300 rounded-xl animate-pulse" />
                </div>
              </div>

              {/* Skeleton do botão */}
              <div className="h-14 bg-gradient-to-r from-blue-400 to-indigo-500 rounded-xl animate-pulse" />
            </div>
          </div>

          {/* Skeleton do footer */}
          <div className="text-center mt-12">
            <div className="h-3 bg-gradient-to-r from-gray-200 to-gray-300 rounded mx-auto w-2/3 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (error && !doctor) {
    return (
      <div className={`min-h-screen ${styleConfig.bgClass} relative overflow-hidden flex items-center justify-center`}>
        <div className="absolute inset-0 bg-gradient-to-br from-gray-200/20 via-transparent to-gray-300/20" />
        <div className="relative max-w-md mx-auto px-6">
          <div className={`${styleConfig.cardClass} rounded-3xl p-8 text-center`}>
            <h2 className={`text-lg md:text-xl font-semibold mb-3 ${styleConfig.titleClass}`}>
              {t.somethingWrong}
            </h2>
            <p className={`${styleConfig.subtitleClass}`}>
              {error}
            </p>
          </div>
            </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className={`min-h-screen ${styleConfig.bgClass} relative overflow-hidden flex items-center justify-center`}>
        <div className="absolute inset-0 bg-gradient-to-br from-gray-200/20 via-transparent to-gray-300/20" />
        <div className="relative max-w-md mx-auto px-6">
          <div className={`${styleConfig.cardClass} rounded-3xl p-8 text-center`}>
            <div className="w-16 h-16 bg-gradient-to-r from-green-400 to-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            
            <h2 className={`text-xl md:text-2xl font-semibold mb-4 ${styleConfig.titleClass}`}>
              {t.requestSent}
            </h2>
            <p className={`${styleConfig.subtitleClass} mb-8`}>
              {t.contactSoon}
              </p>
              
            <div className="bg-gray-100/50 backdrop-blur-sm border border-gray-300/30 rounded-xl p-4 mb-8">
              <p className="bg-gradient-to-b from-gray-600 to-gray-500 bg-clip-text text-transparent text-sm">
                {t.redirectingIn(countdown)}
                </p>
              </div>
              
            <div className="space-y-4">
              <button 
                onClick={() => {
                    // Verificar se o usuário está logado como paciente
                    fetch('/api/auth/session')
                      .then(res => res.json())
                      .then(session => {
                        if (session?.user) {
                          // Se está logado, verificar se é paciente
                          fetch('/api/auth/role')
                            .then(res => res.json())
                            .then(data => {
                              if (data.role === 'PATIENT') {
                                window.location.href = '/patient/referrals';
                              } else {
                                window.location.href = '/';
                              }
                            })
                            .catch(() => {
                              window.location.href = '/';
                            });
                        } else {
                          // Se não está logado, redirecionar para login
                          window.location.href = '/auth/signin';
                        }
                      })
                      .catch(() => {
                        window.location.href = '/';
                      });
                }}
                className={`w-full ${styleConfig.buttonClass} py-4 px-6 rounded-xl font-medium transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98]`}
                >
                  {t.accessAccount}
                </button>
                
                <button 
                  onClick={() => {
                    setSuccess(false);
                    setCountdown(5);
                    setFormData({ name: '', email: '', phone: '', referrerCode: referrerCode || '' });
                  }}
                  className="w-full bg-gray-100/50 backdrop-blur-sm border border-gray-300/50 text-gray-700 hover:bg-gray-200/50 py-4 px-6 rounded-xl font-medium transition-all duration-300"
              >
                {t.newRequest}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${styleConfig.bgClass} relative overflow-hidden`}>
      {/* Background Effects */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-200/20 via-transparent to-gray-300/20" />
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gray-400/10 via-transparent to-transparent" />
      
      <div className="relative max-w-md mx-auto px-6 py-20">
        
        {/* Imagem do médico no topo */}
        {doctor && (
          <div className="text-center mb-12">
            <div className="relative mb-8">
              {doctor.image ? (
                <div className="relative w-32 h-32 mx-auto">
                  <div className="absolute inset-0 bg-gradient-to-r from-gray-400 to-gray-500 rounded-full opacity-75 blur-lg" />
                  <img 
                    src={doctor.image} 
                    alt={doctor.name}
                    className="relative w-full h-full rounded-full object-cover border-4 border-white/30 shadow-2xl"
                  />
                </div>
                ) : (
                <div className="relative w-32 h-32 mx-auto">
                  <div className="absolute inset-0 bg-gradient-to-r from-gray-400 to-gray-500 rounded-full opacity-75 blur-lg" />
                  <div className="relative w-full h-full rounded-full bg-gradient-to-r from-gray-500 to-gray-600 flex items-center justify-center border-4 border-white/30 shadow-2xl">
                    <span className="text-white text-4xl font-light">
                      {doctor.name.charAt(0)}
                    </span>
                  </div>
                  </div>
                )}
            </div>
            
            <div className="space-y-3">
              <p className={`text-lg md:text-xl font-light leading-relaxed ${styleConfig.titleClass}`}>
                {referrer ? t.referredBy(referrer.name) : t.referredGeneric}
              </p>
              <h1 className={`text-xl md:text-2xl font-semibold ${styleConfig.titleClass}`}>
                {doctor.name}
                  </h1>
              <p className={`text-base md:text-lg font-light ${styleConfig.titleClass}`}>
                {t.withPriority}
                  </p>
                  {stats && (
                <p className={`text-xs md:text-sm ${styleConfig.subtitleClass} opacity-80`}>
                  {t.patientsServed(stats.totalPatients)}
                </p>
                  )}
                </div>
              </div>
        )}

        {/* Formulário moderno */}
        <div className={`${styleConfig.cardClass} rounded-3xl p-8 shadow-2xl`}>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-5">
                  <div>
                <label htmlFor="name" className={`block text-xs md:text-sm font-medium ${styleConfig.titleClass} mb-2 opacity-90`}>
                  {t.fullName}
                </label>
                <input
                      id="name"
                      name="name"
                      type="text"
                      value={formData.name}
                      onChange={handleInputChange}
                      required
                  className="w-full px-4 py-3 bg-gray-50/80 backdrop-blur-sm border border-gray-300/50 rounded-xl text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all duration-200"
                  placeholder={t.fullNamePlaceholder}
                    />
                  </div>

                  <div>
                <label htmlFor="email" className={`block text-xs md:text-sm font-medium ${styleConfig.titleClass} mb-2 opacity-90`}>
                  {t.email}
                </label>
                <input
                      id="email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      required
                  className="w-full px-4 py-3 bg-gray-50/80 backdrop-blur-sm border border-gray-300/50 rounded-xl text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all duration-200"
                  placeholder={t.emailPlaceholder}
                    />
                </div>

                <div>
                <label htmlFor="phone" className={`block text-xs md:text-sm font-medium ${styleConfig.titleClass} mb-2 opacity-90`}>
                  {t.phone}
                </label>
                <input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={handleInputChange}
                  className="w-full px-4 py-3 bg-gray-50/80 backdrop-blur-sm border border-gray-300/50 rounded-xl text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all duration-200"
                  placeholder={t.phonePlaceholder}
                  />
                </div>
                </div>

                {error && (
              <div className="bg-red-500/20 backdrop-blur-sm border border-red-400/30 text-red-100 text-sm p-4 rounded-xl">
                    {error}
                  </div>
                )}

            <button
                  type="submit" 
                  disabled={submitting}
              className={`w-full ${styleConfig.buttonClass} py-4 px-6 rounded-xl font-medium text-base md:text-lg transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {submitting ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {t.sending}
                </div>
                  ) : (
                t.scheduleConsultation
                  )}
            </button>
              </form>
              </div>

        {/* Footer minimalista */}
        <div className="text-center mt-12">
          <p className={`text-xs ${styleConfig.subtitleClass} opacity-60`}>
            {t.personalizedCare}
          </p>
        </div>
      </div>
    </div>
  );
} 