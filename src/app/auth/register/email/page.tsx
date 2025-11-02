'use client';

import { Suspense, useState } from "react";
import Image from 'next/image';
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight } from 'lucide-react';

function RegisterEmailInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string>(searchParams.get('email') ?? "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    if (!email) {
      setError("Email is required");
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

      if (!response.ok) {
        throw new Error(data.message || 'Failed to send verification code');
      }

      // Verificar se é um usuário existente
      if (data.existingUser) {
        // Redirecionar para a página de verificação com flag de usuário existente
        router.push(`/auth/register/verify?email=${encodeURIComponent(email)}&existingUser=true`);
      } else {
        // Fluxo normal para novos usuários
        router.push(`/auth/register/verify?email=${encodeURIComponent(email)}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send verification code');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white font-normal tracking-[-0.03em] relative z-10">
      {/* Logo no topo esquerdo */}
      <div className="absolute top-4 left-4">
        <div className="relative w-8 h-8">
          <Image src="/logo.png" alt="Logo" fill className="object-contain" priority />
        </div>
      </div>
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-[420px] bg-white rounded-2xl border border-gray-200 p-8 shadow-lg relative z-20">

          {/* Tabs */}
          <div className="mb-4">
            <div className="inline-flex items-center rounded-xl border border-gray-200 p-1 bg-white/60 backdrop-blur-sm">
              <Link
                href="/auth/signin"
                className="h-8 px-3 inline-flex items-center justify-center rounded-lg text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-50"
              >
                Log In
              </Link>
              <span className="h-8 px-3 inline-flex items-center justify-center rounded-lg text-sm text-gray-900 bg-white shadow-sm select-none">
                Sign Up
              </span>
            </div>
          </div>

          {/* Mensagem de erro */}
          {error && (
            <div className="mb-6 text-red-600 text-center text-sm">{error}</div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off">
            {/* Minimal helper message above the email */}
            <p className="text-sm text-gray-700">Enter your email to start your 14-day free trial.</p>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="off"
                className="w-full px-4 py-2.5 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5154e7]/20 focus:border-[#5154e7] transition-all duration-200 text-gray-900 placeholder-gray-500"
                placeholder="email@example.com"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-gradient-to-b from-gray-900 to-black hover:opacity-90 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Sending…' : 'Create a account'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          {/* Login link */}
          <div className="mt-6 text-center">
            <Link
              href="/auth/signin"
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors duration-200"
            >
              Already have an account? Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RegisterEmail() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex items-center justify-center p-4">
          <div className="w-full max-w-[420px] bg-white rounded-2xl border border-gray-200 p-8 shadow-lg">
            {/* Tabs skeleton */}
            <div className="mb-4">
              <div className="inline-flex items-center rounded-xl border border-gray-200 p-1 bg-white/60 backdrop-blur-sm">
                <div className="h-8 w-16 rounded-lg bg-gray-100" />
                <div className="h-8 w-20 rounded-lg bg-gray-100 ml-1" />
              </div>
            </div>

            <div className="animate-pulse">
              {/* Label */}
              <div className="h-4 w-12 bg-gray-100 rounded mb-3" />
              {/* Input */}
              <div className="h-10 w-full bg-gray-100 rounded-lg mb-5" />
              {/* Button */}
              <div className="h-10 w-full bg-gray-200 rounded-lg" />
            </div>

            {/* Secondary link */}
            <div className="mt-6 flex items-center justify-center">
              <div className="h-4 w-40 bg-gray-100 rounded" />
            </div>
          </div>
        </div>
      }
    >
      <RegisterEmailInner />
    </Suspense>
  );
}
