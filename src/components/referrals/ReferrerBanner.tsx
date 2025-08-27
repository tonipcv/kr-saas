"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type Props = {
  slug: string;
};

export default function ReferrerBanner({ slug }: Props) {
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const coupon = searchParams.get("cupom") || searchParams.get("coupon");
  const [referrerName, setReferrerName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadReferrer() {
      if (!code) return;
      setLoading(true);
      try {
        const res = await fetch(`/api/referrals/doctor/by-slug/${encodeURIComponent(slug)}?code=${encodeURIComponent(code)}`);
        const data = await res.json();
        if (!cancelled && res.ok && data?.referrer?.name) {
          setReferrerName(String(data.referrer.name));
        }
      } catch {
        // silent fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadReferrer();
    return () => {
      cancelled = true;
    };
  }, [code, slug]);

  // Prepare fade-in when the name becomes available
  useEffect(() => {
    setShow(false);
    if (referrerName) {
      const t = setTimeout(() => setShow(true), 30);
      return () => clearTimeout(t);
    }
  }, [referrerName]);

  if (!code) return null;

  if (loading && !referrerName) {
    return (
      <div className="mt-2 mb-1 text-center text-xs text-gray-500">
        Verificando indicação...
      </div>
    );
  }

  if (!referrerName) return null;

  // Resolve dynamic offer text based on coupon
  const offerText = (() => {
    const key = (coupon || '').toLowerCase().trim();
    if (!key) return 'para uma avaliação gratuita.';
    if (key === 'free') return 'para uma avaliação gratuita.';
    // offXX => percent off on first procedure
    const m = /^off(\d{1,2})$/.exec(key);
    if (m) {
      const pct = parseInt(m[1], 10);
      if (!Number.isNaN(pct)) return `com Desconto de ${pct}% no Primeiro Procedimento.`;
    }
    // fallback known keyword
    if (key === 'off') return 'com Desconto de 20% no Primeiro Procedimento.';
    // default
    return 'para uma avaliação gratuita.';
  })();

  return (
    <div className="mt-2 mb-2 flex justify-center">
      <div className={`inline-flex items-center gap-2 text-sm text-green-800 bg-green-50 rounded-full px-3 py-1 transition-all duration-300 ${show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'}`}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-4 w-4 text-green-700"
          aria-hidden
        >
          <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-2.59a.75.75 0 1 0-1.22-.86l-3.6 5.1-1.78-1.78a.75.75 0 1 0-1.06 1.06l2.4 2.4a.75.75 0 0 0 1.17-.11l4.09-5.81Z" clipRule="evenodd" />
        </svg>
        <span>
          <span className="font-medium">{referrerName}</span> está indicando você {offerText}
        </span>
      </div>
    </div>
  );
}
