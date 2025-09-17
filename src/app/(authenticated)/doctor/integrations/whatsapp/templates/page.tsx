'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useClinic } from '@/contexts/clinic-context';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { toast } from 'react-hot-toast';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function WhatsAppTemplatesPage() {
  const { currentClinic } = useClinic();
  const clinicId = currentClinic?.id;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [languageFilter, setLanguageFilter] = useState<string>('');
  const [selected, setSelected] = useState<any | null>(null);
  const [details, setDetails] = useState<any | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Create Template modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('MARKETING');
  const [newLanguage, setNewLanguage] = useState('pt_BR');
  const [newBody, setNewBody] = useState('Olá {{1}}, tudo bem?');
  const [newFooter, setNewFooter] = useState('');
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((t) => (
      (!q || (t.name?.toLowerCase?.().includes(q))) &&
      (!statusFilter || t.status === statusFilter) &&
      (!categoryFilter || t.category === categoryFilter) &&
      (!languageFilter || t.language === languageFilter)
    ));
  }, [templates, query, statusFilter, categoryFilter, languageFilter]);

  const load = async () => {
    if (!clinicId) return;
    try {
      setLoading(true);
      setError(null);
      setTemplates([]);
      setSelected(null);
      const res = await fetch(`/api/integrations/whatsapp/templates?clinicId=${encodeURIComponent(clinicId)}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Falha ao carregar templates');
      const list = Array.isArray(data?.data?.data) ? data.data.data : [];
      setTemplates(list);
      setSelected(list[0] || null);
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar templates');
      toast.error(e.message || 'Erro ao carregar templates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [clinicId]);

  // Load components when selection changes
  useEffect(() => {
    const fetchDetails = async () => {
      if (!clinicId || !selected?.name) { setDetails(null); return; }
      try {
        setDetailsLoading(true);
        const res = await fetch(`/api/integrations/whatsapp/templates/components?clinicId=${encodeURIComponent(clinicId)}&name=${encodeURIComponent(selected.name)}`, { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Falha ao carregar componentes');
        setDetails(data?.data || null);
      } catch (e: any) {
        setDetails(null);
        toast.error(e.message || 'Erro ao carregar componentes');
      } finally {
        setDetailsLoading(false);
      }
    };
    fetchDetails();
  }, [clinicId, selected?.name]);

  const createTemplate = async () => {
    if (!clinicId) return;
    if (!newName.trim() || !newBody.trim()) {
      toast.error('Informe nome e corpo (BODY)');
      return;
    }
    try {
      setCreating(true);
      const components: any[] = [ { type: 'BODY', text: newBody } ];
      if (newFooter.trim()) components.push({ type: 'FOOTER', text: newFooter.trim() });
      const res = await fetch('/api/integrations/whatsapp/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId, name: newName.trim(), category: newCategory, language: newLanguage, components })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Falha ao criar template');
      toast.success('Template enviado para aprovação');
      setCreateOpen(false);
      setNewName(''); setNewBody('Olá {{1}}, tudo bem?'); setNewFooter('');
      await load();
      // focus on created template
      const createdName = data?.data?.name || newName.trim();
      const found = templates.find(t => t.name === createdName);
      if (found) setSelected(found);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao criar template');
    } finally {
      setCreating(false);
    }
  };

  const statuses = useMemo(() => Array.from(new Set(templates.map((t:any) => t.status).filter(Boolean))), [templates]);
  const categories = useMemo(() => Array.from(new Set(templates.map((t:any) => t.category).filter(Boolean))), [templates]);
  const languages = useMemo(() => Array.from(new Set(templates.map((t:any) => t.language).filter(Boolean))), [templates]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">WhatsApp templates</h1>
              <p className="text-sm text-gray-500">Templates do WABA conectado, com filtros e detalhes.</p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/doctor/integrations">
                <Button variant="outline" className="rounded-lg">Voltar</Button>
              </Link>
              <Button onClick={load} disabled={loading} className="rounded-lg">{loading ? 'Atualizando…' : 'Refresh'}</Button>
              <Button onClick={() => setCreateOpen(true)} className="rounded-lg bg-gradient-to-r from-[#5893ec] to-[#9bcef7] text-white">Criar template</Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* Sidebar filters and list */}
            <div className="lg:col-span-1 bg-white border border-gray-200 rounded-xl p-3 space-y-3">
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nome" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
                <select className="h-9 rounded-lg border px-2" value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value)}>
                  <option value="">Status</option>
                  {statuses.map((s) => (<option key={s} value={s}>{s}</option>))}
                </select>
                <select className="h-9 rounded-lg border px-2" value={categoryFilter} onChange={(e)=>setCategoryFilter(e.target.value)}>
                  <option value="">Categoria</option>
                  {categories.map((c) => (<option key={c} value={c}>{c}</option>))}
                </select>
                <select className="h-9 rounded-lg border px-2" value={languageFilter} onChange={(e)=>setLanguageFilter(e.target.value)}>
                  <option value="">Idioma</option>
                  {languages.map((l) => (<option key={l} value={l}>{l}</option>))}
                </select>
              </div>
              <Separator />
              <div className="max-h-[60vh] overflow-auto divide-y rounded-lg border">
                {loading ? (
                  <div className="p-3 text-sm text-gray-600">Carregando…</div>
                ) : error ? (
                  <div className="p-3 text-sm text-red-600">{error}</div>
                ) : filtered.length === 0 ? (
                  <div className="p-3 text-sm text-gray-600">Nenhum template encontrado.</div>
                ) : (
                  filtered.map((t) => (
                    <button key={t.id} className={`w-full text-left p-3 text-sm hover:bg-gray-50 ${selected?.id===t.id?'bg-gray-50':''}`} onClick={()=>setSelected(t)}>
                      <div className="font-medium text-gray-900 truncate">{t.name}</div>
                      <div className="text-xs text-gray-500 truncate">{t.category} • {t.language}</div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Detail */}
            <div className="lg:col-span-3 bg-white border border-gray-200 rounded-xl p-4">
              {!selected ? (
                <p className="text-sm text-gray-600">Selecione um template para ver detalhes.</p>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-lg font-semibold text-gray-900">{selected.name}</div>
                      <div className="text-xs text-gray-500">{selected.category} • {selected.language}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {selected.quality_score?.score && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200 text-xs">
                          QS: {selected.quality_score.score}
                        </span>
                      )}
                      <span className={
                        'inline-flex items-center px-2 py-0.5 rounded-full ring-1 ring-inset text-xs ' +
                        (selected.status === 'APPROVED' ? 'bg-green-50 text-green-700 ring-green-200' :
                         selected.status === 'PENDING' ? 'bg-amber-50 text-amber-700 ring-amber-200' :
                         'bg-gray-50 text-gray-700 ring-gray-200')
                      }>
                        {selected.status}
                      </span>
                    </div>
                  </div>
                  <Separator />
                  {detailsLoading ? (
                    <p className="text-sm text-gray-600">Carregando componentes…</p>
                  ) : !details ? (
                    <p className="text-sm text-gray-600">Sem detalhes disponíveis.</p>
                  ) : (
                    <div className="space-y-3">
                      {(details.components || []).map((c: any, idx: number) => (
                        <div key={idx} className="rounded-md border p-3">
                          <div className="text-xs uppercase text-gray-500 mb-1">{c.type}</div>
                          {c.type === 'BODY' && (
                            <pre className="whitespace-pre-wrap text-sm text-gray-900">{c.text}</pre>
                          )}
                          {c.type === 'FOOTER' && (
                            <div className="text-sm text-gray-700">{c.text}</div>
                          )}
                          {c.type === 'HEADER' && (
                            <div className="text-sm text-gray-700">{c.format || 'TEXT'} {c.text ? `— ${c.text}` : ''}</div>
                          )}
                          {c.type === 'BUTTONS' && (
                            <ul className="list-disc pl-5 text-sm text-gray-800">
                              {(c.buttons || []).map((b: any, i: number) => (
                                <li key={i}>{b.type}: {b.text || b.url || b.phone_number}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <Separator />
                  <div className="grid grid-cols-4 gap-3 text-center">
                    <div>
                      <div className="text-xs text-gray-500">Enviadas</div>
                      <div className="text-lg font-semibold">—</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Entregues</div>
                      <div className="text-lg font-semibold">—</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Lidas</div>
                      <div className="text-lg font-semibold">—</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Taxa de abertura</div>
                      <div className="text-lg font-semibold">—</div>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">Ative webhooks para ver métricas reais.</p>
                </div>
              )}
            </div>
          </div>
          {/* Create Template Modal */}
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogContent className="sm:max-w-[640px]">
              <DialogHeader>
                <DialogTitle>Criar template</DialogTitle>
                <DialogDescription>Envie um novo template para aprovação no WABA conectado.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <Input value={newName} onChange={(e)=>setNewName(e.target.value)} placeholder="Nome (ex: boas_vindas)" />
                  <select className="h-9 rounded-lg border px-2" value={newCategory} onChange={(e)=>setNewCategory(e.target.value)}>
                    {['MARKETING','UTILITY','AUTHENTICATION'].map(c => (<option key={c} value={c}>{c}</option>))}
                  </select>
                  <Input value={newLanguage} onChange={(e)=>setNewLanguage(e.target.value)} placeholder="Idioma (ex: pt_BR)" />
                </div>
                <div>
                  <div className="text-sm text-gray-700 mb-1">Corpo (BODY)</div>
                  <textarea className="w-full border rounded-lg p-2 text-sm" rows={5} value={newBody} onChange={(e)=>setNewBody(e.target.value)} />
                  <p className="text-xs text-gray-500 mt-1">Use variáveis {"{{1}}"}, {"{{2}}"}… para parâmetros.</p>
                </div>
                <div>
                  <div className="text-sm text-gray-700 mb-1">Rodapé (FOOTER) — opcional</div>
                  <Input value={newFooter} onChange={(e)=>setNewFooter(e.target.value)} placeholder="Texto do rodapé" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={()=>setCreateOpen(false)}>Cancelar</Button>
                <Button onClick={createTemplate} disabled={creating} className="bg-gradient-to-r from-[#5893ec] to-[#9bcef7] text-white">{creating ? 'Enviando…' : 'Criar'}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
