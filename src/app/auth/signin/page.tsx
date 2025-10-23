'use client';

import React, { useState, FormEvent, useEffect, Suspense } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn, signOut } from "next-auth/react"
import { ArrowRight } from 'lucide-react';

function LoginForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'credentials' | 'code'>('credentials');
  const [showBusinessModal, setShowBusinessModal] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Verificar se temos um token na URL e autenticar automaticamente
  useEffect(() => {
    const token = searchParams.get('token');
    const emailParam = searchParams.get('email');
    const resetParam = searchParams.get('reset');
    
    // Log de todos os parâmetros da URL para debug
    const urlParams: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      urlParams[key] = value;
    });
    console.log('URL search params:', urlParams);
    console.log('Token in URL:', token ? `${token.substring(0, 20)}...` : 'not found');
    console.log('Email in URL:', emailParam);
    console.log('Reset param:', resetParam);
    
    // If it comes from the password reset flow, prefill email
    if (resetParam === 'true' && emailParam) {
      console.log('Detected successful password reset flow');
      setEmail(emailParam);
      // No error, just prefill the email to ease sign-in
    }
    
    if (token && emailParam) {
      console.log('Token detected in URL, attempting automatic authentication');
      setIsSubmitting(true);
      setEmail(emailParam);
      
      // Authenticate using the token via signIn
      console.log('Trying to authenticate with token via signIn');
      
      // Primeiro verificamos o token no servidor
      fetch('/api/auth/token-signin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, email: emailParam }),
      })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            console.log('Token verified successfully, now signing in via credentials');
            
            // Se o token for válido, usamos o signIn do NextAuth para autenticar o usuário
            // Isso garante que o NextAuth reconheça a sessão corretamente
            return signIn('credentials', {
              email: emailParam,
              // Usamos o token como senha temporária - o backend vai verificar isso
              password: `token:${token}`,
              redirect: false,
            }).then(result => {
              console.log('signIn result:', result);
              
              if (result?.error) {
                throw new Error(result.error);
              }
              
              if (result?.ok) {
                console.log('Token-based authentication succeeded');
                // DOCTOR-only guard for this page: check role and block PATIENT
                fetch('/api/profile')
                  .then(r => r.ok ? r.json() : Promise.reject(new Error('profile fail')))
                  .then(async (profile) => {
                    if (profile?.role !== 'DOCTOR') {
                      await signOut({ redirect: false });
                      setShowBusinessModal(true);
                      return;
                    }
                    // DOCTOR: proceed normally
                    router.push('/');
                  })
                  .catch(async () => {
                    // On profile failure, sign out for safety
                    await signOut({ redirect: false });
                    setShowBusinessModal(true);
                  });
              }
            });
          } else {
            throw new Error(data.message || 'Token verification failed');
          }
        })
        .catch(err => {
          console.error('Error authenticating with token:', err);
          setError('Error processing automatic authentication. Please sign in manually.');
          setIsSubmitting(false);
        });
    }
  }, [searchParams, router]);
  
  // Step 1: validate email + password and send the code
  const handleCredentialsSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const doctorSlug = searchParams.get('doctor') || undefined;
    try {
      // 1) Verify password on the backend (without opening a session)
      const verifyResp = await fetch('/api/auth/password/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      if (!verifyResp.ok) {
        const data = await verifyResp.json().catch(() => ({}));
        throw new Error(data?.message || 'Credenciais inválidas');
      }

      // 2) Send verification code via email (with optional branding from slug in URL)
      const sendResp = await fetch('/api/auth/register/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, slug: doctorSlug })
      });
      if (!sendResp.ok) {
        const data = await sendResp.json().catch(() => ({}));
        throw new Error(data?.message || 'Falha ao enviar código');
      }

      setStep('code');
    } catch (err) {
      console.error('Error sending verification code:', err);
      setError(err instanceof Error ? err.message : 'Failed to start 2FA');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 2: validate code and complete login via token
  const handleCodeSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // 3) Verify code and obtain a NextAuth-compatible JWT
      const verifyCodeResp = await fetch('/api/auth/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, existingUser: true })
      });
      const data = await verifyCodeResp.json();
      if (!verifyCodeResp.ok) {
        throw new Error(data?.message || 'Código inválido');
      }

      const token = data?.token as string | undefined;
      if (!token) throw new Error('Token not returned');

      // 4) Sign in using the token as "password" (prefixed with token:)
      const result = await signIn('credentials', {
        email,
        password: `token:${token}`,
        redirect: true,
      });

      if (result?.error) {
        throw new Error(result.error);
      }
    } catch (err) {
      console.error('Error authenticating with verification code:', err);
      setError(err instanceof Error ? err.message : 'Failed to authenticate');
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

          {/* Tabs minimalistas */}
          <div className="mb-4">
            <div className="inline-flex items-center rounded-xl border border-gray-200 p-1 bg-white/60 backdrop-blur-sm">
              <span className="h-8 px-3 inline-flex items-center justify-center rounded-lg text-sm text-gray-900 bg-white shadow-sm select-none">
                Log In
              </span>
              <Link
                href="/auth/register/email"
                className="h-8 px-3 inline-flex items-center justify-center rounded-lg text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-50"
              >
                Sign Up
              </Link>
            </div>
          </div>

          {/* Mensagem de erro */}
          {error && (
            <div className="mb-6 text-red-600 text-center text-sm">{error}</div>
          )}
          
          {/* Step-based forms */}
          {step === 'credentials' ? (
            <form onSubmit={handleCredentialsSubmit} className="space-y-5" autoComplete="off">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  required
                  autoComplete="off"
                  className="w-full px-4 py-2.5 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5154e7]/20 focus:border-[#5154e7] transition-all duration-200 text-gray-900"
                  placeholder="m@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  required
                  autoComplete="current-password"
                  className="w-full px-4 py-2.5 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5154e7]/20 focus:border-[#5154e7] transition-all duration-200 text-gray-900"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-black hover:bg-gray-900 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Sending code…' : 'Continue'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          ) : (
            <form onSubmit={handleCodeSubmit} className="space-y-5" autoComplete="off">
              <div>
                <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-2">
                  Verification code
                </label>
                <input
                  id="code"
                  name="code"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  required
                  className="w-full px-4 py-2.5 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5154e7]/20 focus:border-[#5154e7] transition-all duration-200 text-gray-900"
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                />
                <div className="mt-2 text-xs text-gray-600">
                  Didn't receive it?{' '}
                  <button
                    type="button"
                    className="underline hover:text-gray-900"
                    disabled={isSubmitting}
                    onClick={async () => {
                      try {
                        setIsSubmitting(true);
                        setError(null);
                        await fetch('/api/auth/resend-code', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ email })
                        }).then(async (r) => {
                          if (!r.ok) {
                            const d = await r.json().catch(() => ({}));
                            throw new Error(d?.message || 'Failed to resend code');
                          }
                        });
                      } catch (e) {
                        setError(e instanceof Error ? e.message : 'Failed to resend code');
                      } finally {
                        setIsSubmitting(false);
                      }
                    }}
                  >
                    Resend code
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-black hover:bg-gray-900 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Verifying…' : 'Sign in'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          )}

          {/* Links */}
          <div className="mt-6 text-center">
            <Link
              href="/auth/forgot-password"
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors duration-200 block"
            >
              Forgot your password?
            </Link>
          </div>
        </div>
      </div>

      {/* Modal prompting to create a business account (shown when login is not DOCTOR) */}
      {showBusinessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Business Account</h3>
            <p className="text-sm text-gray-600 mb-5">
              This login is exclusive to clinics/professionals. Do you want to create a business account?
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowBusinessModal(false)}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <Link
                href="/auth/register-doctor"
                className="px-4 py-2 text-sm rounded-lg bg-gray-900 text-white hover:bg-black"
              >
                Create business account
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1a1a1a] to-[#2a2a2a] flex items-center justify-center">
      <div className="w-full max-w-[420px] bg-[#0f0f0f] rounded-2xl border border-gray-800 p-8 shadow-lg">
        <div className="animate-pulse space-y-4">
          <div className="flex justify-center">
            <div className="w-10 h-10 bg-gray-700 rounded-lg"></div>
          </div>
          <div className="space-y-2">
            <div className="h-4 bg-gray-700 rounded"></div>
            <div className="h-10 bg-gray-700 rounded"></div>
          </div>
          <div className="space-y-2">
            <div className="h-4 bg-gray-700 rounded"></div>
            <div className="h-10 bg-gray-700 rounded"></div>
          </div>
          <div className="h-10 bg-gray-700 rounded"></div>
        </div>
      </div>
    </div>
  );
}

export default function LoginDark() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <LoginForm />
    </Suspense>
  );
} 