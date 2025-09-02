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
}: {
  slug: string;
  doctorId: string | number;
  products: Product[];
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
          // Show success UI and then redirect after a brief delay
          const finalUrl = target.toString();
          setRedirectUrl(finalUrl);
          setSuccess(true);
          setTimeout(() => {
            try { window.location.href = finalUrl; } catch {}
          }, 500);
          return; // prevent falling through to generic success
        } catch (e) {
          // If URL is malformed, fallback to success state
          console.warn('Invalid confirmationUrl, showing success modal instead');
        }
      }
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
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={
                        (active
                          ? "text-[#5154e7] bg-[#5154e7]/10 border border-[#5154e7]/30 "
                          : "text-gray-600 hover:text-gray-900 border border-transparent ") +
                        "px-3 py-1 rounded-full text-sm transition-colors"
                      }
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
              className="shrink-0 p-1.5 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100"
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
          <div key={p.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition p-4">
            <div className="aspect-w-16 aspect-h-9 mb-3 bg-gray-100 rounded-xl overflow-hidden">
              {p.imageUrl ? (
                <img src={p.imageUrl} alt={p.name} className="w-full h-48 object-cover" />
              ) : (
                <div className="w-full h-48 flex items-center justify-center bg-gray-100">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                </div>
              )}
            </div>
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-gray-900 truncate">{p.name}</h3>
              {/* Price hidden on public clinic page */}
            </div>
            {p.category ? (
              <span className="mt-1 inline-block text-[10px] px-2 py-0.5 rounded-full bg-gray-50 text-gray-700 border border-gray-200">{p.category}</span>
            ) : null}
            {p.description ? (
              <p className="mt-2 text-xs text-gray-600 line-clamp-3">{p.description}</p>
            ) : null}
            <div className="mt-3">
              <button
                type="button"
                onClick={() => onOpen(p)}
                className="inline-flex items-center justify-center rounded-md bg-blue-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
              >
                Quero agendar
              </button>
            </div>
          </div>
        ))}
      </div>

      {open && selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={onClose} />
          <div className="relative z-10 w-full max-w-md mx-auto bg-white rounded-2xl shadow-xl border border-gray-200 p-5">
            {/* Image on modal top */}
            {selected.imageUrl ? (
              <div className="mb-3 w-full h-40 rounded-xl overflow-hidden bg-gray-100">
                <img src={selected.imageUrl} alt={selected.name} className="w-full h-full object-cover" />
              </div>
            ) : null}

            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{selected.name}</h2>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Fechar">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            {selected.description ? (
              <p className="mt-3 text-sm text-gray-700 whitespace-pre-line">{selected.description}</p>
            ) : (
              <p className="mt-3 text-sm text-gray-500">Sem descrição disponível.</p>
            )}

            {success ? (
              <div className="mt-4 space-y-3 text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                  <span className="text-green-600 text-2xl">✓</span>
                </div>
                <p className="text-sm text-gray-700">
                  {redirectUrl
                    ? 'Parabéns, estamos redirecionando você para um dos nossos atendentes...'
                    : 'Em breve um dos nossos atendentes entrará em contato com você!'}
                </p>
                {leadReferralCode && coupon ? (
                  <div className="text-xs text-gray-600">
                    Seu CUPOM é: <span className="font-semibold text-gray-800">{leadReferralCode}</span>
                  </div>
                ) : null}
                {redirectUrl ? (
                  <div className="flex items-center justify-center gap-3 text-xs text-gray-600">
                    <svg className="animate-spin h-4 w-4 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"></path>
                    </svg>
                    <a href={redirectUrl} className="underline hover:no-underline">Abrir agora</a>
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
                  <label className="block text-xs font-medium text-gray-700">Nome</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Seu nome"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700">WhatsApp</label>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="(xx) xxxxx-xxxx"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                {error ? (
                  <div className="text-sm text-red-600">{error}</div>
                ) : null}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center rounded-md bg-blue-500 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
                >
                  {submitting ? 'Enviando…' : 'Quero agendar'}
                </button>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
