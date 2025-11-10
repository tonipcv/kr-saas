"use client";
import { useEffect, useMemo, useState } from "react";
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
  const [editingId, setEditingId] = useState<string | null>(null);
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
      setEditingId(null);
    } catch (e: any) {
      alert(`Erro ao salvar: ${e?.message || String(e)}`);
    } finally {
      setSaving(null);
      // Refresh server state if necessary
      router.refresh();
    }
  };

  const onCancel = () => setEditingId(null);

  const onKeyDownRow = (e: React.KeyboardEvent, c: ClinicItem) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSave(c);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24">
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-[20px] font-semibold text-gray-900 tracking-[-0.01em]">Payments Split</h1>
                <p className="text-sm text-gray-500 mt-1">Defina o percentual de repasse e a taxa da plataforma por clínica.</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-3">
            {loading && <div className="text-gray-500">Carregando...</div>}
            {error && <div className="text-red-600">Erro: {error}</div>}

            {!loading && !error && (
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50/80 text-xs text-gray-600">
                    <tr>
                      <th className="px-3 py-2 text-left">Clínica</th>
                      <th className="px-3 py-2 text-right">splitPercent (%)</th>
                      <th className="px-3 py-2 text-right">platformFeeBps (bps)</th>
                      <th className="px-3 py-2 text-right">transactionFee (R$)</th>
                      <th className="px-3 py-2 text-left">transactionFeeType</th>
                      <th className="px-3 py-2 text-left">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {clinics.map((c) => {
                      const isEditing = editingId === c.id;
                      const txFeeReal = Number(c.merchant?.transactionFeeCents ?? 0) / 100;
                      return (
                        <tr
                          key={c.id}
                          className="hover:bg-gray-50 cursor-zoom-in"
                          onDoubleClick={() => setEditingId(c.id)}
                          onKeyDown={(e) => isEditing ? onKeyDownRow(e, c) : undefined}
                        >
                          <td className="px-3 py-2 whitespace-nowrap max-w-[280px] truncate">{c.name}</td>
                          <td className="px-3 py-2 text-right">
                            {isEditing ? (
                              <input
                                autoFocus
                                type="number"
                                className="w-24 border rounded px-2 py-1 text-right"
                                value={Number(c.merchant?.splitPercent ?? 70)}
                                min={0}
                                max={100}
                                onChange={(e) => updateField(c.id, 'splitPercent', Math.max(0, Math.min(100, Number(e.target.value))))}
                              />
                            ) : (
                              <span className="tabular-nums">{Number(c.merchant?.splitPercent ?? 70)}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {isEditing ? (
                              <input
                                type="number"
                                className="w-28 border rounded px-2 py-1 text-right"
                                value={Number(c.merchant?.platformFeeBps ?? 0)}
                                min={0}
                                onChange={(e) => updateField(c.id, 'platformFeeBps', Math.max(0, Number(e.target.value)))}
                              />
                            ) : (
                              <span className="tabular-nums">{Number(c.merchant?.platformFeeBps ?? 0)}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {isEditing ? (
                              <div className="flex items-center justify-end gap-2">
                                <span className="text-gray-500">R$</span>
                                <input
                                  type="number"
                                  className="w-28 border rounded px-2 py-1 text-right"
                                  value={txFeeReal}
                                  min={0}
                                  step={0.01}
                                  onChange={(e) => updateField(c.id, 'transactionFeeCents', Math.max(0, Math.round(Number(e.target.value) * 100)))}
                                />
                              </div>
                            ) : (
                              <span className="tabular-nums">R$ {(txFeeReal || 0).toFixed(2)}</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {isEditing ? (
                              <select
                                className="border rounded px-2 py-1"
                                value={String(c.merchant?.transactionFeeType ?? 'flat')}
                                onChange={(e) => updateField(c.id, 'transactionFeeType', e.target.value)}
                              >
                                <option value="flat">flat</option>
                                <option value="percent">percent</option>
                                <option value="hybrid">hybrid</option>
                              </select>
                            ) : (
                              <span>{String(c.merchant?.transactionFeeType ?? 'flat')}</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {isEditing ? (
                              <div className="flex items-center gap-2">
                                <button
                                  className="px-3 py-1.5 rounded bg-gray-900 text-white text-xs disabled:opacity-50"
                                  onClick={() => onSave(c)}
                                  disabled={saving === c.id}
                                >
                                  {saving === c.id ? 'Salvando...' : 'Salvar'}
                                </button>
                                <button
                                  className="px-3 py-1.5 rounded border text-xs"
                                  onClick={onCancel}
                                  disabled={saving === c.id}
                                >
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-500">Dê um duplo clique para editar</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {clinics.length === 0 && (
                      <tr><td className="px-3 py-6 text-gray-500" colSpan={6}>Nenhuma clínica encontrada.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
