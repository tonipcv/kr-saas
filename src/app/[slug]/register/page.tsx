'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';

type DoctorPublic = {
  id: string;
  name: string | null;
  image: string | null;
  email: string;
};

export default function DoctorRegisterPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();

  const [doctor, setDoctor] = useState<DoctorPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchDoctor = async () => {
      try {
        setLoading(true);
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
        setLoading(false);
      }
    };
    if (slug) fetchDoctor();
  }, [slug]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    const phone = formData.get('phone') as string;
    const password = formData.get('password') as string;

    try {
      // NOTE: The existing API may require adjustments to match the current Prisma schema.
      // We'll wire this after confirming field names. For now, block submission gracefully.
      console.warn('Registration endpoint wiring pending schema check.');
      setError('Registration temporarily unavailable. Please try again shortly.');
    } catch (err) {
      setError('Error during registration');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white font-normal tracking-[-0.03em] relative z-10">
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-[420px] bg-white rounded-2xl border border-gray-200 p-8 shadow-lg relative z-20">
          {/* Header with doctor image/name */}
          <div className="text-center mb-6">
            <div className="flex justify-center items-center mb-4 min-h-16">
              {loading ? (
                <div className="w-16 h-16 bg-gray-200 rounded-full animate-pulse" />
              ) : doctor?.image ? (
                <div className="w-16 h-16 relative rounded-full overflow-hidden">
                  <Image src={doctor.image} alt={doctor.name || 'Médico'} fill className="object-cover rounded-full" />
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
              {loading ? 'Loading…' : doctor?.name || 'Doctor'}
            </h1>
          </div>

          {error && (
            <div className="mb-6 text-red-600 text-center text-sm">{error}</div>
          )}

          {/* Register form */}
          <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">Name</label>
              <input
                type="text"
                id="name"
                name="name"
                required
                className="w-full px-4 py-2.5 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5154e7]/20 focus:border-[#5154e7] transition-all duration-200 text-gray-900"
                placeholder="Your name"
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input
                type="email"
                id="email"
                name="email"
                required
                className="w-full px-4 py-2.5 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5154e7]/20 focus:border-[#5154e7] transition-all duration-200 text-gray-900"
                placeholder="m@example.com"
              />
            </div>
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
              <input
                type="tel"
                id="phone"
                name="phone"
                required
                className="w-full px-4 py-2.5 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5154e7]/20 focus:border-[#5154e7] transition-all duration-200 text-gray-900"
                placeholder="(555) 555-5555"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">Password</label>
              <input
                type="password"
                id="password"
                name="password"
                required
                className="w-full px-4 py-2.5 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5154e7]/20 focus:border-[#5154e7] transition-all duration-200 text-gray-900"
                placeholder="Enter your password"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-gradient-to-r from-[#5893ec] to-[#9bcef7] hover:from-[#4f88e2] hover:to-[#8fc4f5] rounded-lg transition-all duration-300 flex items-center justify-center gap-2"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          {/* Footer links */}
          <div className="mt-6 text-center space-y-3">
            <Link
              href={`/${slug}/login`}
              className="text-sm text-gray-700 hover:text-gray-900 transition-colors duration-200 block"
            >
              Already have an account? Sign in
            </Link>
            <div className="pt-4 border-t border-gray-200">
              <div className="flex items-center justify-center gap-2 text-gray-500">
                <span className="text-xs">Powered by</span>
                <Image src="/logo.png" alt="Sistema" width={32} height={10} className="object-contain opacity-80" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
