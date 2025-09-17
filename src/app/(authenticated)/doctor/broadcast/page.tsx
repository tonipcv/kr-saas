"use client";

import { useEffect, useMemo, useState } from "react";
import { useClinic } from "@/contexts/clinic-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type SegmentKey = 'all' | 'inactive_30d' | 'birthday_7d' | 'purchased_30d';

export default function DoctorBroadcastPage() {
  const { currentClinic } = useClinic();
  const clinicId = currentClinic?.id || "";
  const disabled = !clinicId;

  // State – Composer
  const [subject, setSubject] = useState<string>("");
  const [message, setMessage] = useState<string>("Olá! Esta é uma mensagem de teste.");
  const [useTemplate, setUseTemplate] = useState<boolean>(false);
  const [templateName, setTemplateName] = useState<string>("");
  const [templateLanguage, setTemplateLanguage] = useState<string>("pt_BR");
  const [loadingTemplates, setLoadingTemplates] = useState<boolean>(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [approvedTemplates, setApprovedTemplates] = useState<Array<{ id: string; name: string; status: string; language: string; category?: string }>>([]);

  // State – Audience
  const [segment, setSegment] = useState<SegmentKey>('all');
  const [audienceSize, setAudienceSize] = useState<number>(0);
  const [audienceSample, setAudienceSample] = useState<Array<{ id: string; name: string; phone: string }>>([]);

  // State – Schedule
  const [scheduleLater, setScheduleLater] = useState<boolean>(false);
  const [scheduleDate, setScheduleDate] = useState<string>("");
  const [scheduleTime, setScheduleTime] = useState<string>("");

  // State – Actions
  const [to, setTo] = useState<string>("");
  const [sendingTest, setSendingTest] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string>("");
  const [trigger, setTrigger] = useState<string>("customer_inactive");
  const [sendingCampaign, setSendingCampaign] = useState<boolean>(false);
  const [campaignResult, setCampaignResult] = useState<string | null>(null);

  // Derived – Preview content (simple phone mock)
  const previewText = useMemo(() => {
    if (useTemplate && templateName) {
      return `Template: ${templateName} (${templateLanguage})\n\nPré-visualização: ${message}`;
    }
    return message || "";
  }, [useTemplate, templateName, templateLanguage, message]);

  const doSendTest = async () => {
    if (disabled) return;
    setSendingTest(true);
    setTestResult(null);
    try {
      const body: any = { clinicId, to, message };
      const res = await fetch('/api/integrations/whatsapp/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (res.ok) setTestResult(`OK • messageId: ${json?.messageId || 'n/a'}`);
      else setTestResult(`Erro • ${json?.error || res.status} ${json?.hint ? `• ${json.hint}` : ''}`);
    } catch (e: any) {
      setTestResult(`Erro • ${e?.message || 'Falha inesperada'}`);
    } finally {
      setSendingTest(false);
    }
  };

  // Fetch real audience count/sample based on selected segment
  useEffect(() => {
    const controller = new AbortController();
    async function loadAudience() {
      if (!clinicId) { setAudienceSize(0); setAudienceSample([]); return; }
      try {
        const url = `/api/v2/doctor/broadcast/audience?segment=${encodeURIComponent(segment)}`;
        const res = await fetch(url, { signal: controller.signal, headers: { 'Cache-Control': 'no-cache' } });
        const json = await res.json().catch(() => ({}));
        if (res.ok) {
          setAudienceSize(Number(json?.data?.count || 0));
          setAudienceSample(Array.isArray(json?.data?.sample) ? json.data.sample : []);
        } else {
          setAudienceSize(0);
          setAudienceSample([]);
        }
      } catch (e) {
        if (!(e instanceof DOMException && e.name === 'AbortError')) {
          setAudienceSize(0);
          setAudienceSample([]);
        }
      }
    }
    loadAudience();
    return () => controller.abort();
  }, [clinicId, segment]);

  // Load approved WhatsApp templates for this clinic
  useEffect(() => {
    let active = true;
    async function loadTemplates() {
      if (!useTemplate || !clinicId) { setApprovedTemplates([]); setTemplatesError(null); return; }
      setLoadingTemplates(true);
      setTemplatesError(null);
      try {
        const res = await fetch(`/api/integrations/whatsapp/templates?clinicId=${encodeURIComponent(clinicId)}`, { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        if (!active) return;
        if (res.ok) {
          const items = Array.isArray(json?.data?.data) ? json.data.data : Array.isArray(json?.data) ? json.data : [];
          const approved = (items || []).filter((t: any) => (t?.status || '').toUpperCase() === 'APPROVED')
            .map((t: any) => ({ id: t?.id, name: t?.name, status: t?.status, language: t?.language, category: t?.category }));
          setApprovedTemplates(approved);
        } else {
          setTemplatesError(json?.error || 'Falha ao carregar templates');
          setApprovedTemplates([]);
        }
      } catch (e: any) {
        if (!active) return;
        setTemplatesError(e?.message || 'Erro inesperado');
        setApprovedTemplates([]);
      } finally {
        if (active) setLoadingTemplates(false);
      }
    }
    loadTemplates();
    return () => { active = false; };
  }, [useTemplate, clinicId]);

  const doSendCampaign = async (dryRun: boolean) => {
    if (disabled) return;
    if (!campaignId) { setCampaignResult('Informe o campaignId'); return; }
    setSendingCampaign(true);
    setCampaignResult(null);
    try {
      const res = await fetch(`/api/v2/doctor/campaigns/${encodeURIComponent(campaignId)}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'whatsapp', audienceSize: Number(audienceSize)||0, dryRun, trigger })
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) setCampaignResult(`OK • campaign ${json?.data?.id || campaignId} (${dryRun ? 'dry run' : 'live'})`);
      else setCampaignResult(`Erro • ${json?.error || res.status}`);
    } catch (e: any) {
      setCampaignResult(`Erro • ${e?.message || 'Falha inesperada'}`);
    } finally {
      setSendingCampaign(false);
    }
  };

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24 bg-gray-50">

          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">Broadcast</h1>
              <p className="text-xs text-gray-500">Crie, segmente, agende e envie — inspirado em kit.com / beehiiv</p>
            </div>
          </div>

          {!clinicId && (
            <div className="mb-4 rounded-2xl px-4 py-3 text-gray-700 bg-white border border-gray-200 shadow-sm">
              Selecione uma clínica para habilitar os envios.
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left: Form sections */}
            <div className="lg:col-span-8 space-y-3">
              {/* Composer */}
              <Card className="bg-white border border-gray-200 shadow-sm rounded-2xl">
                <CardHeader className="px-4 py-3 border-b border-gray-100">
                  <CardTitle className="text-sm font-semibold text-gray-900">Composer</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-3 space-y-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Assunto (interno)</label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300"
                      placeholder="Ex.: Reengajamento – inativos 30 dias"
                      disabled={disabled}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Mensagem</label>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={5}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300"
                      placeholder="Escreva sua mensagem curta para WhatsApp"
                      disabled={disabled}
                    />
                    <p className="mt-1 text-[11px] text-gray-500">Mensagens livres só podem ser enviadas dentro da janela de 24h. Fora da janela, use template aprovado.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                      <input type="checkbox" checked={useTemplate} onChange={(e) => setUseTemplate(e.target.checked)} disabled={disabled} />
                      Usar template aprovado (HSM)
                    </label>
                    {useTemplate && (
                      <>
                        <select
                          value={templateName}
                          onChange={(e) => {
                            const name = e.target.value;
                            setTemplateName(name);
                            const found = approvedTemplates.find(t => t.name === name);
                            if (found?.language) setTemplateLanguage(found.language);
                          }}
                          className="h-8 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300"
                          disabled={disabled || loadingTemplates}
                        >
                          <option value="">
                            {loadingTemplates ? 'Carregando templates…' : 'Selecione um template aprovado'}
                          </option>
                          {approvedTemplates.map((t) => (
                            <option key={t.id} value={t.name}>{t.name} ({t.language})</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={templateName}
                          onChange={(e) => setTemplateName(e.target.value)}
                          className="h-8 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300"
                          placeholder="ou digite o nome do template"
                          disabled={disabled}
                        />
                        <input
                          type="text"
                          value={templateLanguage}
                          onChange={(e) => setTemplateLanguage(e.target.value)}
                          className="h-8 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300"
                          placeholder="pt_BR"
                          disabled={disabled}
                        />
                      </>
                    )}
                  </div>
                  {useTemplate && templatesError && (
                    <p className="text-[11px] text-red-600">{templatesError}</p>
                  )}
                  {useTemplate && !templatesError && approvedTemplates.length > 0 && (
                    <p className="text-[11px] text-gray-500">{approvedTemplates.length} templates aprovados disponíveis</p>
                  )}
                  {audienceSample.length > 0 && (
                    <div className="mt-2">
                      <div className="text-[11px] text-gray-500 mb-1">Amostra (até 10):</div>
                      <ul className="text-xs text-gray-700 list-disc pl-4">
                        {audienceSample.map((p) => (
                          <li key={p.id} className="truncate">{p.name || 'Sem nome'} — {p.phone || 'sem telefone'}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Audience */}
              <Card className="bg-white border border-gray-200 shadow-sm rounded-2xl">
                <CardHeader className="px-4 py-3 border-b border-gray-100">
                  <CardTitle className="text-sm font-semibold text-gray-900">Audience</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-3 space-y-3">
                  <div className="grid md:grid-cols-3 gap-3 items-center">
                    <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                      <input type="radio" name="segment" checked={segment==='all'} onChange={() => setSegment('all')} />
                      Todos os contatos
                    </label>
                    <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                      <input type="radio" name="segment" checked={segment==='inactive_30d'} onChange={() => setSegment('inactive_30d')} />
                      Inativos 30 dias
                    </label>
                    <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                      <input type="radio" name="segment" checked={segment==='birthday_7d'} onChange={() => setSegment('birthday_7d')} />
                      Aniversariantes 7 dias
                    </label>
                    <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                      <input type="radio" name="segment" checked={segment==='purchased_30d'} onChange={() => setSegment('purchased_30d')} />
                      Compraram 30 dias
                    </label>
                  </div>
                  <div className="grid md:grid-cols-3 gap-3 items-center">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Audience size (estimativa)</label>
                      <input
                        type="number"
                        min={0}
                        value={audienceSize}
                        onChange={(e) => setAudienceSize(Number(e.target.value) || 0)}
                        className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300"
                        placeholder="0"
                        disabled={disabled}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Campaign ID</label>
                      <input
                        type="text"
                        value={campaignId}
                        onChange={(e) => setCampaignId(e.target.value)}
                        className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300"
                        placeholder="cmp_123"
                        disabled={disabled}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Trigger (opcional)</label>
                      <input
                        type="text"
                        value={trigger}
                        onChange={(e) => setTrigger(e.target.value)}
                        className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300"
                        placeholder="customer_inactive / birthday / purchase_made"
                        disabled={disabled}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Schedule */}
              <Card className="bg-white border border-gray-200 shadow-sm rounded-2xl">
                <CardHeader className="px-4 py-3 border-b border-gray-100">
                  <CardTitle className="text-sm font-semibold text-gray-900">Schedule</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-3 space-y-3">
                  <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                    <input type="checkbox" checked={scheduleLater} onChange={(e) => setScheduleLater(e.target.checked)} disabled={disabled} />
                    Programar para depois (UI apenas — backend de agendamento será adicionado)
                  </label>
                  {scheduleLater && (
                    <div className="grid md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Data</label>
                        <input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Hora</label>
                        <input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300" />
                      </div>
                    </div>
                  )}
                  <p className="text-[11px] text-gray-500">Fora da 24h, use templates aprovados. Integração de templates será adicionada nesta página.</p>
                </CardContent>
              </Card>
            </div>

            {/* Right: Preview & Summary */}
            <div className="lg:col-span-4 space-y-3">
              {/* Preview */}
              <Card className="bg-white border border-gray-200 shadow-sm rounded-2xl">
                <CardHeader className="px-4 py-3 border-b border-gray-100">
                  <CardTitle className="text-sm font-semibold text-gray-900">Preview</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-3">
                  <div className="border border-gray-200 rounded-xl p-3 bg-gray-50">
                    <div className="text-[11px] text-gray-500 mb-2">WhatsApp</div>
                    <div className="bg-white rounded-lg p-3 text-sm text-gray-800 border border-gray-200 whitespace-pre-wrap min-h-[120px]">
                      {previewText || 'Sua mensagem aparecerá aqui…'}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Summary & Actions */}
              <Card className="bg-white border border-gray-200 shadow-sm rounded-2xl">
                <CardHeader className="px-4 py-3 border-b border-gray-100">
                  <CardTitle className="text-sm font-semibold text-gray-900">Summary & Actions</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-3 space-y-3">
                  <div className="text-xs text-gray-600">
                    <p><strong>Assunto:</strong> {subject || '—'}</p>
                    <p><strong>Segmento:</strong> {segment}</p>
                    <p><strong>Audience:</strong> ~{audienceSize || 0}</p>
                    <p><strong>Agendamento:</strong> {scheduleLater ? `${scheduleDate || 'data'} ${scheduleTime || 'hora'}` : 'Enviar agora'}</p>
                    <p><strong>Template:</strong> {useTemplate ? `${templateName || '—'} (${templateLanguage})` : 'Não'}</p>
                  </div>

                  {/* Test send */}
                  <div className="border-t border-gray-100 pt-3">
                    <div className="text-[11px] text-gray-500 mb-1">Envio de teste</div>
                    <div className="flex items-center gap-2">
                      <input
                        type="tel"
                        placeholder="5511999999999"
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                        className="flex-1 h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300"
                        disabled={disabled || sendingTest}
                      />
                      <Button variant="outline" size="sm" className="h-8 border-gray-300 text-gray-800" onClick={doSendTest} disabled={disabled || sendingTest}>
                        {sendingTest ? 'Enviando…' : 'Enviar teste'}
                      </Button>
                    </div>
                    {testResult && <p className="mt-1 text-[11px] text-gray-600">{testResult}</p>}
                  </div>

                  {/* Campaign send */}
                  <div className="border-t border-gray-100 pt-3">
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="h-8 border-gray-300 text-gray-800" onClick={() => doSendCampaign(true)} disabled={disabled || sendingCampaign}>
                        {sendingCampaign ? 'Enviando…' : 'Dry run'}
                      </Button>
                      <Button size="sm" className="h-8" onClick={() => doSendCampaign(false)} disabled={disabled || sendingCampaign}>
                        {sendingCampaign ? 'Enviando…' : 'Enviar campanha'}
                      </Button>
                    </div>
                    {campaignResult && <p className="mt-1 text-[11px] text-gray-600">{campaignResult}</p>}
                    <p className="mt-2 text-[11px] text-gray-500">Envios fora da 24h devem usar templates aprovados.</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
