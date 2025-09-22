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
  type ActionItem = { id: string; type: 'send_campaign'; channel: Channel; campaignId: string };

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string|null>(null);

  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState("customer_inactive_days");
  const [triggerDays, setTriggerDays] = useState<number>(30);
  const [actions, setActions] = useState<ActionItem[]>([]);

  // Campaign list for dropdowns
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name?: string; channel?: string }>>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    async function loadCampaigns() {
      try {
        setLoadingCampaigns(true);
        const res = await fetch(`/api/v2/doctor/campaigns?status=PUBLISHED&limit=100`, { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        if (!active) return;
        const list = Array.isArray(json?.data) ? json.data : [];
        const mapped = list.map((c: any) => ({ id: c?.id, name: c?.title || c?.name, channel: c?.channel || c?.defaultChannel }));
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
        if (a?.action_type === 'multi' && Array.isArray(a?.action_config?.actions)) {
          const arr = a.action_config.actions.map((it: any) => ({ id: Math.random().toString(36).slice(2), type: 'send_campaign', channel: (it?.channel || 'email') as Channel, campaignId: String(it?.campaignId || '') }));
          setActions(arr);
        } else {
          // single action fallback
          const single = { id: Math.random().toString(36).slice(2), type: 'send_campaign', channel: 'email' as Channel, campaignId: String(a?.action_config?.campaignId || '') };
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

  const addAction = () => setActions(prev => [...prev, { id: Math.random().toString(36).slice(2), type: 'send_campaign', channel: 'email', campaignId: '' }]);
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
        actions: actions.map(a => ({ type: a.type, channel: a.channel, campaignId: a.campaignId })),
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

  const selectedFirstCampaign = useMemo(() => {
    const first = actions[0];
    if (!first) return undefined;
    return campaigns.find(c => c.id === first.campaignId);
  }, [campaigns, actions]);

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
                        <div key={a.id} className="grid md:grid-cols-3 gap-2 items-end p-2 border border-gray-200 rounded-lg">
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Canal</label>
                            <select value={a.channel} onChange={(e)=>updateAction(a.id, { channel: e.target.value as any })} className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm">
                              <option value="email">Email</option>
                              <option value="whatsapp">WhatsApp</option>
                              <option value="sms">SMS</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Campanha</label>
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
                          <div className="flex items-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => removeAction(a.id)} disabled={actions.length <= 1}>Remover</Button>
                            <div className="text-[11px] text-gray-500">{idx===0 ? 'Executa primeiro' : `Execução #${idx+1}`}</div>
                          </div>
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
                        <> <strong>enviar</strong> a campanha <strong>{selectedFirstCampaign?.name || actions[0]?.campaignId || '—'}</strong> por <strong>{actions[0]?.channel === 'email' ? 'Email' : actions[0]?.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}</strong>.</>
                      ) : (
                        <>
                          executar múltiplas ações:
                          <ul className="list-disc pl-5">
                            {actions.map((a, i) => {
                              const c = campaigns.find(cmp => cmp.id === a.campaignId);
                              return (
                                <li key={a.id}>
                                  Enviar campanha <strong>{c?.name || a.campaignId || '—'}</strong> por <strong>{a.channel === 'email' ? 'Email' : a.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}</strong> (passo {i+1})
                                </li>
                              );
                            })}
                          </ul>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button onClick={save} disabled={saving || actions.some(a => !a.campaignId)}>{saving ? 'Salvando…' : 'Salvar alterações'}</Button>
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
