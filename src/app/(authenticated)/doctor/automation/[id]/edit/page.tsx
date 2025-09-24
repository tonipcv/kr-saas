"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function EditAutomationPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id as string;

  type Channel = 'email'|'whatsapp'|'sms';
  type SendTemplate = { id: string; type: 'send_template'; templateId: string };
  type RunSequence = { id: string; type: 'run_sequence'; sequenceId: string };
  type WaitAction = { id: string; type: 'wait'; amount: number; unit: 'minutes'|'hours'|'days' };
  type ActionItem = SendTemplate | RunSequence | WaitAction;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string|null>(null);

  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState("customer_inactive_days");
  const [triggerDays, setTriggerDays] = useState<number>(30);
  const [actions, setActions] = useState<ActionItem[]>([]);
  // Lists for selection
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; channel: Channel }>>([]);
  const [sequences, setSequences] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingLists, setLoadingLists] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    async function loadLists() {
      try {
        setLoadingLists(true);
        const [tplRes, seqRes] = await Promise.all([
          fetch(`/api/v2/doctor/message-templates?limit=200`, { cache: 'no-store' }),
          fetch(`/api/v2/doctor/message-sequences?limit=200`, { cache: 'no-store' }),
        ]);
        const tplJson = await tplRes.json().catch(()=>({}));
        const seqJson = await seqRes.json().catch(()=>({}));
        if (!active) return;
        setTemplates(Array.isArray(tplJson?.data) ? tplJson.data.map((t:any)=>({ id: t.id, name: t.name, channel: t.channel as Channel })) : []);
        setSequences(Array.isArray(seqJson?.data) ? seqJson.data.map((s:any)=>({ id: s.id, name: s.name })) : []);
      } catch (_e) {
        if (active) { setTemplates([]); setSequences([]); }
      } finally {
        if (active) setLoadingLists(false);
      }
    }
    loadLists();
    return () => { active = false };
  }, []);

  // Load existing automation
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/v2/doctor/automations/${encodeURIComponent(id)}`, { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        if (!active) return;
        if (!res.ok) { setError(json?.error || `HTTP ${res.status}`); setLoading(false); return; }
        const a = json?.data || {};
        setName(a?.name || '');
        setTriggerType(a?.trigger_type || 'customer_inactive_days');
        const tc = a?.trigger_config || {};
        if (a?.trigger_type === 'customer_inactive_days' && typeof tc?.days === 'number') setTriggerDays(tc.days);
        const toLocal = (it: any): ActionItem => {
          if (it?.type === 'send_template') return { id: Math.random().toString(36).slice(2), type: 'send_template', templateId: String(it?.templateId || '') };
          if (it?.type === 'run_sequence') return { id: Math.random().toString(36).slice(2), type: 'run_sequence', sequenceId: String(it?.sequenceId || '') };
          if (it?.type === 'wait') return { id: Math.random().toString(36).slice(2), type: 'wait', amount: Number(it?.amount)||1, unit: (it?.unit||'days') } as WaitAction;
          // Legacy mapping
          if (it?.type === 'send_campaign' || it?.type === 'send_message') return { id: Math.random().toString(36).slice(2), type: 'send_template', templateId: '' };
          return { id: Math.random().toString(36).slice(2), type: 'send_template', templateId: '' };
        };
        if (a?.action_type === 'multi' && Array.isArray(a?.action_config?.actions)) {
          const arr = a.action_config.actions.map((it: any) => toLocal(it));
          setActions(arr);
        } else {
          // single action fallback
          const single = toLocal(a?.action_config || {});
          setActions([single]);
        }
      } catch (e: any) {
        if (active) setError(e?.message || 'Erro inesperado');
      } finally {
        if (active) setLoading(false);
      }
    }
    if (id) load();
    return () => { active = false };
  }, [id]);

  const isValid = useMemo(() => {
    return actions.every(a => {
      if (a.type === 'send_template') return !!a.templateId;
      if (a.type === 'run_sequence') return !!a.sequenceId;
      if (a.type === 'wait') return a.amount > 0 && ['minutes','hours','days'].includes(a.unit);
      return false;
    });
  }, [actions]);

  const addAction = () => setActions(prev => [...prev, { id: Math.random().toString(36).slice(2), type: 'send_template', templateId: '' } as ActionItem]);
  const removeAction = (aid: string) => setActions(prev => prev.filter(a => a.id !== aid));
  const updateAction = (aid: string, patch: Partial<ActionItem>) => setActions(prev => prev.map(a => a.id === aid ? { ...a, ...patch } : a));

  const save = async () => {
    try {
      setSaving(true);
      setError(null);
      const payload: any = {
        name: name || `Automation edit ${new Date().toLocaleString('pt-BR')}`,
        trigger_type: triggerType,
        trigger_config: triggerType === 'customer_inactive_days' ? { days: Number(triggerDays)||30 } : {},
        actions: actions.map(a => {
          if (a.type === 'send_template') return { type: 'send_template', templateId: a.templateId };
          if (a.type === 'run_sequence') return { type: 'run_sequence', sequenceId: a.sequenceId };
          if (a.type === 'wait') return { type: 'wait', amount: a.amount, unit: a.unit };
          return a;
        }),
      };
      const res = await fetch(`/api/v2/doctor/automations/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json?.error || `HTTP ${res.status}`); setSaving(false); return; }
      router.push('/doctor/automation');
    } catch (e: any) {
      setError(e?.message || 'Erro inesperado');
      setSaving(false);
    }
  };

  const firstActionLabel = useMemo(() => {
    const a = actions[0];
    if (!a) return '—';
    if (a.type === 'send_template') {
      const t = templates.find(x => x.id === a.templateId);
      return t ? `template ${t.name} (${t.channel})` : 'template —';
    }
    if (a.type === 'run_sequence') {
      const s = sequences.find(x => x.id === a.sequenceId);
      return s ? `sequência ${s.name}` : 'sequência —';
    }
    if (a.type === 'wait') return `aguardar ${a.amount} ${a.unit}`;
    return '—';
  }, [actions, templates, sequences]);

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24 bg-gray-50 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">Editar automação</h1>
              <p className="text-xs text-gray-500">Ajuste trigger e múltiplas ações</p>
            </div>
            <div className="flex gap-2">
              <Link href="/doctor/automation"><Button variant="outline" size="sm">Voltar</Button></Link>
            </div>
          </div>

          <Card className="bg-white border border-gray-200 shadow-sm rounded-2xl">
            <CardHeader className="px-4 py-3 border-b border-gray-100">
              <CardTitle className="text-sm font-semibold text-gray-900">Configuração</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-3 space-y-4 text-sm">
              {loading && <p className="text-sm text-gray-500">Carregando…</p>}
              {error && <p className="text-[12px] text-red-600">{error}</p>}

              {!loading && (
                <>
                  <div className="grid md:grid-cols-2 gap-3 items-end">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Nome</label>
                      <input value={name} onChange={(e) => setName(e.target.value)} className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm" placeholder="Ex.: Reengajar clientes inativos 30d" />
                    </div>
                    <div />
                  </div>

                  <div className="grid md:grid-cols-3 gap-3 items-end">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Trigger</label>
                      <select value={triggerType} onChange={(e)=>setTriggerType(e.target.value)} className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm">
                        <option value="customer_inactive_days">Cliente inativo há X dias</option>
                        <option value="customer_birthday">Aniversário do cliente (dia)</option>
                        <option value="purchase_made">Compra realizada</option>
                      </select>
                    </div>
                    {triggerType === 'customer_inactive_days' && (
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Dias</label>
                        <input type="number" min={1} value={triggerDays} onChange={(e)=>setTriggerDays(Number(e.target.value)||1)} className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm" />
                      </div>
                    )}
                    <div />
                  </div>

                  {/* Actions builder */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium text-gray-900">Ações</div>
                      <Button variant="outline" size="sm" onClick={addAction}>Adicionar ação</Button>
                    </div>
                    <div className="space-y-2">
                      {actions.map((a, idx) => (
                        <div key={a.id} className="space-y-2 p-2 border border-gray-200 rounded-lg">
                          <div className="grid md:grid-cols-4 gap-2 items-end">
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Tipo</label>
                              <select
                                value={a.type}
                                onChange={(e)=>{
                                  const v = e.target.value as 'send_template'|'run_sequence'|'wait';
                                  if (v === 'send_template') updateAction(a.id, { type: 'send_template', templateId: '' } as any);
                                  if (v === 'run_sequence') updateAction(a.id, { type: 'run_sequence', sequenceId: '' } as any);
                                  if (v === 'wait') updateAction(a.id, { type: 'wait', amount: 1, unit: 'days' } as any);
                                }}
                                className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm"
                              >
                                <option value="send_template">Enviar template</option>
                                <option value="run_sequence">Executar sequência</option>
                                <option value="wait">Aguardar período</option>
                              </select>
                            </div>
                            {a.type === 'send_template' && (
                              <div>
                                <div className="flex items-center justify-between">
                                  <label className="block text-xs text-gray-600 mb-1">Template</label>
                                  <div className="flex items-center gap-2">
                                    <Link href="/doctor/message-templates" className="text-[11px] text-blue-600 hover:underline">Gerenciar templates</Link>
                                  </div>
                                </div>
                                <select value={(a as SendTemplate).templateId} onChange={(e)=>updateAction(a.id, { templateId: e.target.value } as any)} className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm">
                                  <option value="">Selecione um template</option>
                                  {templates.map(t => (<option key={t.id} value={t.id}>{t.name} ({t.channel})</option>))}
                                </select>
                              </div>
                            )}
                            {a.type === 'run_sequence' && (
                              <div>
                                <div className="flex items-center justify-between">
                                  <label className="block text-xs text-gray-600 mb-1">Sequência</label>
                                  <Link href="/doctor/message-sequences" className="text-[11px] text-blue-600 hover:underline">Gerenciar sequências</Link>
                                </div>
                                <select value={(a as RunSequence).sequenceId} onChange={(e)=>updateAction(a.id, { sequenceId: e.target.value } as any)} className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm">
                                  <option value="">Selecione uma sequência</option>
                                  {sequences.map(s => (<option key={s.id} value={s.id}>{s.name}</option>))}
                                </select>
                              </div>
                            )}
                            {a.type === 'wait' && (
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-xs text-gray-600 mb-1">Quantidade</label>
                                  <input type="number" min={1} value={(a as WaitAction).amount} onChange={(e)=>updateAction(a.id, { amount: Number(e.target.value)||1 } as any)} className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm" />
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-600 mb-1">Unidade</label>
                                  <select value={(a as WaitAction).unit} onChange={(e)=>updateAction(a.id, { unit: e.target.value as any } as any)} className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm">
                                    <option value="minutes">Minutos</option>
                                    <option value="hours">Horas</option>
                                    <option value="days">Dias</option>
                                  </select>
                                </div>
                              </div>
                            )}
                            <div className="md:col-span-1 flex items-end justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={() => removeAction(a.id)} disabled={actions.length <= 1}>Remover</Button>
                              <div className="text-[11px] text-gray-500">{idx===0 ? 'Executa primeiro' : `Execução #${idx+1}`}</div>
                            </div>
                          </div>
                          {/* No extra editors; template/sequence selection above covers content */}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Preview */}
                  <div className="text-[13px] text-gray-800 bg-gray-50 border border-gray-200 rounded-md p-3">
                    <div className="text-[11px] text-gray-500 mb-1">Automação</div>
                    <div>
                      Quando o cliente ficar {triggerType === 'customer_inactive_days' ? (<>
                        <strong>{triggerDays || 0} dias inativo</strong>
                      </>) : triggerType === 'customer_birthday' ? (
                        <strong>de aniversário</strong>
                      ) : (
                        <strong>com uma compra</strong>
                      )}, então {actions.length <= 1 ? (
                        <> <strong>executar</strong> {firstActionLabel}.</>
                      ) : (
                        <>
                          executar múltiplas ações:
                          <ul className="list-disc pl-5">
                            {actions.map((a, i) => {
                              if (a.type === 'send_template') {
                                const t = templates.find(t => t.id === a.templateId);
                                return (<li key={a.id}>Enviar template <strong>{t?.name || '—'}</strong> ({t?.channel || '—'}) (passo {i+1})</li>);
                              }
                              if (a.type === 'run_sequence') {
                                const s = sequences.find(s => s.id === a.sequenceId);
                                return (<li key={a.id}>Executar sequência <strong>{s?.name || '—'}</strong> (passo {i+1})</li>);
                              }
                              return (<li key={a.id}>Aguardar <strong>{a.amount}</strong> {a.unit} (passo {i+1})</li>);
                            })}
                          </ul>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button onClick={save} disabled={saving || !isValid}>{saving ? 'Salvando…' : 'Salvar alterações'}</Button>
                    <Link href="/doctor/automation"><Button variant="outline">Cancelar</Button></Link>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
