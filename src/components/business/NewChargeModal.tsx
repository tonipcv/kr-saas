"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  client: { id: string; name?: string | null; email?: string | null; phone?: string | null };
  defaultSlug?: string;
};

export default function NewChargeModal({ open, onOpenChange, client, defaultSlug = "" }: Props) {
  const router = useRouter();
  const [country, setCountry] = useState<string>("BR");
  const [slug, setSlug] = useState<string>(defaultSlug);
  const [productId, setProductId] = useState<string>("");
  const [offers, setOffers] = useState<Array<{ id: string; name: string; priceCents: number; maxInstallments?: number | null; isSubscription?: boolean }>>([]);
  const [offerId, setOfferId] = useState<string>("");
  const [method, setMethod] = useState<"pix" | "card">("pix");
  const [installments, setInstallments] = useState<number>(1);
  const [name, setName] = useState<string>(client?.name || "");
  const [email, setEmail] = useState<string>(client?.email || "");
  const [phone, setPhone] = useState<string>(client?.phone || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [loadingCards, setLoadingCards] = useState(false);
  const [loadingClinics, setLoadingClinics] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [clinics, setClinics] = useState<Array<{ id: string; name: string; slug?: string | null }>>([]);
  const [selectedClinicId, setSelectedClinicId] = useState<string>("");
  const [products, setProducts] = useState<Array<{ id: string; name: string; price?: number | null }>>([]);
  const [savedCards, setSavedCards] = useState<Array<{
    id: string;
    payment_customer_id: string;
    provider_customer_id: string | null;
    provider_card_id: string;
    brand: string | null;
    last4: string | null;
    exp_month: number | null;
    exp_year: number | null;
    is_default: boolean;
    status: string | null;
  }>>([]);
  const [selectedSavedCardId, setSelectedSavedCardId] = useState<string>("");
  const [selectedProviderCustomerId, setSelectedProviderCustomerId] = useState<string>("");

  const isValid = useMemo(() => {
    if (!slug || !productId || !email || !name || !country) return false;
    if (method === "card") {
      return Boolean(selectedSavedCardId && selectedProviderCustomerId);
    }
    return true;
  }, [slug, productId, email, name, country, method, selectedSavedCardId, selectedProviderCustomerId]);

  // Load clinics when opening
  useEffect(() => {
    if (!open) return;
    const loadClinics = async () => {
      setLoadingClinics(true);
      try {
        const res = await fetch('/api/clinics');
        const json = await res.json().catch(() => ({}));
        const list = Array.isArray(json?.clinics) ? json.clinics : [];
        const mapped = list.map((c: any) => ({ id: c.id, name: c.name || c.slug || c.id, slug: c.slug ?? c.subdomain ?? null }));
        setClinics(mapped);
        // Choose default clinic: by defaultSlug match, otherwise first
        let chosen = mapped[0]?.id || '';
        if (defaultSlug) {
          const found = mapped.find((c: any) => (c.slug || '') === defaultSlug);
          if (found) chosen = found.id;
        }
        setSelectedClinicId(chosen);
        const chosenClinic = mapped.find((c: any) => c.id === chosen);
        setSlug(chosenClinic?.slug || '');
      } finally {
        setLoadingClinics(false);
      }
    };
    loadClinics();
  }, [open, defaultSlug]);

  // Load products for selected clinic
  useEffect(() => {
    if (!open || !selectedClinicId) return;
    const loadProducts = async () => {
      setLoadingProducts(true);
      try {
        const res = await fetch(`/api/products?clinicId=${encodeURIComponent(selectedClinicId)}`);
        const json = await res.json().catch(() => []);
        const list = Array.isArray(json) ? json : [];
        setProducts(list.map((p: any) => ({ id: p.id, name: p.name, price: p.originalPrice ?? p.price ?? null })));
        if (list.length > 0) setProductId(list[0].id);
      } finally {
        setLoadingProducts(false);
      }
    };
    loadProducts();
  }, [open, selectedClinicId]);

  // Load offers whenever product changes
  useEffect(() => {
    if (!open || !productId) return;
    const loadOffers = async () => {
      setLoadingOffers(true);
      try {
        const res = await fetch(`/api/products/${encodeURIComponent(productId)}/offers`);
        const json = await res.json().catch(() => ({}));
        const list = Array.isArray(json?.offers) ? json.offers : [];
        const mapped = list.map((o: any) => ({
          id: o.id,
          name: o.name || 'Oferta',
          priceCents: Number(o.priceCents || 0),
          maxInstallments: Number(o.maxInstallments || 1),
          isSubscription: !!o.isSubscription,
        }));
        setOffers(mapped);
        const first = mapped[0];
        setOfferId(first ? first.id : "");
        setInstallments(1);
      } finally {
        setLoadingOffers(false);
      }
    };
    loadOffers();
  }, [open, productId]);

  const fmtMoney = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((cents || 0) / 100);

  // Load saved cards when modal opens or when slug/client changes
  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setLoadingCards(true);
      try {
        const url = `/api/payments/saved-cards?userId=${encodeURIComponent(client.id)}&slug=${encodeURIComponent(slug)}`;
        const res = await fetch(url);
        const json = await res.json().catch(() => ({}));
        if (res.ok && json?.ok && Array.isArray(json.data)) {
          setSavedCards(json.data);
          if (json.data.length > 0) {
            // Preselect default card if exists
            const def = json.data.find((x: any) => x.is_default) || json.data[0];
            setSelectedSavedCardId(def.provider_card_id);
            setSelectedProviderCustomerId(def.provider_customer_id || "");
          } else {
            setSelectedSavedCardId("");
            setSelectedProviderCustomerId("");
          }
        } else {
          setSavedCards([]);
          setSelectedSavedCardId("");
          setSelectedProviderCustomerId("");
        }
      } catch (e) {
        setSavedCards([]);
        setSelectedSavedCardId("");
        setSelectedProviderCustomerId("");
      } finally {
        setLoadingCards(false);
      }
    };
    load();
  }, [open, client.id, slug]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const payload: any = {
        productId: productId,
        slug,
        offerId: offerId || undefined,
        buyer: {
          name,
          email,
          phone,
          address: { country },
        },
        payment: method === "card"
          ? { method: "card", installments, saved_card_id: selectedSavedCardId, provider_customer_id: selectedProviderCustomerId }
          : { method: "pix" },
      };
      const res = await fetch("/api/checkout/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || json?.message || "Erro ao criar cobrança");
      setResult(json);
      // Open receipt in a new tab for quick verification
      if (json?.order_id) {
        try {
          const url = `/${encodeURIComponent(slug)}/checkout/success?order_id=${encodeURIComponent(json.order_id)}&method=${encodeURIComponent(method)}&product_id=${encodeURIComponent(productId)}`;
          window.open(url, "_blank");
        } catch {}
      }
      // If card payment is immediately approved, close modal and refresh client page
      if (method === "card" && json?.card?.approved) {
        // Small delay to let result render quickly (optional)
        onOpenChange(false);
        // Refresh server data (transactions/methods/customers tabs)
        try { router.refresh(); } catch {}
      }
    } catch (e: any) {
      setError(e?.message || "Erro inesperado");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl bg-white border border-gray-200 rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-[18px] font-semibold text-gray-900">New Charge</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Business</label>
              <Select
                value={selectedClinicId}
                onValueChange={(v) => {
                  setSelectedClinicId(v);
                  const found = clinics.find(c => c.id === v);
                  setSlug(found?.slug || "");
                }}
                disabled={loadingClinics || clinics.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingClinics ? 'Loading...' : 'Select a business'} />
                </SelectTrigger>
                <SelectContent>
                  {clinics.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} {c.slug ? `(${c.slug})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">Seleciona a Business para escopo de cobrança.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment method</label>
              <Select value={method} onValueChange={(v) => setMethod(v as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="card">
                    Card (saved)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a country" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BR">Brazil (BR)</SelectItem>
                  <SelectItem value="US">United States (US)</SelectItem>
                  <SelectItem value="PT">Portugal (PT)</SelectItem>
                  <SelectItem value="ES">Spain (ES)</SelectItem>
                  <SelectItem value="GB">United Kingdom (GB)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">Define o país para selecionar o OfferPrice correto e moeda.</p>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Product</label>
            <Select
              value={productId}
              onValueChange={(v) => setProductId(v)}
              disabled={loadingProducts || products.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingProducts ? 'Loading...' : 'Select a product'} />
              </SelectTrigger>
              <SelectContent>
                {products.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 mt-1">Produtos da Business selecionada.</p>
          </div>

          {/* Offer selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Offer</label>
            <Select
              value={offerId}
              onValueChange={(v) => {
                setOfferId(v);
                setInstallments(1);
              }}
              disabled={loadingOffers || offers.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingOffers ? 'Loading...' : 'Select an offer'} />
              </SelectTrigger>
              <SelectContent>
                {offers.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name} — {fmtMoney(o.priceCents)}{o.isSubscription ? ' (Assinatura)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 mt-1">Selecione a oferta (preço e regras de parcelamento).</p>
          </div>

          {/* Installments selection (card only) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Parcelas</label>
            <Select
              value={String(installments)}
              onValueChange={(v) => setInstallments(Number(v) || 1)}
              disabled={method !== 'card' || !offerId}
            >
              <SelectTrigger>
                <SelectValue placeholder={method === 'card' ? 'Selecione parcelas' : 'Disponível apenas para cartão'} />
              </SelectTrigger>
              <SelectContent>
                {(() => {
                  const max = offers.find((o: any) => o.id === offerId)?.maxInstallments || 1;
                  const items: React.ReactNode[] = [];
                  for (let i = 1; i <= max; i++) {
                    items.push(
                      <SelectItem key={i} value={String(i)}>
                        {i}x
                      </SelectItem>
                    );
                  }
                  return items;
                })()}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 mt-1">Parcelamento limitado pela oferta e regras de negócio.</p>
          </div>

          {method === "card" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Saved card</label>
                <Select
                  value={selectedSavedCardId}
                  onValueChange={(v) => {
                    setSelectedSavedCardId(v);
                    const found = savedCards.find((x) => x.provider_card_id === v);
                    setSelectedProviderCustomerId(found?.provider_customer_id || "");
                  }}
                  disabled={loadingCards || savedCards.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={loadingCards ? "Loading..." : "Select a card"} />
                  </SelectTrigger>
                  <SelectContent>
                    {savedCards.map((c: any) => (
                      <SelectItem key={c.provider_card_id} value={c.provider_card_id}>
                        {`${c.brand ?? "Card"} •••• ${c.last4 ?? ""}  exp ${c.exp_month ?? ""}/${c.exp_year ?? ""}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1">
                  Cartões salvos deste cliente para o business.
                  {(!loadingCards && savedCards.length === 0) && (
                    <span className="ml-1 text-gray-600">Nenhum cartão salvo. Peça um checkout de cartão para salvar.</span>
                  )}
                </p>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Client name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Client email</label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client phone</label>
            <Input value={phone || ""} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" />
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          {result && (
            <div className="text-sm text-gray-800 bg-gray-50 border border-gray-200 p-3 rounded-xl">
              <div className="font-medium mb-1">Charge created</div>
              {result?.order_id && (
                <div className="text-xs text-gray-600">Order: {result.order_id}</div>
              )}
              {method === "card" && result?.card && (
                <div className="mt-1 text-xs text-gray-700">
                  <div>Status: {String(result.card.status || '')}</div>
                  {result.card.approved === false && result.card.acquirer_message && (
                    <div>Message: {result.card.acquirer_message}</div>
                  )}
                </div>
              )}
              {result?.payment_url && (
                <div className="mt-1">
                  <a href={result.payment_url} target="_blank" className="text-blue-600 underline">
                    Open payment link
                  </a>
                </div>
              )}
              {result?.pix?.qr_code_url && (
                <div className="mt-1">
                  <a href={result.pix.qr_code_url} target="_blank" className="text-blue-600 underline">
                    PIX QR Code
                  </a>
                </div>
              )}
              {/* Link to success page when we have order id */}
              {result?.order_id && (
                <div className="mt-2">
                  <a
                    href={`/${encodeURIComponent(slug)}/checkout/success?order_id=${encodeURIComponent(result.order_id)}&method=${encodeURIComponent(method)}&product_id=${encodeURIComponent(productId)}`}
                    target="_blank"
                    className="text-blue-600 underline"
                  >
                    View receipt
                  </a>
                </div>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-8">
              Close
            </Button>
            <Button type="submit" className="h-8 bg-gray-900 text-white" disabled={!isValid || submitting}>
              {submitting ? "Creating..." : "Create charge"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
