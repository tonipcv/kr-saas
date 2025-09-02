'use client';

import { useEffect, useState } from 'react';
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

export default function DoctorForgotPasswordPage() {
  const { slug } = useParams<{ slug: string }>();

  const [doctor, setDoctor] = useState<DoctorPublic | null>(null);
  const [loadingDoctor, setLoadingDoctor] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showNotMemberModal, setShowNotMemberModal] = useState(false);

  useEffect(() => {
    const fetchDoctor = async () => {
      try {
        setLoadingDoctor(true);
        const res = await fetch(`/api/v2/doctor-link/${slug}`);
        const json = await res.json();
        if (!res.ok || !json?.success) {
          setError(json?.message || 'Doctor not found');
          setDoctor(null);
        } else {
          setDoctor(json.data as DoctorPublic);
          setError(null);
        }
      } catch (e) {
        setError('Error loading doctor information');
      } finally {
        setLoadingDoctor(false);
      }
    };
    if (slug) fetchDoctor();
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
        // If endpoint fails, we continue to standard flow as a fallback
      } catch {}

      // 2) Proceed with standard forgot password request (pass slug for tenant context)
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, slug }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Something went wrong');
      }

      setIsSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white font-normal tracking-[-0.03em] relative z-10">
        <div className="min-h-screen flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-[420px] bg-white rounded-2xl border border-gray-200 p-8 shadow-lg relative z-20">
            {/* Doctor header */}
            <div className="text-center mb-6">
              <div className="flex justify-center items-center mb-4 min-h-16">
                {loadingDoctor ? (
                  <div className="w-16 h-16 bg-gray-200 rounded-full animate-pulse" />
                ) : doctor?.image ? (
                  <div className="w-16 h-16 relative rounded-full overflow-hidden">
                    <Image src={doctor.image} alt={doctor.name || 'Doctor'} fill className="object-cover rounded-full" />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                    <span className="text-white text-lg font-bold">
                      {(doctor?.name || 'D').charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
              <h1 className="text-xl font-semibold text-gray-900 mb-2">
                {loadingDoctor ? 'Loading…' : doctor?.name || 'Doctor'}
              </h1>
            </div>

            {/* Success */}
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-medium text-gray-900 mb-2">Email sent!</h2>
              <p className="text-gray-600 text-sm">We've sent a password recovery link to your email.</p>
            </div>

            <Link
              href={`/${slug}/login`}
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-gradient-to-r from-[#5893ec] to-[#9bcef7] hover:from-[#4f88e2] hover:to-[#8fc4f5] rounded-lg transition-all duration-300 flex items-center justify-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to login
            </Link>

            {/* Footer */}
            <div className="mt-6 pt-4 border-t border-gray-200">
              <div className="flex items-center justify-center gap-2 text-gray-500">
                <span className="text-xs">Powered by</span>
                <Image src="/logo.png" alt="Sistema" width={32} height={10} className="object-contain opacity-80" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white font-normal tracking-[-0.03em] relative z-10">
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-[420px] bg-white rounded-2xl border border-gray-200 p-8 shadow-lg relative z-20">
          {/* Doctor header */}
          <div className="text-center mb-6">
            <div className="flex justify-center items-center mb-4 min-h-16">
              {loadingDoctor ? (
                <div className="w-16 h-16 bg-gray-200 rounded-full animate-pulse" />
              ) : doctor?.image ? (
                <div className="w-16 h-16 relative rounded-full overflow-hidden">
                  <Image src={doctor.image} alt={doctor.name || 'Doctor'} fill className="object-cover rounded-full" />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                  <span className="text-white text-lg font-bold">
                    {(doctor?.name || 'D').charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">
              {loadingDoctor ? 'Loading…' : doctor?.name || 'Doctor'}
            </h1>
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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="off"
                className="w-full px-4 py-2.5 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5154e7]/20 focus:border-[#5154e7] transition-all duration-200 text-gray-900"
                placeholder="m@example.com"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-gradient-to-r from-[#5893ec] to-[#9bcef7] hover:from-[#4f88e2] hover:to-[#8fc4f5] rounded-lg transition-all duration-300 flex items-center justify-center gap-2"
              disabled={isLoading}
            >
              {isLoading ? 'Sending link...' : 'Reset password'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          {/* Links */}
          <div className="mt-6 text-center space-y-3">
            <Link
              href={`/${slug}/login`}
              className="text-sm text-gray-700 hover:text-gray-900 transition-colors duration-200 flex items-center justify-center gap-2"
            >
              <ArrowLeft className="h-3 w-3" />
              Back to login
            </Link>
            <div className="pt-4 border-t border-gray-200">
              <div className="flex items-center justify-center gap-2 text-gray-500">
                <span className="text-xs">Powered by</span>
                <Image src="/logo.png" alt="Sistema" width={32} height={10} className="object-contain opacity-80" />
              </div>
            </div>
          </div>
        </div>
        {/* Modal: Not a member */}
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
                <Link
                  href={`/${slug}`}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                  onClick={() => setShowNotMemberModal(false)}
                >
                  Ver produtos
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
