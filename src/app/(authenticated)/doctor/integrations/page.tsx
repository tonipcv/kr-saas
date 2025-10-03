'use client';

import React, { useMemo, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { CogIcon, LinkIcon, LockClosedIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useClinic } from '@/contexts/clinic-context';
import { Input } from '@/components/ui/input';
import { toast } from 'react-hot-toast';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function IntegrationsPage() {
  const router = useRouter();
  const { currentClinic, isLoading } = useClinic();
  const planName = currentClinic?.subscription?.plan?.name || '';
  const planLower = planName.toLowerCase();
  const isFree = useMemo(() => planLower === 'free', [planLower]);
  // Unlock for Starter and above (i.e., block only when Free or unknown)
  const isAtLeastStarter = useMemo(() => !!planLower && planLower !== 'free', [planLower]);
  // Some sections (e.g., payments/webhooks) may require Creator
  const isCreator = useMemo(() => planLower === 'creator', [planLower]);
  const blocked = useMemo(() => !isAtLeastStarter, [isAtLeastStarter]);

  // Xase state
  const [apiKey, setApiKey] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [status, setStatus] = useState<'CONNECTED' | 'DISCONNECTED' | 'PENDING' | 'UNKNOWN'>('UNKNOWN');
  const [phone, setPhone] = useState<string | null>(null);
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const [testTo, setTestTo] = useState('');
  const [testMsg, setTestMsg] = useState('Olá! Integração ativa pela Zuzz.');
  const [testing, setTesting] = useState(false);

  // WhatsApp (Official) state
  const [waAccessToken, setWaAccessToken] = useState('');
  const [waPhoneNumberId, setWaPhoneNumberId] = useState('');
  const [waWabaId, setWaWabaId] = useState('');
  const [waStatusLoading, setWaStatusLoading] = useState(false);
  const [waStatus, setWaStatus] = useState<'CONNECTED' | 'DISCONNECTED' | 'UNKNOWN'>('UNKNOWN');
  const [waPhone, setWaPhone] = useState<string | null>(null);
  const [waTesting, setWaTesting] = useState(false);
  const [waTestTo, setWaTestTo] = useState('');
  const [waTestMsg, setWaTestMsg] = useState('Olá! Integração WhatsApp (oficial) ativa.');

  // Email (SendPulse) intermediary flow — user only verifies sender email (no API keys)
  const [senderName, setSenderName] = useState('');
  const [senderEmail, setSenderEmail] = useState('');
  const [emailConnecting, setEmailConnecting] = useState(false);
  const [emailStatus, setEmailStatus] = useState<'VERIFIED' | 'PENDING' | 'DISCONNECTED' | 'UNKNOWN'>('UNKNOWN');
  const [emailSession, setEmailSession] = useState<string>('');
  const [verifyCode, setVerifyCode] = useState<string>('');
  const [verifying, setVerifying] = useState<boolean>(false);
  const [verifyMsg, setVerifyMsg] = useState<string>('');
  const [emailStatusLoading, setEmailStatusLoading] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState<string>('');

  // Page loading while both integrations status are being fetched
  const pageLoading = isLoading || statusLoading || waStatusLoading;

  // Onboarding wizard state (Business → WABA → Number)
  const [waWizardOpen, setWaWizardOpen] = useState(false);
  const [waBizLoading, setWaBizLoading] = useState(false);
  const [waWabaLoading, setWaWabaLoading] = useState(false);
  const [waNumLoading, setWaNumLoading] = useState(false);
  const [waBusinesses, setWaBusinesses] = useState<any[]>([]);
  const [waWabas, setWaWabas] = useState<any[]>([]);
  const [waNumbers, setWaNumbers] = useState<any[]>([]);
  const [waSelectedBusiness, setWaSelectedBusiness] = useState<string>('');
  const [waSelectedWaba, setWaSelectedWaba] = useState<string>('');
  const [waSelectedNumber, setWaSelectedNumber] = useState<string>('');
  const [waFinishing, setWaFinishing] = useState(false);

  // (templates moved to dedicated page)

  // Minimal view toggles
  const [xaseExpanded, setXaseExpanded] = useState(false);
  const [emailExpanded, setEmailExpanded] = useState(false);
  const [waExpanded, setWaExpanded] = useState(false);
  // Pagar.me
  const [pgExpanded, setPgExpanded] = useState(false);
  const [pgLoading, setPgLoading] = useState(false);
  const [pgStatus, setPgStatus] = useState<'ACTIVE' | 'PENDING' | 'DISABLED' | 'UNKNOWN'>('UNKNOWN');
  const [pgRecipientId, setPgRecipientId] = useState<string | null>(null);
  const [pgSplitPercent, setPgSplitPercent] = useState<number>(100);
  const [pgPlatformFeeBps, setPgPlatformFeeBps] = useState<number>(0);
  const [pgLastSyncAt, setPgLastSyncAt] = useState<string | null>(null);
  const [pgDialogOpen, setPgDialogOpen] = useState(false);
  const [pgDetails, setPgDetails] = useState<any>(null);
  // Simple legal/bank form
  const [pgLegalName, setPgLegalName] = useState('');
  const [pgDocument, setPgDocument] = useState('');
  const [pgEmail, setPgEmail] = useState('');
  const [pgPhone, setPgPhone] = useState('');
  const [pgBankCode, setPgBankCode] = useState('');
  const [pgAgency, setPgAgency] = useState('');
  const [pgAccount, setPgAccount] = useState('');
  const [pgAgencyDigit, setPgAgencyDigit] = useState('');
  const [pgAccountDigit, setPgAccountDigit] = useState('');
  const [pgAccountType, setPgAccountType] = useState<'conta_corrente' | 'conta_poupanca' | ''>('');
  const [pgSaving, setPgSaving] = useState(false);
  

  // (SEO card removed — SEO is automatic and not shown here)

  const loadStatus = async () => {
    if (!currentClinic?.id) return;
    try {
      setStatusLoading(true);
      const res = await fetch(`/api/integrations/xase/status?clinicId=${encodeURIComponent(currentClinic.id)}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load status');
      if (data.exists) {
        setStatus((data.status || 'UNKNOWN').toUpperCase());
        setPhone(data.phone || null);
        setInstanceId(data.instanceId || null);
        setLastSeenAt(data.lastSeenAt || null);
      } else {
        setStatus('DISCONNECTED');
        setPhone(null);
        setInstanceId(null);
        setLastSeenAt(null);
      }
    } catch (e: any) {
      console.error('Load status error', e);
      toast.error(e.message || 'Erro ao carregar status');
    } finally {
      setStatusLoading(false);
    }
  };

  // (templates moved to dedicated page)

  // Onboarding fetchers
  const fetchBusinesses = async () => {
    if (!currentClinic?.id) return;
    try {
      setWaBizLoading(true);
      setWaBusinesses([]);
      const res = await fetch(`/api/integrations/whatsapp/onboarding?type=businesses&clinicId=${encodeURIComponent(currentClinic.id)}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao listar Businesses');
      setWaBusinesses(Array.isArray(data?.data?.data) ? data.data.data : []);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao listar Businesses');
    } finally {
      setWaBizLoading(false);
    }
  };

  const fetchWabas = async (businessId: string) => {
    if (!currentClinic?.id) return;
    try {
      setWaWabaLoading(true);
      setWaWabas([]);
      const res = await fetch(`/api/integrations/whatsapp/onboarding?type=wabas&business_id=${encodeURIComponent(businessId)}&clinicId=${encodeURIComponent(currentClinic.id)}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao listar WABAs');
      setWaWabas(Array.isArray(data?.data?.data) ? data.data.data : []);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao listar WABAs');
    } finally {
      setWaWabaLoading(false);
    }
  };

  const fetchNumbers = async (wabaId: string) => {
    if (!currentClinic?.id) return;
    try {
      setWaNumLoading(true);
      setWaNumbers([]);
      const res = await fetch(`/api/integrations/whatsapp/onboarding?type=numbers&waba_id=${encodeURIComponent(wabaId)}&clinicId=${encodeURIComponent(currentClinic.id)}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao listar números');
      setWaNumbers(Array.isArray(data?.data?.data) ? data.data.data : []);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao listar números');
    } finally {
      setWaNumLoading(false);
    }
  };

  const openWizard = async () => {
    setWaWizardOpen(true);
    setWaSelectedBusiness('');
    setWaSelectedWaba('');
    setWaSelectedNumber('');
    setWaWabas([]);
    setWaNumbers([]);
    await fetchBusinesses();
  };

  const finalizeWizard = async () => {
    if (!currentClinic?.id) return;
    if (!waSelectedNumber) {
      toast.error('Selecione um número');
      return;
    }
    try {
      setWaFinishing(true);
      const meta = { business_id: waSelectedBusiness };
      const res = await fetch('/api/integrations/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId: currentClinic.id, phoneNumberId: waSelectedNumber, wabaId: waSelectedWaba, meta })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao conectar');
      toast.success('WhatsApp conectado com sucesso');
      setWaWizardOpen(false);
      await loadWaStatus();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao finalizar conexão');
    } finally {
      setWaFinishing(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, [currentClinic?.id]);

  // Pagar.me status loader
  const loadPgStatus = async () => {
    if (!currentClinic?.id) return;
    try {
      setPgLoading(true);
      const res = await fetch(`/api/payments/pagarme/status?clinicId=${encodeURIComponent(currentClinic.id)}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Erro ao carregar status do Pagar.me');
      const connected = !!data?.connected;
      setPgRecipientId(data?.recipientId || null);
      setPgSplitPercent(Number(data?.splitPercent ?? 100));
      setPgPlatformFeeBps(Number(data?.platformFeeBps ?? 0));
      setPgLastSyncAt(data?.lastSyncAt || null);
      setPgStatus(connected ? 'ACTIVE' : (String(data?.status || 'UNKNOWN').toUpperCase() as any));
      setPgDetails(data?.details || null);
    } catch (e: any) {
      console.error('Pagar.me status error', e);
      setPgStatus('UNKNOWN');
    } finally {
      setPgLoading(false);
    }
  };

  useEffect(() => {
    loadPgStatus();
  }, [currentClinic?.id]);

  // WhatsApp (Official) handlers
  const loadWaStatus = async () => {
    if (!currentClinic?.id) return;
    try {
      setWaStatusLoading(true);
      const res = await fetch(`/api/integrations/whatsapp/status?clinicId=${encodeURIComponent(currentClinic.id)}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load status');
      if (data.exists) {
        setWaStatus((data.status || 'UNKNOWN').toUpperCase());
        setWaPhone(data.phone || null);
        setWaPhoneNumberId(data.phoneNumberId || '');
        setWaWabaId((data as any).wabaId || '');
      } else {
        setWaStatus('DISCONNECTED');
        setWaPhone(null);
        setWaPhoneNumberId('');
        setWaWabaId('');
      }
    } catch (e: any) {
      console.error('WA Load status error', e);
      toast.error(e.message || 'Erro ao carregar status WhatsApp');
    } finally {
      setWaStatusLoading(false);
    }
  };

  useEffect(() => {
    loadWaStatus();
  }, [currentClinic?.id]);

  // Email status loader (DB-backed)
  const loadEmailDbStatus = async () => {
    if (!currentClinic?.id) return;
    try {
      setEmailStatusLoading(true);
      const res = await fetch(`/api/integrations/email/senders/by-clinic?clinicId=${encodeURIComponent(currentClinic.id)}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Erro ao carregar status do email');
      if (data?.exists) {
        const normalized = String(data.status || 'UNKNOWN').toUpperCase();
        setEmailStatus(normalized as any);
        const vEmail = String(data.email || '');
        setVerifiedEmail(vEmail);
        if (normalized === 'VERIFIED' && !senderEmail) {
          setSenderEmail(vEmail);
        }
        const vName = String(data.senderName || '').trim();
        if (vName && !senderName) {
          setSenderName(vName);
        }
      } else {
        setEmailStatus('DISCONNECTED');
        setVerifiedEmail('');
      }
    } catch (e: any) {
      console.error('Email Load status error', e);
      toast.error(e?.message || 'Erro ao carregar status do email');
    } finally {
      setEmailStatusLoading(false);
    }
  };

  useEffect(() => {
    loadEmailDbStatus();
  }, [currentClinic?.id]);

  // Read OAuth result from URL and notify
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const oauth = url.searchParams.get('wa_oauth');
    const reason = url.searchParams.get('reason');
    if (oauth) {
      if (oauth === 'ok') {
        toast.success('Facebook conectado. Selecione o WABA e o número.');
      } else {
        // Try to parse Graph error JSON for better diagnostics
        let message = reason || 'desconhecido';
        try {
          const parsed = JSON.parse(reason || '');
          const err = parsed?.error || {};
          const details = {
            message: err.message,
            type: err.type,
            code: err.code,
            fbtrace_id: err.fbtrace_id,
          };
          console.error('[WA OAuth] Facebook error during token exchange', details);
          message = err?.message ? `${err.message} (code ${err.code || 'n/a'})` : message;
        } catch {
          console.error('[WA OAuth] Error during token exchange:', reason);
        }
        toast.error(`Erro no OAuth: ${message}`);
      }
      url.searchParams.delete('wa_oauth');
      url.searchParams.delete('reason');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  const connectWa = async () => {
    if (!currentClinic?.id) return;
    if (!waAccessToken.trim() || !waPhoneNumberId.trim()) {
      toast.error('Informe Access Token e Phone Number ID do WhatsApp');
      return;
    }
    try {
      setConnecting(true);
      const res = await fetch('/api/integrations/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId: currentClinic.id, accessToken: waAccessToken.trim(), phoneNumberId: waPhoneNumberId.trim(), wabaId: waWabaId.trim() || undefined })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao conectar WhatsApp');
      toast.success('WhatsApp conectado');
      setWaPhone(data.phone || null);
      setWaStatus((data.status || 'CONNECTED').toUpperCase());
      setWaAccessToken('');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao conectar WhatsApp');
    } finally {
      setConnecting(false);
    }
  };

  const sendWaTest = async () => {
    if (!currentClinic?.id) return;
    if (!waTestTo.trim()) {
      toast.error('Informe o número destino (+5511999999999)');
      return;
    }
    try {
      setWaTesting(true);
      const res = await fetch('/api/integrations/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId: currentClinic.id, to: waTestTo.trim(), message: waTestMsg })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao enviar');
      toast.success('Mensagem enviada via WhatsApp');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao enviar mensagem');
    } finally {
      setWaTesting(false);
    }
  };

  const connect = async () => {
    if (!currentClinic?.id) return;
    if (!apiKey.trim()) {
      toast.error('Informe a API Key da Xase.ai');
      return;
    }
    try {
      setConnecting(true);
      const res = await fetch('/api/integrations/xase/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim(), clinicId: currentClinic.id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao conectar');
      toast.success('Conectado com sucesso');
      setInstanceId(data.instanceId || null);
      setPhone(data.phone || null);
      setStatus((data.status || 'CONNECTED').toUpperCase());
      setLastSeenAt(data.lastSeenAt || null);
      setApiKey('');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao conectar');
    } finally {
      setConnecting(false);
    }
  };

  const sendTest = async () => {
    if (!currentClinic?.id) return;
    if (!testTo.trim()) {
      toast.error('Informe o número destino (E.164, ex: +5511999999999)');
      return;
    }
    try {
      setTesting(true);
      const res = await fetch('/api/integrations/xase/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId: currentClinic.id, to: testTo.trim(), message: testMsg })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao enviar');
      toast.success('Mensagem de teste enviada');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao enviar mensagem');
    } finally {
      setTesting(false);
    }
  }

  // (email connect handled inline in the Email card via request-verification)

  return (
    <div className="min-h-screen bg-white">
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">Integrações</h1>
            <p className="text-sm text-gray-500">Conecte suas ferramentas para habilitar automações e disparos.</p>
          </div>

          {/* Free plan note */}
          {isFree && (
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white text-gray-700 px-3 py-1 text-xs">
              <LockClosedIcon className="h-4 w-4" /> Plano Free — integrações limitadas. <Link href="/clinic/subscription" className="underline hover:text-gray-900">Ver planos</Link>
            </div>
          )}

          {/* Cards (minimal headers; click to view details) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Pagar.me Payments */}
            <Card className="relative bg-white border border-gray-200 rounded-2xl shadow-sm">
              {blocked && (
                <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-600 px-2 py-1 text-xs">
                  <LockClosedIcon className="h-3.5 w-3.5" /> Locked
                </div>
              )}
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <CogIcon className="h-5 w-5 text-gray-500" /> Pagamentos
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <div className="text-xs">
                      {pgLoading ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 ring-1 ring-inset ring-gray-200">Carregando…</span>
                      ) : pgStatus === 'ACTIVE' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-50 text-green-700 ring-1 ring-inset ring-green-200">Conectado</span>
                      ) : pgStatus === 'PENDING' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 ring-1 ring-inset ring-yellow-200">Pendente</span>
                      ) : pgStatus === 'DISABLED' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-50 text-gray-700 ring-1 ring-inset ring-gray-200">Desconectado</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-50 text-gray-700 ring-1 ring-inset ring-gray-200">{pgStatus}</span>
                      )}
                    </div>
                    <Button size="sm" variant="outline" className="h-7" onClick={() => setPgExpanded(v => !v)}>
                      {pgExpanded ? 'Ocultar' : 'Ver detalhes'}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {pgExpanded && (
                <CardContent>
                  <div className={blocked ? 'opacity-50 blur-[1px] select-none pointer-events-none' : ''}>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-gray-500">Status</div>
                        <div className="font-medium text-gray-900">{pgStatus}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Recipient</div>
                        <div className="font-mono text-xs text-gray-800 break-all">{pgRecipientId || '-'}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Split % (clínica)</div>
                        <div className="font-medium text-gray-900">{pgSplitPercent}%</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Taxa plataforma (bps)</div>
                        <div className="font-medium text-gray-900">{pgPlatformFeeBps}</div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-gray-500">Última sincronização</div>
                        <div className="text-gray-900">{pgLastSyncAt ? new Date(pgLastSyncAt).toLocaleString() : '-'}</div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {pgDetails && (
                        <div className="w-full mt-1 rounded-lg border border-gray-200 p-3">
                          <div className="text-xs font-semibold text-gray-700 mb-2">Recebedor</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="text-gray-500">Nome</span>
                              <span className="font-medium text-gray-900">{pgDetails.name || '-'}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-gray-500">Documento</span>
                              <span className="font-medium text-gray-900">{pgDetails.document || '-'}</span>
                            </div>
                            <div className="md:col-span-2 flex items-center justify-between">
                              <span className="text-gray-500">Conta bancária</span>
                              <span className="text-gray-900">
                                {pgDetails.bank_account ? (
                                  <>
                                    {pgDetails.bank_account.bank || '—'} · ag {pgDetails.bank_account.branch_number || '—'}{pgDetails.bank_account.branch_check_digit ? `-${pgDetails.bank_account.branch_check_digit}` : ''}
                                    {' '}· conta {pgDetails.bank_account.account_number || '—'}{pgDetails.bank_account.account_check_digit ? `-${pgDetails.bank_account.account_check_digit}` : ''}
                                    {' '}· {pgDetails.bank_account.type || '—'}
                                  </>
                                ) : '—'}
                              </span>
                            </div>
                            <div className="md:col-span-2 flex items-center justify-between">
                              <span className="text-gray-500">Transferências</span>
                              <span className="text-gray-900">
                                {pgDetails.transfer_settings ? (
                                  <>
                                    {pgDetails.transfer_settings.transfer_enabled ? 'Ativadas' : 'Desativadas'} · {pgDetails.transfer_settings.transfer_interval || '-'}{typeof pgDetails.transfer_settings.transfer_day === 'number' ? ` · dia ${pgDetails.transfer_settings.transfer_day}` : ''}
                                  </>
                                ) : '—'}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                      <Button
                        onClick={async () => {
                          if (!currentClinic?.id) return;
                          try {
                            const res = await fetch('/api/payments/pagarme/onboard', {
                              method: 'POST', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ clinicId: currentClinic.id })
                            });
                            const data = await res.json();
                            if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
                            router.push('/doctor/integrations/pagarme/setup');
                          } catch (e: any) {
                            toast.error(e?.message || 'Erro ao iniciar onboarding');
                          }
                        }}
                        className="h-8 rounded-md text-xs px-3"
                      >
                        {pgRecipientId ? 'Reconfigurar' : 'Conectar'}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={async () => {
                          if (!currentClinic?.id) return;
                          try {
                            const res = await fetch('/api/payments/pagarme/refresh', {
                              method: 'POST', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ clinicId: currentClinic.id })
                            });
                            const data = await res.json();
                            if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
                            toast.success('Status atualizado');
                            await loadPgStatus();
                          } catch (e: any) {
                            toast.error(e?.message || 'Erro ao atualizar status');
                          }
                        }}
                        className="h-8 rounded-md text-xs px-3"
                      >
                        Atualizar
                      </Button>
                      {pgRecipientId && (
                        <Button
                          variant="outline"
                          onClick={async () => {
                            if (!currentClinic?.id) return;
                            const ok = confirm('Desconectar pagamentos desta clínica?');
                            if (!ok) return;
                            try {
                              const res = await fetch('/api/payments/pagarme/disconnect', {
                                method: 'POST', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ clinicId: currentClinic.id })
                              });
                              const data = await res.json();
                              if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
                              toast.success('Integração desconectada');
                              await loadPgStatus();
                            } catch (e: any) {
                              toast.error(e?.message || 'Erro ao desconectar');
                            }
                          }}
                          className="h-8 rounded-md text-xs px-3"
                        >
                          Desconectar
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
            {/* SEO card removed */}
            {/* WhatsApp (Xase.ai) */}
            <Card className="relative bg-white border border-gray-200 rounded-2xl shadow-sm">
              {blocked && (
                <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-600 px-2 py-1 text-xs">
                  <LockClosedIcon className="h-3.5 w-3.5" /> Locked
                </div>
              )}
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <CogIcon className="h-5 w-5 text-gray-500" /> WhatsApp (Xase.ai)
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <div className="text-xs">
                      {statusLoading ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 ring-1 ring-inset ring-gray-200">Carregando…</span>
                      ) : status === 'CONNECTED' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-50 text-green-700 ring-1 ring-inset ring-green-200">Conectado</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-50 text-gray-700 ring-1 ring-inset ring-gray-200">Desconectado</span>
                      )}
                    </div>
                    <Button size="sm" variant="outline" className="h-7" onClick={() => setXaseExpanded(v => !v)}>
                      {xaseExpanded ? 'Ocultar' : 'Ver detalhes'}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {xaseExpanded && (
                <CardContent>
                  <div className={blocked ? 'opacity-50 blur-[1px] select-none pointer-events-none' : ''}>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Xase API Key" className="h-8 text-sm" />
                      <div className="flex flex-wrap items-center gap-2">
                        <Button onClick={connect} disabled={connecting || !apiKey.trim()} className="h-8 rounded-md w-full sm:w-auto text-xs px-3">
                          {connecting ? 'Conectando…' : 'Conectar'}
                        </Button>
                        <Button variant="outline" onClick={loadStatus} disabled={statusLoading} className="h-8 rounded-md w-full sm:w-auto text-xs px-3">Atualizar</Button>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-gray-500">Status</div>
                        <div className="font-medium text-gray-900">{status}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Número</div>
                        <div className="font-medium text-gray-900">{phone || '-'}</div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-gray-500">Instance</div>
                        <div className="font-mono text-xs text-gray-800 break-all">{instanceId || '-'}</div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-gray-500">Última conexão</div>
                        <div className="text-gray-900">{lastSeenAt ? new Date(lastSeenAt).toLocaleString() : '-'}</div>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="Destino (+5511999999999)" className="h-8 text-sm" />
                      <Input value={testMsg} onChange={(e) => setTestMsg(e.target.value)} placeholder="Mensagem" className="h-8 text-sm" />
                      <Button onClick={sendTest} disabled={testing || status !== 'CONNECTED'} className="h-8 rounded-md w-full sm:w-auto text-xs px-3">
                        {testing ? 'Enviando…' : 'Enviar teste'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
            {/* Email (SendPulse) – Intermediado pela Zuzz */}
            <Card className="relative bg-white border border-gray-200 rounded-2xl shadow-sm">
              {blocked && (
                <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-600 px-2 py-1 text-xs">
                  <LockClosedIcon className="h-3.5 w-3.5" /> Locked
                </div>
              )}
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <CogIcon className="h-5 w-5 text-gray-500" /> E-mail
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <div className="text-xs">
                      {emailStatus === 'VERIFIED' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-50 text-green-700 ring-1 ring-inset ring-green-200">Conectado</span>
                      ) : emailStatus === 'PENDING' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 ring-1 ring-inset ring-yellow-200">Pendente</span>
                      ) : emailStatus === 'DISCONNECTED' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-50 text-gray-700 ring-1 ring-inset ring-gray-200">Desconectado</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-50 text-gray-700 ring-1 ring-inset ring-gray-200">{emailStatus}</span>
                      )}
                    </div>
                    <Button size="sm" variant="outline" className="h-7" onClick={() => setEmailExpanded(v => !v)}>
                      {emailExpanded ? 'Ocultar' : 'Ver detalhes'}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {emailExpanded && (
                <CardContent>
                  <div className={blocked ? 'opacity-50 blur-[1px] select-none pointer-events-none' : ''}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <Input value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Nome do remetente (ex.: Clínica Zuzz)" className="h-8 text-sm" />
                      <Input value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} placeholder="Email do remetente (ex.: contato@clinica.com)" className="h-8 text-sm" />
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={async () => {
                            if (!currentClinic?.id) return toast.error('Selecione uma clínica');
                            if (!senderEmail.trim()) return toast.error('Informe o email do remetente');
                            try {
                              setEmailConnecting(true);
                              const res = await fetch('/api/integrations/email/senders/request-verification', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ clinicId: currentClinic.id, email: senderEmail.trim(), name: senderName.trim() || undefined })
                              });
                              const data = await res.json().catch(() => ({}));
                              if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
                              toast.success('Enviamos um email de confirmação para o seu remetente');
                              setEmailStatus('PENDING');
                              if (data?.sessionToken) setEmailSession(String(data.sessionToken));
                              setVerifyMsg('');
                              setVerifiedEmail('');
                            } catch (e: any) {
                              toast.error(e?.message || 'Falha ao solicitar verificação');
                            } finally {
                              setEmailConnecting(false);
                            }
                          }}
                          disabled={emailConnecting || !senderEmail.trim()}
                          className="h-8 rounded-md w-full md:w-auto text-xs px-3"
                        >
                          {emailConnecting ? 'Enviando…' : 'Solicitar confirmação'}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={loadEmailDbStatus}
                          disabled={emailStatusLoading}
                          className="h-8 rounded-md w-full md:w-auto text-xs px-3"
                        >
                          {emailStatusLoading ? 'Carregando…' : 'Atualizar'}
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2 text-sm">
                      <div>
                        <div className="text-gray-500">Status</div>
                        <div className="text-gray-900 font-medium">
                          {emailStatus === 'VERIFIED' ? 'Conectado' : emailStatus === 'PENDING' ? 'Pendente' : emailStatus === 'DISCONNECTED' ? 'Desconectado' : emailStatus}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500">Remetente verificado</div>
                        <div className="text-gray-900 font-medium break-all">{verifiedEmail || '-'}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Nome do remetente</div>
                        <div className="text-gray-900 font-medium break-all">{senderName || '-'}</div>
                      </div>
                      {emailStatus === 'PENDING' && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
                          <Input value={verifyCode} onChange={(e) => setVerifyCode(e.target.value)} placeholder="Código de 6 dígitos" className="h-8 text-sm" />
                          <div className="flex items-center gap-2">
                            <Button
                              variant="secondary"
                              onClick={async () => {
                                if (!emailSession) return toast.error('Sessão não encontrada, solicite novamente');
                                if (!verifyCode.trim()) return toast.error('Informe o código recebido por email');
                                try {
                                  setVerifying(true);
                                  setVerifyMsg('');
                                  const res = await fetch('/api/integrations/email/senders/confirm', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ token: emailSession, code: verifyCode.trim() })
                                  });
                                  const data = await res.json().catch(() => ({}));
                                  if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
                                  setEmailStatus('VERIFIED');
                                  setVerifyMsg('Remetente verificado com sucesso.');
                                  // Refresh from DB to retrieve verified email
                                  await loadEmailDbStatus();
                                } catch (e: any) {
                                  setVerifyMsg(e?.message || 'Erro ao verificar código');
                                } finally {
                                  setVerifying(false);
                                }
                              }}
                              disabled={verifying || !verifyCode.trim()}
                              className="h-8 rounded-md w-full md:w-auto text-xs px-3"
                            >
                              {verifying ? 'Verificando…' : 'Confirmar código'}
                            </Button>
                          </div>
                          {verifyMsg && <div className="md:col-span-3 text-[12px] text-gray-600">{verifyMsg}</div>}
                        </div>
                      )}
                      <div>
                        <div className="text-gray-500">Webhook (interno)</div>
                        <div className="font-mono text-xs text-gray-800 break-all">/api/webhooks/sendpulse</div>
                      </div>
                      <p className="text-[12px] text-gray-500">A Zuzz intermedia a integração. Você só confirma o seu email e usamos as nossas credenciais para enviar. Depois podemos configurar domínio (SPF/DKIM) para melhor entregabilidade.</p>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
            {/* WhatsApp (Oficial) */}
            <Card className="relative bg-white border border-gray-200 rounded-2xl shadow-sm">
              {blocked && (
                <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-600 px-2 py-1 text-xs">
                  <LockClosedIcon className="h-3.5 w-3.5" /> Locked
                </div>
              )}
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <CogIcon className="h-5 w-5 text-gray-500" /> WhatsApp (Oficial)
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <div className="text-xs">
                      {waStatusLoading ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 ring-1 ring-inset ring-gray-200">Carregando…</span>
                      ) : waStatus === 'CONNECTED' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-50 text-green-700 ring-1 ring-inset ring-green-200">Conectado</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-50 text-gray-700 ring-1 ring-inset ring-gray-200">Desconectado</span>
                      )}
                    </div>
                    <Button size="sm" variant="outline" className="h-7" onClick={() => setWaExpanded(v => !v)}>
                      {waExpanded ? 'Ocultar' : 'Ver detalhes'}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {waExpanded && (
                <CardContent>
                  <div className={blocked ? 'opacity-50 blur-[1px] select-none pointer-events-none' : ''}>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                      <Input value={waAccessToken} onChange={(e) => setWaAccessToken(e.target.value)} placeholder="Access Token" className="h-8 text-sm" />
                      <Input value={waPhoneNumberId} onChange={(e) => setWaPhoneNumberId(e.target.value)} placeholder="Phone Number ID" className="h-8 text-sm" />
                      <Input value={waWabaId} onChange={(e) => setWaWabaId(e.target.value)} placeholder="WABA ID (opcional)" className="h-8 text-sm" />
                      <div className="flex items-center gap-2">
                        <Button onClick={connectWa} disabled={connecting || !waAccessToken.trim() || !waPhoneNumberId.trim()} className="h-8 rounded-md w-full md:w-auto text-xs px-3">
                          {connecting ? 'Conectando…' : 'Conectar'}
                        </Button>
                        <Button variant="outline" onClick={loadWaStatus} disabled={waStatusLoading} className="h-8 rounded-md w-full md:w-auto text-xs px-3">Atualizar</Button>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        className="h-9 rounded-lg border-gray-200"
                        onClick={() => {
                          if (!currentClinic?.id) return toast.error('Selecione uma clínica');
                          const returnTo = '/doctor/integrations';
                          window.location.href = `/api/integrations/whatsapp/oauth/start?clinicId=${encodeURIComponent(currentClinic.id)}&returnTo=${encodeURIComponent(returnTo)}`;
                        }}
                      >
                        Conectar Facebook
                      </Button>
                      <Button variant="secondary" className="h-9 rounded-lg" onClick={openWizard}>Wizard de número</Button>
                      <Link href="/doctor/integrations/whatsapp/templates">
                        <Button variant="secondary" className="h-9 rounded-lg" disabled={waStatus !== 'CONNECTED'}>Templates</Button>
                      </Link>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-gray-500">Status</div>
                        <div className="font-medium text-gray-900">{waStatus}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Número</div>
                        <div className="font-medium text-gray-900">{waPhone || '-'}</div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-gray-500">Phone Number ID</div>
                        <div className="font-mono text-xs text-gray-800 break-all">{waPhoneNumberId || '-'}</div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-gray-500">WABA ID</div>
                        <div className="font-mono text-xs text-gray-800 break-all">{waWabaId || '-'}</div>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
                      <Input value={waTestTo} onChange={(e) => setWaTestTo(e.target.value)} placeholder="Destino (+5511999999999)" className="h-8 text-sm" />
                      <Input value={waTestMsg} onChange={(e) => setWaTestMsg(e.target.value)} placeholder="Mensagem" className="h-8 text-sm" />
                      <Button onClick={sendWaTest} disabled={waTesting || waStatus !== 'CONNECTED'} className="h-8 rounded-md w-full md:w-auto text-xs px-3">
                        {waTesting ? 'Enviando…' : 'Enviar teste'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          </div>
          {/* WhatsApp Onboarding Wizard */}
          <Dialog open={waWizardOpen} onOpenChange={setWaWizardOpen}>
            <DialogContent className="sm:max-w-[680px]">
              <DialogHeader>
                <DialogTitle>Conectar WhatsApp (Oficial)</DialogTitle>
                <DialogDescription>
                  Selecione o Business → WABA → Número e finalize a conexão.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <div className="text-sm text-gray-700 mb-1">Business</div>
                  <select
                    className="w-full border rounded-lg h-9 px-2"
                    value={waSelectedBusiness}
                    onChange={async (e) => {
                      const v = e.target.value; setWaSelectedBusiness(v); setWaSelectedWaba(''); setWaSelectedNumber(''); setWaWabas([]); setWaNumbers([]);
                      if (v) await fetchWabas(v);
                    }}
                  >
                    <option value="">{waBizLoading ? 'Carregando...' : 'Selecione um Business'}</option>
                    {waBusinesses.map((b: any) => (
                      <option key={b.id} value={b.id}>{b.name || b.id}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="text-sm text-gray-700 mb-1">WABA</div>
                  <select
                    className="w-full border rounded-lg h-9 px-2"
                    value={waSelectedWaba}
                    onChange={async (e) => {
                      const v = e.target.value; setWaSelectedWaba(v); setWaSelectedNumber(''); setWaNumbers([]);
                      if (v) await fetchNumbers(v);
                    }}
                    disabled={!waSelectedBusiness}
                  >
                    <option value="">{waWabaLoading ? 'Carregando...' : (waSelectedBusiness ? 'Selecione um WABA' : 'Selecione um Business primeiro')}</option>
                    {waWabas.map((w: any) => (
                      <option key={w.id} value={w.id}>{w.name || w.id}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="text-sm text-gray-700 mb-1">Número</div>
                  <select
                    className="w-full border rounded-lg h-9 px-2"
                    value={waSelectedNumber}
                    onChange={(e) => setWaSelectedNumber(e.target.value)}
                    disabled={!waSelectedWaba}
                  >
                    <option value="">{waNumLoading ? 'Carregando...' : (waSelectedWaba ? 'Selecione um número' : 'Selecione um WABA primeiro')}</option>
                    {waNumbers.map((n: any) => (
                      <option key={n.id} value={n.id}>{`${n.display_phone_number || n.id}${n.verified_name ? ' — ' + n.verified_name : ''}`}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setWaWizardOpen(false)}>Cancelar</Button>
                <Button onClick={finalizeWizard} disabled={!waSelectedNumber || waFinishing} className="bg-gradient-to-r from-[#5893ec] to-[#9bcef7] text-white">
                  {waFinishing ? 'Conectando...' : 'Conectar'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Pagar.me Recipient Dialog */}
          <Dialog open={pgDialogOpen} onOpenChange={setPgDialogOpen}>
            <DialogContent className="bg-white rounded-none max-w-none w-screen h-[92vh] p-0">
              {/* Header */}
              <div className="px-6 pt-5 pb-3 border-b border-gray-200">
                <DialogHeader>
                  <DialogTitle className="text-[20px] font-semibold text-gray-900 tracking-[-0.01em]">
                    {pgRecipientId ? 'Atualizar dados do recebedor' : 'Conectar pagamentos (Pagar.me)'}
                  </DialogTitle>
                  <DialogDescription>
                    Informe os dados legais e bancários para receber repasses. Você pode ajustar o split e a taxa de plataforma.
                  </DialogDescription>
                </DialogHeader>
              </div>

              {/* Body */}
              <div className="px-6 py-5 overflow-auto h-[calc(92vh-56px-72px)]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left: form */}
                  <div>
                    <div className="text-xs font-semibold text-gray-700 mb-2">Dados legais</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <div className="text-[12px] text-gray-600 mb-1">Razão social / Nome completo</div>
                        <Input value={pgLegalName} onChange={(e) => setPgLegalName(e.target.value)} placeholder="Ex.: Clínica Exemplo LTDA" className="h-10" />
                      </div>
                      <div>
                        <div className="text-[12px] text-gray-600 mb-1">Documento (CPF/CNPJ)</div>
                        <Input value={pgDocument} onChange={(e) => setPgDocument(e.target.value)} placeholder="Somente números" className="h-10" />
                      </div>
                      <div>
                        <div className="text-[12px] text-gray-600 mb-1">Email de contato</div>
                        <Input value={pgEmail} onChange={(e) => setPgEmail(e.target.value)} placeholder="email@dominio.com" className="h-10" />
                      </div>
                      <div>
                        <div className="text-[12px] text-gray-600 mb-1">Telefone (E.164)</div>
                        <Input value={pgPhone} onChange={(e) => setPgPhone(e.target.value)} placeholder="+5511999999999" className="h-10" />
                      </div>
                    </div>

                    <div className="mt-5 text-xs font-semibold text-gray-700 mb-2">Dados bancários</div>
                    <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                      <div>
                        <div className="text-[12px] text-gray-600 mb-1">Banco</div>
                        <Input value={pgBankCode} onChange={(e) => setPgBankCode(e.target.value)} placeholder="341" className="h-10" />
                      </div>
                      <div>
                        <div className="text-[12px] text-gray-600 mb-1">Agência</div>
                        <Input value={pgAgency} onChange={(e) => setPgAgency(e.target.value)} placeholder="1234" className="h-10" />
                      </div>
                      <div>
                        <div className="text-[12px] text-gray-600 mb-1">Dígito ag.</div>
                        <Input value={pgAgencyDigit} onChange={(e) => setPgAgencyDigit(e.target.value)} placeholder="6 (opcional)" className="h-10" />
                      </div>
                      <div>
                        <div className="text-[12px] text-gray-600 mb-1">Conta</div>
                        <Input value={pgAccount} onChange={(e) => setPgAccount(e.target.value)} placeholder="12345" className="h-10" />
                      </div>
                      <div>
                        <div className="text-[12px] text-gray-600 mb-1">Dígito conta</div>
                        <Input value={pgAccountDigit} onChange={(e) => setPgAccountDigit(e.target.value)} placeholder="6 (opcional)" className="h-10" />
                      </div>
                      <div>
                        <div className="text-[12px] text-gray-600 mb-1">Tipo</div>
                        <Input value={pgAccountType} onChange={(e) => setPgAccountType(e.target.value as any)} placeholder="conta_corrente / conta_poupanca" className="h-10" />
                      </div>
                    </div>

                    <div className="mt-5 text-xs font-semibold text-gray-700 mb-2">Split & Taxa</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <div className="text-[12px] text-gray-600 mb-1">Split % (clínica)</div>
                        <Input type="number" min={1} max={100} value={pgSplitPercent} onChange={(e) => setPgSplitPercent(parseInt(e.target.value || '100', 10))} placeholder="1-100" className="h-10" />
                      </div>
                      <div>
                        <div className="text-[12px] text-gray-600 mb-1">Taxa plataforma (bps)</div>
                        <Input type="number" min={0} max={10000} value={pgPlatformFeeBps} onChange={(e) => setPgPlatformFeeBps(parseInt(e.target.value || '0', 10))} placeholder="ex.: 150 = 1,5%" className="h-10" />
                      </div>
                    </div>
                  </div>

                  {/* Right: summary */}
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 h-full">
                    <div className="text-sm font-semibold text-gray-800">Resumo</div>
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-gray-600">Nome</span><span className="font-medium text-gray-900 truncate max-w-[60%] text-right">{pgLegalName || '-'}</span></div>
                      <div className="flex justify-between"><span className="text-gray-600">Documento</span><span className="font-medium text-gray-900">{pgDocument || '-'}</span></div>
                      <div className="flex justify-between"><span className="text-gray-600">Email</span><span className="font-medium text-gray-900 truncate max-w-[60%] text-right">{pgEmail || '-'}</span></div>
                      <div className="flex justify-between"><span className="text-gray-600">Telefone</span><span className="font-medium text-gray-900">{pgPhone || '-'}</span></div>
                      <div className="h-px bg-gray-200 my-2" />
                      <div className="flex justify-between"><span className="text-gray-600">Banco</span><span className="font-medium text-gray-900">{pgBankCode || '-'}</span></div>
                      <div className="flex justify-between"><span className="text-gray-600">Agência</span><span className="font-medium text-gray-900">{pgAgency}{pgAgencyDigit ? `-${pgAgencyDigit}` : ''}</span></div>
                      <div className="flex justify-between"><span className="text-gray-600">Conta</span><span className="font-medium text-gray-900">{pgAccount}{pgAccountDigit ? `-${pgAccountDigit}` : ''}</span></div>
                      <div className="flex justify-between"><span className="text-gray-600">Tipo</span><span className="font-medium text-gray-900">{pgAccountType || '-'}</span></div>
                      <div className="h-px bg-gray-200 my-2" />
                      <div className="flex justify-between"><span className="text-gray-600">Split (clínica)</span><span className="font-medium text-gray-900">{pgSplitPercent}%</span></div>
                      <div className="flex justify-between"><span className="text-gray-600">Taxa plataforma</span><span className="font-medium text-gray-900">{pgPlatformFeeBps} bps</span></div>
                      <div className="text-xs text-gray-500 mt-3">Dica: você pode ajustar esses valores depois em Integrações.</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2 sticky bottom-0 bg-white">
                <Button variant="outline" onClick={() => setPgDialogOpen(false)} className="h-8">Cancelar</Button>
                <Button
                  onClick={async () => {
                    if (!currentClinic?.id) return toast.error('Selecione uma clínica');
                    // Basic validation
                    if (!pgLegalName.trim() || !pgDocument.trim()) return toast.error('Informe razão social e documento');
                    try {
                      setPgSaving(true);
                      const legalInfo: any = {
                        name: pgLegalName.trim(),
                        document_number: pgDocument.trim(),
                        email: pgEmail.trim() || undefined,
                        phone_number: pgPhone.trim() || undefined,
                      };
                      const bankAccount: any = pgBankCode && pgAgency && pgAccount && pgAccountType ? {
                        bank_code: pgBankCode.trim(),
                        agencia: pgAgency.trim(),
                        branch_check_digit: pgAgencyDigit.trim() || undefined,
                        conta: pgAccount.trim(),
                        account_check_digit: pgAccountDigit.trim() || undefined,
                        type: pgAccountType,
                      } : {};
                      const res = await fetch('/api/payments/pagarme/recipient', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          clinicId: currentClinic.id,
                          legalInfo,
                          bankAccount,
                          splitPercent: pgSplitPercent,
                          platformFeeBps: pgPlatformFeeBps,
                        })
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
                      toast.success('Dados salvos. Recipient configurado.');
                      setPgDialogOpen(false);
                      // reset sensíveis
                      setPgLegalName(''); setPgDocument(''); setPgEmail(''); setPgPhone('');
                      setPgBankCode(''); setPgAgency(''); setPgAccount(''); setPgAccountType('');
                      await loadPgStatus();
                    } catch (e: any) {
                      toast.error(e?.message || 'Falha ao configurar recebedor');
                    } finally {
                      setPgSaving(false);
                    }
                  }}
                  disabled={pgSaving}
                  className="h-8 bg-gray-900 text-white hover:bg-black"
                >
                  {pgSaving ? 'Salvando…' : 'Salvar'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
