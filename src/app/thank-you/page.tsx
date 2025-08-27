'use client';

import React, { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function ThankYouContent() {
  const params = useSearchParams();
  const name = params.get('name') || '';
  const email = params.get('email') || '';
  const whatsapp = params.get('whatsapp') || '';
  const productId = params.get('productId') || '';
  const doctorSlug = params.get('doctor') || '';
  const doctorId = params.get('doctorId') || '';

  const waLink = useMemo(() => {
    const phoneDigits = (whatsapp || '').replace(/\D+/g, '');
    const text = encodeURIComponent(
      `Olá${name ? `, sou ${name}` : ''}! Acabei de registrar interesse${productId ? ` no produto ${productId}` : ''}. Podemos falar?`
    );
    if (phoneDigits) {
      return `https://wa.me/${phoneDigits}?text=${text}`;
    }
    // Fallback: open WhatsApp with prefilled text only
    return `https://wa.me/?text=${text}`;
  }, [whatsapp, name, productId]);

  return (
    <div className="min-h-screen bg-white">
      <div className="container mx-auto max-w-2xl px-6 py-16">
        <div className="rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
          <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="h-7 w-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Recebemos seu interesse</h1>
          <p className="mt-2 text-gray-600">
            {name ? `${name}, ` : ''}enviamos a confirmação para {email || 'seu email'}. Em breve entraremos em contato.
          </p>

          <div className="mt-8 space-y-3">
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center rounded-xl bg-green-500 px-4 py-3 text-white font-medium shadow-sm hover:bg-green-600"
            >
              Falar no WhatsApp
            </a>
            {doctorSlug ? (
              <Link
                href={`/${doctorSlug}/products`}
                className="inline-flex w-full items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-700 font-medium hover:bg-gray-50"
              >
                Voltar aos produtos
              </Link>
            ) : (
              <Link
                href="/"
                className="inline-flex w-full items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-700 font-medium hover:bg-gray-50"
              >
                Voltar ao início
              </Link>
            )}
          </div>

          {(doctorId || doctorSlug) && (
            <p className="mt-4 text-xs text-gray-400">
              Ref: {doctorSlug || doctorId}{productId ? ` · Produto ${productId}` : ''}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ThankYouPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}> 
      <ThankYouContent />
    </Suspense>
  );
}
