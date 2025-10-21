'use client';

import { useState, useEffect, Suspense } from "react";
import Image from 'next/image';
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { ArrowRight, Check } from 'lucide-react';

function RegisterPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailParam = searchParams.get('email');
  const tokenParam = searchParams.get('token');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [isSuccess, setIsSuccess] = useState(false);

  // Redirect if no email or token
  useEffect(() => {
    if (!emailParam || !tokenParam) {
      router.push('/auth/register/email');
    }
  }, [emailParam, tokenParam, router]);

  // Evaluate password strength
  useEffect(() => {
    if (!password) {
      setPasswordStrength(0);
      return;
    }

    let strength = 0;
    if (password.length >= 8) strength += 1;
    if (/[A-Z]/.test(password)) strength += 1;
    if (/[a-z]/.test(password)) strength += 1;
    if (/[0-9]/.test(password)) strength += 1;
    if (/[^A-Za-z0-9]/.test(password)) strength += 1;

    setPasswordStrength(strength);
  }, [password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    if (!name || !password || !confirmPassword) {
      setError("All fields are required");
      setIsSubmitting(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setIsSubmitting(false);
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/register/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: emailParam,
          token: tokenParam,
          name,
          password
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to complete registration');
      }

      setIsSuccess(true);
      const createdClinicId: string | undefined = data?.clinicId;

      // Try to automatically sign the user in and then navigate to plans for the created clinic
      try {
        const result = await signIn('credentials', {
          email: emailParam || '',
          password,
          redirect: false,
        });

        if (result?.ok) {
          const target = createdClinicId
            ? `/clinic/planos-trial?clinicId=${encodeURIComponent(createdClinicId)}&newClinic=1`
            : '/clinic/planos-trial';
          router.push(target);
          router.refresh();
        } else {
          // Fallback to sign-in page if auto sign-in fails
          router.push('/auth/signin');
        }
      } catch (e) {
        // Fallback to sign-in page in case of any error
        router.push('/auth/signin');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete registration');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white font-normal tracking-[-0.03em] relative z-10">
        {/* Logo at top-left */}
        <div className="absolute top-4 left-4">
          <div className="relative w-8 h-8">
            <Image src="/logo.png" alt="Logo" fill className="object-contain" priority />
          </div>
        </div>
        <div className="min-h-screen flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-[420px] bg-white rounded-2xl border border-gray-200 p-8 shadow-lg relative z-20">

            <div className="text-center space-y-2 mb-6">
              <div className="flex justify-center">
                <div className="bg-green-100 p-3 rounded-full">
                  <Check className="h-8 w-8 text-green-600" />
                </div>
              </div>
              <h1 className="text-xl font-medium text-gray-900 mt-4">Registration complete!</h1>
              <p className="text-sm text-gray-600">
                Your account has been created and your 14-day trial is active.
              </p>
            </div>

            <div className="mt-6">
              <p className="text-center text-sm text-gray-600 mb-4">
                Finalizing your account and redirecting to your plan selection...
              </p>
              <Link
                href="/clinic/planos-trial"
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-black hover:bg-gray-900 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black"
              >
                Go to plans
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white font-normal tracking-[-0.03em] relative z-10">
      {/* Logo at top-left */}
      <div className="absolute top-4 left-4">
        <div className="relative w-8 h-8">
          <Image src="/logo.png" alt="Logo" fill className="object-contain" priority />
        </div>
      </div>
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-[420px] bg-white rounded-2xl border border-gray-200 p-8 shadow-lg relative z-20">

          <div className="text-center space-y-2 mb-6">
            <h1 className="text-xl font-medium text-gray-900">Finish your registration</h1>
            <p className="text-sm text-gray-600">
              Set your business name and password to start your trial
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-6 text-red-600 text-center text-sm">{error}</div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                Business name
              </label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="off"
                className="w-full px-4 py-2.5 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5154e7]/20 focus:border-[#5154e7] transition-all duration-200 text-gray-900"
                placeholder="Your Business"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full px-4 py-2.5 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5154e7]/20 focus:border-[#5154e7] transition-all duration-200 text-gray-900"
                placeholder="Minimum 8 characters"
              />
              {password && (
                <div className="mt-2">
                  <div className="flex gap-1">
                    {[...Array(5)].map((_, i) => (
                      <div 
                        key={i}
                        className={`h-1 flex-1 rounded-full ${
                          i < passwordStrength ? 'bg-[#5893ec]' : 'bg-gray-200'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {passwordStrength < 3 ? 'Weak password' : passwordStrength < 5 ? 'Medium password' : 'Strong password'}
                  </p>
                </div>
              )}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                Confirm password
              </label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full px-4 py-2.5 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5154e7]/20 focus:border-[#5154e7] transition-all duration-200 text-gray-900"
                placeholder="Repeat your password"
              />
            </div>

            {/* Plan selection and trial removed: plan is handled later in /clinic/planos-trial */}

            <button
              type="submit"
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-black hover:bg-gray-900 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Finalizing...' : 'Finish registration'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          {/* Links */}
          <div className="mt-6 text-center space-y-3">
            <div className="border-t border-gray-200 pt-3">
              <Link
                href={`/auth/register/slug?email=${encodeURIComponent(emailParam || '')}&token=${encodeURIComponent(tokenParam || '')}`}
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
export default function RegisterPassword() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Carregando...</div>}>
      <RegisterPasswordInner />
    </Suspense>
  );
}
