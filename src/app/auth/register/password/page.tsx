'use client';

import { useState, useEffect, Suspense } from "react";
import Image from 'next/image';
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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

  // Redirecionar se não tiver email ou token
  useEffect(() => {
    if (!emailParam || !tokenParam) {
      router.push('/auth/register/email');
    }
  }, [emailParam, tokenParam, router]);

  // Verificar força da senha
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
      setError("Todos os campos são obrigatórios");
      setIsSubmitting(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("As senhas não coincidem");
      setIsSubmitting(false);
      return;
    }

    if (password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres");
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
        throw new Error(data.message || 'Falha ao finalizar cadastro');
      }

      setIsSuccess(true);
      
      // Redirecionar após 3 segundos
      setTimeout(() => {
        router.push('/auth/signin');
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao finalizar cadastro');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
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

            <div className="text-center space-y-2 mb-6">
              <div className="flex justify-center">
                <div className="bg-green-100 p-3 rounded-full">
                  <Check className="h-8 w-8 text-green-600" />
                </div>
              </div>
              <h1 className="text-xl font-medium text-gray-900 mt-4">Cadastro concluído!</h1>
              <p className="text-sm text-gray-600">
                Sua conta foi criada com sucesso e seu período de teste de 7 dias foi ativado.
              </p>
            </div>

            <div className="mt-6">
              <p className="text-center text-sm text-gray-600 mb-4">
                Redirecionando para a página de login...
              </p>
              <Link
                href="/auth/signin"
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-gradient-to-r from-[#5893ec] to-[#9bcef7] hover:from-[#4f88e2] hover:to-[#8fc4f5] rounded-lg transition-all duration-300 flex items-center justify-center gap-2"
              >
                Fazer login agora
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
      {/* Logo no topo esquerdo */}
      <div className="absolute top-4 left-4">
        <div className="relative w-8 h-8">
          <Image src="/logo.png" alt="Logo" fill className="object-contain" priority />
        </div>
      </div>
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-[420px] bg-white rounded-2xl border border-gray-200 p-8 shadow-lg relative z-20">

          <div className="text-center space-y-2 mb-6">
            <h1 className="text-xl font-medium text-gray-900">Finalize seu cadastro</h1>
            <p className="text-sm text-gray-600">
              Defina seu nome e senha para começar seu período de teste
            </p>
          </div>

          {/* Mensagem de erro */}
          {error && (
            <div className="mb-6 text-red-600 text-center text-sm">{error}</div>
          )}

          {/* Formulário */}
          <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                Nome completo
              </label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="off"
                className="w-full px-4 py-2.5 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5154e7]/20 focus:border-[#5154e7] transition-all duration-200 text-gray-900"
                placeholder="Dr. João Silva"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Senha
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full px-4 py-2.5 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5154e7]/20 focus:border-[#5154e7] transition-all duration-200 text-gray-900"
                placeholder="Mínimo 8 caracteres"
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
                    {passwordStrength < 3 ? 'Senha fraca' : passwordStrength < 5 ? 'Senha média' : 'Senha forte'}
                  </p>
                </div>
              )}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                Confirmar senha
              </label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full px-4 py-2.5 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5154e7]/20 focus:border-[#5154e7] transition-all duration-200 text-gray-900"
                placeholder="Repita sua senha"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-gradient-to-r from-[#5893ec] to-[#9bcef7] hover:from-[#4f88e2] hover:to-[#8fc4f5] rounded-lg transition-all duration-300 flex items-center justify-center gap-2"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Finalizando...' : 'Finalizar cadastro'}
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
                Voltar
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
