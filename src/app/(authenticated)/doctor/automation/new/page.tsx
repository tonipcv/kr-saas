"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function NewAutomationPage() {
  const router = useRouter();

  // Form state
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<'email'|'whatsapp'|'sms'>("email");
  const [triggerType, setTriggerType] = useState("customer_inactive_days");
  const [triggerDays, setTriggerDays] = useState(30);
  // Multi-actions state
  type EmailMsg = { subject: string; html: string; text?: string };
  type WhatsAppMsg = { text: string; template?: string|null; templateVariables?: Record<string,string>|null };
  type SmsMsg = { text: string };
  type SendCampaign = { id: string; type: 'send_campaign'; channel: 'email'|'whatsapp'|'sms'; campaignId: string; overrides?: { email?: EmailMsg; whatsapp?: WhatsAppMsg; sms?: SmsMsg } };
  type WaitAction = { id: string; type: 'wait'; amount: number; unit: 'minutes'|'hours'|'days' };
  type ActionItem = SendCampaign | WaitAction;
  const [actions, setActions] = useState<ActionItem[]>([{
    id: Math.random().toString(36).slice(2),
    type: 'send_campaign',
    channel: 'email',
    campaignId: '',
    overrides: { email: { subject: '', html: '', text: '' } }
  }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string|null>(null);

  // Campaign dropdown
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name?: string; channel?: string }>>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState<boolean>(false);
  const selectedCampaign = useMemo(() => {
    // For preview we use first action's campaign
    const first = actions[0];
    if (!first || first.type !== 'send_campaign') return undefined;
    return campaigns.find(c => c.id === first.campaignId);
  }, [campaigns, actions]);

  useEffect(() => {
    let active = true;
    async function loadCampaigns() {
      try {
        setLoadingCampaigns(true);
        const res = await fetch(`/api/v2/doctor/campaigns?status=PUBLISHED&limit=100`, { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        if (!active) return;
        const list = Array.isArray(json?.data) ? json.data : [];
        const mapped = list.map((c: any) => ({ id: c?.id, name: c?.name || c?.title, channel: c?.channel || c?.defaultChannel }));
        setCampaigns(mapped);
      } catch (_e) {
        if (active) setCampaigns([]);
      } finally {
        if (active) setLoadingCampaigns(false);
      }
    }
    loadCampaigns();
    return () => { active = false };
  }, []);

  const createAutomation = async () => {
    try {
      setSubmitting(true);
      setError(null);
      const payload: any = {
        name: name || `Automation ${new Date().toLocaleString('pt-BR')}`,
        trigger_type: triggerType,
        trigger_config: triggerType === 'customer_inactive_days' ? { days: Number(triggerDays)||30 } : {},
        // Map actions; include overrides when present
        actions: actions.map(a => (
          a.type === 'send_campaign'
            ? (() => {
                const base: any = { type: 'send_campaign', channel: a.channel, campaignId: a.campaignId };
                const ov = (a as SendCampaign).overrides || {};
                const overrides: any = {};
                if (a.channel === 'email' && ov.email) overrides.email = { subject: ov.email.subject || '', html: ov.email.html || '', ...(ov.email.text ? { text: ov.email.text } : {}) };
                if (a.channel === 'whatsapp' && ov.whatsapp) overrides.whatsapp = { text: ov.whatsapp.text || '', template: ov.whatsapp.template ?? null, templateVariables: ov.whatsapp.templateVariables ?? null };
                if (a.channel === 'sms' && ov.sms) overrides.sms = { text: ov.sms.text || '' };
                if (Object.keys(overrides).length > 0) base.overrides = overrides;
                return base;
              })()
            : { type: 'wait', amount: (a as WaitAction).amount, unit: (a as WaitAction).unit }
        )),
      };
      const res = await fetch('/api/v2/doctor/automations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json?.error || `HTTP ${res.status}`); setSubmitting(false); return; }
      router.push('/doctor/automation');
    } catch (e: any) {
      setError(e?.message || 'Erro inesperado');
      setSubmitting(false);
    }
  };

  const addAction = () => {
    const newAction: SendCampaign = { id: Math.random().toString(36).slice(2), type: 'send_campaign', channel: 'email', campaignId: '', overrides: { email: { subject: '', html: '', text: '' } } };
    setActions(prev => [...prev, newAction]);
  };
  const removeAction = (id: string) => {
    setActions(prev => prev.filter(a => a.id !== id));
  };
  const updateAction = (id: string, patch: Partial<ActionItem>) => {
    setActions(prev => prev.map(a => a.id === id ? ({ ...a, ...patch } as ActionItem) : a));
  };

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24 bg-gray-50 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">Nova automação</h1>
              <p className="text-xs text-gray-500">Defina a condição (WHEN) e a ação (THEN)</p>
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
              {error && <p className="text-[12px] text-red-600">{error}</p>}

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
                    <div key={a.id} className="grid md:grid-cols-4 gap-2 items-end p-2 border border-gray-200 rounded-lg">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Tipo</label>
                        <select
                          value={a.type}
                          onChange={(e)=> {
                            const v = e.target.value as 'send_campaign'|'wait';
                            if (v === 'send_campaign') {
                              updateAction(a.id, { type: 'send_campaign', ...(a as any).channel ? {} : { channel: 'email' }, ...(a as any).campaignId ? {} : { campaignId: '' } });
                            } else {
                              updateAction(a.id, { type: 'wait', amount: 1, unit: 'days' } as any);
                            }
                          }}
                          className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm"
                        >
                          <option value="send_campaign">Enviar campanha</option>
                          <option value="wait">Aguardar período</option>
                        </select>
                      </div>
                      {a.type === 'send_campaign' ? (
                        <>
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Canal</label>
                            <select value={a.channel} onChange={(e)=>{
                              const ch = e.target.value as 'email'|'whatsapp'|'sms';
                              const patch: Partial<ActionItem> = { channel: ch } as any;
                              // ensure overrides object exists for the new channel
                              const current = a as SendCampaign;
                              const ov = current.overrides || {};
                              if (ch === 'email' && !ov.email) (patch as any).overrides = { ...ov, email: { subject: '', html: '', text: '' } };
                              if (ch === 'whatsapp' && !ov.whatsapp) (patch as any).overrides = { ...ov, whatsapp: { text: '', template: null, templateVariables: null } };
                              if (ch === 'sms' && !ov.sms) (patch as any).overrides = { ...ov, sms: { text: '' } };
                              updateAction(a.id, patch);
                            }} className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm">
                              <option value="email">Email</option>
                              <option value="whatsapp">WhatsApp</option>
                              <option value="sms">SMS</option>
                            </select>
                          </div>
                          <div className="md:col-span-2">
                            <div className="flex items-center justify-between">
                              <label className="block text-xs text-gray-600 mb-1">Campanha</label>
                              <Link href="/doctor/campaigns" className="text-[11px] text-blue-600 hover:underline">Gerenciar campanhas</Link>
                            </div>
                            <select
                              value={a.campaignId}
                              onChange={(e)=>updateAction(a.id, { campaignId: e.target.value })}
                              className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm"
                              disabled={loadingCampaigns}
                            >
                              <option value="">{loadingCampaigns ? 'Carregando…' : 'Selecione uma campanha'}</option>
                              {campaigns.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name || c.id}{c.channel ? ` (${String(c.channel).charAt(0).toUpperCase()}${String(c.channel).slice(1)})` : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                          {/* Overrides editor */}
                          <div className="md:col-span-4 space-y-2">
                            <div className="text-[11px] text-gray-500">Mensagem da campanha será usada como base. Você pode sobrescrever por canal (opcional).</div>
                            {a.channel === 'email' && (
                              <div className="grid md:grid-cols-3 gap-2">
                                <div>
                                  <label className="block text-xs text-gray-600 mb-1">Assunto (override)</label>
                                  <input value={(a as SendCampaign).overrides?.email?.subject || ''} onChange={(e)=> updateAction(a.id, { overrides: { email: { subject: e.target.value } } } as any)} className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm" />
                                </div>
                                <div className="md:col-span-2">
                                  <label className="block text-xs text-gray-600 mb-1">Corpo (HTML) (override)</label>
                                  <textarea value={(a as SendCampaign).overrides?.email?.html || ''} onChange={(e)=> updateAction(a.id, { overrides: { email: { html: e.target.value } } } as any)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" rows={4} />
                                </div>
                                <div className="md:col-span-3">
                                  <label className="block text-xs text-gray-600 mb-1">Texto (opcional) (override)</label>
                                  <textarea value={(a as SendCampaign).overrides?.email?.text || ''} onChange={(e)=> updateAction(a.id, { overrides: { email: { text: e.target.value } } } as any)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" rows={2} />
                                </div>
                              </div>
                            )}
                            {a.channel === 'whatsapp' && (
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">Mensagem (override)</label>
                                <textarea value={(a as SendCampaign).overrides?.whatsapp?.text || ''} onChange={(e)=> updateAction(a.id, { overrides: { whatsapp: { text: e.target.value } } } as any)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" rows={3} />
                              </div>
                            )}
                            {a.channel === 'sms' && (
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">Mensagem (override) (160 caracteres)</label>
                                <textarea maxLength={320} value={(a as SendCampaign).overrides?.sms?.text || ''} onChange={(e)=> updateAction(a.id, { overrides: { sms: { text: e.target.value } } } as any)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" rows={2} />
                                <div className="text-[11px] text-gray-500 mt-1">{((a as SendCampaign).overrides?.sms?.text || '').length} / 320</div>
                              </div>
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Quantidade</label>
                            <input type="number" min={1} value={a.amount} onChange={(e)=>updateAction(a.id, { amount: Number(e.target.value)||1 } as any)} className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Unidade</label>
                            <select value={a.unit} onChange={(e)=>updateAction(a.id, { unit: e.target.value as any } as any)} className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm">
                              <option value="minutes">Minutos</option>
                              <option value="hours">Horas</option>
                              <option value="days">Dias</option>
                            </select>
                          </div>
                          <div className="md:col-span-1" />
                        </>
                      )}
                      <div className="flex items-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => removeAction(a.id)} disabled={actions.length <= 1}>Remover</Button>
                        <div className="text-[11px] text-gray-500">{idx===0 ? 'Executa primeiro' : `Execução #${idx+1}`}</div>
                      </div>
                    </div>
                  ))}
              </div>
              </div>

              {/* Natural language preview */}
              <div className="text-[13px] text-gray-800 bg-gray-50 border border-gray-200 rounded-md p-3">
                <div className="text-[11px] text-gray-500 mb-1">Automação</div>
                <div>
                  Quando o cliente ficar {triggerType === 'customer_inactive_days' ? (<>
                    <strong>{triggerDays || 0} dias inativo</strong>
                  </>) : triggerType === 'customer_birthday' ? (
                    <strong>de aniversário</strong>
                  ) : (
                    <strong>com uma compra</strong>
                  )}, então {actions.length === 1 ? (
                    (actions[0].type === 'send_campaign') ? (
                      <> <strong>enviar</strong> a campanha {selectedCampaign?.name ? (<strong>{selectedCampaign.name}</strong>) : (<strong>{(actions[0] as any)?.campaignId || '—'}</strong>)} por <strong>{(actions[0] as any)?.channel === 'email' ? 'Email' : (actions[0] as any)?.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}</strong>.</>
                    ) : (
                      <> <strong>aguardar</strong> {(actions[0] as any).amount} {(actions[0] as any).unit === 'minutes' ? 'minutos' : (actions[0] as any).unit === 'hours' ? 'horas' : 'dias'}.</>
                    )
                  ) : (
                    <>
                      executar múltiplas ações:
                      <ul className="list-disc pl-5">
                        {actions.map((a, i) => {
                          if (a.type === 'send_campaign') {
                            const c = campaigns.find(cmp => cmp.id === a.campaignId);
                            return (
                              <li key={a.id}>
                                Enviar campanha <strong>{c?.name || a.campaignId || '—'}</strong> por <strong>{a.channel === 'email' ? 'Email' : a.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}</strong> (passo {i+1})
                              </li>
                            );
                          }
                          return (
                            <li key={a.id}>
                              Aguardar <strong>{a.amount}</strong> {(a.unit === 'minutes' ? 'minutos' : a.unit === 'hours' ? 'horas' : 'dias')} (passo {i+1})
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button onClick={createAutomation} disabled={actions.some(a => (a.type === 'send_campaign' && !(a.campaignId))) || submitting}>{submitting ? 'Salvando…' : 'Salvar automação'}</Button>
                <Link href="/doctor/automation"><Button variant="outline">Cancelar</Button></Link>
              </div>
              <p className="text-[11px] text-gray-500">MVP: a automação criará tarefas em lote para clientes que atenderem à trigger e executará a ação definida.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
