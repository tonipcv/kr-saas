"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useClinic } from "@/contexts/clinic-context";

type Job = {
  id: string;
  campaignId: string;
  channel: "whatsapp" | "sms" | "email";
  status: "scheduled" | "running" | "done" | "failed" | "cancelled" | "sent" | "completed" | "success";
  scheduleAt: string;
  createdAt: string;
  updatedAt?: string;
  finishedAt?: string;
  lastError?: string;
  payload?: any;
};

export default function ScheduledJobsPage() {
  const { currentClinic } = useClinic();
  const clinicId = currentClinic?.id || "";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selected, setSelected] = useState<Job | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      // Primary: scheduled/running
      const schedUrl = clinicId
        ? `/api/v2/doctor/broadcast/schedule?doctorId=${encodeURIComponent(clinicId)}`
        : "/api/v2/doctor/broadcast/schedule";
      const res = await fetch(schedUrl, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      let all: Job[] = Array.isArray(json?.data) ? json.data : [];

      // Secondary (best-effort): try to fetch completed jobs from a history endpoint
      // These endpoints may or may not exist; ignore failures gracefully
      const baseQuery = clinicId ? `doctorId=${encodeURIComponent(clinicId)}&` : "";
      const historyCandidates = [
        `/api/v2/doctor/broadcast/jobs?${baseQuery}status=done&limit=100`,
        `/api/v2/doctor/broadcast/schedule?${baseQuery}status=done&limit=100`,
        `/api/v2/doctor/broadcast/history?${baseQuery}limit=100`,
      ];
      for (const url of historyCandidates) {
        try {
          const r = await fetch(url, { cache: "no-store" });
          if (!r.ok) continue;
          const j = await r.json().catch(() => ({}));
          const arr: Job[] = Array.isArray(j?.data) ? j.data : [];
          if (arr.length) {
            const map = new Map(all.map(x => [x.id, x] as const));
            for (const it of arr) map.set(it.id, it);
            all = Array.from(map.values());
            break; // first success is enough
          }
        } catch {}
      }

      if (res.ok) {
        setJobs(all);
      } else {
        setError(json?.error || `HTTP ${res.status}`);
        setJobs(all);
      }
    } catch (e: any) {
      setError(e?.message || "Erro inesperado");
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  const cancelJob = async (id: string) => {
    try {
      setActionMsg(null);
      const res = await fetch(`/api/v2/doctor/broadcast/schedule/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionMsg(`Erro ao cancelar • ${json?.error || res.status}`);
        return;
      }
      setActionMsg('Agendamento cancelado');
      await load();
      if (selected && selected.id === id) {
        setSelected({ ...selected, status: 'cancelled' });
      }
    } catch (e: any) {
      setActionMsg(`Erro ao cancelar • ${e?.message || 'Falha inesperada'}`);
    }
  };

  useEffect(() => {
    if (!clinicId) return;
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [clinicId]);

  useEffect(() => {
    const onDocClick = () => { setMenuOpenId(null); setMenuPos(null); };
    window.addEventListener('click', onDocClick);
    return () => window.removeEventListener('click', onDocClick);
  }, []);

  const prettyDate = (iso?: string) => {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(d);
    } catch {
      return iso;
    }
  };

  const upcoming = useMemo(() => jobs.filter(j => j.status === 'scheduled' || j.status === 'running'), [jobs]);
  const sentStatuses = new Set(["done", "sent", "completed", "success"] as const);
  const sent = useMemo(() => jobs
    .filter(j => sentStatuses.has(j.status as any))
    .sort((a, b) => {
      const aTime = new Date(a.finishedAt || a.updatedAt || a.createdAt).getTime();
      const bTime = new Date(b.finishedAt || b.updatedAt || b.createdAt).getTime();
      return bTime - aTime;
    })
  , [jobs]);

  const channelBadge = (ch: Job["channel"]) => {
    const map: Record<string, string> = {
      email: "bg-blue-100 text-blue-700",
      whatsapp: "bg-green-100 text-green-700",
      sms: "bg-yellow-100 text-yellow-700",
    };
    return <span className={`text-[11px] px-2 py-[2px] rounded ${map[ch] || "bg-gray-100 text-gray-700"}`}>{ch.toUpperCase()}</span>;
  };

  const statusBadge = (s: Job["status"]) => {
    const map: Record<string, string> = {
      scheduled: "bg-gray-100 text-gray-700",
      running: "bg-purple-100 text-purple-700",
      done: "bg-emerald-100 text-emerald-700",
      failed: "bg-red-100 text-red-700",
      cancelled: "bg-zinc-100 text-zinc-700",
    };
    const labelMap: Record<string, string> = {
      scheduled: "Agendado",
      running: "Executando",
      done: "Concluído",
      failed: "Falhou",
      cancelled: "Cancelado",
    };
    return <span className={`text-[11px] px-2 py-[2px] rounded ${map[s] || "bg-gray-100 text-gray-700"}`}>{labelMap[s] || s}</span>;
  };

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24 bg-gray-50">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">Agendamentos</h1>
              <p className="text-xs text-gray-500">Veja suas campanhas programadas</p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/doctor/broadcast"><Button variant="outline" size="sm">Voltar ao Broadcast</Button></Link>
              <Button size="sm" onClick={load} disabled={loading}>{loading ? "Atualizando…" : "Atualizar"}</Button>
            </div>
          </div>

          {!clinicId && (
            <div className="mb-3 text-[12px] text-amber-700">Selecione uma clínica para visualizar os agendamentos e enviados.</div>
          )}

          <Card className="bg-white border border-gray-200 shadow-sm rounded-2xl">
            <CardHeader className="px-4 py-3 border-b border-gray-100">
              <CardTitle className="text-sm font-semibold text-gray-900">Próximos agendamentos</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-3">
              {error && <p className="text-[12px] text-red-600 mb-2">{error}</p>}
              {actionMsg && <p className="text-[12px] text-gray-700 mb-2">{actionMsg}</p>}
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-600">
                      <th className="py-2 pr-4">Data/Hora</th>
                      <th className="py-2 pr-4">Canal</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Campaign</th>
                      <th className="py-2 pr-4">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcoming.length === 0 && (
                      <tr><td colSpan={5} className="py-6 text-center text-gray-500">Nenhum agendamento encontrado</td></tr>
                    )}
                    {upcoming.map((j) => (
                      <tr key={j.id} className="border-t border-gray-100 text-gray-800">
                        <td className="py-2 pr-4 whitespace-nowrap">{prettyDate(j.scheduleAt)}</td>
                        <td className="py-2 pr-4">{channelBadge(j.channel)}</td>
                        <td className="py-2 pr-4">{statusBadge(j.status)}</td>
                        <td className="py-2 pr-4 font-mono text-[12px]">{j.campaignId}</td>
                        <td className="py-2 pr-4 relative">
                          <button
                            className="h-7 w-7 flex items-center justify-center rounded hover:bg-gray-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              const x = rect.right;
                              const y = rect.bottom + window.scrollY;
                              if (menuOpenId === j.id) {
                                setMenuOpenId(null);
                                setMenuPos(null);
                              } else {
                                setMenuOpenId(j.id);
                                setMenuPos({ x, y });
                              }
                            }}
                            aria-label="Ações"
                          >
                            <span className="text-xl leading-none">⋯</span>
                          </button>
                          {menuOpenId === j.id && menuPos && (
                            <div
                              className="fixed w-40 bg-white border border-gray-200 rounded-md shadow-lg z-[9999]"
                              style={{ left: menuPos.x, top: menuPos.y }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                className="w-full text-left px-3 py-2 text-[13px] hover:bg-gray-50"
                                onClick={() => { setSelected(j); setMenuOpenId(null); setMenuPos(null); }}
                              >
                                Ver detalhes
                              </button>
                              {j.status === 'scheduled' && (
                                <button
                                  className="w-full text-left px-3 py-2 text-[13px] text-red-600 hover:bg-red-50"
                                  onClick={() => { setMenuOpenId(null); setMenuPos(null); cancelJob(j.id); }}
                                >
                                  Cancelar
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Sent (done) section */}
          <Card className="bg-white border border-gray-200 shadow-sm rounded-2xl mt-4">
            <CardHeader className="px-4 py-3 border-b border-gray-100">
              <CardTitle className="text-sm font-semibold text-gray-900">Enviados recentemente</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-3">
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-600">
                      <th className="py-2 pr-4">Enviado em</th>
                      <th className="py-2 pr-4">Canal</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Campaign</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sent.length === 0 && (
                      <tr><td colSpan={4} className="py-6 text-center text-gray-500">Ainda não há envios concluídos</td></tr>
                    )}
                    {sent.map((j) => (
                      <tr key={j.id} className="border-top border-gray-100 text-gray-800">
                        <td className="py-2 pr-4 whitespace-nowrap">{prettyDate(j.finishedAt || j.updatedAt || j.createdAt)}</td>
                        <td className="py-2 pr-4">{channelBadge(j.channel)}</td>
                        <td className="py-2 pr-4">{statusBadge(j.status)}</td>
                        <td className="py-2 pr-4 font-mono text-[12px]">{j.campaignId}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {selected && (
            <div className="fixed inset-0 bg-black/30 z-50 flex items-end md:items-center justify-center" onClick={() => setSelected(null)}>
              <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl w-full md:max-w-2xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
                <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">Detalhes do agendamento</div>
                    <div className="text-[11px] text-gray-500">ID: {selected.id}</div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setSelected(null)}>Fechar</Button>
                </div>
                <div className="p-4 space-y-3 text-sm text-gray-800">
                  <div className="grid md:grid-cols-2 gap-3">
                    <div>
                      <div className="text-[11px] text-gray-500">Data/Hora</div>
                      <div>{prettyDate(selected.scheduleAt)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-500">Criado em</div>
                      <div>{prettyDate(selected.createdAt)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-500">Canal</div>
                      <div className="mt-0.5">{channelBadge(selected.channel)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-500">Status</div>
                      <div className="mt-0.5">{statusBadge(selected.status)}</div>
                    </div>
                    <div className="md:col-span-2">
                      <div className="text-[11px] text-gray-500">Campaign ID</div>
                      <div className="font-mono text-[12px]">{selected.campaignId}</div>
                    </div>
                  </div>

                  {selected.status === 'scheduled' && (
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => cancelJob(selected.id)}>Cancelar agendamento</Button>
                      <span className="text-[11px] text-gray-500">Você pode desfazer antes do horário.</span>
                    </div>
                  )}

                  {selected.lastError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 rounded-md p-3">
                      <div className="text-[11px] font-medium">Erro</div>
                      <div className="text-[12px] whitespace-pre-wrap">{selected.lastError}</div>
                    </div>
                  )}

                  {/* Payload inspector */}
                  <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
                    <div className="text-[11px] text-gray-600 mb-2">Conteúdo</div>
                    {selected.channel === 'email' ? (
                      <div className="space-y-2">
                        <div><span className="text-[11px] text-gray-500">Assunto:</span> {selected.payload?.subject || '—'}</div>
                        <div className="text-[11px] text-gray-500">HTML:</div>
                        <div className="border border-gray-200 rounded p-2 bg-white max-h-60 overflow-auto" dangerouslySetInnerHTML={{ __html: selected.payload?.html || '<em>—</em>' }} />
                        {selected.payload?.text && (
                          <div>
                            <div className="text-[11px] text-gray-500">Texto:</div>
                            <pre className="border border-gray-200 rounded p-2 bg-white text-[12px] whitespace-pre-wrap">{selected.payload?.text}</pre>
                          </div>
                        )}
                      </div>
                    ) : selected.channel === 'whatsapp' ? (
                      <div className="space-y-1">
                        <div><span className="text-[11px] text-gray-500">Usa template:</span> {selected.payload?.useTemplate ? 'Sim' : 'Não'}</div>
                        {selected.payload?.useTemplate ? (
                          <>
                            <div><span className="text-[11px] text-gray-500">Template:</span> {selected.payload?.templateName || '—'} ({selected.payload?.templateLanguage || '—'})</div>
                          </>
                        ) : (
                          <>
                            <div className="text-[11px] text-gray-500">Mensagem:</div>
                            <pre className="border border-gray-200 rounded p-2 bg-white text-[12px] whitespace-pre-wrap">{selected.payload?.message || '—'}</pre>
                          </>
                        )}
                      </div>
                    ) : (
                      <div>
                        <div className="text-[11px] text-gray-500">Mensagem SMS:</div>
                        <pre className="border border-gray-200 rounded p-2 bg-white text-[12px] whitespace-pre-wrap">{selected.payload?.message || '—'}</pre>
                      </div>
                    )}

                    <details className="mt-2">
                      <summary className="text-[11px] text-gray-500 cursor-pointer">Ver JSON bruto</summary>
                      <pre className="mt-1 border border-gray-200 rounded p-2 bg-white text-[12px] whitespace-pre-wrap">{JSON.stringify(selected.payload || {}, null, 2)}</pre>
                    </details>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
