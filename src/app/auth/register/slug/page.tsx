'use client';

import { useState, useEffect, Suspense } from "react";
import Image from 'next/image';
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Check, X } from 'lucide-react';
import { debounce } from 'lodash';

function RegisterSlugInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailParam = searchParams.get('email');
  const tokenParam = searchParams.get('token');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clinicName, setClinicName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [businessPhone, setBusinessPhone] = useState("");
  const [monthlyRevenue, setMonthlyRevenue] = useState("");
  const [currentGateway, setCurrentGateway] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [baseDomain] = useState<string>(
    (typeof window !== 'undefined' && (process.env.NEXT_PUBLIC_APP_BASE_DOMAIN || 'zuzz.vu')) || 'zuzz.vu'
  );

  // Redirecionar se não tiver email ou token
  useEffect(() => {
    if (!emailParam || !tokenParam) {
      router.push('/auth/register/email');
    }
  }, [emailParam, tokenParam, router]);

  // Verificar disponibilidade do subdomínio
  const checkSubAvailability = debounce(async (value: string) => {
    if (!value || value.length < 3) {
      setIsAvailable(null);
      return;
    }

    setIsChecking(true);
    try {
      const response = await fetch(`/api/auth/register/check-slug?subdomain=${encodeURIComponent(value)}`);
      const data = await response.json();
      setIsAvailable(data.available);
    } catch (err) {
      console.error("Erro ao verificar slug:", err);
      setIsAvailable(null);
    } finally {
      setIsChecking(false);
    }
  }, 500);

  // Atualizar verificação quando o subdomínio mudar
  useEffect(() => {
    if (subdomain) {
      checkSubAvailability(subdomain);
    } else {
      setIsAvailable(null);
    }
  }, [subdomain]);

  // Auto-generate subdomain from clinic name until user manually edits slug
  useEffect(() => {
    if (!slugEdited) {
      const generated = clinicName
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
      setSubdomain(generated);
    }
  }, [clinicName, slugEdited]);

  const handleSubdomainChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSlugEdited(true);
    // allow only lowercase letters, numbers and hyphen
    const value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setSubdomain(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    if (!clinicName) {
      setError("Business name is required");
      setIsSubmitting(false);
      return;
    }

    if (!subdomain || subdomain.length < 3) {
      setError("Subdomain is required (min 3 characters)");
      setIsSubmitting(false);
      return;
    }

    if (!isAvailable) {
      setError("This subdomain is not available");
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/register/slug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: emailParam,
          token: tokenParam,
          clinicName,
          subdomain,
          businessPhone,
          monthlyRevenue,
          currentGateway,
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to save business info');
      }

      // Redirect to password setup page, forwarding business info for draft creation after sign-in
      const q = new URLSearchParams({
        email: String(emailParam || ''),
        token: String(data.token || ''),
        clinicName: clinicName,
        subdomain: subdomain,
      });
      router.push(`/auth/register/password?${q.toString()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save business info');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white font-normal tracking-[-0.03em] relative z-10">
      {/* Logo (top-left) */}
      <div className="absolute top-4 left-4">
        <div className="relative w-8 h-8">
          <Image src="/logo.png" alt="Logo" fill className="object-contain" priority />
        </div>
      </div>
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-[420px] bg-white rounded-2xl border border-gray-200 p-8 shadow-lg relative z-20">

          <div className="text-center space-y-2 mb-6">
            <h1 className="text-xl font-medium text-gray-900">Your business details</h1>
            <p className="text-sm text-gray-600">
              Enter the name and choose a unique subdomain for your access
            </p>
          </div>

          {/* Mensagem de erro */}
          {error && (
            <div className="mb-6 text-red-600 text-center text-sm">{error}</div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off">
            <div>
              <label htmlFor="clinicName" className="block text-sm font-medium text-gray-700 mb-2">
                Business name
              </label>
              <input
                type="text"
                id="clinicName"
                value={clinicName}
                onChange={(e) => setClinicName(e.target.value)}
                required
                autoComplete="off"
                className="w-full px-4 py-2.5 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5154e7]/20 focus:border-[#5154e7] transition-all duration-200 text-gray-900"
                placeholder="Example Business"
                minLength={3}
                maxLength={100}
              />
            </div>

            {/* Business phone */}
            <div>
              <label htmlFor="businessPhone" className="block text-sm font-medium text-gray-700 mb-2">
                Business phone (optional)
              </label>
              <input
                type="tel"
                id="businessPhone"
                value={businessPhone}
                onChange={(e) => setBusinessPhone(e.target.value)}
                autoComplete="tel"
                className="w-full px-4 py-2.5 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5154e7]/20 focus:border-[#5154e7] transition-all duration-200 text-gray-900"
                placeholder="+1 555 000 0000"
                maxLength={32}
              />
            </div>

            {/* Monthly revenue */}
            <div>
              <label htmlFor="monthlyRevenue" className="block text-sm font-medium text-gray-700 mb-2">
                Monthly revenue (optional)
              </label>
              <select
                id="monthlyRevenue"
                value={monthlyRevenue}
                onChange={(e) => setMonthlyRevenue(e.target.value)}
                className="w-full px-4 py-2.5 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5154e7]/20 focus:border-[#5154e7] transition-all duration-200 text-gray-900"
              >
                <option value="">Select a range…</option>
                <option value="<10k">Less than $10k</option>
                <option value="10k-50k">$10k – $50k</option>
                <option value="50k-200k">$50k – $200k</option>
                <option value="200k-1m">$200k – $1M</option>
                <option value="1m-5m">$1M – $5M</option>
                <option value=">5m">More than $5M</option>
              </select>
            </div>

            {/* Current payment gateway */}
            <div>
              <label htmlFor="currentGateway" className="block text-sm font-medium text-gray-700 mb-2">
                Current payment gateway (optional)
              </label>
              <input
                type="text"
                id="currentGateway"
                value={currentGateway}
                onChange={(e) => setCurrentGateway(e.target.value)}
                className="w-full px-4 py-2.5 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5154e7]/20 focus:border-[#5154e7] transition-all duration-200 text-gray-900"
                placeholder="e.g., Stripe, Adyen, Pagar.me"
                maxLength={64}
              />
            </div>

            <div>
              <label htmlFor="subdomain" className="block text-sm font-medium text-gray-700 mb-2">
                Business subdomain
              </label>
              <div className="relative">
                <input
                  type="text"
                  id="subdomain"
                  value={subdomain}
                  onChange={handleSubdomainChange}
                  required
                  autoComplete="off"
                  className="w-full pr-[90px] pl-4 py-2.5 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5154e7]/20 focus:border-[#5154e7] transition-all duration-200 text-gray-900"
                  placeholder="name"
                  minLength={3}
                  maxLength={30}
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <span className="text-gray-500">.{baseDomain}</span>
                </div>
                {subdomain && (
                  <div className="absolute inset-y-0 right-20 flex items-center pr-2">
                    {isChecking ? (
                      <div className="h-4 w-4 border-2 border-t-blue-500 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></div>
                    ) : isAvailable === true ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : isAvailable === false ? (
                      <X className="h-4 w-4 text-red-500" />
                    ) : null}
                  </div>
                )}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Your link will look like: <span className="font-medium text-gray-700">{subdomain || 'name'}.{baseDomain}</span>
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Use only lowercase letters, numbers and hyphen. Minimum of 3 characters.
              </p>
              {isAvailable === false && (
                <p className="mt-1 text-xs text-red-500">
                  This subdomain is already in use. Please choose another.
                </p>
              )}
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-black hover:bg-gray-900 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black"
              disabled={isSubmitting || !isAvailable}
            >
              {isSubmitting ? 'Saving…' : 'Continue'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          {/* Links */}
          <div className="mt-6 text-center space-y-3">
            <div className="border-t border-gray-200 pt-3">
              <Link
                href={`/auth/register/verify?email=${encodeURIComponent(emailParam || '')}`}
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

export default function RegisterSlug() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <RegisterSlugInner />
    </Suspense>
  );
}
