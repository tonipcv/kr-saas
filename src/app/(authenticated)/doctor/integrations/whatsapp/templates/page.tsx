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
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

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

  // Delete selected template from WABA
  const deleteTemplate = async () => {
    if (!clinicId || !selected?.name) return;
    try {
      setDeleting(true);
      const res = await fetch('/api/integrations/whatsapp/templates', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId, name: selected.name, language: selected.language })
      });
      const j = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(j?.error || 'Falha ao excluir template');
      toast.success('Template excluído do WhatsApp');
      setDeleteOpen(false);
      await load();
    } catch (e:any) {
      toast.error(e?.message || 'Erro ao excluir template');
    } finally {
      setDeleting(false);
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
              <h1 className="text-lg font-semibold text-gray-900">WhatsApp templates</h1>
              <p className="text-xs text-gray-500">Templates do WABA conectado, com filtros e detalhes.</p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/doctor/integrations">
                <Button size="sm" variant="outline" className="rounded-lg">Voltar</Button>
              </Link>
              <Button size="sm" onClick={load} disabled={loading} className="rounded-lg">{loading ? 'Atualizando…' : 'Refresh'}</Button>
              <Button size="sm" onClick={() => setCreateOpen(true)} className="rounded-lg bg-black text-white hover:bg-black/90">Criar template</Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* Sidebar filters and list */}
            <div className="lg:col-span-1 bg-white border border-gray-200 rounded-xl p-3 space-y-3">
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nome" className="h-8 text-[13px]" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
                <select className="h-8 rounded-lg border px-2 text-[13px]" value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value)}>
                  <option value="">Status</option>
                  {statuses.map((s) => (<option key={s} value={s}>{s}</option>))}
                </select>
                <select className="h-8 rounded-lg border px-2 text-[13px]" value={categoryFilter} onChange={(e)=>setCategoryFilter(e.target.value)}>
                  <option value="">Categoria</option>
                  {categories.map((c) => (<option key={c} value={c}>{c}</option>))}
                </select>
                <select className="h-8 rounded-lg border px-2 text-[13px]" value={languageFilter} onChange={(e)=>setLanguageFilter(e.target.value)}>
                  <option value="">Idioma</option>
                  {languages.map((l) => (<option key={l} value={l}>{l}</option>))}
                </select>
              </div>
              <Separator />
              <div className="max-h-[60vh] overflow-auto divide-y rounded-lg border">
                {loading ? (
                  <div className="p-3 text-xs text-gray-600">Carregando…</div>
                ) : error ? (
                  <div className="p-3 text-xs text-red-600">{error}</div>
                ) : filtered.length === 0 ? (
                  <div className="p-3 text-xs text-gray-600">Nenhum template encontrado.</div>
                ) : (
                  filtered.map((t) => (
                    <button key={t.id} className={`w-full text-left p-2.5 text-[13px] hover:bg-gray-50 ${selected?.id===t.id?'bg-gray-50':''}`} onClick={()=>setSelected(t)}>
                      <div className="text-[13px] font-medium text-gray-900 truncate leading-5">{t.name}</div>
                      <div className="text-[11px] text-gray-500 truncate">{t.category} • {t.language}</div>
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
                  <div className="flex items-center gap-2">
                    <div>
                      <div className="text-[15px] font-semibold text-gray-900 leading-5">{selected.name}</div>
                      <div className="text-[11px] text-gray-500">{selected.category} • {selected.language}</div>
                    </div>
                    <div className="flex items-center gap-2 ml-auto">
                      <Button size="sm" variant="outline" className="rounded-lg" onClick={()=>setDeleteOpen(true)} disabled={deleting}>Excluir</Button>
                      {selected.quality_score?.score && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200 text-[10px]">
                          QS: {selected.quality_score.score}
                        </span>
                      )}
                      <span
                        className={
                          'inline-flex items-center px-2 py-0.5 rounded-full ring-1 ring-inset text-[10px] ' +
                          (selected.status === 'APPROVED' ? 'bg-green-50 text-green-700 ring-green-200' :
                           selected.status === 'PENDING' ? 'bg-amber-50 text-amber-700 ring-amber-200' :
                           'bg-gray-50 text-gray-700 ring-gray-200')
                        }
                      >
                        {selected.status}
                      </span>
                    </div>
                  </div>
                  <Separator />
                  {detailsLoading ? (
                    <p className="text-[11px] text-gray-600">Carregando componentes…</p>
                  ) : !details ? (
                    <p className="text-[11px] text-gray-600">Sem detalhes disponíveis.</p>
                  ) : (
                    // Visualização estilo WhatsApp
                    (() => {
                      const comps = Array.isArray(details.components) ? details.components : [];
                      const header = comps.find((c:any)=>c.type==='HEADER');
                      const body = comps.find((c:any)=>c.type==='BODY');
                      const footer = comps.find((c:any)=>c.type==='FOOTER');
                      const buttons = comps.find((c:any)=>c.type==='BUTTONS');

                      const renderWithVars = (text: string) => {
                        // Destacar variáveis {{1}}, {{2}} com "chips"
                        const parts: any[] = [];
                        const regex = /\{\{\d+\}\}/g;
                        let lastIndex = 0;
                        let match: RegExpExecArray | null;
                        while ((match = regex.exec(text))) {
                          if (match.index > lastIndex) {
                            parts.push(<span key={`t-${lastIndex}`}>{text.slice(lastIndex, match.index)}</span>);
                          }
                          parts.push(
                            <span key={`v-${match.index}`} className="inline-flex items-center px-1.5 py-0.5 text-[11px] bg-emerald-50 text-emerald-700 rounded border border-emerald-200">
                              {match[0]}
                            </span>
                          );
                          lastIndex = match.index + match[0].length;
                        }
                        if (lastIndex < text.length) parts.push(<span key={`t-end`}>{text.slice(lastIndex)}</span>);
                        return parts;
                      };

                      return (
                        <div className="w-full max-w-md mx-auto">
                          <div className="bg-[#e5ddd5] rounded-2xl p-4 border border-gray-200">
                            {/* Simulação da conversa */}
                            <div className="space-y-2">
                              {/* Balão da mensagem (template preview) */}
                              <div className="max-w-[85%] bg-white rounded-lg shadow p-3">
                                {header?.text ? (
                                  <div className="text-[11px] font-semibold text-emerald-700 mb-1">
                                    {header.text}
                                  </div>
                                ) : null}

                                {body?.text ? (
                                  <div className="text-[12px] text-gray-900 whitespace-pre-wrap leading-5">
                                    {renderWithVars(body.text)}
                                  </div>
                                ) : (
                                  <div className="text-[13px] text-gray-500 italic">Sem corpo (BODY)</div>
                                )}

                                {footer?.text ? (
                                  <div className="mt-2 text-[10px] text-gray-500">
                                    {footer.text}
                                  </div>
                                ) : null}
                              </div>

                              {/* Botões */}
                              {Array.isArray(buttons?.buttons) && buttons.buttons.length > 0 && (
                                <div className="max-w-[85%] flex flex-col gap-2 mt-1">
                                  {buttons.buttons.map((b:any, i:number) => (
                                    <button
                                      key={i}
                                      type="button"
                                      className={`w-full text-center rounded-md border text-[12px] py-2 ${b.type==='URL' ? 'bg-white border-emerald-300 text-emerald-700' : 'bg-white border-gray-300 text-gray-800'}`}
                                      disabled
                                    >
                                      {b.text || b.url || b.phone_number}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Meta-infos */}
                          <div className="mt-3 text-xs text-gray-500">
                            Visualização aproximada do WhatsApp. Elementos interativos estão desativados.
                          </div>
                        </div>
                      );
                    })()
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
                <Button onClick={createTemplate} disabled={creating} className="bg-black text-white hover:bg-black/90">{creating ? 'Enviando…' : 'Criar'}</Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Delete Confirmation Modal */}
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogContent className="sm:max-w-[420px]">
              <DialogHeader>
                <DialogTitle>Excluir template</DialogTitle>
                <DialogDescription>
                  Esta ação removerá o template "{selected?.name}" do WhatsApp. Não é possível desfazer.
                </DialogDescription>
              </DialogHeader>
              <div className="text-sm text-gray-600">
                Confirme para prosseguir com a exclusão.
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={()=>setDeleteOpen(false)}>Cancelar</Button>
                <Button size="sm" onClick={deleteTemplate} disabled={deleting} className="bg-black text-white hover:bg-black/90">{deleting ? 'Excluindo…' : 'Excluir'}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
