"use client";

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function SubscriptionSuccessInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [message, setMessage] = useState<string>('Finalizando sua assinatura...');

  useEffect(() => {
    const sessionId = params.get('session_id');
    async function confirm() {
      try {
        if (!sessionId) {
          setMessage('Sessão inválida.');
          return;
        }
        const res = await fetch(`/api/clinic/subscription/confirm?session_id=${encodeURIComponent(sessionId)}`, { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) {
          console.error('[subscription success] confirm error', data);
          setMessage(data?.error || 'Falha ao confirmar assinatura.');
          return;
        }
        setMessage('Assinatura confirmada! Redirecionando...');
        const clinicId = data?.clinicId;
        const url = clinicId ? `/clinic?setup=1&clinicId=${encodeURIComponent(String(clinicId))}` : '/clinic';
        router.replace(url);
      } catch (e: any) {
        console.error('[subscription success] unexpected error', e);
        setMessage('Erro inesperado ao confirmar assinatura.');
      }
    }
    confirm();
  }, [params, router]);

  return (
    <div className="min-h-screen bg-[#111] text-white flex items-center justify-center">
      <div className="text-center">
        <div className="text-xl font-medium">{message}</div>
        <div className="text-sm text-gray-400 mt-2">Você já pode fechar esta janela se nada acontecer em alguns segundos.</div>
      </div>
    </div>
  );
}

export default function SubscriptionSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#111] text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl font-medium">Carregando...</div>
        </div>
      </div>
    }>
      <SubscriptionSuccessInner />
    </Suspense>
  );
}
