'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { signIn } from 'next-auth/react';
import Link from 'next/link';

type DoctorPublic = {
  id: string;
  name: string | null;
  image: string | null;
  email: string;
};

export default function DoctorLoginPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();

  const [doctor, setDoctor] = useState<DoctorPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Fetch doctor public info
  useEffect(() => {
    const fetchDoctor = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/v2/doctor-link/${slug}`);
        const json = await res.json();
        if (!res.ok || !json?.success) {
          setError(json?.message || 'Médico não encontrado');
          setDoctor(null);
        } else {
          setDoctor(json.data as DoctorPublic);
          setError(null);
        }
      } catch (e) {
        setError('Erro ao carregar informações do médico');
      } finally {
        setLoading(false);
      }
    };
    if (slug) fetchDoctor();
  }, [slug]);

  // Note: We intentionally do not auto-redirect authenticated users here, so
  // they can still access the doctor-slug landing page for verification.

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSigningIn(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError('Email ou senha incorretos');
      } else if (result?.ok) {
        // Follow the same behavior as src/app/auth/signin: let Home handle role-based redirect
        setTimeout(() => {
          router.push('/');
          router.refresh();
        }, 500);
      }
    } catch (err) {
      setError('Erro durante o login');
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white font-normal tracking-[-0.03em] relative z-10">
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-[420px] bg-white rounded-2xl border border-gray-200 p-8 shadow-lg relative z-20">
          {/* Doctor header */}
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
                    {(doctor?.name || 'M').charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">
              {loading ? 'Carregando…' : doctor?.name || 'Médico'}
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
                required
                autoComplete="off"
                className="w-full px-4 py-2.5 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5154e7]/20 focus:border-[#5154e7] transition-all duration-200 text-gray-900"
                placeholder="m@example.com"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">Password</label>
              <input
                type="password"
                id="password"
                name="password"
                required
                autoComplete="current-password"
                className="w-full px-4 py-2.5 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5154e7]/20 focus:border-[#5154e7] transition-all duration-200 text-gray-900"
                placeholder="Enter your password"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-gradient-to-r from-[#5893ec] to-[#9bcef7] hover:from-[#4f88e2] hover:to-[#8fc4f5] rounded-lg transition-all duration-300 flex items-center justify-center gap-2"
              disabled={isSigningIn}
            >
              {isSigningIn ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          {/* Footer links */}
          <div className="mt-6 text-center space-y-3">
            <Link
              href={`/${slug}/register`}
              className="text-sm text-gray-700 hover:text-gray-900 transition-colors duration-200 block"
            >
              Don’t have an account? Sign up
            </Link>
            <Link
              href={`/${slug}/forgot-password`}
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors duration-200 block"
            >
              Forgot your password?
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
