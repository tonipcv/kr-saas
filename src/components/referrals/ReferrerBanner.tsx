"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type Props = {
  slug: string;
};

export default function ReferrerBanner({ slug }: Props) {
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  // Support multiple coupon keys via repeated params: ?cupom=a&cupom=b (also fallback to coupon=)
  const couponParams = (
    (typeof searchParams.getAll === "function"
      ? [...searchParams.getAll("cupom"), ...searchParams.getAll("coupon")]
      : [searchParams.get("cupom"), searchParams.get("coupon")]) as (string | null | undefined)[]
  )
    .map((v) => (v || "").trim())
    .filter(Boolean);
  const [referrerName, setReferrerName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);
  const [campaignOfferText, setCampaignOfferText] = useState<string | null>(null);
  const [templateTitle, setTemplateTitle] = useState<string | null>(null);
  const [templateMessage, setTemplateMessage] = useState<string | null>(null);

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

  // Persist first coupon template slug in a cookie for post-login claim flow
  useEffect(() => {
    const key = (couponParams[0] || '').trim();
    if (!slug || !key) return;
    try {
      const cookieName = `coupon_template_${slug}`;
      const existing = (typeof document !== 'undefined' ? document.cookie : '').includes(`${cookieName}=`);
      if (!existing) {
        const maxAge = 60 * 60 * 24 * 7; // 7 days
        document.cookie = `${cookieName}=${encodeURIComponent(key)}; path=/; max-age=${maxAge}; samesite=lax`;
      }
    } catch {
      // ignore cookie failures
    }
  }, [couponParams.join('|'), slug]);

  // Resolve campaign(s) by coupon param(s), prefer the first matching key order
  useEffect(() => {
    let cancelled = false;
    async function resolveCampaignOffer() {
      setCampaignOfferText(null);
      const keys = couponParams.map((k) => k.toLowerCase());
      if (!slug || keys.length === 0) return;
      try {
        const qs = new URLSearchParams({ slug });
        keys.forEach((k) => qs.append("cupom", k));
        const res = await fetch(`/api/campaigns/resolve?${qs.toString()}`, { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        const items: Array<{ campaign_slug: string; benefit_title?: string | null; title?: string | null }> = json?.data || [];
        if (!Array.isArray(items) || items.length === 0) return;
        // Order by provided keys precedence
        const first = keys
          .map((k) => items.find((it) => (it.campaign_slug || "").toLowerCase() === k))
          .find((it) => !!it) || items[0];
        const text = first?.benefit_title || first?.title || null;
        if (!cancelled && text) setCampaignOfferText(String(text));
      } catch {
        // ignore campaign resolution failures
      }
    }
    resolveCampaignOffer();
    return () => {
      cancelled = true;
    };
  }, [couponParams.join("|"), slug]);

  // Resolve coupon template by coupon param(s)
  useEffect(() => {
    let cancelled = false;
    async function resolveTemplate() {
      setTemplateTitle(null);
      setTemplateMessage(null);
      const keys = couponParams.map((k) => k.toLowerCase());
      if (!slug || keys.length === 0) return;
      try {
        const qs = new URLSearchParams({ slug });
        keys.forEach((k) => qs.append('cupom', k));
        const res = await fetch(`/api/coupon-templates/resolve?${qs.toString()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json();
        const items: Array<{ slug: string; display_title?: string | null; display_message?: string | null }> = json?.data || [];
        if (!Array.isArray(items) || items.length === 0) return;
        // Prefer the first matching key in given order
        const first = keys
          .map((k) => items.find((it) => (it.slug || '').toLowerCase() === k))
          .find((it) => !!it) || items[0];
        if (!cancelled && first) {
          setTemplateTitle(first.display_title || null);
          setTemplateMessage(first.display_message || null);
        }
      } catch {
        // ignore
      }
    }
    resolveTemplate();
    return () => { cancelled = true; };
  }, [couponParams.join('|'), slug]);

  // Prepare fade-in when any display condition becomes available
  useEffect(() => {
    setShow(false);
    const hasCampaignText = !!campaignOfferText;
    const hasCouponParam = couponParams.length > 0;
    const hasTemplate = !!templateTitle || !!templateMessage;
    // Also show when a referral code is present, even if we couldn't resolve the referrer name
    const hasReferralCode = !!code;
    if (referrerName || hasCampaignText || hasCouponParam || hasTemplate || hasReferralCode) {
      const t = setTimeout(() => setShow(true), 30);
      return () => clearTimeout(t);
    }
  }, [referrerName, campaignOfferText, templateTitle, templateMessage, couponParams.join('|'), code]);

  // Show loading only when we have code and are fetching referrer
  if (code && loading && !referrerName) {
    return (
      <div className="mt-2 mb-1 text-center text-xs text-gray-500">
        Verificando indicação...
      </div>
    );
  }

  // Decide if banner should show: show on referrerName, campaign/coupon/template OR when a code exists
  const hasCampaignText = !!campaignOfferText;
  const hasTemplate = !!templateTitle || !!templateMessage;
  const hasReferralCode = !!code;
  if (!referrerName && !hasCampaignText && !hasTemplate && !hasReferralCode) return null;

  // Resolve dynamic offer text based on coupon (description only)
  const benefitText = (() => {
    const base = (() => {
      if (campaignOfferText) return String(campaignOfferText);
      const key = (couponParams[0] || '').toLowerCase().trim();
      if (!key) return 'uma avaliação gratuita';
      if (key === 'free') return 'uma avaliação gratuita';
      const m = /^off(\d{1,2})$/.exec(key);
      if (m) {
        const pct = parseInt(m[1], 10);
        if (!Number.isNaN(pct)) return `Desconto de ${pct}% no primeiro procedimento`;
      }
      if (key === 'off') return 'Desconto de 20% no primeiro procedimento';
      return `cupom aplicado: ${key}`;
    })();
    return base.replace(/[.!?]+$/g, '');
  })();

  // Prepare single-line sentence text
  const rawBenefit = (templateMessage || benefitText || '').trim().replace(/[.!?]+$/g, '');
  const benefitLower = rawBenefit
    ? rawBenefit.charAt(0).toLowerCase() + rawBenefit.slice(1)
    : '';
  const sentence = referrerName
    ? `${referrerName} indicou você para receber ${benefitLower}!`
    : (benefitLower ? `Você recebeu ${benefitLower}!` : (hasReferralCode ? 'Você foi indicado por um amigo!' : ''));

  return (
    <div className={`mt-4 md:mt-6 mb-4 md:mb-6 px-3 md:px-4 transition-all duration-300 ${show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'}`}>
      <div className="mx-auto max-w-3xl rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 md:p-4 shadow-sm">
        <div className="flex items-center justify-center gap-2">
          <div className="shrink-0 rounded-full bg-emerald-100 p-1 text-emerald-700">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
              <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-2.59a.75.75 0 1 0-1.22-.86l-3.6 5.1-1.78-1.78a.75.75 0 1 0-1.06 1.06l2.4 2.4a.75.75 0 0 0 1.17-.11l4.09-5.81Z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="min-w-0 text-center">
            <div className="text-[13px] md:text-sm font-semibold text-emerald-900 leading-snug">
              {sentence}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
