'use client';

import { useState, FormEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from "next-auth/react"
import { ArrowRight } from 'lucide-react';
import { Button } from "@/components/ui/button";

export default function Login() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    try {
      console.log('Tentando fazer login...', { email });
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      console.log('Resultado do login:', result);

      if (result?.error) {
        setError(result.error);
        return;
      }

      if (result?.ok) {
        console.log('Login bem sucedido, redirecionando...');
        
        // Redireciona para a página inicial que fará o redirecionamento baseado no role
        router.push('/');
        router.refresh();
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao fazer login');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 font-normal tracking-[-0.03em] relative z-10">
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-[420px] bg-white rounded-2xl border border-slate-200 p-8 shadow-xl relative z-20">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="flex justify-center items-center mb-4">
              <Image
                src="/logo.png"
                alt="Logo"
                width={40}
                height={13}
                className="object-contain"
                priority
              />
            </div>
          </div>

          {/* Mensagem de erro */}
          {error && (
            <div className="mb-6 text-red-600 text-center text-sm bg-red-50 p-3 rounded-lg border border-red-200">{error}</div>
          )}
          
          {/* Formulário */}
          <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">
                Email
              </label>
              <input
                type="email"
                id="email"
                name="email"
                required
                autoComplete="off"
                className="w-full px-4 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 text-slate-900 placeholder:text-slate-400"
                placeholder="m@example.com"
              />
            </div>
            
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-2">
                Password
              </label>
              <input
                type="password"
                id="password"
                name="password"
                required
                autoComplete="new-password"
                className="w-full px-4 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 text-slate-900 placeholder:text-slate-400"
                placeholder="Enter your password"
              />
            </div>

            <button 
              type="submit" 
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-gradient-to-r from-[#2a075e] via-[#7131b8] to-[#caa8f5] hover:opacity-90 rounded-lg transition-all duration-300 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#7131b8] shadow-lg hover:shadow-xl"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Signing in...' : 'Sign in'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          {/* Links */}
          <div className="mt-4 text-center">
            <Link 
              href="/forgot-password" 
              className="text-sm text-slate-600 hover:text-slate-900 transition-colors duration-200"
            >
              Forgot your password?
            </Link>
          </div>

          {/* Link para versão escura */}
          <div className="mt-6 text-center">
            <Link 
              href="/auth/signin-dark" 
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors duration-200"
            >
              Versão escura
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
} 