"use client";

import React, { useMemo, useState } from "react";

type Product = {
  id: string | number;
  name: string;
  description?: string | null;
  category?: string | null;
  creditsPerUnit?: number | null;
  price?: number | null;
  imageUrl?: string | null;
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
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const params = new URLSearchParams({
      productId: String(selected.id),
      from: slug,
    });
    if (name.trim()) params.set("name", name.trim());
    if (whatsapp.trim()) params.set("whatsapp", whatsapp.trim());
    window.location.href = `/patient/appointments/${doctorId}?${params.toString()}`;
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
    if (selectedCategory === "Todos") return products;
    return (products || []).filter((p) => (p.category || "").trim() === selectedCategory);
  }, [products, selectedCategory]);

  return (
    <>
      <div className="mb-5 overflow-x-auto">
        <div className="flex items-center justify-center gap-3 whitespace-nowrap">
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
              {typeof p.price === "number" ? (
                <span className="text-sm font-medium text-gray-900">{priceFormatter.format(p.price)}</span>
              ) : null}
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
                Saber mais
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
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center rounded-md bg-blue-500 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
              >
                Agendar agora
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
