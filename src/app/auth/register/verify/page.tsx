'use client';

import { useState, Suspense } from "react";
import Image from 'next/image';
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight } from 'lucide-react';
import { signIn } from 'next-auth/react';

function RegisterVerifyInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailParam = searchParams.get('email');
  const existingUserParam = searchParams.get('existingUser');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState(emailParam || "");
  const [code, setCode] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    if (!email || !code) {
      setError("Email and code are required");
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email, 
          code, 
          existingUser: existingUserParam === 'true'
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to verify the code');
      }

      // Check if the user was authenticated (login) or should continue the registration flow
      if (data.user && data.token) {
        // Existing user: sign in via NextAuth using token
        const result = await signIn('credentials', {
          email,
          password: `token:${data.token}`,
          redirect: false,
          callbackUrl: '/doctor/dashboard'
        });

        if (result?.ok) {
          // Forçar navegação completa para garantir que o middleware enxergue a sessão
          window.location.assign('/doctor/dashboard');
          return;
        }

        // If it fails for any reason, fallback to login redirect
        router.push('/auth/signin?callbackUrl=' + encodeURIComponent('/doctor/dashboard'));
      } else {
        // Continue registration flow
        router.push(`/auth/register/slug?email=${encodeURIComponent(email)}&token=${encodeURIComponent(data.token)}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify the code');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendCode = async () => {
    if (!email) {
      setError("Email is required");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/register/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to resend the code');
      }

      alert("A new verification code has been sent!");
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend the code');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white font-normal tracking-[-0.03em] relative z-10">
      {/* Logo at the top-left */}
      <div className="absolute top-4 left-4">
        <div className="relative w-8 h-8">
          <Image src="/logo.png" alt="Logo" fill className="object-contain" priority />
        </div>
      </div>
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-[420px] bg-white rounded-2xl border border-gray-200 p-8 shadow-lg relative z-20">

          <div className="text-center space-y-2 mb-6">
            <h1 className="text-xl font-medium text-gray-900">Verify your email</h1>
            <p className="text-sm text-gray-600">
              Enter the verification code sent to <strong>{email}</strong>
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-6 text-red-600 text-center text-sm">{error}</div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off">
            <div>
              <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-2">
                Verification code
              </label>
              <input
                type="text"
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                autoComplete="off"
                className="w-full px-4 py-2.5 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5154e7]/20 focus:border-[#5154e7] transition-all duration-200 text-gray-900 placeholder-gray-500"
                placeholder="Enter the 6-digit code"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-gradient-to-r from-[#5893ec] to-[#9bcef7] hover:from-[#4f88e2] hover:to-[#8fc4f5] rounded-lg transition-all duration-300 flex items-center justify-center gap-2"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Verifying...' : 'Continue'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          {/* Links */}
          <div className="mt-6 text-center space-y-3">
            <button
              onClick={handleResendCode}
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors duration-200"
              disabled={isSubmitting}
            >
              Resend code
            </button>
            <div className="border-t border-gray-200 pt-3">
              <Link
                href="/auth/register/email"
                className="text-sm text-gray-600 hover:text-gray-900 transition-colors duration-200"
              >
                Back
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RegisterVerify() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <RegisterVerifyInner />
    </Suspense>
  );
}
