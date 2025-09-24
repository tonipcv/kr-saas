"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function MessageSequencesPage() {
  const router = useRouter();
  type Channel = 'email'|'whatsapp'|'sms';

  type Template = { id: string; name: string; channel: Channel };
  type Step = { id: string; orderIndex: number; delayAmount: number; delayUnit: 'minutes'|'hours'|'days'; templateId: string };
  type Sequence = { id: string; name: string; description?: string|null; steps: Step[] };

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string|null>(null);

  const [items, setItems] = useState<Sequence[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);

  const [search, setSearch] = useState("");
  const filtered = useMemo(()=> items.filter(s => search ? (s.name?.toLowerCase()||'').includes(search.toLowerCase()) : true), [items, search]);

  const [editing, setEditing] = useState<Sequence|null>(null);
  const [form, setForm] = useState<Partial<Sequence>>({ name: '', description: '', steps: [] });

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const [seqRes, tplRes] = await Promise.all([
        fetch(`/api/v2/doctor/message-sequences`, { cache: 'no-store' }),
        fetch(`/api/v2/doctor/message-templates?limit=200`, { cache: 'no-store' }),
      ]);
      const seqJson = await seqRes.json().catch(()=>({}));
      const tplJson = await tplRes.json().catch(()=>({}));
      if (!seqRes.ok) throw new Error(seqJson?.error || `HTTP ${seqRes.status}`);
      if (!tplRes.ok) throw new Error(tplJson?.error || `HTTP ${tplRes.status}`);
      setItems(Array.isArray(seqJson?.data) ? seqJson.data : []);
      const list = Array.isArray(tplJson?.data) ? tplJson.data : [];
      setTemplates(list.map((t:any)=>({ id: t.id, name: t.name, channel: t.channel })));
    } catch (e:any) {
      setError(e?.message || 'Falha ao carregar dados');
    } finally {
      setLoading(false);
    }
  }

  useEffect(()=>{ load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  function startNew() {
    setEditing(null);
    setForm({ name: '', description: '', steps: [] });
  }

  function startEdit(s: Sequence) {
    setEditing(s);
    setForm({ id: s.id, name: s.name, description: s.description || '', steps: s.steps?.map(st => ({...st})) || [] });
  }

  function updateForm(patch: any) { setForm(prev => ({ ...prev, ...patch })); }

  function addStep() {
    const nextIndex = (form.steps?.length || 0);
    const newStep: Step = { id: Math.random().toString(36).slice(2), orderIndex: nextIndex, delayAmount: 0, delayUnit: 'hours', templateId: templates[0]?.id || '' };
    updateForm({ steps: [ ...(form.steps||[]), newStep ] });
  }

  function removeStep(sid: string) { updateForm({ steps: (form.steps||[]).filter(s => s.id !== sid) }); }

  function moveStep(sid: string, dir: -1|1) {
    const arr = [ ...(form.steps || []) ];
    const idx = arr.findIndex(s => s.id === sid);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= arr.length) return;
    const [spliced] = arr.splice(idx, 1);
    arr.splice(newIdx, 0, spliced);
    // reindex
    arr.forEach((s, i) => s.orderIndex = i);
    updateForm({ steps: arr });
  }

  function updateStep(sid: string, patch: Partial<Step>) {
    updateForm({ steps: (form.steps||[]).map(s => s.id === sid ? ({ ...s, ...patch }) : s) });
  }

  async function save() {
    try {
      setSaving(true);
      setError(null);
      const isEdit = !!editing?.id;
      const payload: any = {
        name: form.name,
        description: form.description,
        steps: (form.steps||[]).map((s, i) => ({
          orderIndex: i,
          delayAmount: s.delayAmount,
          delayUnit: s.delayUnit,
          templateId: s.templateId,
        })),
      };
      const res = await fetch(isEdit ? `/api/v2/doctor/message-sequences/${editing!.id}` : `/api/v2/doctor/message-sequences`, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      await load();
      setEditing(null);
      startNew();
    } catch (e:any) {
      setError(e?.message || 'Falha ao salvar sequência');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Remover esta sequência?')) return;
    const res = await fetch(`/api/v2/doctor/message-sequences/${id}`, { method: 'DELETE' });
    const json = await res.json().catch(()=>({}));
    if (!res.ok) { alert(json?.error || `HTTP ${res.status}`); return; }
    await load();
  }

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24 bg-gray-50 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">Sequências de Mensagens</h1>
              <p className="text-xs text-gray-500">Monte fluxos com múltiplos passos (delays + templates)</p>
            </div>
            <div className="flex gap-2">
              <Link href="/doctor/message-templates"><Button variant="outline" size="sm">Templates</Button></Link>
              <Link href="/doctor/automation"><Button variant="outline" size="sm">Automations</Button></Link>
            </div>
          </div>

          <Card className="bg-white border border-gray-200 shadow-sm rounded-2xl">
            <CardHeader className="px-4 py-3 border-b border-gray-100">
              <CardTitle className="text-sm font-semibold text-gray-900">Listagem</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-3 space-y-3 text-sm">
              <div className="grid md:grid-cols-3 gap-2">
                <div className="md:col-span-2">
                  <label className="block text-xs text-gray-600 mb-1">Buscar</label>
                  <input value={search} onChange={(e)=>setSearch(e.target.value)} onKeyDown={(e)=>{ if (e.key==='Enter') load(); }} className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm" placeholder="Nome da sequência" />
                </div>
                <div className="flex items-end gap-2">
                  <Button variant="outline" size="sm" onClick={load} disabled={loading}>{loading ? 'Atualizando…' : 'Atualizar'}</Button>
                  <Button size="sm" onClick={startNew}>Nova sequência</Button>
                </div>
              </div>
              <div className="border-t border-gray-100 pt-3">
                {filtered.length === 0 ? (
                  <p className="text-xs text-gray-500">Nenhuma sequência encontrada.</p>
                ) : (
                  <div className="space-y-2">
                    {filtered.map((s) => (
                      <div key={s.id} className="p-2 border border-gray-200 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div className="text-sm">
                            <div className="font-medium text-gray-900">{s.name}</div>
                            <div className="text-[11px] text-gray-500">{s.steps?.length || 0} passos</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={()=>startEdit(s)}>Editar</Button>
                            <Button variant="outline" size="sm" onClick={()=>remove(s.id)}>Remover</Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border border-gray-200 shadow-sm rounded-2xl">
            <CardHeader className="px-4 py-3 border-b border-gray-100">
              <CardTitle className="text-sm font-semibold text-gray-900">{editing ? 'Editar sequência' : 'Nova sequência'}</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-3 space-y-3 text-sm">
              {error && <p className="text-[12px] text-red-600">{error}</p>}
              <div className="grid md:grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Nome</label>
                  <input value={form.name || ''} onChange={(e)=>updateForm({ name: e.target.value })} className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs text-gray-600 mb-1">Descrição</label>
                  <input value={form.description || ''} onChange={(e)=>updateForm({ description: e.target.value })} className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm" />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-gray-900">Passos</div>
                  <Button variant="outline" size="sm" onClick={addStep}>Adicionar passo</Button>
                </div>
                {(form.steps||[]).length === 0 ? (
                  <p className="text-xs text-gray-500">Nenhum passo adicionado.</p>
                ) : (
                  <div className="space-y-2">
                    {(form.steps||[]).map((st, idx) => (
                      <div key={st.id} className="p-2 border border-gray-200 rounded-lg">
                        <div className="grid md:grid-cols-4 gap-2 items-end">
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Template</label>
                            <select value={st.templateId} onChange={(e)=>updateStep(st.id, { templateId: e.target.value })} className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm">
                              {templates.map(t => (
                                <option key={t.id} value={t.id}>{t.name} ({t.channel})</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Delay</label>
                            <div className="grid grid-cols-2 gap-2">
                              <input type="number" min={0} value={st.delayAmount} onChange={(e)=>updateStep(st.id, { delayAmount: Number(e.target.value)||0 })} className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm" />
                              <select value={st.delayUnit} onChange={(e)=>updateStep(st.id, { delayUnit: e.target.value as any })} className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm">
                                <option value="minutes">Minutos</option>
                                <option value="hours">Horas</option>
                                <option value="days">Dias</option>
                              </select>
                            </div>
                          </div>
                          <div className="flex items-end gap-2">
                            <Button variant="outline" size="sm" onClick={()=>moveStep(st.id, -1)} disabled={idx===0}>↑</Button>
                            <Button variant="outline" size="sm" onClick={()=>moveStep(st.id, 1)} disabled={idx===(form.steps!.length-1)}>↓</Button>
                            <Button variant="outline" size="sm" onClick={()=>removeStep(st.id)}>Remover</Button>
                          </div>
                          <div className="text-[11px] text-gray-500">Ordem: {idx+1}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button onClick={save} disabled={saving}>{saving ? 'Salvando…' : (editing ? 'Salvar alterações' : 'Criar sequência')}</Button>
                <Button variant="outline" onClick={()=>{ setEditing(null); startNew(); }}>Limpar</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
