"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useClinic } from "@/contexts/clinic-context";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';

type SegmentKey = 'all' | 'inactive_30d' | 'birthday_7d' | 'purchased_30d';

export default function DoctorBroadcastPage() {
  const { currentClinic } = useClinic();
  const clinicId = currentClinic?.id || "";
  const disabled = !clinicId;

  // State – Channel & Composer
  const [channel, setChannel] = useState<'whatsapp'|'sms'|'email'>('whatsapp');
  const [subject, setSubject] = useState<string>("");
  const [message, setMessage] = useState<string>("Hello! This is a test message.");
  const [useTemplate, setUseTemplate] = useState<boolean>(true);
  const [templateName, setTemplateName] = useState<string>("");
  const [templateLanguage, setTemplateLanguage] = useState<string>("en_US");
  const [loadingTemplates, setLoadingTemplates] = useState<boolean>(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [approvedTemplates, setApprovedTemplates] = useState<Array<{ id: string; name: string; status: string; language: string; category?: string }>>([]);
  // State – Selected template content
  const [templateBody, setTemplateBody] = useState<string>("");
  const [templateLoading, setTemplateLoading] = useState<boolean>(false);
  const [templateLoadError, setTemplateLoadError] = useState<string | null>(null);
  const [templateComponents, setTemplateComponents] = useState<any[]>([]);
  // UI – WhatsApp content mode (none | free | template)
  const [waContentMode, setWaContentMode] = useState<'none'|'free'|'template'>('template');

  // State – Audience
  const [segment, setSegment] = useState<SegmentKey>('all');
  const [audienceSize, setAudienceSize] = useState<number>(0); // eligible for WhatsApp
  const [audienceSample, setAudienceSample] = useState<Array<{ id: string; name: string; phone?: string; email?: string }>>([]);
  const [audienceTotals, setAudienceTotals] = useState<{ totalPatients: number; eligibleCount: number; invalidCount: number }>({ totalPatients: 0, eligibleCount: 0, invalidCount: 0 });

  // State – Schedule
  const [scheduleLater, setScheduleLater] = useState<boolean>(false);
  const [scheduleDate, setScheduleDate] = useState<string>("");
  const [scheduleTime, setScheduleTime] = useState<string>("");
  const [isScheduled, setIsScheduled] = useState<boolean>(false);

  // State – Actions
  const [to, setTo] = useState<string>("");
  const [sendingTest, setSendingTest] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string>("");
  const [trigger, setTrigger] = useState<string>("customer_inactive");
  const [sendingCampaign, setSendingCampaign] = useState<boolean>(false);
  const [campaignResult, setCampaignResult] = useState<string | null>(null);
  const [scheduleResult, setScheduleResult] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState<boolean>(false);
  const [campaignLoadHint, setCampaignLoadHint] = useState<string | null>(null);
  // State - Bulk send
  const [bulkSendMode, setBulkSendMode] = useState<boolean>(false);
  const [showBulkConfirm, setShowBulkConfirm] = useState<boolean>(false);
  const [bulkSendProgress, setBulkSendProgress] = useState<{total: number; sent: number; failed: number} | null>(null);
  // UX – Trigger presets & Campaign list
  const [triggerType, setTriggerType] = useState<'inactive'|'birthday'|'points'|'none'>('inactive');
  const [triggerDays, setTriggerDays] = useState<number>(30);
  const [pointsValue, setPointsValue] = useState<number>(100);
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name?: string; channel?: string }>>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState<boolean>(false);
  const selectedCampaign = useMemo(() => campaigns.find(c => c.id === campaignId), [campaigns, campaignId]);
  // State – Email sender (From)
  const [fromEmail, setFromEmail] = useState<string>("");
  const [fromName, setFromName] = useState<string>("");
  // Email rich editor (TipTap)
  const [htmlBody, setHtmlBody] = useState<string>("<p>Olá! Este é um teste de email.</p>");
  const emailEditor = useEditor({
    extensions: [StarterKit, Underline],
    content: htmlBody,
    onUpdate: ({ editor }) => {
      setHtmlBody(editor.getHTML());
    },
  });
  // Derived – can bulk send email now (depends on htmlBody)
  const canBulkEmailNow = useMemo(() => {
    if (channel !== 'email' || disabled) return false;
    const hasBody = (htmlBody && htmlBody.trim().length > 0) || (message && message.trim().length > 0);
    const hasSubject = subject && subject.trim().length > 0;
    return (audienceSize > 0) && (hasBody || hasSubject);
  }, [channel, disabled, audienceSize, htmlBody, message, subject]);

  // Derived – Preview content (simple phone mock)
  const previewText = useMemo(() => {
    if (channel === 'whatsapp' && useTemplate && templateName) {
      const body = templateBody?.trim() || "";
      if (templateLoading) return `Template: ${templateName} (${templateLanguage})\n\nLoading template content…`;
      if (templateLoadError) return `Template: ${templateName} (${templateLanguage})\n\n${templateLoadError}`;
      if (body) return `Template: ${templateName} (${templateLanguage})\n\n${body}`;
      // fallback to free message if template body isn't available yet
      return `Template: ${templateName} (${templateLanguage})\n\n${message || ""}`;
    }
    return message || "";
  }, [channel, useTemplate, templateName, templateLanguage, message, templateBody, templateLoading, templateLoadError]);

  // Derived – Extract parts from selected template
  const templateHeader = useMemo(() => {
    return (templateComponents || []).find((c: any) => c?.type === 'HEADER') || null;
  }, [templateComponents]);
  const templateFooter = useMemo(() => {
    return (templateComponents || []).find((c: any) => c?.type === 'FOOTER') || null;
  }, [templateComponents]);
  const templateButtons = useMemo(() => {
    const b = (templateComponents || []).find((c: any) => c?.type === 'BUTTONS');
    return b?.buttons || [];
  }, [templateComponents]);

  // Derived – Can quick-send/send bulk now? (WhatsApp + SMS + Email)
  const canQuickSendNow = useMemo(() => {
    if (disabled) return false;
    if (channel !== 'whatsapp' && channel !== 'sms' && channel !== 'email') return false;
    
    // Bulk mode validations
    if (bulkSendMode) {
      if (audienceSize <= 0) return false;
      if (channel === 'whatsapp') return !!templateName && useTemplate === true;
      if (channel === 'sms') return (message && message.trim().length > 0);
      if (channel === 'email') {
        const hasBody = (htmlBody && htmlBody.trim().length > 0) || (message && message.trim().length > 0);
        const hasSubject = subject && subject.trim().length > 0;
        return hasBody || hasSubject;
      }
      return false;
    }
    
    // Single recipient validations
    if (!to || String(to).trim().length === 0) return false;
    if (channel === 'whatsapp') {
      if (useTemplate) return !!templateName && String(templateName).trim().length > 0;
      return true;
    }
    if (channel === 'sms') {
      return (message && message.trim().length > 0);
    }
    if (channel === 'email') {
      // require at least subject or body/text
      const hasBody = (htmlBody && htmlBody.trim().length > 0) || (message && message.trim().length > 0);
      const hasSubject = subject && subject.trim().length > 0;
      return hasBody || hasSubject;
    }
    return false;
  }, [disabled, channel, to, useTemplate, templateName, bulkSendMode, audienceSize, message, subject, htmlBody]);
  
  // Auto-fill WhatsApp destination from sample when channel changes
  useEffect(() => {
    // If switching to email and current 'to' looks like a phone, clear it to avoid 400
    if (channel === 'email' && to && !/.+@.+\..+/.test(String(to))) {
      console.log('[UI] Clearing non-email destination when switching to Email:', to);
      setTo('');
    }
    if (channel === 'whatsapp' && !to && audienceSample.length > 0) {
      // Find first sample with phone
      const firstWithPhone = audienceSample.find(s => s.phone);
      if (firstWithPhone?.phone) {
        // Clean the number to digits only
        const cleaned = String(firstWithPhone.phone).replace(/\D+/g, '');
        if (cleaned.length >= 10) {
          setTo(cleaned);
          console.log('[UI] Auto-filled WhatsApp destination:', cleaned);
        }
      } else {
        console.log('[UI] No sample with phone found in audienceSample:', audienceSample);
      }
    }
    if (channel === 'email' && !to && audienceSample.length > 0) {
      // Find first sample with email
      const firstWithEmail = audienceSample.find(s => s.email);
      if (firstWithEmail?.email) {
        const mail = String(firstWithEmail.email).trim();
        setTo(mail);
        console.log('[UI] Auto-filled Email destination:', mail);
      } else {
        console.log('[UI] No sample with email found in audienceSample:', audienceSample);
      }
    }
  }, [channel, audienceSample, to]);

  // Derived – Substitute variables {{1}}, {{2}} for preview
  const sampleName = useMemo(() => (audienceSample?.[0]?.name || '').split(' ')[0] || 'John', [audienceSample]);
  const sampleClinic = useMemo(() => currentClinic?.name || 'Your business', [currentClinic]);
  const sampleVars = useMemo(() => [sampleName, sampleClinic, 'https://example.link', '1234'], [sampleName, sampleClinic]);
  const applyVars = (text?: string) => {
    if (!text) return '';
    return text.replace(/\{\{(\d+)\}\}/g, (_m, g1) => {
      const idx = parseInt(g1, 10) - 1;
      return sampleVars[idx] ?? '';
    });
  };

  // Send to all contacts in the selected segment (Email)
  const doBulkSendEmail = async () => {
    const isEmailChannel = channel === 'email' as const;
    if (!isEmailChannel) return;
    const hasBody = (htmlBody && htmlBody.trim().length > 0) || (message && message.trim().length > 0);
    const hasSubject = subject && subject.trim().length > 0;
    if (!hasBody && !hasSubject) { setCampaignResult('Preencha o assunto ou o corpo do email.'); return; }

    setSendingCampaign(true);
    setCampaignResult(null);
    setShowBulkConfirm(false);

    try {
      if (!clinicId) throw new Error('Clínica não selecionada');
      console.log(`[UI] Fetching full contact list for Email, segment ${segment}, clinicId=${clinicId}`);
      const res = await fetch(`/api/v2/doctor/broadcast/audience?segment=${encodeURIComponent(segment)}&full=true&clinicId=${encodeURIComponent(clinicId)}&channel=${encodeURIComponent(channel)}`, {
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (!res.ok) throw new Error('Falha ao carregar lista de contatos');
      const json = await res.json();
      const recipients = (Array.isArray(json?.data?.contacts) ? json.data.contacts : []).filter((r: any) => !!r?.email);
      console.log(`[UI] Loaded ${recipients.length} contacts for Email bulk send`);
      if (recipients.length === 0) { setCampaignResult('Nenhum contato com email válido no segmento selecionado.'); return; }

      const total = recipients.length;
      let sent = 0;
      let failed = 0;
      setBulkSendProgress({ total, sent, failed });

      const batchSize = 5;
      const batches: any[] = [];
      for (let i = 0; i < recipients.length; i += batchSize) batches.push(recipients.slice(i, i + batchSize));

      for (const batch of batches) {
        const promises = batch.map(async (recipient: any) => {
          const toEmail = String(recipient.email || '').trim();
          if (!/.+@.+\..+/.test(toEmail)) return { success: false, error: 'Email inválido' };
          const body: any = { clinicId, to: toEmail, subject: subject || 'Mensagem da clínica', message, html: htmlBody };
          try {
            const r = await fetch('/api/integrations/email/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const j = await r.json().catch(() => ({}));
            return { success: r.ok, messageId: j?.messageId, error: j?.error };
          } catch (e: any) {
            return { success: false, error: e?.message || 'Erro desconhecido' };
          }
        });
        const results = await Promise.all(promises);
        sent += results.filter(r => r.success).length;
        failed += results.filter(r => !r.success).length;
        setBulkSendProgress({ total, sent, failed });
        if (batches.indexOf(batch) < batches.length - 1) await new Promise(res => setTimeout(res, 800));
      }

      setCampaignResult(`Emails em massa concluídos: ${sent} enviados, ${failed} falhas de ${total} contatos.`);
    } catch (e: any) {
      setCampaignResult(`Erro no envio em massa (Email): ${e?.message || 'Falha inesperada'}`);
    } finally {
      setSendingCampaign(false);
      setBulkSendProgress(null);
    }
  };

  // Immediate Email send (single recipient)
  const doSendEmailQuick = async () => {
    if (disabled) return;
    setSendingCampaign(true);
    setCampaignResult(null);
    try {
      if (channel !== 'email') {
        setCampaignResult('Selecione o canal adequado para este envio.');
        return;
      }
      if (bulkSendMode) {
        setShowBulkConfirm(true);
        setSendingCampaign(false);
        return;
      }
      if (!to) { setCampaignResult('Informe o email de destino.'); return; }
      const toStr = String(to).trim();
      console.log('[UI] Email quick send validation', { to: toStr, hasAt: toStr.includes('@'), subject: !!subject, hasHtml: !!htmlBody, hasText: !!message });
      if (!/.+@.+\..+/.test(toStr)) { setCampaignResult('O campo "Para" deve ser um email válido.'); return; }
      const payload: any = { clinicId, to: toStr, subject: subject || 'Mensagem da clínica', message, html: htmlBody };
      console.log('[UI] doSendEmailQuick -> /api/integrations/email/send', payload);
      const res = await fetch('/api/integrations/email/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const json = await res.json().catch(() => ({}));
      console.log('[UI] doSendEmailQuick <- response', res.status, json);
      if (res.ok) setCampaignResult(`OK • Email • messageId: ${json?.messageId || 'n/a'}`);
      else setCampaignResult(`Erro • ${json?.error || res.status}${json?.echoTo ? ` • to=${json.echoTo}` : ''}${json?.status ? ` • http=${json.status}` : ''}`);
    } catch (e: any) {
      setCampaignResult(`Erro • ${e?.message || 'Falha inesperada'}`);
    } finally {
      setSendingCampaign(false);
    }
  };

  // Immediate SMS send (single recipient)
  const doSendSMSQuick = async () => {
    if (disabled) return;
    setSendingCampaign(true);
    setCampaignResult(null);
    try {
      if (channel !== 'sms') {
        setCampaignResult('Selecione o canal adequado para este envio.');
        return;
      }
      if (bulkSendMode) {
        setShowBulkConfirm(true);
        setSendingCampaign(false);
        return;
      }
      if (!to) { setCampaignResult('Informe o número de destino.'); return; }
      if (!message || message.trim().length === 0) { setCampaignResult('Informe a mensagem do SMS.'); return; }
      const body: any = { to, message, refer: 'broadcast:single', clinicId, campaignId: campaignId || undefined };
      console.log('[UI] doSendSMSQuick -> /api/integrations/sms/send', body);
      const res = await fetch('/api/integrations/sms/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      console.log('[UI] doSendSMSQuick <- response', res.status, json);
      if (res.ok) setCampaignResult(`OK • SMS • messageId: ${json?.messageId || 'n/a'}`);
      else setCampaignResult(`Erro • ${json?.error || res.status}${json?.hint ? ` • ${json.hint}` : ''}`);
    } catch (e: any) {
      setCampaignResult(`Erro • ${e?.message || 'Falha inesperada'}`);
    } finally {
      setSendingCampaign(false);
    }
  };

  // Wrapper to decide which immediate sender to use
  const handleImmediateSendClick = () => {
    if (bulkSendMode) {
      setShowBulkConfirm(true);
      return;
    }
    if (channel === 'whatsapp') return void doSendWhatsAppQuick();
    if (channel === 'sms') return void doSendSMSQuick();
    if (channel === 'email') {
      // If no single recipient is provided, treat as bulk intent
      if (!to || String(to).trim().length === 0) {
        if (!canBulkEmailNow) return; // guard
        if ((audienceSize || 0) <= 10) {
          console.log('[UI] Primary action -> bulk email (immediate)');
          setCampaignResult('Iniciando envio em massa (Email)…');
          return void doBulkSendEmail();
        }
        console.log('[UI] Primary action -> open bulk email confirm');
        setCampaignResult('Confirme o envio em massa (Email)…');
        setShowBulkConfirm(true);
        return;
      }
      return void doSendEmailQuick();
    }
  };

  // Send to all contacts in the selected segment (SMS)
  const doBulkSendSMS = async () => {
    if (disabled || channel !== 'sms') return;
    if (!message || message.trim().length === 0) { setCampaignResult('Informe a mensagem de SMS.'); return; }

    setSendingCampaign(true);
    setCampaignResult(null);
    setShowBulkConfirm(false);

    try {
      if (!clinicId) throw new Error('Clínica não selecionada');
      console.log(`[UI] Fetching full contact list for SMS, segment ${segment}, clinicId=${clinicId}`);
      const res = await fetch(`/api/v2/doctor/broadcast/audience?segment=${encodeURIComponent(segment)}&full=true&clinicId=${encodeURIComponent(clinicId)}&channel=${encodeURIComponent(channel)}`, {
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (!res.ok) throw new Error('Falha ao carregar lista de contatos');
      const json = await res.json();
      const recipients = Array.isArray(json?.data?.contacts) ? json.data.contacts : [];
      console.log(`[UI] Loaded ${recipients.length} contacts for SMS bulk send`);
      if (recipients.length === 0) { setCampaignResult('Nenhum contato encontrado no segmento selecionado.'); return; }

      const total = recipients.length;
      let sent = 0;
      let failed = 0;
      setBulkSendProgress({ total, sent, failed });

      const batchSize = 10;
      const batches: any[] = [];
      for (let i = 0; i < recipients.length; i += batchSize) batches.push(recipients.slice(i, i + batchSize));

      for (const batch of batches) {
        const promises = batch.map(async (recipient: any) => {
          const phoneRaw = recipient.phone ? String(recipient.phone) : '';
          const phone = phoneRaw.replace(/\D+/g, '');
          if (phone.length < 10) return { success: false, error: 'Telefone inválido' };
          const body = { to: phone, message, refer: 'broadcast:bulk', clinicId, campaignId: campaignId || undefined } as any;
          try {
            const r = await fetch('/api/integrations/sms/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const j = await r.json().catch(() => ({}));
            return { success: r.ok, messageId: j?.messageId, error: j?.error };
          } catch (e: any) {
            return { success: false, error: e?.message || 'Erro desconhecido' };
          }
        });
        const results = await Promise.all(promises);
        sent += results.filter(r => r.success).length;
        failed += results.filter(r => !r.success).length;
        setBulkSendProgress({ total, sent, failed });
        if (batches.indexOf(batch) < batches.length - 1) await new Promise(res => setTimeout(res, 800));
      }

      setCampaignResult(`SMS em massa concluído: ${sent} enviados, ${failed} falhas de ${total} contatos.`);
    } catch (e: any) {
      setCampaignResult(`Erro no envio em massa (SMS): ${e?.message || 'Falha inesperada'}`);
    } finally {
      setSendingCampaign(false);
      setBulkSendProgress(null);
    }
  };

  const doSchedule = async () => {
    if (disabled) return;
    setScheduleResult(null);
    try {
      if (!campaignId) { setScheduleResult('Informe o campaignId'); return; }
      if (!scheduleLater) { setScheduleResult('Habilite "Programar para depois"'); return; }
      if (!scheduleDate || !scheduleTime) { setScheduleResult('Informe data e hora'); return; }
      const iso = new Date(`${scheduleDate}T${scheduleTime}:00`).toISOString();
      // Snapshot do conteúdo por canal
      const payload: any = { channel };
      if (channel === 'email') {
        payload.subject = subject || '';
        payload.html = htmlBody || '';
        payload.text = message || '';
        payload.toPreview = to || '';
      } else if (channel === 'whatsapp') {
        payload.useTemplate = !!useTemplate;
        payload.templateName = templateName || null;
        payload.templateLanguage = templateLanguage || null;
        payload.message = message || '';
      } else if (channel === 'sms') {
        payload.message = message || '';
      }
      const res = await fetch('/api/v2/doctor/broadcast/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, channel, scheduleAt: iso, trigger, payload })
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) setScheduleResult(`Agendado • ${json?.data?.id || ''} • ${json?.data?.scheduleAt || ''}`);
      else setScheduleResult(`Erro agendamento • ${json?.error || res.status}`);
    } catch (e: any) {
      setScheduleResult(`Erro agendamento • ${e?.message || 'Falha inesperada'}`);
    }
  };
  const renderedHeaderText = useMemo(() => applyVars(templateHeader?.text), [templateHeader, sampleVars]);
  const renderedBodyText = useMemo(() => applyVars(templateBody), [templateBody, sampleVars]);
  const renderedFooterText = useMemo(() => applyVars(templateFooter?.text), [templateFooter, sampleVars]);

  const doSendTest = async () => {
    if (disabled) return;
    setSendingTest(true);
    setTestResult(null);
    try {
      let res: Response;
      if (channel === 'whatsapp') {
        const body: any = { clinicId, to, message, campaignId: campaignId || undefined };
        if (useTemplate && templateName) {
          body.useTemplate = true;
          body.templateName = templateName;
          body.templateLanguage = templateLanguage || 'pt_BR';
          // Optional: pass components if you want to substitute variables server-side later
          // For now we send no components; Cloud API will use the static template body.
        }
        console.log('[UI] doSendTest -> /api/integrations/whatsapp/send', body);
        res = await fetch('/api/integrations/whatsapp/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } else if (channel === 'sms') {
        const body: any = { to, message, refer: 'broadcast:test' };
        console.log('[UI] doSendTest -> /api/integrations/sms/send', body);
        res = await fetch('/api/integrations/sms/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } else {
        const toStr = String(to || '').trim();
        console.log('[UI] doSendTest (email) validation', { to: toStr, hasAt: toStr.includes('@') });
        if (!/.+@.+\..+/.test(toStr)) {
          setTestResult('O campo "Para" deve ser um email válido.');
          return;
        }
        const body: any = { clinicId, to: toStr, subject: subject || 'Mensagem da clínica', message, html: htmlBody, campaignId: campaignId || undefined };
        console.log('[UI] doSendTest -> /api/integrations/email/send', body);
        res = await fetch('/api/integrations/email/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }
      const json = await res.json().catch(() => ({}));
      console.log('[UI] doSendTest <- response', res.status, json);
      if (res.ok) setTestResult(`OK • messageId: ${json?.messageId || 'n/a'}`);
      else setTestResult(`Erro • ${json?.error || res.status}${json?.echoTo ? ` • to=${json.echoTo}` : ''}${json?.status ? ` • http=${json.status}` : ''}`);
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
      if (!clinicId) { 
        console.log('[UI] No clinicId available, skipping audience load');
        setAudienceSize(0); 
        setAudienceSample([]); 
        return; 
      }
      try {
        // Always include clinicId in the URL
        const url = `/api/v2/doctor/broadcast/audience?segment=${encodeURIComponent(segment)}&clinicId=${encodeURIComponent(clinicId)}&channel=${encodeURIComponent(channel)}`;
        console.log(`[UI] Loading audience with URL: ${url}`);
        const res = await fetch(url, { signal: controller.signal, headers: { 'Cache-Control': 'no-cache' } });
        const json = await res.json().catch(() => ({}));
        if (res.ok) {
          // Eligible count (WhatsApp-ready)
          const count = Number(json?.data?.count || 0);
          const totalPatients = Number(json?.data?.totalPatients ?? 0);
          const eligibleCount = Number(json?.data?.eligibleCount ?? count);
          const invalidCount = Number(json?.data?.invalidCount ?? Math.max(totalPatients - eligibleCount, 0));
          console.log(`[UI] Loaded audience for segment ${segment}: total=${totalPatients} eligible=${eligibleCount} invalid=${invalidCount}`);
          setAudienceSize(eligibleCount);
          setAudienceTotals({ totalPatients, eligibleCount, invalidCount });
          setAudienceSample(Array.isArray(json?.data?.sample) ? json.data.sample : []);
        } else {
          console.log(`[UI] Failed to load audience: ${res.status}`);
          setAudienceSize(0);
          setAudienceTotals({ totalPatients: 0, eligibleCount: 0, invalidCount: 0 });
          setAudienceSample([]);
        }
      } catch (e) {
        if (!(e instanceof DOMException && e.name === 'AbortError')) {
          console.error('[UI] Error loading audience:', e);
          setAudienceSize(0);
          setAudienceTotals({ totalPatients: 0, eligibleCount: 0, invalidCount: 0 });
          setAudienceSample([]);
        }
      }
    }
    loadAudience();
    return () => controller.abort();
  }, [clinicId, segment, channel]);

  // Auto-fill campaignId on first load using authenticated endpoint
  useEffect(() => {
    let cancelled = false;
    async function loadDefaultCampaign() {
      try {
        if (campaignId) return; // user already filled
        const res = await fetch(`/api/v2/doctor/campaigns?status=PUBLISHED&limit=1`, { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        const list = Array.isArray(json?.data) ? json.data : [];
        if (!cancelled && list.length > 0 && list[0]?.id) {
          setCampaignId(list[0].id as string);
          setCampaignLoadHint(null);
        } else if (!cancelled) {
          setCampaignLoadHint('Nenhuma campanha publicada encontrada para preencher automaticamente.');
        }
      } catch (e: any) {
        if (!cancelled) setCampaignLoadHint('Falha ao carregar campanhas padrão.');
      }
    }
    loadDefaultCampaign();
    return () => { cancelled = true; };
  }, []);

  // Load email sender info (DB-backed) for preview when Email channel is selected
  useEffect(() => {
    let cancelled = false;
    async function loadSender() {
      if (channel !== 'email' || !clinicId) { if (!cancelled) { setFromEmail(""); setFromName(""); } return; }
      try {
        const res = await fetch(`/api/integrations/email/senders/by-clinic?clinicId=${encodeURIComponent(clinicId)}`, { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && json?.exists) {
          setFromEmail(String(json.email || ''));
          setFromName(String(json.senderName || ''));
        } else {
          setFromEmail('');
          setFromName('');
        }
      } catch {
        if (!cancelled) { setFromEmail(''); setFromName(''); }
      }
    }
    loadSender();
    return () => { cancelled = true; };
  }, [channel, clinicId]);

  // Load list of published campaigns for dropdown
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
    return () => { active = false; };
  }, []);

  // Keep backend 'trigger' string in sync with UX preset selections
  useEffect(() => {
    if (triggerType === 'inactive') setTrigger('customer_inactive');
    else if (triggerType === 'birthday') setTrigger('birthday');
    else if (triggerType === 'points') setTrigger('points_milestone');
    else setTrigger('');
  }, [triggerType]);

  // Load approved WhatsApp templates for this clinic
  useEffect(() => {
    let active = true;
    async function loadTemplates() {
      if (channel !== 'whatsapp' || !useTemplate || !clinicId) { setApprovedTemplates([]); setTemplatesError(null); return; }
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
  }, [channel, useTemplate, clinicId]);

  // Load selected template components/body for preview
  useEffect(() => {
    let cancelled = false;
    const fetchTemplateComponents = async () => {
      if (channel !== 'whatsapp' || !clinicId || !useTemplate || !templateName) {
        setTemplateBody("");
        setTemplateLoadError(null);
        setTemplateLoading(false);
        return;
      }
      try {
        setTemplateLoading(true);
        setTemplateLoadError(null);
        setTemplateBody("");
        const res = await fetch(`/api/integrations/whatsapp/templates/components?clinicId=${encodeURIComponent(clinicId)}&name=${encodeURIComponent(templateName)}`, { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setTemplateLoadError(json?.error || 'Falha ao carregar conteúdo do template');
          setTemplateBody("");
          return;
        }
        const details = json?.data;
        const components = Array.isArray(details?.components) ? details.components : [];
        setTemplateComponents(components);
        const bodyComp = Array.isArray(components) ? components.find((c: any) => c?.type === 'BODY') : null;
        const bodyText = (bodyComp?.text || '').toString();
        setTemplateBody(bodyText);
      } catch (e: any) {
        if (cancelled) return;
        setTemplateLoadError(e?.message || 'Erro ao carregar conteúdo do template');
        setTemplateBody("");
        setTemplateComponents([]);
      } finally {
        if (!cancelled) setTemplateLoading(false);
      }
    };
    fetchTemplateComponents();
    return () => { cancelled = true; };
  }, [channel, clinicId, useTemplate, templateName]);

  const doSendCampaign = async (dryRun: boolean) => {
    if (disabled) return;
    setSendingCampaign(true);
    setCampaignResult(null);
    try {
      let res: Response;
      // If no campaign selected and channel is WhatsApp, send directly via integrations endpoint
      if (channel === 'whatsapp' && !campaignId) {
        const body: any = { clinicId, to, message, campaignId: campaignId || undefined };
        if (useTemplate && templateName) {
          body.useTemplate = true;
          body.templateName = templateName;
          body.templateLanguage = templateLanguage || 'pt_BR';
        }
        console.log('[UI] doSendCampaign (direct) -> /api/integrations/whatsapp/send', body);
        res = await fetch('/api/integrations/whatsapp/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } else {
        const body = {
          channel,
          audienceSize: Number(audienceSize)||0,
          dryRun,
          trigger,
          // pass WhatsApp template info so backend can initiate template sends
          useTemplate: channel==='whatsapp' ? !!useTemplate : undefined,
          templateName: channel==='whatsapp' && useTemplate ? (templateName || null) : undefined,
          templateLanguage: channel==='whatsapp' && useTemplate ? (templateLanguage || 'pt_BR') : undefined,
          // MVP: allow a single preview recipient for immediate send
          toPreview: channel==='whatsapp' ? (to || '') : undefined,
          message: channel==='whatsapp' && !useTemplate ? (message || '') : undefined,
        };
        console.log('[UI] doSendCampaign (campaign) ->', `/api/v2/doctor/campaigns/${encodeURIComponent(campaignId)}/send`, body);
        res = await fetch(`/api/v2/doctor/campaigns/${encodeURIComponent(campaignId)}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
      }
      const json = await res.json().catch(() => ({}));
      console.log('[UI] doSendCampaign <- response', res.status, json);
      if (res.ok) {
        const msgId = json?.messageId || json?.data?.messageId || 'n/a';
        setCampaignResult(`OK • ${campaignId ? `campaign ${json?.data?.id || campaignId}` : 'WhatsApp'} ${msgId !== 'n/a' ? `• messageId: ${msgId}` : ''}`);
      }
      else setCampaignResult(`Erro • ${json?.error || res.status}`);
    } catch (e: any) {
      setCampaignResult(`Erro • ${e?.message || 'Falha inesperada'}`);
    } finally {
      setSendingCampaign(false);
    }
  };

  // Always send directly via WhatsApp integration, ignoring campaignId
  const doSendWhatsAppQuick = async () => {
    if (disabled) return;
    setSendingCampaign(true);
    setCampaignResult(null);
    try {
      if (channel !== 'whatsapp') {
        setCampaignResult('Selecione o canal adequado para este envio.');
        return;
      }
      
      // If bulk mode is active, show confirmation dialog
      if (bulkSendMode) {
        setShowBulkConfirm(true);
        setSendingCampaign(false);
        return;
      }
      
      // Single recipient mode
      if (!to) {
        setCampaignResult('Informe o número de destino.');
        return;
      }
      
      const body: any = { clinicId, to, message, campaignId: campaignId || undefined };
      if (useTemplate && templateName) {
        body.useTemplate = true;
        body.templateName = templateName;
        body.templateLanguage = templateLanguage || 'pt_BR';
        // In the future we can include templateComponents gathered from the preview
      }
      
      console.log('[UI] doSendWhatsAppQuick -> /api/integrations/whatsapp/send', body);
      const res = await fetch('/api/integrations/whatsapp/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      console.log('[UI] doSendWhatsAppQuick <- response', res.status, json);
      
      if (res.ok) {
        const msgId = json?.messageId || 'n/a';
        setCampaignResult(`OK • WhatsApp${msgId !== 'n/a' ? ` • messageId: ${msgId}` : ''}`);
      } else {
        setCampaignResult(`Erro • ${json?.error || res.status}${json?.hint ? ` • ${json.hint}` : ''}`);
      }
    } catch (e: any) {
      setCampaignResult(`Erro • ${e?.message || 'Falha inesperada'}`);
    } finally {
      setSendingCampaign(false);
    }
  };
  
  // Send to all contacts in the selected segment (WhatsApp)
  const doBulkSendWhatsApp = async () => {
    if (disabled || channel !== 'whatsapp' || !useTemplate || !templateName) return;
    
    setSendingCampaign(true);
    setCampaignResult(null);
    setShowBulkConfirm(false);
    
    try {
      // Get all recipients from the selected segment
      if (!clinicId) {
        throw new Error('Clínica não selecionada');
      }
      console.log(`[UI] Fetching full contact list for segment ${segment}, clinicId=${clinicId}`);
      const res = await fetch(`/api/v2/doctor/broadcast/audience?segment=${encodeURIComponent(segment)}&full=true&clinicId=${encodeURIComponent(clinicId)}&channel=${encodeURIComponent(channel)}`, { 
        headers: { 'Cache-Control': 'no-cache' } 
      });
      
      if (!res.ok) {
        throw new Error('Falha ao carregar lista de contatos');
      }
      
      const json = await res.json();
      const recipients = Array.isArray(json?.data?.contacts) ? json.data.contacts : [];
      console.log(`[UI] Loaded ${recipients.length} contacts for bulk send`);
      
      if (recipients.length === 0) {
        setCampaignResult('Nenhum contato encontrado no segmento selecionado.');
        return;
      }
      
      // Initialize progress
      const total = recipients.length;
      let sent = 0;
      let failed = 0;
      setBulkSendProgress({ total, sent, failed });
      
      // Process in batches to avoid overwhelming the server
      const batchSize = 5;
      const batches = [];
      
      for (let i = 0; i < recipients.length; i += batchSize) {
        batches.push(recipients.slice(i, i + batchSize));
      }
      
      for (const batch of batches) {
        const promises = batch.map(async (recipient: any) => {
          if (!recipient.phone) return { success: false, error: 'Sem telefone' };
          
          const phone = String(recipient.phone).replace(/\D+/g, '');
          if (phone.length < 10) return { success: false, error: 'Telefone inválido' };
          
          const body: any = { 
            clinicId, 
            to: phone, 
            message,
            useTemplate: true,
            templateName,
            templateLanguage: templateLanguage || 'pt_BR',
            campaignId: campaignId || undefined,
          };
          
          try {
            const res = await fetch('/api/integrations/whatsapp/send', { 
              method: 'POST', 
              headers: { 'Content-Type': 'application/json' }, 
              body: JSON.stringify(body) 
            });
            
            const json = await res.json().catch(() => ({}));
            return { success: res.ok, messageId: json?.messageId, error: json?.error };
          } catch (e: any) {
            return { success: false, error: e?.message || 'Erro desconhecido' };
          }
        });
        
        const results = await Promise.all(promises);
        
        // Update progress
        sent += results.filter(r => r.success).length;
        failed += results.filter(r => !r.success).length;
        setBulkSendProgress({ total, sent, failed });
        
        // Small delay between batches
        if (batches.indexOf(batch) < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      setCampaignResult(`Envio em massa concluído: ${sent} enviados, ${failed} falhas de ${total} contatos.`);
    } catch (e: any) {
      setCampaignResult(`Erro no envio em massa: ${e?.message || 'Falha inesperada'}`);
    } finally {
      setSendingCampaign(false);
      setBulkSendProgress(null);
    }
  };

  const handleSchedule = async (scheduledFor?: string) => {
    if (!clinicId) return;
    
    setScheduling(true);
    setScheduleError(null);
    
    try {
      // Implementation of scheduling logic
      setScheduleResult(`Mensagem programada para ${scheduledFor || 'agora'}`);
      setIsScheduled(true);
    } catch (error) {
      console.error('Error scheduling message:', error);
      setScheduleError('Erro ao agendar mensagem. Tente novamente.');
      setIsScheduled(false);
    } finally {
      setScheduling(false);
    }
  };

  const handleScheduleDate = (date: Date | null) => {
    if (date) {
      setScheduleDate(date.toISOString());
      setScheduleLater(true);
      handleSchedule(`o dia ${date.toLocaleDateString('pt-BR')}`);
    }
  };

  const handleSendNow = () => {
    setScheduleLater(false);
    handleSchedule('agora');
  };

  const handleBulkSend = () => {
    // Implementation for bulk send
    handleSendNow();
  };

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24 bg-gray-50">

          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">Broadcast</h1>
              <p className="text-xs text-gray-500">Crie, segmente, agende e envie campanhas</p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/doctor/broadcast/scheduled">
                <Button variant="outline" size="sm">Ver agendamentos</Button>
              </Link>
            </div>
          </div>
          

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left: Form sections */}
            <div className="lg:col-span-8 space-y-3">
              {/* Channel Tabs */}
              <div className="bg-white border border-gray-200 rounded-2xl p-2 flex w-full">
                <button
                  onClick={() => setChannel('whatsapp')}
                  className={`flex-1 h-9 rounded-lg text-sm ${channel==='whatsapp' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'}`}
                  disabled={disabled}
                >WhatsApp</button>
                <button
                  onClick={() => { setChannel('sms'); setUseTemplate(false); }}
                  className={`flex-1 h-9 rounded-lg text-sm ${channel==='sms' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'} ml-2`}
                  disabled={disabled}
                >SMS</button>
                <button
                  onClick={() => { setChannel('email'); setUseTemplate(false); }}
                  className={`flex-1 h-9 rounded-lg text-sm ${channel==='email' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'} ml-2`}
                  disabled={disabled}
                >Email</button>
              </div>

              {/* Composer */}
              <Card className="bg-white border border-gray-200 shadow-sm rounded-2xl">
                <CardHeader className="px-4 py-3 border-b border-gray-100">
                  <CardTitle className="text-sm font-semibold text-gray-900">Composer</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-3 space-y-3">
                  {channel==='email' ? (
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Assunto</label>
                        <input
                          type="text"
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                          className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300"
                          placeholder="Ex.: Atualização importante da clínica"
                          disabled={disabled}
                        />
                      </div>
                      <label className="block text-xs text-gray-600 mb-1">Corpo do email (rich text)</label>
                      {/* Toolbar */}
                      <div className="flex flex-wrap items-center gap-1 border border-gray-200 rounded-md p-1 bg-gray-50">
                        <button type="button" className="px-2 py-1 text-xs rounded hover:bg-gray-200" onClick={() => emailEditor?.chain().focus().toggleBold().run()} disabled={!emailEditor}>Negrito</button>
                        <button type="button" className="px-2 py-1 text-xs rounded hover:bg-gray-200" onClick={() => emailEditor?.chain().focus().toggleItalic().run()} disabled={!emailEditor}>Itálico</button>
                        <button type="button" className="px-2 py-1 text-xs rounded hover:bg-gray-200" onClick={() => emailEditor?.chain().focus().toggleUnderline().run()} disabled={!emailEditor}>Sublinhar</button>
                        <span className="mx-1 h-4 w-px bg-gray-300" />
                        <button type="button" className="px-2 py-1 text-xs rounded hover:bg-gray-200" onClick={() => emailEditor?.chain().focus().toggleBulletList().run()} disabled={!emailEditor}>Lista</button>
                        <button type="button" className="px-2 py-1 text-xs rounded hover:bg-gray-200" onClick={() => emailEditor?.chain().focus().toggleOrderedList().run()} disabled={!emailEditor}>Numerada</button>
                        <button type="button" className="px-2 py-1 text-xs rounded hover:bg-gray-200" onClick={() => emailEditor?.chain().focus().toggleBlockquote().run()} disabled={!emailEditor}>Citação</button>
                        <span className="mx-1 h-4 w-px bg-gray-300" />
                        <button type="button" className="px-2 py-1 text-xs rounded hover:bg-gray-200" onClick={() => emailEditor?.chain().focus().unsetAllMarks().clearNodes().run()} disabled={!emailEditor}>Limpar</button>
                      </div>
                      <div className="min-h-[140px] border border-gray-300 rounded-md bg-white p-3">
                        {emailEditor ? (
                          <EditorContent editor={emailEditor} />
                        ) : (
                          <div className="text-xs text-gray-500">Carregando editor…</div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* SMS: sempre mensagem livre */}
                      {channel==='sms' && (
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Mensagem</label>
                          <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            rows={5}
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300"
                            placeholder="Escreva sua mensagem SMS"
                            disabled={disabled}
                          />
                          <p className="mt-1 text-[11px] text-gray-500">SMS: sem templates. Máx. ~160 caracteres por SMS (custos por mensagem).</p>
                        </div>
                      )}

                      {/* WhatsApp: seleção de modo de conteúdo */}
                      {channel==='whatsapp' && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <label className="block text-xs text-gray-600">Conteúdo</label>
                            <div className="flex rounded-full border border-gray-300 overflow-hidden">
                              <button
                                type="button"
                                onClick={() => { setWaContentMode('free'); setUseTemplate(false); }}
                                className={`px-3 py-1 text-xs ${waContentMode==='free' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'}`}
                              >Mensagem livre</button>
                              <button
                                type="button"
                                onClick={() => { setWaContentMode('template'); setUseTemplate(true); }}
                                className={`px-3 py-1 text-xs ${waContentMode==='template' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'}`}
                              >Template aprovado</button>
                            </div>
                          </div>

                          {waContentMode==='free' && (
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
                              <p className="mt-1 text-[11px] text-amber-700">Atenção: mensagens livres só funcionam dentro da janela de 24h da última interação. Fora da janela, use um template aprovado.</p>
                            </div>
                          )}

                          {waContentMode==='template' && (
                            <div className="flex items-center gap-2 flex-wrap">
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
                                <option value="">{loadingTemplates ? 'Carregando templates…' : 'Selecione um template aprovado'}</option>
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
                              <span className="text-[12px] text-gray-600">
                                <a href="/doctor/integrations/whatsapp/templates" className="underline hover:no-underline">
                                  Criar/gerenciar templates
                                </a>
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                  {useTemplate && templatesError && (
                    <p className="text-[11px] text-red-600">{templatesError}</p>
                  )}
                  {useTemplate && templateLoadError && (
                    <p className="text-[11px] text-red-600">{templateLoadError}</p>
                  )}
                  {useTemplate && !templatesError && approvedTemplates.length > 0 && (
                    <p className="text-[11px] text-gray-500">{approvedTemplates.length} templates aprovados disponíveis</p>
                  )}
                  {/* Amostra removida para interface minimalista */}
                </CardContent>
              </Card>
              

              {/* Audiência */}
              <Card className="bg-white border border-gray-200 shadow-sm rounded-2xl">
                <CardHeader className="px-4 py-3 border-b border-gray-100">
                  <CardTitle className="text-sm font-semibold text-gray-900">Audiência</CardTitle>
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
                  </div>
                  {bulkSendMode && (
                    <div className="border border-gray-200 bg-gray-50 rounded-lg p-2">
                      <div className="flex flex-wrap gap-3 text-[11px] text-gray-800">
                        <div><strong>Todos:</strong> {audienceTotals.totalPatients}</div>
                        <div><strong>{channel==='sms' ? 'Aptos para SMS' : channel==='email' ? 'Aptos para Email' : 'Aptos para WhatsApp'}:</strong> {audienceTotals.eligibleCount}</div>
                        <div><strong>{channel==='email' ? 'Sem email ou inválidos' : 'Sem telefone ou inválidos'}:</strong> {audienceTotals.invalidCount}</div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Envio */}
              <Card className="bg-white border border-gray-200 shadow-sm rounded-2xl">
                <CardHeader className="px-4 py-3 border-b border-gray-100">
                  <CardTitle className="text-sm font-semibold text-gray-900">Envio</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-3 space-y-2">
                  <div className="text-[12px] text-gray-600">Envio para todos os contatos do segmento selecionado em <strong>Audiência</strong>.</div>
                  <div className="text-[12px] text-gray-700">Segmento: <span className="font-medium">{segment === 'all' ? 'Todos' : segment === 'inactive_30d' ? 'Inativos 30 dias' : segment === 'birthday_7d' ? 'Aniversariantes 7 dias' : 'Compraram 30 dias'}</span> • Contatos: <span className="font-medium">{audienceSize || 0}</span></div>
                  {(channel==='whatsapp' || channel==='sms' || channel==='email') && (
                    <div className="flex items-center gap-2 flex-wrap pt-1">
                      <Button
                        size="sm"
                        className="h-8 bg-gray-900 hover:bg-gray-800 text-white"
                        onClick={() => {
                          const ch = String(channel);
                          if ((audienceSize || 0) === 0) return;
                          if (ch === 'whatsapp') return doBulkSendWhatsApp();
                          if (ch === 'sms') return doBulkSendSMS();
                          return doBulkSendEmail();
                        }}
                        disabled={sendingCampaign || (audienceSize || 0) === 0 || (String(channel) === 'email' && !canBulkEmailNow)}
                      >
                        {sendingCampaign ? 'Enviando…' : (channel==='whatsapp' ? 'Enviar WhatsApp' : channel==='sms' ? 'Enviar SMS' : 'Enviar Email')}
                      </Button>
                      <span className="text-[11px] text-gray-500">Envia para {audienceSize || 0} contatos do segmento selecionado.</span>
                    </div>
                  )}

                  {/* Progresso de envio em massa (qualquer canal) */}
                  {bulkSendProgress && (
                    <div className="border border-blue-200 bg-blue-50 rounded-lg p-3 my-2">
                      <p className="text-sm font-medium text-blue-800">Enviando mensagens...</p>
                      <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                        <div 
                          className="bg-blue-600 h-2.5 rounded-full" 
                          style={{ width: `${Math.round((bulkSendProgress.sent + bulkSendProgress.failed) / bulkSendProgress.total * 100)}%` }}
                        ></div>
                      </div>
                      <p className="text-xs text-blue-700 mt-1">
                        Progresso: {bulkSendProgress.sent + bulkSendProgress.failed} de {bulkSendProgress.total} ({bulkSendProgress.sent} enviados, {bulkSendProgress.failed} falhas)
                      </p>
                    </div>
                  )}

                  {campaignResult && (
                    <p className="text-[11px] text-gray-600 mt-1">{campaignResult}</p>
                  )}
                </CardContent>
              </Card>

              {/* Schedule */}
              <Card className="bg-white border border-gray-200 shadow-sm rounded-2xl">
                <CardHeader className="px-4 py-3 border-b border-gray-100">
                  <CardTitle className="text-sm font-semibold text-gray-900">Agendamento</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-gray-700">Programar para depois</div>
                    <Switch checked={scheduleLater} onCheckedChange={(v) => setScheduleLater(Boolean(v))} disabled={disabled} />
                  </div>
                  <p className="text-[11px] text-gray-500">Defina uma data e hora para enviar automaticamente.</p>
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
                      {channel !== 'whatsapp' && (
                        <div className="md:col-span-3 text-[11px] text-gray-500">Preencha também o <strong>Campaign ID</strong> em Audience para habilitar o agendamento.</div>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    <Button size="sm" className="h-8 bg-gray-900 hover:bg-gray-800 text-white"
                      onClick={doSchedule}
                      disabled={!scheduleLater || !scheduleDate || !scheduleTime || !campaignId}
                    >
                      Agendar {channel === 'email' ? 'Email' : channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}
                    </Button>
                    <span className="text-[11px] text-gray-500">Programa este canal para a data/hora acima.</span>
                  </div>
                  {scheduleResult && <p className="text-[11px] text-gray-600">{scheduleResult}</p>}
                  <p className="text-[11px] text-gray-500">Fora da 24h, use templates aprovados (WhatsApp). Integração de templates será adicionada nesta página.</p>

                  {/* Envio movido para o card 'Envio' */}
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
                  {channel==='sms' ? (
                    <div className="border border-gray-200 rounded-[24px] p-4 bg-[#f2f2f7]">
                      <div className="text-[11px] text-gray-600 mb-2">SMS • Prévia</div>
                      {/* Phone chat area (SMS style) */}
                      <div className="relative mx-auto max-w-[360px] bg-[#f2f2f7] rounded-[24px] border border-gray-200 p-3 shadow-sm">
                        <div className="flex justify-end">
                          <div className="max-w-[85%] bg-[#34C759] text-white rounded-2xl rounded-tr-md p-3 text-[13px] whitespace-pre-wrap leading-snug shadow-sm">
                            {message || 'Sua mensagem SMS aparecerá aqui…'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : channel==='whatsapp' ? (
                    <div className="border border-gray-200 rounded-[24px] p-4 bg-[#eae6df]">
                      <div className="text-[11px] text-gray-600 mb-2">WhatsApp • Prévia</div>
                      {/* Phone chat area */}
                      <div className="relative mx-auto max-w-[360px] bg-[#efeae2] rounded-[24px] border border-[#dbd3c3] p-3 shadow-sm">
                        {/* Incoming bubble */}
                        {channel==='whatsapp' && useTemplate && templateName ? (
                          <div className="max-w-[85%]">
                            <div className="bg-white rounded-2xl rounded-tl-md p-3 text-[13px] text-gray-900 shadow-sm border border-gray-200">
                            {/* HEADER */}
                            {templateHeader?.format === 'TEXT' && renderedHeaderText && (
                              <div className="font-semibold mb-1 text-[13px] leading-snug">{renderedHeaderText}</div>
                            )}
                            {templateHeader && templateHeader.format && templateHeader.format !== 'TEXT' && (
                              <div className="mb-2 text-[12px] text-gray-600 italic">{templateHeader.format} • pré-visualização não textual</div>
                            )}
                            {/* BODY */}
                            <div className="whitespace-pre-wrap leading-snug">
                              {renderedBodyText || '—'}
                            </div>
                            {/* FOOTER */}
                            {renderedFooterText && (
                              <div className="mt-2 text-[11px] text-gray-500 border-t border-gray-100 pt-2">{renderedFooterText}</div>
                            )}
                            {/* BUTTONS */}
                            {Array.isArray(templateButtons) && templateButtons.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-gray-100">
                                <div className="flex flex-col gap-2">
                                  {templateButtons.map((b: any, i: number) => (
                                    <button
                                      key={i}
                                      className="w-full text-left text-[13px] px-3 py-2 rounded-md border border-[#d1e7dd] bg-[#f0fff4] text-[#1d7a4a] hover:bg-[#e7ffef]"
                                      type="button"
                                      disabled
                                    >
                                      {b.type === 'QUICK_REPLY' && (b.text || 'Resposta rápida')}
                                      {b.type === 'URL' && (b.text || b.url || 'Abrir link')}
                                      {b.type === 'PHONE_NUMBER' && (b.text || b.phone_number || 'Ligar')}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="max-w-[85%]">
                          <div className="bg-white rounded-2xl rounded-tl-md p-3 text-[13px] text-gray-900 shadow-sm border border-gray-200 whitespace-pre-wrap min-h-[80px]">
                            {previewText || 'Sua mensagem aparecerá aqui…'}
                          </div>
                        </div>
                      )}
                      </div>
                    </div>
                  ) : (
                    <div className="border border-gray-200 rounded-[24px] p-4 bg-white">
                      <div className="text-[11px] text-gray-600 mb-2">Email • Prévia</div>
                      <div className="border border-gray-200 rounded-lg p-3 bg-white">
                        <div className="text-[11px] text-gray-500 mb-1">Para: <span className="text-gray-800">{to || '(destinatário de teste)'}</span></div>
                        <div className="text-[12px] text-gray-900 font-semibold mb-2">{subject || '(sem assunto)'}</div>
                        <div className="text-[13px] text-gray-800 min-h-[80px] border border-dashed border-gray-200 rounded-md p-2 bg-white" dangerouslySetInnerHTML={{ __html: htmlBody || '<em>(sem conteúdo)</em>' }} />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
