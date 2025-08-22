'use client';

import React, { useState, FormEvent, useEffect, Suspense } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from "next-auth/react"
import { ArrowRight } from 'lucide-react';

function LoginForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
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
    console.log('Parâmetros da URL:', urlParams);
    console.log('Token da URL:', token ? `${token.substring(0, 20)}...` : 'não encontrado');
    console.log('Email da URL:', emailParam);
    console.log('Reset param:', resetParam);
    
    // Se vier do fluxo de reset de senha, mostrar mensagem
    if (resetParam === 'true' && emailParam) {
      console.log('Detectado fluxo de reset de senha bem-sucedido');
      setEmail(emailParam);
      // Não definimos erro, apenas preenchemos o email para facilitar o login
    }
    
    if (token && emailParam) {
      console.log('Token detectado na URL, tentando autenticar automaticamente');
      setIsSubmitting(true);
      setEmail(emailParam);
      
      // Autenticar usando o token - abordagem alternativa usando signIn diretamente
      console.log('Tentando autenticar com token via signIn');
      
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
            console.log('Token verificado com sucesso, agora fazendo login via credentials');
            
            // Se o token for válido, usamos o signIn do NextAuth para autenticar o usuário
            // Isso garante que o NextAuth reconheça a sessão corretamente
            return signIn('credentials', {
              email: emailParam,
              // Usamos o token como senha temporária - o backend vai verificar isso
              password: `token:${token}`,
              redirect: false,
            }).then(result => {
              console.log('Resultado do signIn:', result);
              
              if (result?.error) {
                throw new Error(result.error);
              }
              
              if (result?.ok) {
                console.log('Autenticação com token bem-sucedida');
                // Redirecionar para a área de indicações do paciente
                router.push('/patient/referrals/');
              }
            });
          } else {
            throw new Error(data.message || 'Falha na verificação do token');
          }
        })
        .catch(err => {
          console.error('Erro ao autenticar com token:', err);
          setError('Erro ao processar autenticação automática. Por favor, faça login manualmente.');
          setIsSubmitting(false);
        });
    }
  }, [searchParams, router]);
  
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const emailInput = formData.get('email') as string;
    const password = formData.get('password') as string;

    try {
      console.log('Tentando fazer login...', { emailInput });
      const result = await signIn('credentials', {
        email: emailInput,
        password,
        redirect: false,
      });

      console.log('Resultado do login:', result);
      console.log('URL atual:', window.location.href);

      if (result?.error) {
        console.error('Erro no login:', result.error);
        setError(result.error);
        return;
      }

      if (result?.ok) {
        console.log('Login bem sucedido, redirecionando...');
        
        try {
          // Redireciona para a página inicial que fará o redirecionamento baseado no role
          console.log('Tentando redirecionar para a página inicial');
          
          // Forçar um pequeno atraso para garantir que a sessão seja estabelecida
          setTimeout(() => {
            router.push('/');
            router.refresh();
          }, 500);
        } catch (redirectError) {
          console.error('Erro ao redirecionar:', redirectError);
          // Fallback para redirecionar diretamente para a página de protocolos
          router.push('/patient/protocols');
        }
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao fazer login');
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
          
          {/* Formulário */}
          <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off">
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
                autoComplete="new-password"
                className="w-full px-4 py-2.5 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5154e7]/20 focus:border-[#5154e7] transition-all duration-200 text-gray-900"
                placeholder="Enter your password"
              />
            </div>

            <button 
              type="submit" 
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-gradient-to-r from-[#1d2b64] to-[#2b5876] hover:from-[#192455] hover:to-[#244861] rounded-lg transition-all duration-300 flex items-center justify-center gap-2"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Signing in...' : 'Sign in'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

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