"use client";

import { useState, useEffect, useMemo } from "react";
import Image from 'next/image';
import { useRouter } from "next/navigation";
import { debounce } from 'lodash';

export default function NewClinicPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [baseDomain] = useState<string>(
    (typeof window !== 'undefined' && (process.env.NEXT_PUBLIC_APP_BASE_DOMAIN || 'zuzz.vu')) || 'zuzz.vu'
  );

  const validSubdomain = useMemo(() => {
    if (!subdomain) return true; // optional
    return /^[a-z0-9-]{3,63}$/.test(subdomain) && !subdomain.startsWith("-") && !subdomain.endsWith("-");
  }, [subdomain]);

  const checkSubAvailability = debounce(async (value: string) => {
    if (!value || value.length < 3) {
      setIsAvailable(null);
      return;
    }
    setIsChecking(true);
    try {
      const response = await fetch(`/api/auth/register/check-slug?subdomain=${encodeURIComponent(value)}`);
      const data = await response.json();
      setIsAvailable(Boolean(data.available));
    } catch (err) {
      console.error("Erro ao verificar slug:", err);
      setIsAvailable(null);
    } finally {
      setIsChecking(false);
    }
  }, 500);

  useEffect(() => {
    if (subdomain) {
      checkSubAvailability(subdomain);
    } else {
      setIsAvailable(null);
    }
  }, [subdomain]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (!validSubdomain) return;
    if (subdomain && isAvailable === false) return;

    try {
      setIsSubmitting(true);
      const resp = await fetch('/api/clinic/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), subdomain: subdomain.trim() || undefined }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data?.error || 'Falha ao criar negócio');
      }
      const cid: string | undefined = data?.clinic?.id;
      if (cid) {
        router.replace(`/clinic/planos-trial?clinicId=${encodeURIComponent(cid)}&newClinic=1#plans`);
      } else {
        router.replace(`/clinic/planos-trial#plans`);
      }
    } catch (e: any) {
      alert(e?.message || 'Erro ao criar negócio');
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
            <h1 className="text-xl font-medium text-gray-900">Criar novo negócio</h1>
            <p className="text-sm text-gray-600">Defina o nome e o subdomínio antes de escolher seu plano</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Nome do negócio</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={3}
                maxLength={100}
                className="w-full px-4 py-2.5 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5154e7]/20 focus:border-[#5154e7] transition-all duration-200 text-gray-900"
                placeholder="Ex.: Estética Bella Vida"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Subdomínio do negócio (opcional)</label>
              <div className="relative">
                <input
                  type="text"
                  value={subdomain}
                  onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  autoComplete="off"
                  className="w-full pr-[90px] pl-4 py-2.5 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5154e7]/20 focus:border-[#5154e7] transition-all duration-200 text-gray-900"
                  placeholder="seu-negocio"
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <span className="text-gray-500">.{baseDomain}</span>
                </div>
                {subdomain && (
                  <div className="absolute inset-y-0 right-20 flex items-center pr-2">
                    {isChecking ? (
                      <div className="h-4 w-4 border-2 border-t-blue-500 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></div>
                    ) : isAvailable === true ? (
                      <span className="text-xs text-green-600">OK</span>
                    ) : isAvailable === false ? (
                      <span className="text-xs text-red-600">Indisponível</span>
                    ) : null}
                  </div>
                )}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Seu link ficará assim: <span className="font-medium text-gray-700">{subdomain || 'seu-negocio'}.{baseDomain}</span>
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Use apenas letras minúsculas, números e hífen. Mínimo de 3 caracteres.
              </p>
              {subdomain && !validSubdomain && (
                <p className="mt-1 text-xs text-red-500">Subdomínio inválido</p>
              )}
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-black hover:bg-gray-900 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black"
              disabled={isSubmitting || !name.trim() || !validSubdomain || (subdomain ? isAvailable === false : false)}
            >
              {isSubmitting ? 'Criando...' : 'Continuar para planos'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
