"use client";

import { useEffect, useMemo, useState, useRef, useCallback, memo } from "react";
import type React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useClinic } from "@/contexts/clinic-context";
import { toast } from "react-hot-toast";

// Simple page inspired by broadcast scheduling UI: list + create/edit panel
export default function MessageTemplatesPage() {
  const router = useRouter();
  type Channel = "email" | "whatsapp" | "sms";
  type RenderStrategy = "raw_html" | "mjml";

  type Template = {
    id: string;
    name: string;
    channel: Channel;
    subject?: string | null;
    html?: string | null;
    text?: string | null;
    mjml?: string | null;
    renderStrategy?: RenderStrategy | null;
    fromName?: string | null;
    fromEmail?: string | null;
    replyTo?: string | null;
    provider?: string | null;
    waTemplateName?: string | null;
    waLanguage?: string | null;
    waCategory?: string | null;
    waComponents?: any | null;
    waStatus?: string | null;
    waProviderId?: string | null;
    variablesSchema?: any | null;
    sampleVariables?: any | null;
    tags?: string[] | null;
    smsMaxSegments?: number | null;
    isActive: boolean;
  };

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Template[]>([]);
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<"" | Channel>("");

  // New/Edit form state
  const [editing, setEditing] = useState<Template | null>(null);
  const [form, setForm] = useState<any>({ channel: "email", name: "" });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [modalStage, setModalStage] = useState<'choose'|'form'>('choose');

  // Email sender integration (by clinic)
  const { currentClinic } = useClinic();
  type EmailSender = { exists: boolean; status?: 'VERIFIED'|'PENDING'|'DISCONNECTED'; email?: string|null; senderName?: string|null };
  const [senderInfo, setSenderInfo] = useState<EmailSender | null>(null);
  const [senderLoading, setSenderLoading] = useState(false);
  const [whatsappIntegrations, setWhatsappIntegrations] = useState<any[]>([]);
  const [whatsappLoading, setWhatsappLoading] = useState(false);
  const [syncingTemplate, setSyncingTemplate] = useState<string | null>(null);
  const hasVerifiedSender = senderInfo?.exists && senderInfo?.status === 'VERIFIED' && !!senderInfo?.email;

  const filtered = useMemo(() => {
    return items.filter((t) =>
      (channelFilter ? t.channel === channelFilter : true) &&
      (search ? (t.name?.toLowerCase() || "").includes(search.toLowerCase()) : true)
    );
  }, [items, channelFilter, search]);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const qs = new URLSearchParams();
      if (channelFilter) qs.set("channel", channelFilter);
      if (search) qs.set("search", search);
      const res = await fetch(`/api/v2/doctor/message-templates?${qs.toString()}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setItems(Array.isArray(json?.data) ? json.data : []);
    } catch (e: any) {
      setError(e?.message || "Falha ao carregar templates");
    } finally {
      setLoading(false);
    }
  }

  // Load email sender for clinic when opening modal form for email
  useEffect(() => {
    const shouldLoadEmail = showCreateModal && modalStage === 'form' && (form.channel === 'email') && currentClinic?.id;
    if (shouldLoadEmail) {
      let active = true;
      (async () => {
        try {
          setSenderLoading(true);
          const res = await fetch(`/api/integrations/email/senders/by-clinic?clinicId=${encodeURIComponent(currentClinic!.id)}`, { cache: 'no-store' });
          const json = await res.json().catch(()=>({}));
          if (!active) return;
          if (!res.ok || json?.error) {
            // keep previous senderInfo, just stop loading
            return;
          }
          setSenderInfo(json || null);
          // Prefill from verified sender if fields empty
          if (json?.exists && json?.status === 'VERIFIED') {
            setForm((prev:any) => ({
              ...prev,
              fromEmail: prev.fromEmail || json.email || '',
              fromName: prev.fromName || json.senderName || '',
              replyTo: prev.replyTo || json.email || ''
            }));
          }
        } finally {
          if (active) setSenderLoading(false);
        }
      })();
      return () => { active = false };
    }
    
    // Load WhatsApp integrations when opening modal form for WhatsApp
    const shouldLoadWhatsApp = showCreateModal && modalStage === 'form' && (form.channel === 'whatsapp') && currentClinic?.id;
    if (shouldLoadWhatsApp) {
      let active = true;
      setWhatsappLoading(true);
      (async () => {
        try {
          // Buscar integrações WhatsApp existentes
          const res = await fetch(`/api/integrations/whatsapp/status?clinicId=${encodeURIComponent(currentClinic!.id)}`, { cache: 'no-store' });
          const json = await res.json().catch(() => ({}));
          if (!active) return;
          
          if (res.ok && json?.exists) {
            // Formato da resposta de status: { exists: true, phoneNumberId: '...', wabaId: '...', meta: {...} }
            const integration = {
              id: json.phoneNumberId,
              phoneNumber: json.phoneNumber || json.phoneNumberId,
              name: 'WhatsApp Business API'
            };
            setWhatsappIntegrations([integration]);
          }
        } catch (err) {
          console.error('Error loading WhatsApp integrations:', err);
        } finally {
          if (active) setWhatsappLoading(false);
        }
      })();
      return () => { active = false };
    }
  }, [showCreateModal, modalStage, form.channel, currentClinic?.id, form.provider]);

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  function defaultsForChannel(ch: Channel) {
    if (ch === 'email') {
      return {
        name: 'Novo Email',
        channel: 'email',
        subject: 'Informação importante da sua clínica',
        html: '<p>Olá {{first_name}},</p><p>Esperamos que esteja bem!</p><p>Atenciosamente,<br>{{doctor_name}}<br>{{clinic_name}}</p>',
        text: 'Olá {{first_name}}, Esperamos que esteja bem! Atenciosamente, {{doctor_name}} - {{clinic_name}}',
        renderStrategy: 'raw_html',
        fromName: '',
        fromEmail: '',
        replyTo: '',
        isActive: true,
      };
    }
    if (ch === 'whatsapp') {
      // Pré-preencher somente o obrigatório pela Meta: language, category e um BODY vazio
      // O usuário deverá informar: waTemplateName, BODY (texto) e selecionar a integração (provider)
      return {
        name: 'Novo Template WhatsApp',
        channel: 'whatsapp',
        provider: '',
        waTemplateName: '',
        waLanguage: 'pt_BR',
        waCategory: 'UTILITY',
        waComponents: JSON.stringify({ body: { text: '' } }, null, 2),
        isActive: true,
      };
    }
    // sms
    return {
      name: 'Novo SMS',
      channel: 'sms',
      text: 'Olá {{first_name}}, temos informações importantes para você. Atenciosamente, {{clinic_name}}',
      smsMaxSegments: 2,
      isActive: true,
    };
  }

  function startCreateWithChannel(ch: Channel) {
    setEditing(null);
    setForm(defaultsForChannel(ch));
    setModalStage('form');
  }

  function startEdit(t: Template) {
    setEditing(t);
    setForm({ ...t, waComponents: t.waComponents ? JSON.stringify(t.waComponents, null, 2) : "", variablesSchema: t.variablesSchema ? JSON.stringify(t.variablesSchema, null, 2) : "", sampleVariables: t.sampleVariables ? JSON.stringify(t.sampleVariables, null, 2) : "" });
    setShowCreateModal(true);
    setModalStage('form');
  }

  function updateForm(patch: any) {
    setForm((prev: any) => ({ ...prev, ...patch }));
  }

  function resetForm() {
    // default back to email for convenience
    setEditing(null);
    setForm(defaultsForChannel('email'));
    setModalStage('choose');
    setShowCreateModal(false);
  }

  async function save() {
    try {
      setSaving(true);
      setError(null);
      const payload = { ...form };
      // Parse JSON fields
      if (payload.waComponents && typeof payload.waComponents === 'string') {
        try { payload.waComponents = JSON.parse(payload.waComponents); } catch { /* keep string */ }
      }
      if (payload.variablesSchema && typeof payload.variablesSchema === 'string') {
        try { payload.variablesSchema = JSON.parse(payload.variablesSchema); } catch { /* keep string */ }
      }
      if (payload.sampleVariables && typeof payload.sampleVariables === 'string') {
        try { payload.sampleVariables = JSON.parse(payload.sampleVariables); } catch { /* keep string */ }
      }

      const isEdit = !!editing?.id;
      const url = isEdit ? `/api/v2/doctor/message-templates/${editing!.id}` : `/api/v2/doctor/message-templates`;
      const method = isEdit ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      await load();
      resetForm();
    } catch (e: any) {
      setError(e?.message || 'Falha ao salvar template');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Remover este template?')) return;
    const res = await fetch(`/api/v2/doctor/message-templates/${id}`, { method: 'DELETE' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { alert(json?.error || `HTTP ${res.status}`); return; }
    await load();
  }
  
  // Sincronizar template WhatsApp com a API do WhatsApp Business
  async function syncWhatsAppTemplate(id: string) {
    if (!currentClinic?.id) {
      toast.error('Clínica não identificada');
      return;
    }
    
    try {
      setSyncingTemplate(id);
      const res = await fetch('/api/v2/doctor/message-templates/sync-to-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: id, clinicId: currentClinic.id })
      });
      
      const json = await res.json();
      
      if (!res.ok) {
        toast.error(json?.error || 'Erro ao sincronizar template');
        return;
      }
      
      toast.success(json?.message || 'Template enviado para aprovação no WhatsApp');
      await load(); // Recarregar lista para atualizar status
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao sincronizar template');
    } finally {
      setSyncingTemplate(null);
    }
  }

  const channel = form.channel as Channel;

  // Helpers para WhatsApp
  const getWaBodyText = useCallback(() => {
    try {
      const obj = typeof form.waComponents === 'string' ? JSON.parse(form.waComponents || '{}') : (form.waComponents || {});
      return obj?.body?.text || '';
    } catch {
      return '';
    }
  }, [form.waComponents]);

  const canCreateWhatsApp = useMemo(() => {
    if (channel !== 'whatsapp') return true;
    const hasName = !!(form.waTemplateName && String(form.waTemplateName).trim());
    const hasLang = !!(form.waLanguage && String(form.waLanguage).trim());
    const hasCat = !!(form.waCategory && String(form.waCategory).trim());
    const hasBody = !!getWaBodyText().trim();
    const hasProvider = !!(form.provider && String(form.provider).trim());
    return hasName && hasLang && hasCat && hasBody && hasProvider;
  }, [channel, form.waTemplateName, form.waLanguage, form.waCategory, form.provider, getWaBodyText]);

  // Personalization variables available to insert (memoized so it stays stable)
  const availableVars = useMemo(() => ([
    { key: "first_name", label: "Nome" },
    { key: "full_name", label: "Nome completo" },
    { key: "email", label: "Email" },
    { key: "doctor_name", label: "Nome do doutor" },
    { key: "clinic_name", label: "Nome da clínica" },
  ]), []);

  // Tiny helper: insert text at caret in a contenteditable element
  function insertAtSelection(text: string) {
    const sel = window.getSelection?.();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const node = document.createTextNode(text);
    range.deleteContents();
    range.insertNode(node);
    // move caret after inserted node
    range.setStartAfter(node);
    range.setEndAfter(node);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  const HtmlEditor = memo(function HtmlEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
    const [color, setColor] = useState<string>("#111827");
    const editorRef = useRef<HTMLDivElement | null>(null);
    const isFocusedRef = useRef(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const linkModalRef = useRef<HTMLDivElement | null>(null);
    const [showLink, setShowLink] = useState(false);
    const [linkUrl, setLinkUrl] = useState("");
    const savedRangeRef = useRef<Range | null>(null);

    const ref = (node: HTMLDivElement | null) => {
      editorRef.current = node;
      if (node && !isFocusedRef.current && node.innerHTML !== (value || "")) {
        node.innerHTML = value || "";
      }
    };
    useEffect(() => {
      const el = editorRef.current;
      if (!el) return;
      // Only sync external value when not focused
      if (!isFocusedRef.current && el.innerHTML !== (value || "")) {
        el.innerHTML = value || "";
      }
    }, [value]);

    const exec = (cmd: string, arg?: string) => document.execCommand(cmd, false, arg);

    const saveSelection = () => {
      const sel = window.getSelection?.();
      if (sel && sel.rangeCount > 0) savedRangeRef.current = sel.getRangeAt(0);
    };
    const restoreSelection = () => {
      const sel = window.getSelection?.();
      if (sel && savedRangeRef.current) {
        sel.removeAllRanges();
        sel.addRange(savedRangeRef.current);
      }
    };
    const getAnchorAtSelection = (): HTMLAnchorElement | null => {
      const sel = window.getSelection?.();
      if (!sel || sel.rangeCount === 0) return null;
      const range = sel.getRangeAt(0);
      let node: Node | null = range.commonAncestorContainer;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
      while (node && (node as HTMLElement).nodeType === 1) {
        const el = node as HTMLElement;
        if (el.tagName === 'A') return el as HTMLAnchorElement;
        node = el.parentElement;
      }
      // Fallback: check startContainer parent
      let sc: Node | null = range.startContainer;
      if (sc && sc.nodeType === Node.TEXT_NODE) sc = sc.parentNode;
      if (sc && (sc as HTMLElement).tagName === 'A') return sc as HTMLAnchorElement;
      return null;
    };
    const normalizeUrl = (raw: string) => {
      const v = (raw || '').trim();
      if (!v) return '';
      if (/^https?:\/\//i.test(v)) return v;
      return `https://${v}`;
    };
    const normalizeAnchors = () => {
      const root = editorRef.current;
      if (!root) return;
      const as = Array.from(root.querySelectorAll('a')) as HTMLAnchorElement[];
      for (const a of as) {
        const href = a.getAttribute('href') || '';
        if (href && !a.getAttribute('title')) a.setAttribute('title', href);
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
        // Force visual style inline to avoid Tailwind resets
        a.style.color = '#1d4ed8'; // blue-600
        a.style.textDecoration = 'underline';
        a.onmouseenter = () => { a.style.textDecoration = 'underline'; };
        a.onmouseleave = () => { a.style.textDecoration = 'underline'; };
      }
    };

    const makeLink = (rawUrl: string) => {
      const url = normalizeUrl(rawUrl);
      if (!url) return;
      // Focus first, then restore selection, then create link
      editorRef.current?.focus();
      const sel = window.getSelection?.();
      if (sel) {
        restoreSelection();
        const range = sel.rangeCount ? sel.getRangeAt(0) : null;
        // If selection is inside an existing single anchor, just update it
        const existingA = getAnchorAtSelection();
        if (existingA) {
          existingA.setAttribute('href', url);
          existingA.setAttribute('title', url);
          existingA.setAttribute('target', '_blank');
          existingA.setAttribute('rel', 'noopener noreferrer');
          normalizeAnchors();
          setShowLink(false);
          setLinkUrl('');
          if (editorRef.current) onChange(editorRef.current.innerHTML);
          return;
        }
        if (range && range.collapsed) {
          // Insert the URL text and select it
          const textNode = document.createTextNode(url);
          range.insertNode(textNode);
          sel.removeAllRanges();
          const newRange = document.createRange();
          newRange.setStartBefore(textNode);
          newRange.setEndAfter(textNode);
          sel.addRange(newRange);
        }
      }
      document.execCommand('createLink', false, url);
      // ensure attributes and tooltip on anchors
      normalizeAnchors();
      setShowLink(false);
      setLinkUrl('');
      // propagate value to parent
      if (editorRef.current) onChange(editorRef.current.innerHTML);
    };
    const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
      const html = (e.target as HTMLDivElement).innerHTML;
      // Do not update parent immediately; debounce to reduce re-renders
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (!isFocusedRef.current) onChange(html);
      }, 600);
    };
    const addVar = (key: string) => { insertAtSelection(`{{${key}}}`); // reflect in state
      const el = editorRef.current; if (el) onChange(el.innerHTML);
    };
    return (
      <>
      <div className="border border-gray-300 rounded-lg relative">
        <div className="flex flex-wrap items-center gap-1 px-2 py-1 border-b border-gray-200 bg-gray-50">
          <button type="button" className="text-xs px-2 py-1 rounded hover:bg-gray-100" onMouseDown={(e)=>{ e.preventDefault(); editorRef.current?.focus(); exec('bold'); }}><b>B</b></button>
          <button type="button" className="text-xs px-2 py-1 rounded hover:bg-gray-100" onMouseDown={(e)=>{ e.preventDefault(); editorRef.current?.focus(); exec('italic'); }}><i>I</i></button>
          <button type="button" className="text-xs px-2 py-1 rounded hover:bg-gray-100" onMouseDown={(e)=>{ e.preventDefault(); editorRef.current?.focus(); exec('underline'); }}><u>U</u></button>
          <span className="mx-1 w-px h-5 bg-gray-200" />
          <button type="button" className="text-xs px-2 py-1 rounded hover:bg-gray-100" onMouseDown={(e)=>{ e.preventDefault(); editorRef.current?.focus(); exec('formatBlock','H1'); }}>H1</button>
          <button type="button" className="text-xs px-2 py-1 rounded hover:bg-gray-100" onMouseDown={(e)=>{ e.preventDefault(); editorRef.current?.focus(); exec('formatBlock','H2'); }}>H2</button>
          <button type="button" className="text-xs px-2 py-1 rounded hover:bg-gray-100" onMouseDown={(e)=>{ e.preventDefault(); editorRef.current?.focus(); exec('formatBlock','P'); }}>Parágrafo</button>
          <span className="mx-1 w-px h-5 bg-gray-200" />
          <button type="button" className="text-xs px-2 py-1 rounded hover:bg-gray-100" onMouseDown={(e)=>{ e.preventDefault(); editorRef.current?.focus(); exec('insertUnorderedList'); }}>• Lista</button>
          <button type="button" className="text-xs px-2 py-1 rounded hover:bg-gray-100" onMouseDown={(e)=>{ e.preventDefault(); editorRef.current?.focus(); exec('insertOrderedList'); }}>1. Lista</button>
          <span className="mx-1 w-px h-5 bg-gray-200" />
          <button type="button" className="text-xs px-2 py-1 rounded hover:bg-gray-100" onMouseDown={(e)=>{ e.preventDefault(); saveSelection();
            // Prefill URL if selection currently within a link
            const a = getAnchorAtSelection();
            setLinkUrl(a?.getAttribute('href') || '');
            setShowLink(true);
          }}>Link</button>
          <span className="mx-1 w-px h-5 bg-gray-200" />
          <div className="flex items-center gap-1">
            <label className="text-[11px] text-gray-600">Cor</label>
            <input type="color" value={color} onChange={(e)=>{ setColor(e.target.value); editorRef.current?.focus(); exec('foreColor', e.target.value); }} className="h-6 w-6 p-0 border border-gray-200 rounded" />
          </div>
          <span className="mx-1 w-px h-5 bg-gray-200" />
          <div className="flex items-center gap-1">
            <label className="text-[11px] text-gray-600">Variáveis</label>
            <select className="h-7 border border-gray-300 rounded text-xs px-1 bg-white" onChange={(e)=>{ if (!e.target.value) return; editorRef.current?.focus(); addVar(e.target.value); e.currentTarget.selectedIndex = 0; }}>
              <option value="">Inserir…</option>
              {availableVars.map(v => (<option key={v.key} value={v.key}>{v.label}</option>))}
            </select>
          </div>
        </div>
        <div
          ref={ref}
          contentEditable
          className="editor min-h-[220px] px-3 py-2 text-sm focus:outline-none"
          onInput={handleInput}
          onFocus={()=>{ isFocusedRef.current = true; }}
          onBlur={()=>{ isFocusedRef.current = false; if (editorRef.current) onChange(editorRef.current.innerHTML); }}
          suppressContentEditableWarning
          spellCheck={false}
          style={{ whiteSpace: 'pre-wrap' }}
        />

        {showLink && (
          <div ref={linkModalRef} className="absolute top-9 left-2 z-10 bg-white border border-gray-200 shadow-md rounded-md p-2 w-64">
            <div className="text-xs text-gray-700 mb-1">Inserir link</div>
            <input
              className="w-full h-8 rounded border border-gray-300 px-2 text-sm mb-2"
              placeholder="https://..."
              value={linkUrl}
              onChange={(e)=>setLinkUrl(e.target.value)}
              onKeyDown={(e)=>{ if (e.key==='Enter') { e.preventDefault(); makeLink(linkUrl); }}}
            />
            <div className="flex justify-end gap-2">
              <button className="text-xs px-2 py-1 rounded border border-gray-300" onMouseDown={(e)=>{ e.preventDefault(); setShowLink(false); setLinkUrl(''); }}>Cancelar</button>
              <button className="text-xs px-2 py-1 rounded bg-gray-900 text-white" onMouseDown={(e)=>{ e.preventDefault(); makeLink(linkUrl); }}>Inserir</button>
            </div>
          </div>
        )}
      </div>
      <style jsx>{`
        .editor a {
          color: #1d4ed8; /* blue-600 */
          text-decoration: underline;
        }
        .editor a:hover {
          text-decoration: underline;
        }
      `}</style>
      </>
    );
  });

  // Stable handler so HtmlEditor doesn't re-render due to prop identity changes
  const handleHtmlChange = useCallback((html: string) => {
    setForm((prev: any) => (prev.html === html ? prev : { ...prev, html }));
  }, []);

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24 bg-gray-50 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-[20px] font-semibold text-gray-900 tracking-tight">Templates de Mensagem</h1>
              <p className="text-xs text-gray-500">Crie e gerencie templates</p>
            </div>
            <div className="flex gap-2">
              <Link href="/doctor/automation"><Button variant="outline" size="sm">Automations</Button></Link>
              <Button size="sm" onClick={()=>{ setShowCreateModal(true); setModalStage('choose'); }}>Novo template</Button>
            </div>
          </div>

          <Card className="bg-white border border-gray-100 shadow-none rounded-xl">
            <CardHeader className="px-3 py-2 border-b border-gray-100">
              <CardTitle className="text-sm font-medium text-gray-900">Listagem</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-3 space-y-3 text-sm">
              <div className="grid md:grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Canal</label>
                  <select value={channelFilter} onChange={(e)=>setChannelFilter(e.target.value as any)} className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm">
                    <option value="">Todos</option>
                    <option value="email">Email</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="sms">SMS</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs text-gray-600 mb-1">Buscar</label>
                  <input value={search} onChange={(e)=>setSearch(e.target.value)} onKeyDown={(e)=>{ if (e.key==='Enter') load(); }} className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm" placeholder="Nome do template" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={load} disabled={loading}>{loading ? 'Atualizando…' : 'Atualizar'}</Button>
              </div>

              <div className="border-t border-gray-100 pt-2">
                {filtered.length === 0 ? (
                  <p className="text-xs text-gray-500">Nenhum template encontrado.</p>
                ) : (
                  <div className="space-y-1.5">
                    {filtered.map((t) => (
                      <div key={t.id} className="px-2 py-1.5 border border-gray-100 rounded-md flex items-center justify-between">
                        <div className="text-sm">
                          <div className="font-medium text-gray-900">
                            {t.name} 
                            <span className="ml-1 text-[11px] text-gray-500">({t.channel})</span>
                            {t.channel === 'whatsapp' && (
                              t.waStatus === 'APPROVED' ? (
                                <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-800`}>
                                  APPROVED
                                </span>
                              ) : t.waStatus === 'REJECTED' ? (
                                <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-800`}>
                                  REJECTED
                                </span>
                              ) : ( // PENDING ou sem status porém já enviado
                                (t.waStatus === 'PENDING' || (!!t.waProviderId && !t.waStatus)) && (
                                  <Link href="/doctor/integrations/whatsapp/templates" className="ml-2 text-[11px] underline text-blue-600 hover:text-blue-700">
                                    Checar status
                                  </Link>
                                )
                              )
                            )}
                          </div>
                          <div className="text-[11px] text-gray-500">{t.channel === 'email' ? (t.subject || '—') : t.channel === 'whatsapp' ? (t.waTemplateName || '—') : (t.text?.slice(0,80) || '—')}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={()=>startEdit(t)}>Editar</Button>
                          {t.channel === 'whatsapp' && !t.waProviderId && (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => syncWhatsAppTemplate(t.id)}
                              disabled={syncingTemplate === t.id}
                            >
                              {syncingTemplate === t.id ? 'Enviando...' : 'Enviar p/ WhatsApp'}
                            </Button>
                          )}
                          <Button variant="outline" size="sm" onClick={()=>remove(t.id)}>Remover</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {showCreateModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/40" onClick={()=>{ setShowCreateModal(false); setModalStage('choose'); }} />
              <div className="relative bg-white rounded-xl shadow-xl border border-gray-100 w-full max-w-3xl mx-auto p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold text-gray-900">{editing ? 'Editar template' : (modalStage==='choose' ? 'Criar novo template' : 'Novo template')}</div>
                  <button className="text-gray-500 text-sm" onClick={()=>{ setShowCreateModal(false); setModalStage('choose'); }}>Fechar</button>
                </div>
                {modalStage === 'choose' ? (
                  <>
                    <p className="text-xs text-gray-500 mb-2">Selecione o tipo de canal para este template.</p>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={()=>startCreateWithChannel('email')}>Email</Button>
                      <Button size="sm" variant="outline" onClick={()=>startCreateWithChannel('whatsapp')}>WhatsApp</Button>
                      <Button size="sm" variant="outline" onClick={()=>startCreateWithChannel('sms')}>SMS</Button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-3 text-sm">
                    {error && <p className="text-[12px] text-red-600">{error}</p>}
                    <div className="grid md:grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Nome</label>
                        <input value={form.name || ''} onChange={(e)=>updateForm({ name: e.target.value })} className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Canal</label>
                        <select value={form.channel || 'email'} onChange={(e)=>updateForm({ channel: e.target.value })} className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm" disabled={!!editing}>
                          <option value="email">Email</option>
                          <option value="whatsapp">WhatsApp</option>
                          <option value="sms">SMS</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Ativo</label>
                        <select value={form.isActive ? 'yes' : 'no'} onChange={(e)=>updateForm({ isActive: e.target.value === 'yes' })} className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm">
                          <option value="yes">Sim</option>
                          <option value="no">Não</option>
                        </select>
                      </div>
                    </div>

                    {channel === 'email' && (
                      <div className="space-y-2">
                        {/* Sender selection from integration */}
                        {!hasVerifiedSender && (
                          <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2 flex items-center justify-between">
                            <span>Nenhum remetente verificado encontrado agora. Isso pode ser temporário. </span>
                            <div className="flex items-center gap-2">
                              <Button size="sm" variant="outline" onClick={()=>{
                                // manual refresh
                                if (!currentClinic?.id) return;
                                setSenderLoading(true);
                                fetch(`/api/integrations/email/senders/by-clinic?clinicId=${encodeURIComponent(currentClinic.id)}`, { cache: 'no-store' })
                                  .then(r=>r.json().then(j=>({ok:r.ok, j})))
                                  .then(({ok, j})=>{ if (ok && !j?.error) setSenderInfo(j); })
                                  .finally(()=> setSenderLoading(false));
                              }}>Atualizar</Button>
                              <Link href="/doctor/integrations" className="underline">Configurar integrações</Link>
                            </div>
                          </div>
                        )}
                        <div className="grid md:grid-cols-3 gap-2">
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Assunto</label>
                            <input value={form.subject || ''} onChange={(e)=>updateForm({ subject: e.target.value })} className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm" />
                          </div>
                          <div className="md:col-span-2" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">HTML</label>
                          <HtmlEditor value={form.html || ''} onChange={handleHtmlChange} />
                        </div>
                        <div className="grid md:grid-cols-3 gap-2">
                          <div className="md:col-span-2">
                            <div className="flex items-center justify-between">
                              <label className="block text-xs text-gray-600 mb-1">Remetente</label>
                              <div className="flex items-center gap-2">
                                {hasVerifiedSender && (
                                  <span className="text-[11px] text-gray-500">{senderInfo?.senderName || ''} &lt;{senderInfo?.email || ''}&gt;</span>
                                )}
                                <Link href="/doctor/integrations" className="text-[11px] text-blue-600 hover:underline">Gerenciar</Link>
                              </div>
                            </div>
                            <select
                              value={hasVerifiedSender ? `${senderInfo?.senderName || ''} <${senderInfo?.email || ''}>` : ''}
                              onChange={(e)=>{
                                const v = e.target.value;
                                const match = v.match(/^(.*) <(.*)>$/);
                                if (match) {
                                  updateForm({ fromName: match[1].trim(), fromEmail: match[2].trim() });
                                  if (!form.replyTo) updateForm({ replyTo: match[2].trim() });
                                }
                              }}
                              disabled={!hasVerifiedSender || senderLoading}
                              className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm"
                            >
                              <option value="">{senderLoading ? 'Carregando…' : hasVerifiedSender ? `${senderInfo?.senderName || ''} <${senderInfo?.email || ''}>` : 'Sem remetente verificado'}</option>
                              {hasVerifiedSender && (
                                <option value={`${senderInfo?.senderName || ''} <${senderInfo?.email || ''}>`}>
                                  {senderInfo?.senderName || ''} &lt;{senderInfo?.email || ''}&gt;
                                </option>
                              )}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Reply-To</label>
                            <select
                              value={form.replyTo || ''}
                              onChange={(e)=>updateForm({ replyTo: e.target.value })}
                              disabled={!hasVerifiedSender || senderLoading}
                              className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm"
                            >
                              <option value="">{senderLoading ? 'Carregando…' : hasVerifiedSender ? (senderInfo?.email || '') : '—'}</option>
                              {hasVerifiedSender && (
                                <option value={senderInfo?.email || ''}>{senderInfo?.email || ''}</option>
                              )}
                            </select>
                          </div>
                        </div>
                      </div>
                    )}

                    {channel === 'sms' && (
                      <div className="space-y-2">
                        <div>
                          <div className="flex items-center justify-between">
                            <label className="block text-xs text-gray-600 mb-1">Texto</label>
                            <div className="flex items-center gap-1">
                              <label className="text-[11px] text-gray-600">Variáveis</label>
                              <select 
                                className="h-7 border border-gray-300 rounded text-xs px-1 bg-white" 
                                onChange={(e)=>{
                                  if (!e.target.value) return;
                                  const token = `{{${e.target.value}}}`;
                                  const textarea = document.getElementById('sms-text') as HTMLTextAreaElement;
                                  if (textarea) {
                                    const start = textarea.selectionStart;
                                    const end = textarea.selectionEnd;
                                    const text = textarea.value;
                                    const newText = text.substring(0, start) + token + text.substring(end);
                                    updateForm({ text: newText });
                                    // Set cursor position after inserted token
                                    setTimeout(() => {
                                      textarea.focus();
                                      textarea.setSelectionRange(start + token.length, start + token.length);
                                    }, 0);
                                  } else {
                                    updateForm({ text: (form.text || '') + token });
                                  }
                                  e.currentTarget.selectedIndex = 0;
                                }}
                              >
                                <option value="">Inserir…</option>
                                {availableVars.map(v => (<option key={v.key} value={v.key}>{v.label}</option>))}
                              </select>
                            </div>
                          </div>
                          <textarea 
                            id="sms-text"
                            value={form.text || ''} 
                            onChange={(e)=>updateForm({ text: e.target.value })} 
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" 
                            rows={4} 
                            placeholder="Digite o texto da mensagem. Use variáveis como {{first_name}} para personalizar."
                          />
                        </div>
                        <div className="grid md:grid-cols-3 gap-2">
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Máx. segmentos (hint)</label>
                            <input type="number" min={1} value={form.smsMaxSegments || ''} onChange={(e)=>updateForm({ smsMaxSegments: Number(e.target.value)||null })} className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm" />
                          </div>
                        </div>
                      </div>
                    )}

                    {channel === 'whatsapp' && (
                      <div className="space-y-2">
                        <div className="grid md:grid-cols-3 gap-2">
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Template Name</label>
                            <input value={form.waTemplateName || ''} onChange={(e)=>updateForm({ waTemplateName: e.target.value })} className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm" placeholder="Nome do template no WhatsApp Business" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Idioma</label>
                            <select value={form.waLanguage || 'pt_BR'} onChange={(e)=>updateForm({ waLanguage: e.target.value })} className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm">
                              <option value="pt_BR">Português (Brasil)</option>
                              <option value="en_US">Inglês (EUA)</option>
                              <option value="es_ES">Espanhol</option>
                              <option value="fr_FR">Francês</option>
                              <option value="pt_PT">Português (Portugal)</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Categoria</label>
                            <select value={form.waCategory || ''} onChange={(e)=>updateForm({ waCategory: e.target.value })} className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm">
                              <option value="">Selecione...</option>
                              <option value="MARKETING">Marketing</option>
                              <option value="UTILITY">Utilitário</option>
                              <option value="AUTHENTICATION">Autenticação</option>
                            </select>
                          </div>
                        </div>
                        <div className="space-y-3">
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Título (opcional)</label>
                            <div className="flex items-center gap-2">
                              <input 
                                type="text" 
                                className="flex-1 h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm" 
                                placeholder="Ex: Confirmação de Consulta"
                                value={(() => {
                                  try {
                                    const json = JSON.parse(form.waComponents || '{}');
                                    return json.header?.text || '';
                                  } catch (e) { return ''; }
                                })()}
                                onChange={(e) => {
                                  let json = {};
                                  try { json = JSON.parse(form.waComponents || '{}'); } catch (e) {}
                                  
                                  if (e.target.value) {
                                    json = {
                                      ...json,
                                      header: {
                                        type: "text",
                                        text: e.target.value,
                                        parameters: []
                                      }
                                    };
                                  } else {
                                    // Remove header if empty
                                    const { header, ...rest } = json as any;
                                    json = rest;
                                  }
                                  
                                  updateForm({ waComponents: JSON.stringify(json, null, 2) });
                                }}
                              />
                            </div>
                          </div>
                          
                          <div>
                            <div className="flex items-center justify-between">
                              <label className="block text-xs text-gray-600 mb-1">Texto da mensagem</label>
                              <div className="flex items-center gap-1">
                                <label className="text-[11px] text-gray-600">Variáveis</label>
                                <select 
                                  className="h-7 border border-gray-300 rounded text-xs px-1 bg-white" 
                                  onChange={(e)=>{
                                    if (!e.target.value) return;
                                    const varName = e.target.value;
                                    const varIndex = (() => {
                                      try {
                                        const json = JSON.parse(form.waComponents || '{}');
                                        return (json.body?.parameters?.length || 0) + 1;
                                      } catch (e) { return 1; }
                                    })();
                                    
                                    // Inserir no textarea
                                    const textarea = document.getElementById('wa-body-text') as HTMLTextAreaElement;
                                    if (textarea) {
                                      const start = textarea.selectionStart;
                                      const end = textarea.selectionEnd;
                                      const text = textarea.value;
                                      const token = `{{${varIndex}}}`;
                                      const newText = text.substring(0, start) + token + text.substring(end);
                                      
                                      // Atualizar texto e parâmetros
                                      let json = {};
                                      try { json = JSON.parse(form.waComponents || '{}'); } catch (e) {}
                                      
                                      if (!json.body) json.body = {};
                                      if (!json.body.parameters) json.body.parameters = [];
                                      
                                      json.body.text = newText;
                                      json.body.parameters.push({"type": "text", "text": `{{${varName}}}`});
                                      
                                      updateForm({ waComponents: JSON.stringify(json, null, 2) });
                                      
                                      // Reposicionar cursor
                                      setTimeout(() => {
                                        textarea.focus();
                                        textarea.setSelectionRange(start + token.length, start + token.length);
                                      }, 0);
                                    }
                                    
                                    e.currentTarget.selectedIndex = 0;
                                  }}
                                >
                                  <option value="">Inserir variável...</option>
                                  {availableVars.map(v => (<option key={v.key} value={v.key}>{v.label}</option>))}
                                </select>
                              </div>
                            </div>
                            <textarea 
                              id="wa-body-text"
                              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" 
                              rows={3} 
                              placeholder="Ex: Olá {{1}}, sua consulta com Dr. {{2}} está confirmada."
                              value={(() => {
                                try {
                                  const json = JSON.parse(form.waComponents || '{}');
                                  return json.body?.text || '';
                                } catch (e) { return ''; }
                              })()}
                              onChange={(e) => {
                                let json = {};
                                try { json = JSON.parse(form.waComponents || '{}'); } catch (e) {}
                                
                                if (!json.body) json.body = {};
                                if (!json.body.parameters) json.body.parameters = [];
                                
                                json.body.text = e.target.value;
                                
                                updateForm({ waComponents: JSON.stringify(json, null, 2) });
                              }}
                            />
                            <div className="text-[11px] text-gray-500 mt-1">Use {'{{'}{'{'}1{'}'}{'}}'}, {'{{'}{'{'}2{'}'}{'}}'}, etc. para inserir variáveis no texto</div>
                          </div>
                          
                          <div>
                            <label className="flex items-center gap-2 text-xs text-gray-600 mb-1">
                              <input 
                                type="checkbox" 
                                className="h-4 w-4" 
                                checked={(() => {
                                  try {
                                    const json = JSON.parse(form.waComponents || '{}');
                                    return !!json.footer;
                                  } catch (e) { return false; }
                                })()}
                                onChange={(e) => {
                                  let json = {};
                                  try { json = JSON.parse(form.waComponents || '{}'); } catch (e) {}
                                  
                                  if (e.target.checked) {
                                    json = {
                                      ...json,
                                      footer: { text: "" }
                                    };
                                  } else {
                                    // Remove footer if unchecked
                                    const { footer, ...rest } = json as any;
                                    json = rest;
                                  }
                                  
                                  updateForm({ waComponents: JSON.stringify(json, null, 2) });
                                }}
                              />
                              <span>Incluir rodapé</span>
                            </label>
                            {(() => {
                              try {
                                const json = JSON.parse(form.waComponents || '{}');
                                if (json.footer) {
                                  return (
                                    <input 
                                      type="text" 
                                      className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm" 
                                      placeholder="Ex: Clique no botão abaixo para confirmar"
                                      value={json.footer.text || ''}
                                      onChange={(e) => {
                                        let json = {};
                                        try { json = JSON.parse(form.waComponents || '{}'); } catch (e) {}
                                        
                                        if (!json.footer) json.footer = {};
                                        json.footer.text = e.target.value;
                                        
                                        updateForm({ waComponents: JSON.stringify(json, null, 2) });
                                      }}
                                    />
                                  );
                                }
                              } catch (e) {}
                              return null;
                            })()}
                          </div>
                          
                          <div>
                            <label className="flex items-center gap-2 text-xs text-gray-600 mb-1">
                              <input 
                                type="checkbox" 
                                className="h-4 w-4" 
                                checked={(() => {
                                  try {
                                    const json = JSON.parse(form.waComponents || '{}');
                                    return Array.isArray(json.buttons) && json.buttons.length > 0;
                                  } catch (e) { return false; }
                                })()}
                                onChange={(e) => {
                                  let json = {};
                                  try { json = JSON.parse(form.waComponents || '{}'); } catch (e) {}
                                  
                                  if (e.target.checked) {
                                    json = {
                                      ...json,
                                      buttons: [
                                        {
                                          type: "url",
                                          url: {
                                            display_text: "Acessar",
                                            url: "https://example.com"
                                          }
                                        }
                                      ]
                                    };
                                  } else {
                                    // Remove buttons if unchecked
                                    const { buttons, ...rest } = json as any;
                                    json = rest;
                                  }
                                  
                                  updateForm({ waComponents: JSON.stringify(json, null, 2) });
                                }}
                              />
                              <span>Incluir botão de link</span>
                            </label>
                            {(() => {
                              try {
                                const json = JSON.parse(form.waComponents || '{}');
                                if (Array.isArray(json.buttons) && json.buttons.length > 0 && json.buttons[0].type === "url") {
                                  return (
                                    <div className="flex gap-2">
                                      <input 
                                        type="text" 
                                        className="w-1/2 h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm" 
                                        placeholder="Texto do botão"
                                        value={json.buttons[0].url?.display_text || ''}
                                        onChange={(e) => {
                                          let json = {};
                                          try { json = JSON.parse(form.waComponents || '{}'); } catch (e) {}
                                          
                                          if (Array.isArray(json.buttons) && json.buttons.length > 0) {
                                            if (!json.buttons[0].url) json.buttons[0].url = {};
                                            json.buttons[0].url.display_text = e.target.value;
                                          }
                                          
                                          updateForm({ waComponents: JSON.stringify(json, null, 2) });
                                        }}
                                      />
                                      <input 
                                        type="text" 
                                        className="w-1/2 h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm" 
                                        placeholder="URL (https://...)"
                                        value={json.buttons[0].url?.url || ''}
                                        onChange={(e) => {
                                          let json = {};
                                          try { json = JSON.parse(form.waComponents || '{}'); } catch (e) {}
                                          
                                          if (Array.isArray(json.buttons) && json.buttons.length > 0) {
                                            if (!json.buttons[0].url) json.buttons[0].url = {};
                                            json.buttons[0].url.url = e.target.value;
                                          }
                                          
                                          updateForm({ waComponents: JSON.stringify(json, null, 2) });
                                        }}
                                      />
                                    </div>
                                  );
                                }
                              } catch (e) {}
                              return null;
                            })()}
                          </div>
                        </div>
                        <div className="pt-3 border-t border-gray-200 mt-3">
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Integração WhatsApp</label>
                            <select 
                              value={form.provider || ''} 
                              onChange={(e)=>updateForm({ provider: e.target.value })} 
                              className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm"
                              disabled={whatsappLoading}
                            >
                              <option value="">Selecione uma integração...</option>
                              {whatsappIntegrations.length > 0 ? (
                                whatsappIntegrations.map((integration) => (
                                  <option key={integration.id} value={integration.id}>
                                    {integration.name || integration.phoneNumber || integration.id}
                                  </option>
                                ))
                              ) : (
                                <option value="" disabled>Nenhuma integração encontrada</option>
                              )}
                            </select>
                            <div className="text-xs text-gray-500 mt-1">
                              {whatsappLoading ? 'Carregando integrações...' : 
                               whatsappIntegrations.length === 0 ? 'Configure uma integração em /doctor/integrations' : 
                               'Selecione a integração WhatsApp para este template'}
                            </div>
                          </div>
                          <div className="text-xs text-gray-500 mt-3">
                            <span className="font-medium">Status:</span> PENDING (novos templates sempre começam como pendentes)
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Variables schema fields removed for a simpler UX */}

                    <div className="flex items-center gap-2 justify-end">
                      <Button variant="outline" onClick={()=>{ if (editing) { setShowCreateModal(false); setModalStage('choose'); } else { setModalStage('choose'); } }}>Voltar</Button>
                      <Button onClick={save} disabled={saving || (channel==='whatsapp' && !canCreateWhatsApp)}>{saving ? 'Salvando…' : (editing ? 'Salvar alterações' : 'Criar template')}</Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Inline form removed: creation/edition happens only within the modal */}
        </div>
      </div>
    </div>
  );
}
