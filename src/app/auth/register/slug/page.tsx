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

  const handleSubdomainChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Permitir apenas letras minúsculas, números e hífen
    const value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setSubdomain(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    if (!clinicName) {
      setError("O nome do negócio é obrigatório");
      setIsSubmitting(false);
      return;
    }

    if (!subdomain) {
      setError("O subdomínio é obrigatório");
      setIsSubmitting(false);
      return;
    }

    if (!isAvailable) {
      setError("Este subdomínio não está disponível");
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
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Falha ao salvar dados do negócio');
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
      setError(err instanceof Error ? err.message : 'Falha ao salvar dados do negócio');
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

          <div className="text-center space-y-2 mb-6">
            <h1 className="text-xl font-medium text-gray-900">Dados do seu negócio</h1>
            <p className="text-sm text-gray-600">
              Informe o nome e escolha um subdomínio único para seu acesso
            </p>
          </div>

          {/* Mensagem de erro */}
          {error && (
            <div className="mb-6 text-red-600 text-center text-sm">{error}</div>
          )}

          {/* Formulário */}
          <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off">
            <div>
              <label htmlFor="clinicName" className="block text-sm font-medium text-gray-700 mb-2">
                Nome do negócio
              </label>
              <input
                type="text"
                id="clinicName"
                value={clinicName}
                onChange={(e) => setClinicName(e.target.value)}
                required
                autoComplete="off"
                className="w-full px-4 py-2.5 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5154e7]/20 focus:border-[#5154e7] transition-all duration-200 text-gray-900"
                placeholder="Negócio Exemplo"
                minLength={3}
                maxLength={100}
              />
            </div>

            <div>
              <label htmlFor="subdomain" className="block text-sm font-medium text-gray-700 mb-2">
                Subdomínio do negócio
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
                  placeholder="nome"
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
                Seu link ficará assim: <span className="font-medium text-gray-700">{subdomain || 'nome'}.{baseDomain}</span>
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Use apenas letras minúsculas, números e hífen. Mínimo de 3 caracteres.
              </p>
              {isAvailable === false && (
                <p className="mt-1 text-xs text-red-500">
                  Este subdomínio já está em uso. Por favor, escolha outro.
                </p>
              )}
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-black hover:bg-gray-900 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black"
              disabled={isSubmitting || !isAvailable}
            >
              {isSubmitting ? 'Salvando...' : 'Continuar'}
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
                Voltar
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
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Carregando...</div>}>
      <RegisterSlugInner />
    </Suspense>
  );
}
