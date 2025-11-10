"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ClinicItem = {
  id: string;
  name: string;
  merchant?: {
    recipientId?: string | null;
    splitPercent?: number | null;
    platformFeeBps?: number | null;
    transactionFeeCents?: number | null;
    transactionFeeType?: string | null;
  } | null;
};

export default function AdminFeesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [clinics, setClinics] = useState<ClinicItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        // Use admin clinics listing; fallback to minimal fetch if not available
        const res = await fetch(`/api/admin/clinics?limit=200`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json().catch(() => ({}));
        const rows: ClinicItem[] = (data?.clinics || data?.items || []).map((c: any) => ({
          id: String(c.id),
          name: c.name || "Unnamed",
          merchant: c.merchant || null,
        }));
        if (!cancelled) setClinics(rows);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, []);

  const updateField = (clinicId: string, key: keyof NonNullable<ClinicItem["merchant"]>, val: any) => {
    setClinics((prev) => prev.map((c) => (
      c.id === clinicId
        ? { ...c, merchant: { ...(c.merchant || {}), [key]: val } }
        : c
    )));
  };

  const onSave = async (c: ClinicItem) => {
    try {
      setSaving(c.id);
      const body: any = {
        clinicId: c.id,
        splitPercent: Number(c.merchant?.splitPercent ?? 70),
        platformFeeBps: Number(c.merchant?.platformFeeBps ?? 0),
        transactionFeeCents: Number(c.merchant?.transactionFeeCents ?? 0),
        transactionFeeType: String(c.merchant?.transactionFeeType ?? "flat"),
      };
      const res = await fetch('/api/payments/pagarme/recipient', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const js = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(js?.error || `HTTP ${res.status}`);
    } catch (e: any) {
      alert(`Erro ao salvar: ${e?.message || String(e)}`);
    } finally {
      setSaving(null);
      // Refresh server state if necessary
      router.refresh();
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Payments Split (Super Admin)</h1>
      <p className="text-sm text-gray-600 mb-6">Defina o percentual de repasse e a taxa da plataforma (percentual e fixa) por clínica. As novas transações usarão automaticamente esses valores.</p>

      {loading && <div className="text-gray-500">Carregando...</div>}
      {error && <div className="text-red-600">Erro: {error}</div>}

      {!loading && !error && (
        <div className="overflow-auto border rounded-md">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left">Clínica</th>
                <th className="px-3 py-2 text-right">splitPercent (%)</th>
                <th className="px-3 py-2 text-right">platformFeeBps (bps)</th>
                <th className="px-3 py-2 text-right">transactionFeeCents (R$)</th>
                <th className="px-3 py-2 text-left">transactionFeeType</th>
                <th className="px-3 py-2 text-left">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {clinics.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-2 whitespace-nowrap max-w-[280px] truncate">{c.name}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      className="w-24 border rounded px-2 py-1 text-right"
                      value={Number(c.merchant?.splitPercent ?? 70)}
                      min={0}
                      max={100}
                      onChange={(e) => updateField(c.id, 'splitPercent', Math.max(0, Math.min(100, Number(e.target.value))))}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      className="w-28 border rounded px-2 py-1 text-right"
                      value={Number(c.merchant?.platformFeeBps ?? 0)}
                      min={0}
                      onChange={(e) => updateField(c.id, 'platformFeeBps', Math.max(0, Number(e.target.value)))}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-gray-500">R$</span>
                      <input
                        type="number"
                        className="w-28 border rounded px-2 py-1 text-right"
                        value={Number(c.merchant?.transactionFeeCents ?? 0) / 100}
                        min={0}
                        step={0.01}
                        onChange={(e) => updateField(c.id, 'transactionFeeCents', Math.max(0, Math.round(Number(e.target.value) * 100)))}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className="border rounded px-2 py-1"
                      value={String(c.merchant?.transactionFeeType ?? 'flat')}
                      onChange={(e) => updateField(c.id, 'transactionFeeType', e.target.value)}
                    >
                      <option value="flat">flat</option>
                      <option value="percent">percent</option>
                      <option value="hybrid">hybrid</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      className="px-3 py-1.5 rounded bg-gray-900 text-white text-xs disabled:opacity-50"
                      onClick={() => onSave(c)}
                      disabled={saving === c.id}
                    >
                      {saving === c.id ? 'Salvando...' : 'Salvar'}
                    </button>
                  </td>
                </tr>
              ))}
              {clinics.length === 0 && (
                <tr><td className="px-3 py-6 text-gray-500" colSpan={6}>Nenhuma clínica encontrada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
