"use client";

import React, { useEffect, useMemo, useState } from "react";
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
  const [slug, setSlug] = useState<string>(defaultSlug);
  const [productId, setProductId] = useState<string>("");
  const [method, setMethod] = useState<"pix" | "card">("pix");
  const [name, setName] = useState<string>(client?.name || "");
  const [email, setEmail] = useState<string>(client?.email || "");
  const [phone, setPhone] = useState<string>(client?.phone || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [loadingCards, setLoadingCards] = useState(false);
  const [loadingClinics, setLoadingClinics] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
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
    if (!slug || !productId || !email || !name) return false;
    if (method === "card") {
      return Boolean(selectedSavedCardId && selectedProviderCustomerId);
    }
    return true;
  }, [slug, productId, email, name, method, selectedSavedCardId, selectedProviderCustomerId]);

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
          const found = mapped.find((c) => (c.slug || '') === defaultSlug);
          if (found) chosen = found.id;
        }
        setSelectedClinicId(chosen);
        const chosenClinic = mapped.find(c => c.id === chosen);
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
        buyer: {
          name,
          email,
          phone,
        },
        payment: method === "card"
          ? { method: "card", saved_card_id: selectedSavedCardId, provider_customer_id: selectedProviderCustomerId }
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
                  <SelectItem value="card" disabled={loadingCards || savedCards.length === 0}>
                    Card (saved)
                  </SelectItem>
                </SelectContent>
              </Select>
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
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 mt-1">Produtos da Business selecionada.</p>
          </div>
          {method === "card" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Saved card</label>
                <Select
                  value={selectedSavedCardId}
                  onValueChange={(v) => setSelectedSavedCardId(v)}
                  disabled={loadingCards || savedCards.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={loadingCards ? "Loading..." : "Select a card"} />
                  </SelectTrigger>
                  <SelectContent>
                    {savedCards.map((c) => (
                      <SelectItem key={c.provider_card_id} value={c.provider_card_id} onClick={() => setSelectedProviderCustomerId(c.provider_customer_id || "") }>
                        {`${c.brand ?? "Card"} •••• ${c.last4 ?? ""}  exp ${c.exp_month ?? ""}/${c.exp_year ?? ""}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1">Cartões salvos deste cliente para o business.</p>
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
