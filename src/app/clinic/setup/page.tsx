"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface Clinic {
  id: string;
  name: string;
  subdomain?: string | null;
  theme?: "LIGHT" | "DARK";
}

export default function ClinicSetupPage() {
  const search = useSearchParams();
  const router = useRouter();
  const clinicId = search?.get("clinicId") || "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [name, setName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [theme, setTheme] = useState<"LIGHT" | "DARK">("DARK");
  const validSubdomain = useMemo(() => /^[a-z0-9-]{3,63}$/.test(subdomain) && !subdomain.startsWith("-") && !subdomain.endsWith("-"), [subdomain]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        if (!clinicId) return;
        const res = await fetch(`/api/clinic?clinicId=${encodeURIComponent(clinicId)}`, { cache: "no-store" });
        if (!res.ok) throw new Error("Falha ao carregar clínica");
        const data = await res.json();
        const c = data?.clinic as any;
        if (!cancelled && c) {
          setClinic({ id: c.id, name: c.name, subdomain: c.subdomain ?? null, theme: c.theme });
          setName(c.name || "");
          setSubdomain(c.subdomain || "");
          setTheme((c.theme as any) === "LIGHT" ? "LIGHT" : "DARK");
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [clinicId]);

  const handleSave = async () => {
    try {
      if (!clinicId) return;
      if (!name.trim()) {
        alert("Informe um nome para a clínica");
        return;
      }
      if (subdomain && !validSubdomain) {
        alert("Subdomínio inválido. Use letras minúsculas, números e hífen (3-63). Não comece/termine com hífen.");
        return;
      }
      setSaving(true);
      const res = await fetch(`/api/clinic/settings?clinicId=${encodeURIComponent(clinicId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), subdomain: subdomain.trim() || undefined, theme })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Falha ao salvar");
      }
      // Após salvar, ir para a área da clínica
      router.push(`/clinic?clinicId=${encodeURIComponent(clinicId)}`);
    } catch (e: any) {
      alert(e?.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  if (!clinicId) {
    return (
      <div className="min-h-screen bg-[#111] text-white flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-xl">Setup de clínica</div>
          <div className="text-sm text-gray-400 mt-2">Parâmetro clinicId ausente.</div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#111] p-6 text-white">
        <div className="max-w-3xl mx-auto">
          <div className="h-8 w-48 bg-[#2F2F2F] rounded animate-pulse mb-8" />
          <div className="space-y-4">
            <div className="h-10 w-full bg-[#2F2F2F] rounded animate-pulse" />
            <div className="h-10 w-full bg-[#2F2F2F] rounded animate-pulse" />
            <div className="h-10 w-40 bg-[#2F2F2F] rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#111] text-white p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-semibold">Configurar nova clínica</h1>
        <p className="text-gray-300 mt-1 text-sm">Defina as informações básicas antes de abrir o painel.</p>

        <div className="mt-8 space-y-6">
          <div>
            <label className="block text-sm text-gray-300 mb-1">Nome da clínica</label>
            <input
              className="w-full h-10 rounded-lg bg-[#1a1a1a] border border-[#333] px-3 text-white focus:outline-none focus:ring-2 focus:ring-white/20"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex.: Clínica Vida"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Subdomínio (opcional)</label>
            <div className="flex items-center gap-2">
              <input
                className="flex-1 h-10 rounded-lg bg-[#1a1a1a] border border-[#333] px-3 text-white focus:outline-none focus:ring-2 focus:ring-white/20"
                value={subdomain}
                onChange={e => setSubdomain(e.target.value.toLowerCase())}
                placeholder="seu-nome"
              />
              <span className="text-gray-400 text-sm">.zuzz.app</span>
            </div>
            {subdomain && !validSubdomain && (
              <div className="text-xs text-red-400 mt-1">Use apenas letras minúsculas, números e hífen (3-63). Não comece/termine com hífen.</div>
            )}
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Tema</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className={`px-3 py-2 rounded-lg border ${theme === "DARK" ? "bg-white text-black border-white" : "bg-transparent text-white border-[#333]"}`}
                onClick={() => setTheme("DARK")}
              >
                Dark
              </button>
              <button
                type="button"
                className={`px-3 py-2 rounded-lg border ${theme === "LIGHT" ? "bg-white text-black border-white" : "bg-transparent text-white border-[#333]"}`}
                onClick={() => setTheme("LIGHT")}
              >
                Light
              </button>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className={`h-10 w-full rounded-lg ${saving ? "bg-gray-400 text-black" : "bg-white text-black hover:bg-white/90"}`}
            >
              {saving ? "Salvando..." : "Salvar e abrir clínica"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
