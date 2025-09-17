"use client";

import React, { useEffect, useMemo, useState } from "react";

type Product = {
  id: string | number;
  name: string;
  description?: string | null;
  category?: string | null;
  creditsPerUnit?: number | null;
  price?: number | null;
  imageUrl?: string | null;
  confirmationUrl?: string | null;
};

export default function ProductsGrid({
  slug,
  doctorId,
  products,
  branding,
  clinicId,
}: {
  slug: string;
  doctorId: string | number;
  products: Product[];
  branding?: { theme?: 'LIGHT' | 'DARK'; buttonColor?: string | null; buttonTextColor?: string | null };
  clinicId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Product | null>(null);
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("Todos");
  const [submitting, setSubmitting] = useState(false);
  const [query, setQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [success, setSuccess] = useState(false);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const [referrerCode, setReferrerCode] = useState<string | null>(null);
  const [coupon, setCoupon] = useState<string | null>(null);
  const [discountPercent, setDiscountPercent] = useState<number | null>(null);
  const [leadReferralCode, setLeadReferralCode] = useState<string | null>(null);

  const priceFormatter = useMemo(
    () => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }),
    []
  );

  const isDark = (branding?.theme ?? 'LIGHT') === 'DARK';

  function onOpen(p: Product) {
    setSelected(p);
    setOpen(true);
  }

  function onClose() {
    setOpen(false);
    setSelected(null);
    setName("");
    setWhatsapp("");
    setSuccess(false);
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;

    // Require phone (WhatsApp)
    if (!whatsapp.trim()) {
      setError("Informe seu WhatsApp");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const resp = await fetch('/api/referrals/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || undefined,
          phone: whatsapp.trim() || undefined,
          doctorId,
          clinic_id: clinicId || undefined,
          clinic_slug: slug,
          // keep for auditing/linking
          referrerCode: referrerCode || undefined,
          // optionally include slug for future compatibility
          doctor_slug: slug,
          // tie the product context (auditing)
          customFields: {
            productId: selected.id,
            productName: selected.name,
            productCategory: selected.category || null,
            offer: {
              amount: typeof selected.price === 'number' ? selected.price : undefined,
            },
            campaign: {
              coupon: coupon || undefined,
              discountPercent: discountPercent ?? undefined,
            }
          }
        })
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data?.error || 'Falha ao enviar indicação');
      }
      if (data?.referralCode) {
        setLeadReferralCode(String(data.referralCode));
      }
      // Redirect to product confirmationUrl if provided by the doctor
      const conf = (selected.confirmationUrl || '').trim();
      if (conf) {
        try {
          const target = conf.startsWith('http') ? new URL(conf) : new URL(conf, window.location.origin);
          // Carry context to destination
          const params = new URLSearchParams();
          params.set('productId', String(selected.id));
          params.set('from', slug);
          if (name.trim()) params.set('name', name.trim());
          if (whatsapp.trim()) params.set('phone', whatsapp.trim());
          if (data?.referralCode) params.set('referral', String(data.referralCode));
          if (typeof selected.price === 'number') params.set('price', String(selected.price));
          if (coupon) params.set('coupon', coupon);
          if (discountPercent != null) params.set('discountPercent', String(discountPercent));
          // Only expose couponCode externally if there is a valid campaign coupon
          if (coupon && data?.referralCode) params.set('couponCode', String(data.referralCode));
          // merge params into target
          params.forEach((v, k) => target.searchParams.set(k, v));

          // If WhatsApp link, inject the referral code into the text message
          try {
            const host = target.hostname.toLowerCase();
            const isWhatsApp = /(^(?:wa\.me|api\.whatsapp\.com|wa\.link)$)|((?:^|\.)whatsapp\.com$)/i.test(host);
            if (isWhatsApp && data?.referralCode) {
              const existing = target.searchParams.get('text') || '';
              const noteLines: string[] = [];
              noteLines.push(`Meu código de indicação: ${String(data.referralCode)}`);
              if (coupon) {
                if (discountPercent != null) noteLines.push(`Campanha: ${coupon} (${discountPercent}% off)`);
                else noteLines.push(`Campanha: ${coupon}`);
              }
              const appendix = noteLines.join('\n');
              const merged = existing ? `${existing}\n\n${appendix}` : appendix;
              target.searchParams.set('text', merged);
            }
          } catch {}
          // Show success UI with the final URL; do not auto-redirect to let the user see/copy the code
          const finalUrl = target.toString();
          setRedirectUrl(finalUrl);
          setSuccess(true);
          return; // prevent falling through to generic success
        } catch (e) {
          // If URL is malformed, fallback to success state
          console.warn('Invalid confirmationUrl, showing success modal instead');
        }
      }
      // No confirmationUrl: prefer staying on page and show success with a link to clinic referrals
      if (data?.referralCode) {
        const params = new URLSearchParams();
        params.set('code', String(data.referralCode));
        if (coupon) params.set('cupom', coupon);
        const dest = `/${encodeURIComponent(slug)}/referrals?${params.toString()}`;
        setRedirectUrl(dest);
        setSuccess(true);
        return;
      }
      // Fallback: show success UI if no referralCode for some reason
      setSuccess(true);
    } catch (err: any) {
      setError(err?.message || 'Erro inesperado');
    } finally {
      setSubmitting(false);
    }
  }

  // Build unique categories and derive visible products
  const categories = useMemo<string[]>(() => {
    const set = new Set<string>();
    for (const p of products || []) {
      const c = (p.category || "").trim();
      if (c) set.add(c);
    }
    return ["Todos", ...Array.from(set)];
  }, [products]);

  const visibleProducts = useMemo<Product[]>(() => {
    let list = selectedCategory === "Todos"
      ? (products || [])
      : (products || []).filter((p) => (p.category || "").trim() === selectedCategory);

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((p) =>
        p.name.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [products, selectedCategory, query]);

  // Capture referrer code and coupon from URL query
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      const code = u.searchParams.get('code');
      const rawCoupon = u.searchParams.get('cupom') || u.searchParams.get('coupon');
      if (code) setReferrerCode(code);
      if (rawCoupon) {
        setCoupon(rawCoupon);
        const m = /^off(\d{1,2})$/i.exec(rawCoupon.trim());
        if (m) {
          const pct = parseInt(m[1], 10);
          if (!Number.isNaN(pct)) setDiscountPercent(pct);
        } else {
          setDiscountPercent(null);
        }
      }
    } catch {}
  }, []);

  // Validate coupon against campaigns and coupon templates; if invalid, clear it
  useEffect(() => {
    let cancelled = false;
    async function validateCoupon() {
      const key = (coupon || '').trim();
      if (!key) return;
      try {
        const qs1 = new URLSearchParams({ slug });
        qs1.append('cupom', key);
        const [res1, res2] = await Promise.all([
          fetch(`/api/campaigns/resolve?${qs1.toString()}`, { cache: 'no-store' }),
          fetch(`/api/coupon-templates/resolve?${qs1.toString()}`, { cache: 'no-store' }),
        ]);
        const j1 = res1.ok ? await res1.json() : { data: [] };
        const j2 = res2.ok ? await res2.json() : { data: [] };
        const hasAny = Array.isArray(j1?.data) && j1.data.length > 0
          ? true
          : (Array.isArray(j2?.data) && j2.data.length > 0);
        if (!cancelled && !hasAny) {
          // Invalid coupon: behave like pure slug
          setCoupon(null);
          setDiscountPercent(null);
        }
      } catch {
        // On failure, keep current behavior (don’t block)
      }
    }
    validateCoupon();
    return () => { cancelled = true; };
  }, [coupon, slug]);

  return (
    <>
      <div className="mb-5">
        {showSearch ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Fechar busca"
              onClick={() => { setShowSearch(false); setQuery(""); }}
              className="p-1 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M6.72 6.72a.75.75 0 011.06 0L12 10.94l4.22-4.22a.75.75 0 111.06 1.06L13.06 12l4.22 4.22a.75.75 0 11-1.06 1.06L12 13.06l-4.22 4.22a.75.75 0 11-1.06-1.06L10.94 12 6.72 7.78a.75.75 0 010-1.06z" clipRule="evenodd" />
              </svg>
            </button>
            <div className="relative flex-1">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M10.5 3.75a6.75 6.75 0 104.243 12.03l3.739 3.738a.75.75 0 101.06-1.06l-3.738-3.74A6.75 6.75 0 0010.5 3.75zm-5.25 6.75a5.25 5.25 0 1110.5 0 5.25 5.25 0 01-10.5 0z" clipRule="evenodd" />
                </svg>
              </span>
              <input
                id="product-search"
                type="text"
                value={query}
                autoFocus
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Pesquisar produtos…"
                className="w-full rounded-full border border-gray-300 bg-white px-8 py-1.5 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 overflow-x-auto">
              <div className="flex items-center justify-start gap-3 whitespace-nowrap">
                {categories.map((cat: string) => {
                  const active = cat === selectedCategory;
                  const base = "px-3 py-1 rounded-full text-sm transition-colors";
                  const cls = active
                    ? `border ${isDark ? 'border-transparent' : 'border-[#5154e7]/30'}`
                    : `${isDark ? 'text-gray-300 hover:text-gray-100 border border-gray-700 hover:border-gray-600' : 'text-gray-600 hover:text-gray-900 border border-transparent'}`;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`${base} ${cls}`}
                      style={active ? (isDark ? { backgroundColor: 'var(--btn-bg)', color: 'var(--btn-fg)' } : { color: '#5154e7', backgroundColor: 'rgba(81,84,231,0.10)' }) : undefined}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>
            <button
              type="button"
              aria-label="Pesquisar"
              onClick={() => setShowSearch(true)}
              className={`shrink-0 p-1.5 rounded-full ${isDark ? 'text-gray-300 hover:text-gray-100 hover:bg-[#0f0f0f]' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M10.5 3.75a6.75 6.75 0 104.243 12.03l3.739 3.738a.75.75 0 101.06-1.06l-3.738-3.74A6.75 6.75 0 0010.5 3.75zm-5.25 6.75a5.25 5.25 0 1110.5 0 5.25 5.25 0 01-10.5 0z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleProducts.map((p: Product) => (
          <div key={p.id} className={`${isDark ? 'bg-[#111111] border-gray-800 text-gray-100' : 'bg-white border-gray-200 text-gray-900'} rounded-2xl border shadow-sm hover:shadow-md transition p-4`}>
            <div className={`aspect-w-16 aspect-h-9 mb-3 ${isDark ? 'bg-[#0f0f0f]' : 'bg-gray-100'} rounded-xl overflow-hidden`}>
              {p.imageUrl ? (
                <img src={p.imageUrl} alt={p.name} className="w-full h-48 object-cover" />
              ) : (
                <div className={`w-full h-48 flex items-center justify-center ${isDark ? 'bg-[#0f0f0f]' : 'bg-gray-100'}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" className={`h-12 w-12 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                </div>
              )}
            </div>
            <div className="flex items-start justify-between gap-2">
              <h3 className={`font-semibold truncate ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{p.name}</h3>
              {/* Price hidden on public clinic page */}
            </div>
            {p.category ? (
              <span className={`mt-1 inline-block text-[10px] px-2 py-0.5 rounded-full border ${isDark ? 'bg-[#0f0f0f] text-gray-300 border-gray-800' : 'bg-gray-50 text-gray-700 border-gray-200'}`}>{p.category}</span>
            ) : null}
            {p.description ? (
              <p className={`mt-2 text-xs line-clamp-3 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{p.description}</p>
            ) : null}
            <div className="mt-3">
              <button
                type="button"
                onClick={() => onOpen(p)}
                className="inline-flex items-center justify-center rounded-full px-3 py-1 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-300"
                style={{ backgroundColor: 'var(--btn-bg)', color: 'var(--btn-fg)' }}
              >
                Agendar
              </button>
            </div>
          </div>
        ))}
      </div>

      {open && selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={onClose} />
          <div className={`relative z-10 w-full max-w-md mx-auto rounded-2xl shadow-xl border p-5 ${isDark ? 'bg-[#111111] border-gray-800 text-gray-100' : 'bg-white border-gray-200 text-gray-900'}`}>
            {/* Image on modal top */}
            {selected.imageUrl ? (
              <div className={`mb-3 w-full h-40 rounded-xl overflow-hidden ${isDark ? 'bg-[#0f0f0f]' : 'bg-gray-100'}`}>
                <img src={selected.imageUrl} alt={selected.name} className="w-full h-full object-cover" />
              </div>
            ) : null}

            <div className="flex items-start justify-between">
              <div>
                <h2 className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{selected.name}</h2>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Fechar">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            {selected.description ? (
              <p className={`mt-3 text-sm whitespace-pre-line ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{selected.description}</p>
            ) : (
              <p className={`mt-3 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Sem descrição disponível.</p>
            )}

            {success ? (
              <div className="mt-4 space-y-3 text-center">
                <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center ${isDark ? 'bg-green-900/30' : 'bg-green-100'}`}>
                  <span className="text-green-600 text-2xl">✓</span>
                </div>
                <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  {redirectUrl
                    ? 'Parabéns! Antes de continuar, copie seu código abaixo.'
                    : 'Em breve um dos nossos atendentes entrará em contato com você!'}
                </p>
                {leadReferralCode ? (
                  <div className="flex items-center justify-center">
                    <div className={`w-full max-w-md ${isDark ? 'bg-[#0d0d0d] border border-gray-800' : 'bg-white border border-gray-200'} rounded-2xl p-4 shadow-sm`}>
                      <div className={`text-xs font-semibold ${isDark ? 'text-gray-400' : 'text-gray-500'} mb-2`}>{coupon ? 'Seu CUPOM' : 'Seu CÓDIGO'}</div>
                      <div className="flex items-center justify-between gap-3">
                        <code className={`${isDark ? 'text-white' : 'text-gray-900'} font-mono tracking-widest text-2xl sm:text-3xl select-all`}>{leadReferralCode}</code>
                        <button
                          type="button"
                          className={`shrink-0 inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium ${isDark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-gray-900 text-white hover:bg-gray-800'}`}
                          onClick={() => navigator.clipboard.writeText(leadReferralCode!)}
                        >
                          Copiar
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
                {redirectUrl ? (
                  <div className="flex items-center justify-center gap-3">
                    <a
                      href={redirectUrl}
                      className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium ${isDark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-gray-900 text-white hover:bg-gray-800'}`}
                    >
                      Continuar
                    </a>
                  </div>
                ) : null}
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="mt-1 inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-4 space-y-3">
                <div>
                  <label className={`block text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Nome</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Seu nome"
                    className={`mt-1 w-full rounded-md px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 ${isDark ? 'bg-[#0f0f0f] border-gray-700 text-gray-100 placeholder:text-gray-400 focus:ring-gray-700 focus:border-gray-600' : 'bg-white border border-gray-300 text-gray-900 placeholder:text-gray-500 focus:ring-blue-400'}`}
                  />
                </div>
                <div>
                  <label className={`block text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>WhatsApp</label>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="(xx) xxxxx-xxxx"
                    className={`mt-1 w-full rounded-md px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 ${isDark ? 'bg-[#0f0f0f] border-gray-700 text-gray-100 placeholder:text-gray-400 focus:ring-gray-700 focus:border-gray-600' : 'bg-white border border-gray-300 text-gray-900 placeholder:text-gray-500 focus:ring-blue-400'}`}
                  />
                </div>
                {error ? (
                  <div className="text-sm text-red-500">{error}</div>
                ) : null}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center rounded-full px-3 py-2 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-300 transition-colors"
                  style={{ backgroundColor: 'var(--btn-bg)', color: 'var(--btn-fg)' }}
                >
                  {submitting ? 'Enviando…' : 'Agendar'}
                </button>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
