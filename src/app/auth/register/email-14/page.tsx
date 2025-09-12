'use client';

import { Suspense, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Check } from 'lucide-react';

function RegisterEmail14Inner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string>(searchParams.get('email') ?? '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    if (!email) {
      setError('Email é obrigatório');
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/register/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Falha ao enviar código de verificação');

      if (data.existingUser) {
        router.push(`/auth/register/verify?email=${encodeURIComponent(email)}&existingUser=true`);
      } else {
        router.push(`/auth/register/verify?email=${encodeURIComponent(email)}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao enviar código de verificação');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white font-normal tracking-[-0.03em] relative z-10">
      {/* Logo */}
      <div className="absolute top-4 left-4">
        <div className="relative w-8 h-8">
          <Image src="/logo.png" alt="Logo" fill className="object-contain" priority />
        </div>
      </div>

      {/* Benefits banner */}
      <div className="w-full">
        <div className="relative overflow-hidden">
          <div className="bg-gradient-to-r from-[#6d28d9] via-[#7c3aed] to-[#8b5cf6]">
            <div className="relative">
              <svg className="pointer-events-none absolute inset-0 opacity-30" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 200" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="g-email14" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity="0.1" />
                  </linearGradient>
                </defs>
                {Array.from({ length: 12 }).map((_, i) => (
                  <path key={i} d={`M0 ${10 + i*15} C 300 ${-20 + i*18}, 900 ${40 + i*12}, 1200 ${10 + i*15}`} fill="none" stroke="url(#g-email14)" strokeWidth="2" />
                ))}
              </svg>
              <div className="relative z-10">
                <div className="max-w-3xl mx-auto px-4 py-4 text-center text-white">
                  <p className="text-sm md:text-base font-semibold">
                    Celebrating 1,000+ happy customers and $100M+ in added revenue. Enjoy 14 days free!
                  </p>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs md:text-sm text-white/90">
                    <div className="inline-flex items-center justify-center gap-2"><Check className="h-4 w-4" />Acesso total aos recursos</div>
                    <div className="inline-flex items-center justify-center gap-2"><Check className="h-4 w-4" />Sem compromisso</div>
                    <div className="inline-flex items-center justify-center gap-2"><Check className="h-4 w-4" />Cancele quando quiser</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-[420px] bg-white rounded-2xl border border-gray-200 p-8 shadow-lg relative z-20">
          {/* Tabs */}
          <div className="mb-4">
            <div className="inline-flex items-center rounded-xl border border-gray-200 p-1 bg-white/60 backdrop-blur-sm">
              <Link href="/auth/signin" className="h-8 px-3 inline-flex items-center justify-center rounded-lg text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-50">Log In</Link>
              <span className="h-8 px-3 inline-flex items-center justify-center rounded-lg text-sm text-gray-900 bg-white shadow-sm select-none">Sign Up</span>
            </div>
          </div>

          {error && <div className="mb-6 text-red-600 text-center text-sm">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="off"
                className="w-full px-4 py-2.5 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5154e7]/20 focus:border-[#5154e7] transition-all duration-200 text-gray-900 placeholder-gray-500"
                placeholder="email@exemple.com"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-gradient-to-b from-gray-900 to-black hover:opacity-90 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Enviando…' : 'Testar por 14 dias'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link href="/auth/signin" className="text-sm text-gray-600 hover:text-gray-900 transition-colors duration-200">
              Já tem conta? Entrar
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RegisterEmail14() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex items-center justify-center p-4">
          <div className="w-full max-w-[420px] bg-white rounded-2xl border border-gray-200 p-8 shadow-lg">
            <div className="h-4 w-12 bg-gray-100 rounded mb-3" />
            <div className="h-10 w-full bg-gray-100 rounded-lg mb-5" />
            <div className="h-10 w-full bg-gray-200 rounded-lg" />
          </div>
        </div>
      }
    >
      <RegisterEmail14Inner />
    </Suspense>
  );
}
