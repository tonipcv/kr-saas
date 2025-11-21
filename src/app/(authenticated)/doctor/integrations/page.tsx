'use client';

import React, { Suspense, useMemo, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { LinkIcon, LockClosedIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useClinic } from '@/contexts/clinic-context';
import { Input } from '@/components/ui/input';
import { toast } from 'react-hot-toast';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import Image from 'next/image';

export default function IntegrationsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-600">Loading…</div>}>
      <IntegrationsInner />
    </Suspense>
  );
}

function IntegrationsInner() {
  const ENABLE_XASE = false;
  const router = useRouter();
  const pathname = usePathname();
  const isBusinessRoute = typeof pathname === 'string' && pathname.includes('/business/');
  const { currentClinic, isLoading } = useClinic();
  const searchParams = useSearchParams();
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
  const [testMsg, setTestMsg] = useState('Olá! Integração ativa pela KRX.');
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

  // Add Integration dialog and search state
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'all' | 'payments' | 'messaging' | 'email'>('all');

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
  // Allow editing recipient id directly
  const [pgNewRecipientId, setPgNewRecipientId] = useState<string>('');
  
  // Derived connection states (depends on waStatus, pgStatus, emailStatus declared above)
  const waConnected = waStatus === 'CONNECTED';
  const pgConnected = pgStatus === 'ACTIVE';
  const emailVerified = emailStatus === 'VERIFIED';
  const [stripeConnected, setStripeConnected] = useState(false);
  const [stripeVerified, setStripeVerified] = useState(false);
  const [stripeStatusAccountId, setStripeStatusAccountId] = useState<string>('');
  const [stripeStatusLastUsedAt, setStripeStatusLastUsedAt] = useState<string | null>(null);
  const [stripeStatusApiKey, setStripeStatusApiKey] = useState<string | null>(null);
  const [stripeStatusWebhookSecret, setStripeStatusWebhookSecret] = useState<string | null>(null);
  const hasAnyConnected = waConnected || pgConnected || emailVerified || stripeConnected;

  // Stripe (new, isolated)
  const [stripeOpen, setStripeOpen] = useState(false);
  const [stripeApiKey, setStripeApiKey] = useState('');
  const [stripeAccountId, setStripeAccountId] = useState('');
  const [stripeWebhookSecret, setStripeWebhookSecret] = useState('');
  const [stripeSaving, setStripeSaving] = useState(false);
  const [stripeTesting, setStripeTesting] = useState(false);
  const [stripeTestAmount, setStripeTestAmount] = useState('10.00');
  const [stripeTestCurrency, setStripeTestCurrency] = useState('USD');
  const [stripeTestEmail, setStripeTestEmail] = useState('');
  const [stripeMerchantId, setStripeMerchantId] = useState<string>('');
  const [stripeWebhookUrl, setStripeWebhookUrl] = useState<string>('');
  const [stripeReady, setStripeReady] = useState(false);
  const [stripeVerifying, setStripeVerifying] = useState(false);
  // Appmax connected indicator
  const [appmaxConnected, setAppmaxConnected] = useState(false);
  // Appmax (payments) — minimal state
  const [appmaxOpen, setAppmaxOpen] = useState(false);
  const [appmaxApiKey, setAppmaxApiKey] = useState('');
  const [appmaxTestMode, setAppmaxTestMode] = useState(true);
  const [appmaxSaving, setAppmaxSaving] = useState(false);
  const [appmaxMerchantId, setAppmaxMerchantId] = useState<string>('');
  const [appmaxStatusApiKey, setAppmaxStatusApiKey] = useState<string | null>(null);
  const [appmaxStatusTestMode, setAppmaxStatusTestMode] = useState<boolean>(true);

  // Page loading while integrations status are being fetched
  const pageLoading = isLoading || waStatusLoading || pgLoading || emailStatusLoading;

  // Open Add Integration modal based on URL params
  useEffect(() => {
    try {
      const add = searchParams?.get('add');
      const cat = (searchParams?.get('category') || '').toLowerCase();
      if (add === 'open') setAddOpen(true);
      if (cat && ['all','payments','messaging','email'].includes(cat)) {
        setCategory(cat as any);
      }
    } catch {}
  }, [searchParams]);


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
      toast.error(e.message || 'Failed to load status');
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
      if (!res.ok) throw new Error(data.error || 'Failed to list Businesses');
      setWaBusinesses(Array.isArray(data?.data?.data) ? data.data.data : []);
    } catch (e: any) {
      toast.error(e.message || 'Failed to list Businesses');
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
      if (!res.ok) throw new Error(data.error || 'Failed to list WABAs');
      setWaWabas(Array.isArray(data?.data?.data) ? data.data.data : []);
    } catch (e: any) {
      toast.error(e.message || 'Failed to list WABAs');
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
      if (!res.ok) throw new Error(data.error || 'Failed to list numbers');
      setWaNumbers(Array.isArray(data?.data?.data) ? data.data.data : []);
    } catch (e: any) {
      toast.error(e.message || 'Failed to list numbers');
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
      toast.error('Select a number');
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
      if (!res.ok) throw new Error(data.error || 'Failed to connect');
      toast.success('WhatsApp connected successfully');
      setWaWizardOpen(false);
      await loadWaStatus();
    } catch (e: any) {
      toast.error(e.message || 'Failed to finish connection');
    } finally {
      setWaFinishing(false);
    }
  };

  useEffect(() => {
    if (ENABLE_XASE) {
      loadStatus();
    }
  }, [currentClinic?.id]);

  // Details modal state
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsProvider, setDetailsProvider] = useState<'KRXPAY' | 'STRIPE' | 'WHATSAPP' | ''>('');

  const openDetails = (provider: 'KRXPAY' | 'STRIPE' | 'WHATSAPP') => {
    setDetailsProvider(provider);
    setDetailsOpen(true);
  };

  // Pagar.me status loader
  const loadPgStatus = async () => {
    if (!currentClinic?.id) return;
    try {
      setPgLoading(true);
      const res = await fetch(`/api/payments/pagarme/status?clinicId=${encodeURIComponent(currentClinic.id)}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load payments status');
      const connected = !!data?.connected;
      setPgRecipientId(data?.recipientId || null);
      setPgNewRecipientId(data?.recipientId || '');
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

  // Stripe status loader
  const loadStripeStatus = async () => {
    if (!currentClinic?.id) return;
    try {
      const res = await fetch(`/api/admin/integrations/stripe/status?clinicId=${encodeURIComponent(currentClinic.id)}`, { cache: 'no-store' });
      const data = await res.json();
      setStripeConnected(!!data?.connected);
      setStripeVerified(!!data?.verified);
      setStripeStatusAccountId(String(data?.accountId || ''));
      setStripeStatusLastUsedAt(data?.lastUsedAt || null);
      setStripeStatusApiKey(data?.apiKey || null);
      setStripeStatusWebhookSecret(data?.webhookSecret || null);
    } catch {
      setStripeConnected(false);
      setStripeVerified(false);
      setStripeStatusAccountId('');
      setStripeStatusLastUsedAt(null);
      setStripeStatusApiKey(null);
      setStripeStatusWebhookSecret(null);
    }
  };

  useEffect(() => {
    loadStripeStatus();
  }, [currentClinic?.id]);

  // Appmax status loader (minimal)
  useEffect(() => {
    (async () => {
      if (!currentClinic?.id) return;
      try {
        const res = await fetch(`/api/admin/integrations/appmax/status?clinicId=${encodeURIComponent(currentClinic.id)}`, { cache: 'no-store' });
        const data = await res.json();
        setAppmaxConnected(!!data?.connected);
        setAppmaxStatusApiKey(data?.apiKey || null);
        setAppmaxStatusTestMode(!!data?.testMode);
      } catch {
        setAppmaxConnected(false);
        setAppmaxStatusApiKey(null);
        setAppmaxStatusTestMode(true);
      }
    })();
  }, [currentClinic?.id]);

  // Prefill Stripe dialog when opening
  useEffect(() => {
    if (!stripeOpen) return;
    // hydrate accountId from status
    if (stripeStatusAccountId && !stripeAccountId) {
      setStripeAccountId(stripeStatusAccountId);
    }
    // hydrate masked apiKey and webhookSecret from status
    if (stripeStatusApiKey && !stripeApiKey) {
      setStripeApiKey(stripeStatusApiKey);
    }
    if (stripeStatusWebhookSecret && !stripeWebhookSecret) {
      setStripeWebhookSecret(stripeStatusWebhookSecret);
    }
    // resolve merchant id for actions
    (async () => {
      if (!stripeMerchantId) {
        const mid = await resolveMerchantId();
        if (mid) setStripeMerchantId(mid);
      }
    })();
  }, [stripeOpen]);

  // Compute webhook URL on client
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const origin = window.location.origin;
        setStripeWebhookUrl(`${origin}/api/webhooks/stripe`);
      } catch {}
    }
  }, []);

  // Helper: resolve merchantId for current clinic (for Stripe setup/test)
  const resolveMerchantId = async () => {
    if (!currentClinic?.id) return '';
    try {
      const res = await fetch(`/api/admin/integrations/merchant/by-clinic?clinicId=${encodeURIComponent(currentClinic.id)}`, { cache: 'no-store' });
      const data = await res.json();
      if (data?.exists && data?.id) return String(data.id);
    } catch {}
    return '';
  };

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
      toast.error(e.message || 'Failed to load WhatsApp status');
    } finally {
      setWaStatusLoading(false);
    }
  };

  useEffect(() => {
    loadWaStatus();
  }, [currentClinic?.id]);

  // Prefill Pagar.me recipient dialog when opening using loaded status/details
  useEffect(() => {
    if (!pgDialogOpen) return;
    try {
      const d = pgDetails || {};
      const legal = d.legalInfo || d.legal || d.legal_info || {};
      const bank = d.bankAccount || d.bank_account || {};
      if (typeof legal.name === 'string' && !pgLegalName) setPgLegalName(legal.name);
      if (typeof legal.document_number === 'string' && !pgDocument) setPgDocument(legal.document_number);
      if (typeof legal.email === 'string' && !pgEmail) setPgEmail(legal.email);
      if (typeof legal.phone_number === 'string' && !pgPhone) setPgPhone(legal.phone_number);
      if (typeof bank.bank_code === 'string' && !pgBankCode) setPgBankCode(bank.bank_code);
      if (typeof bank.agencia === 'string' && !pgAgency) setPgAgency(bank.agencia);
      if (typeof bank.branch_check_digit === 'string' && !pgAgencyDigit) setPgAgencyDigit(bank.branch_check_digit);
      if (typeof bank.conta === 'string' && !pgAccount) setPgAccount(bank.conta);
      if (typeof bank.account_check_digit === 'string' && !pgAccountDigit) setPgAccountDigit(bank.account_check_digit);
      if (typeof bank.type === 'string' && !pgAccountType) setPgAccountType(bank.type);
    } catch {}
  }, [pgDialogOpen, pgDetails]);

  // Email status loader (DB-backed)
  const loadEmailDbStatus = async () => {
    if (!currentClinic?.id) return;
    try {
      setEmailStatusLoading(true);
      const res = await fetch(`/api/integrations/email/senders/by-clinic?clinicId=${encodeURIComponent(currentClinic.id)}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load email status');
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
      toast.error(e?.message || 'Failed to load email status');
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
        toast.success('Facebook connected. Select the WABA and the number.');
      } else {
        // Try to parse Graph error JSON for better diagnostics
        let message = reason || 'unknown';
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
        toast.error(`OAuth error: ${message}`);
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
      if (!res.ok) throw new Error(data.error || 'Failed to connect WhatsApp');
      toast.success('WhatsApp connected');
      setWaPhone(data.phone || null);
      setWaStatus((data.status || 'CONNECTED').toUpperCase());
      setWaAccessToken('');
    } catch (e: any) {
      toast.error(e.message || 'Failed to connect WhatsApp');
    } finally {
      setConnecting(false);
    }
  };

  const sendWaTest = async () => {
    if (!currentClinic?.id) return;
    if (!waTestTo.trim()) {
      toast.error('Enter destination number (+5511999999999)');
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
      if (!res.ok) throw new Error(data.error || 'Failed to send');
      toast.success('Message sent via WhatsApp');
    } catch (e: any) {
      toast.error(e.message || 'Failed to send message');
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
          <div className="mb-6 flex items-start justify-between gap-3">
            <div>
              <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">Apps</h1>
              <p className="text-sm text-gray-500">Connect your tools to enable automations and triggers.</p>
            </div>
            <Button onClick={() => setAddOpen(true)} className="h-9 rounded-lg">Add Integration</Button>
          </div>

          {/* Free plan note */}
          {isFree && (
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white text-gray-700 px-3 py-1 text-xs">
              <LockClosedIcon className="h-4 w-4" /> Free Plan — limited integrations. <Link href="/clinic/subscription" className="underline hover:text-gray-900">View plans</Link>
            </div>
          )}

          {/* Loading skeleton to avoid flicker */}
          {pageLoading && (
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="grid grid-cols-3 gap-4 text-xs text-gray-500 px-6 py-3 border-b border-gray-200">
                <div>Name</div>
                <div>Category</div>
                <div>Status</div>
              </div>
              <div className="px-6 py-12 flex flex-col items-center justify-center">
                <div className="w-10 h-10 rounded-full border-2 border-gray-200 border-t-gray-400 animate-spin mb-3" />
                <div className="text-sm text-gray-600">Loading integrations…</div>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!pageLoading && !hasAnyConnected && (
            <div className="bg-white rounded-xl border border-gray-200">
              {/* Header row */}
              <div className="grid grid-cols-3 gap-4 text-xs text-gray-500 px-6 py-3 border-b border-gray-200">
                <div className="flex items-center gap-1">Name</div>
                <div className="flex items-center gap-1">Category</div>
                <div className="flex items-center gap-1">Status</div>
              </div>
              {/* Body empty */}
              <div className="px-6 py-16 flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-md bg-gray-100 mb-3" />
                <div className="text-gray-800 font-semibold">No integrations available</div>
                <div className="text-sm text-gray-600">To start, select <button className="underline" onClick={() => setAddOpen(true)}>Add integration</button></div>
              </div>
            </div>
          )}

          {/* Connected table */}
          {!pageLoading && hasAnyConnected && (
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="grid grid-cols-3 gap-4 text-xs text-gray-500 px-6 py-3 border-b border-gray-200">
                <div className="flex items-center gap-1">Name</div>
                <div className="flex items-center gap-1">Category</div>
                <div className="flex items-center gap-1">Status</div>
              </div>
              <div className="divide-y">
                {/* Row: KRX Pay */}
                {pgConnected && (
                  <div className="px-6 py-3 grid grid-cols-3 items-center gap-4 cursor-pointer" onDoubleClick={() => openDetails('KRXPAY')}>
                    <div className="flex items-center gap-3 min-w-0">
                      <Image src="/krxpay.png" alt="KRX Pay" width={20} height={20} className="invert" />
                      <div className="truncate">
                        <div className="text-sm font-semibold text-gray-900 truncate">KRX Pay</div>
                        <div className="text-[11px] text-gray-500 truncate">Best gateway with AI.</div>
                      </div>
                    </div>
                    <div className="text-sm text-gray-700">Payments</div>
                    <div className="flex items-center justify-end">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-50 text-green-700 ring-1 ring-inset ring-green-200 text-xs">Connected</span>
                    </div>
                  </div>
                )}
                {/* Row: Appmax */}
                {appmaxConnected && (
                  <div
                    className="px-6 py-3 grid grid-cols-3 items-center gap-4 cursor-pointer"
                    onDoubleClick={async () => {
                      if (!appmaxMerchantId) {
                        const mid = await resolveMerchantId();
                        if (mid) setAppmaxMerchantId(mid);
                      }
                      // Prefill masked apiKey and testMode from status
                      if (appmaxStatusApiKey && !appmaxApiKey) {
                        setAppmaxApiKey(appmaxStatusApiKey);
                      }
                      setAppmaxTestMode(appmaxStatusTestMode);
                      setAppmaxOpen(true);
                    }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Image src="/appmax.png" alt="Appmax" width={20} height={20} />
                      <div className="truncate">
                        <div className="text-sm font-semibold text-gray-900 truncate">Appmax</div>
                        <div className="text-[11px] text-gray-500 truncate">Payment processing</div>
                      </div>
                    </div>
                    <div className="text-sm text-gray-700">Payments</div>
                    <div className="flex items-center justify-end">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-50 text-green-700 ring-1 ring-inset ring-green-200 text-xs">Connected</span>
                    </div>
                  </div>
                )}
                {/* Row: Stripe */}
                {stripeConnected && (
                  <div className="px-6 py-3 grid grid-cols-3 items-center gap-4 cursor-pointer" onDoubleClick={() => openDetails('STRIPE')}>
                    <div className="flex items-center gap-3 min-w-0">
                      <Image src="/stripe.svg" alt="Stripe" width={20} height={20} />
                      <div className="truncate">
                        <div className="text-sm font-semibold text-gray-900 truncate">Stripe</div>
                        <div className="text-[11px] text-gray-500 truncate">Payment processing</div>
                      </div>
                    </div>
                    <div className="text-sm text-gray-700">Payments</div>
                    <div className="flex items-center justify-end">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-50 text-green-700 ring-1 ring-inset ring-green-200 text-xs">Connected</span>
                    </div>
                  </div>
                )}
                {/* Row: WhatsApp */}
                {waConnected && (
                  <div className="px-6 py-3 grid grid-cols-3 items-center gap-4 cursor-pointer" onDoubleClick={() => openDetails('WHATSAPP')}>
                    <div className="flex items-center gap-3 min-w-0">
                      <Image src="/zap.png" alt="WhatsApp" width={20} height={20} />
                      <div className="truncate">
                        <div className="text-sm font-semibold text-gray-900 truncate">WhatsApp</div>
                        <div className="text-[11px] text-gray-500 truncate">Official WhatsApp Business API.</div>
                      </div>
                    </div>
                    <div className="text-sm text-gray-700">Messaging</div>
                    <div className="flex items-center justify-end">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-50 text-green-700 ring-1 ring-inset ring-green-200 text-xs">Conectado</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          {/* Add Integration Dialog */}
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogContent className="sm:max-w-[900px]">
              <DialogHeader>
                <DialogTitle>Add integration</DialogTitle>
                <DialogDescription>Integrate your account with apps to supercharge your data.</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Sidebar */}
                <div className="md:col-span-1">
                  <div className="mb-3">
                    <div className="relative">
                      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="pr-8" />
                      <LinkIcon className="h-4 w-4 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2" />
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="radio" name="cat" checked={category==='all'} onChange={() => setCategory('all')} />
                      All categories
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" name="cat" checked={category==='payments'} onChange={() => setCategory('payments')} />
                      Payments
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" name="cat" checked={category==='messaging'} onChange={() => setCategory('messaging')} />
                      Messaging
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" name="cat" checked={category==='email'} onChange={() => setCategory('email')} />
                      Email
                    </label>
                  </div>
                </div>
                {/* Results */}
                <div className="md:col-span-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* KRX Pay (Pagar.me) */}
                    <button
                      className="text-left rounded-xl border border-gray-200 bg-white hover:bg-gray-50 p-4"
                      onClick={async () => {
                        setAddOpen(false);
                        if (!currentClinic?.id) return toast.error('Select a clinic');
                        try {
                          const res = await fetch('/api/payments/pagarme/onboard', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ clinicId: currentClinic.id })
                          });
                          const data = await res.json();
                          if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
                          router.push('/doctor/integrations/payments/setup');
                        } catch (e: any) {
                          toast.error(e?.message || 'Failed to start KRX Pay onboarding');
                        }
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <Image src="/krxpay.png" alt="KRX Pay" width={40} height={40} className="invert" />
                        <div>
                          <div className="font-semibold text-gray-900">KRX Pay</div>
                          <div className="text-xs text-gray-600">Best gateway with AI.</div>
                        </div>
                      </div>
                    </button>
                    {/* WhatsApp Official */}
                    <button
                      className="text-left rounded-xl border border-gray-200 bg-white hover:bg-gray-50 p-4"
                      onClick={() => {
                        setAddOpen(false);
                        if (!currentClinic?.id) return toast.error('Select a clinic');
                        const returnTo = '/doctor/integrations';
                        window.location.href = `/api/integrations/whatsapp/oauth/start?clinicId=${encodeURIComponent(currentClinic.id)}&returnTo=${encodeURIComponent(returnTo)}`;
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <Image src="/zap.png" alt="WhatsApp" width={40} height={40} />
                        <div>
                          <div className="font-semibold text-gray-900">WhatsApp</div>
                          <div className="text-xs text-gray-600">Send messages and templates via the official WhatsApp API.</div>
                        </div>
                      </div>
                    </button>
                    {/* Stripe */}
                    <button
                      className="text-left rounded-xl border border-gray-200 bg-white hover:bg-gray-50 p-4"
                      onClick={async () => {
                        setAddOpen(false);
                        const mid = await resolveMerchantId();
                        if (!mid) {
                          toast.error('Merchant not found for current clinic');
                          return;
                        }
                        setStripeMerchantId(mid);
                        setStripeReady(false);
                        setStripeOpen(true);
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <Image src="/stripe.svg" alt="Stripe" width={40} height={40} />
                        <div>
                          <div className="font-semibold text-gray-900">Stripe</div>
                          <div className="text-xs text-gray-600">Connect payments. Minimal setup.</div>
                        </div>
                      </div>
                    </button>
                    {/* Appmax */}
                    <button
                      className="text-left rounded-xl border border-gray-200 bg-white hover:bg-gray-50 p-4"
                      onClick={async () => {
                        setAddOpen(false);
                        const mid = await resolveMerchantId();
                        if (!mid) {
                          toast.error('Merchant not found for current clinic');
                          return;
                        }
                        setAppmaxMerchantId(mid);
                        setAppmaxOpen(true);
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <Image src="/appmax.png" alt="Appmax" width={40} height={40} />
                        <div>
                          <div className="font-semibold text-gray-900">Appmax</div>
                          <div className="text-xs text-gray-600">Payments (card, pix)</div>
                        </div>
                      </div>
                    </button>
                    {/* PayPal (placeholder) */}
                    <button
                      className="text-left rounded-xl border border-gray-200 bg-white hover:bg-gray-50 p-4"
                      onClick={() => {
                        setAddOpen(false);
                        toast('PayPal coming soon');
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <Image src="/paypal.png" alt="PayPal" width={40} height={40} />
                        <div>
                          <div className="font-semibold text-gray-900">PayPal</div>
                          <div className="text-xs text-gray-600">Accept payments via PayPal. Coming soon.</div>
                        </div>
                      </div>
                    </button>
                    {/* Shopify (placeholder) */}
                    <button
                      className="text-left rounded-xl border border-gray-200 bg-white hover:bg-gray-50 p-4"
                      onClick={() => {
                        setAddOpen(false);
                        toast('Shopify coming soon');
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <Image src="/shopify.png" alt="Shopify" width={40} height={40} />
                        <div>
                          <div className="font-semibold text-gray-900">Shopify</div>
                          <div className="text-xs text-gray-600">Sync products and orders. Coming soon.</div>
                        </div>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Appmax Connect Dialog (minimal) */}
          <Dialog open={appmaxOpen} onOpenChange={async (v) => { setAppmaxOpen(v); if (v && !appmaxMerchantId) { const mid = await resolveMerchantId(); if (mid) setAppmaxMerchantId(mid); } }}>
            <DialogContent className="sm:max-w-[520px]">
              <DialogHeader>
                <DialogTitle>Connect Appmax</DialogTitle>
                <DialogDescription>Save your Appmax API Key (sandbox/production).</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <div className="text-sm text-gray-700 mb-1">API Key</div>
                  <Input value={appmaxApiKey} onChange={(e) => setAppmaxApiKey(e.target.value)} placeholder="XXXXXXXX-XXXXXXXX-..." />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={appmaxTestMode} onChange={(e) => setAppmaxTestMode(e.target.checked)} />
                  Test mode (sandbox)
                </label>
                <div className="pt-2 flex items-center justify-end gap-2">
                  <Button variant="secondary" onClick={() => setAppmaxOpen(false)}>Cancel</Button>
                  <Button
                    disabled={appmaxSaving || !appmaxApiKey.trim() || !appmaxMerchantId}
                    onClick={async () => {
                      if (!appmaxMerchantId) return;
                      try {
                        setAppmaxSaving(true);
                        const res = await fetch('/api/admin/integrations/appmax/upsert', {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ merchantId: appmaxMerchantId, credentials: { apiKey: appmaxApiKey.trim(), testMode: !!appmaxTestMode } })
                        });
                        const data = await res.json();
                        if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
                        toast.success('Appmax connected');
                        // Auto-verify credentials to mark as verified
                        try {
                          const v = await fetch('/api/admin/integrations/appmax/verify', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ clinicId: currentClinic?.id })
                          });
                          const vd = await v.json();
                          if (v.ok && vd?.verified) {
                            toast.success('Appmax token verified');
                          } else {
                            toast(vd?.error || 'Unable to verify Appmax now');
                          }
                        } catch {}
                        setAppmaxOpen(false);
                        setAppmaxApiKey('');
                        // Refresh status table
                        try {
                          const res2 = await fetch(`/api/admin/integrations/appmax/status?clinicId=${encodeURIComponent(currentClinic?.id || '')}`, { cache: 'no-store' });
                          const d2 = await res2.json();
                          setAppmaxConnected(!!d2?.connected);
                        } catch {}
                      } catch (e: any) {
                        toast.error(e?.message || 'Failed to save Appmax credentials');
                      } finally {
                        setAppmaxSaving(false);
                      }
                    }}
                  >{appmaxSaving ? 'Saving…' : 'Save'}</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Integration Details Modal (double-click row) */}
          <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
            <DialogContent className="sm:max-w-[560px]">
              <DialogHeader>
                <DialogTitle>
                  {detailsProvider === 'KRXPAY' && 'KRX Pay — Details'}
                  {detailsProvider === 'STRIPE' && 'Stripe — Details'}
                  {detailsProvider === 'WHATSAPP' && 'WhatsApp — Details'}
                </DialogTitle>
                <DialogDescription>Connection and configuration summary.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                {detailsProvider === 'KRXPAY' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between"><span className="text-gray-600">Status</span><span className="font-medium">Connected</span></div>
                    <div className="flex items-center justify-between"><span className="text-gray-600">Recipient ID</span><span className="font-mono">{pgRecipientId || '—'}</span></div>
                    <div className="flex items-center justify-between"><span className="text-gray-600">Split %</span><span className="font-medium">{pgSplitPercent ?? 100}%</span></div>
                    <div className="flex items-center justify-between"><span className="text-gray-600">Platform fee (bps)</span><span className="font-medium">{pgPlatformFeeBps ?? 0}</span></div>
                    <div className="flex items-center justify-between"><span className="text-gray-600">Last sync</span><span className="font-medium">{pgLastSyncAt || '—'}</span></div>
                    {pgDetails && (
                      <div className="pt-2">
                        <div className="text-gray-600 mb-1">Details</div>
                        <pre className="bg-gray-50 border border-gray-200 rounded-lg p-2 text-[12px] overflow-auto max-h-48 whitespace-pre-wrap">{JSON.stringify(pgDetails, null, 2)}</pre>
                      </div>
                    )}
                    <div className="pt-2 flex justify-end gap-2">
                      <Button variant="secondary" onClick={() => setDetailsOpen(false)}>Close</Button>
                      <Button onClick={() => { setDetailsOpen(false); router.push('/doctor/integrations/payments/setup'); }}>Edit</Button>
                    </div>
                  </div>
                )}
                {detailsProvider === 'STRIPE' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between"><span className="text-gray-600">Status</span><span className="font-medium">Connected</span></div>
                    <div className="flex items-center justify-between"><span className="text-gray-600">Verified</span><span className="font-medium">{stripeVerified ? 'Yes' : 'No'}</span></div>
                    <div className="flex items-center justify-between"><span className="text-gray-600">Account ID</span><span className="font-mono">{stripeStatusAccountId || '—'}</span></div>
                    <div className="flex items-center justify-between"><span className="text-gray-600">Verified at</span><span className="font-medium">{stripeStatusLastUsedAt || '—'}</span></div>
                    <div>
                      <div className="text-gray-600 mb-1">Webhook</div>
                      <div className="flex gap-2 items-center">
                        <Input value={stripeWebhookUrl} readOnly />
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={async () => { try { await navigator.clipboard.writeText(stripeWebhookUrl); toast.success('Copied'); } catch {} }}
                        >Copy</Button>
                      </div>
                    </div>
                    <div className="pt-2 flex justify-end gap-2">
                      <Button variant="secondary" onClick={() => setDetailsOpen(false)}>Close</Button>
                      <Button onClick={() => { setDetailsOpen(false); setStripeOpen(true); }}>Edit</Button>
                    </div>
                  </div>
                )}
                {detailsProvider === 'WHATSAPP' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between"><span className="text-gray-600">Status</span><span className="font-medium">Connected</span></div>
                    <div className="flex items-center justify-between"><span className="text-gray-600">Phone</span><span className="font-medium">{waPhone || '—'}</span></div>
                    <div className="flex items-center justify-between"><span className="text-gray-600">Phone Number ID</span><span className="font-mono">{waPhoneNumberId || '—'}</span></div>
                    <div className="pt-2 flex justify-end gap-2">
                      <Button variant="secondary" onClick={() => setDetailsOpen(false)}>Close</Button>
                      <Button onClick={() => { setDetailsOpen(false); setWaWizardOpen(true); }}>Edit</Button>
                    </div>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* Stripe Setup & Test Dialog (isolated, does not affect KRXPAY) */}
          <Dialog open={stripeOpen} onOpenChange={setStripeOpen}>
            <DialogContent className="sm:max-w-[560px]">
              <DialogHeader>
                <DialogTitle>Stripe — Connect, Confirm, Test</DialogTitle>
                <DialogDescription>Step-by-step setup. Keep it simple.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="text-xs text-gray-500">Merchant: {stripeMerchantId || '—'}</div>
                {/* Step 1 — Connect */}
                <div className="text-[13px] font-medium text-gray-900">1) Connect</div>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <div className="text-sm text-gray-700 mb-1">Webhook endpoint</div>
                    <div className="flex gap-2">
                      <Input value={stripeWebhookUrl} readOnly />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={async () => { try { await navigator.clipboard.writeText(stripeWebhookUrl); toast.success('Copied'); } catch {} }}
                      >Copy</Button>
                    </div>
                    <div className="text-[11px] text-gray-500 mt-1">Add this endpoint in Stripe Dashboard and copy the signing secret.</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-700 mb-1">API key (secret)</div>
                    <Input value={stripeApiKey} onChange={(e) => setStripeApiKey(e.target.value)} placeholder="sk_test_..." />
                  </div>
                  <div>
                    <div className="text-sm text-gray-700 mb-1">Account ID (optional)</div>
                    <Input value={stripeAccountId} onChange={(e) => setStripeAccountId(e.target.value)} placeholder="acct_..." />
                  </div>
                  <div>
                    <div className="text-sm text-gray-700 mb-1">Webhook signing secret (optional)</div>
                    <Input value={stripeWebhookSecret} onChange={(e) => setStripeWebhookSecret(e.target.value)} placeholder="whsec_..." />
                  </div>
                  <div className="flex justify-end">
                    <Button
                      disabled={stripeSaving || !stripeApiKey.trim() || !stripeMerchantId}
                      onClick={async () => {
                        if (!stripeMerchantId) return toast.error('Invalid merchant');
                        try {
                          setStripeSaving(true);
                          const res = await fetch('/api/admin/integrations/stripe/upsert', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              merchantId: stripeMerchantId,
                              credentials: {
                                apiKey: stripeApiKey.trim(),
                                accountId: stripeAccountId.trim() || undefined,
                                webhookSecret: stripeWebhookSecret.trim() || undefined,
                              },
                            })
                          });
                          const data = await res.json();
                          if (!res.ok) throw new Error(data?.error || 'Failed to save credentials');
                          setStripeReady(true);
                          toast.success('Connected');
                        } catch (e: any) {
                          toast.error(e?.message || 'Save error');
                        } finally {
                          setStripeSaving(false);
                        }
                      }}
                    >
                      {stripeSaving ? 'Saving…' : 'Save credentials'}
                    </Button>
                  </div>
                </div>
                {/* Step 2 — Confirm */}
                <Separator />
                <div className="text-[13px] font-medium text-gray-900">2) Confirm</div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm text-gray-700">{stripeReady ? 'Verified. You can test now.' : 'Verify credentials before testing.'}</div>
                  <Button
                    variant="secondary"
                    disabled={stripeVerifying || !stripeMerchantId || !stripeApiKey.trim()}
                    onClick={async () => {
                      if (!stripeMerchantId) return;
                      try {
                        setStripeVerifying(true);
                        const res = await fetch('/api/admin/integrations/stripe/verify', {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ merchantId: stripeMerchantId })
                        });
                        const data = await res.json();
                        if (!res.ok || !data?.verified) throw new Error(data?.error || 'Verification failed');
                        setStripeReady(true);
                        await loadStripeStatus();
                        toast.success('Verified');
                      } catch (e: any) {
                        setStripeReady(false);
                        toast.error(e?.message || 'Could not verify credentials');
                      } finally {
                        setStripeVerifying(false);
                      }
                    }}
                  >
                    {stripeVerifying ? 'Verifying…' : 'Verify'}
                  </Button>
                </div>
                {/* Step 3 — Test */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <div className="text-sm text-gray-700 mb-1">Amount</div>
                    <Input value={stripeTestAmount} onChange={(e) => setStripeTestAmount(e.target.value)} placeholder="10.00" />
                  </div>
                  <div>
                    <div className="text-sm text-gray-700 mb-1">Currency</div>
                    <select
                      className="w-full border rounded-lg h-9 px-2 bg-white"
                      value={stripeTestCurrency}
                      onChange={(e) => setStripeTestCurrency(e.target.value)}
                    >
                      <option value="USD">USD</option>
                      <option value="BRL">BRL</option>
                      <option value="EUR">EUR</option>
                      <option value="GBP">GBP</option>
                      <option value="JPY">JPY</option>
                    </select>
                  </div>
                  <div className="sm:col-span-3">
                    <div className="text-sm text-gray-700 mb-1">Customer email</div>
                    <Input value={stripeTestEmail} onChange={(e) => setStripeTestEmail(e.target.value)} placeholder="customer@example.com" />
                  </div>
                  <div className="sm:col-span-3 flex justify-end">
                    <Button
                      disabled={stripeTesting || !stripeMerchantId || !stripeTestEmail.trim() || !stripeReady}
                      onClick={async () => {
                        if (!stripeMerchantId) return toast.error('Invalid merchant');
                        try {
                          setStripeTesting(true);
                          const amount = (() => {
                            const n = Number(String(stripeTestAmount).replace(',', '.'));
                            return Number.isFinite(n) && n > 0 ? n : 10.0;
                          })();
                          const res = await fetch('/api/payments/create', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              merchantId: stripeMerchantId,
                              provider: 'STRIPE',
                              amount,
                              currency: (stripeTestCurrency || 'USD').toUpperCase(),
                              customerEmail: stripeTestEmail.trim(),
                            })
                          });
                          const data = await res.json();
                          if (!res.ok) throw new Error(data?.error || 'Test failed');
                          const cs = data?.payment?.clientSecret;
                          if (cs) {
                            toast.success('PaymentIntent created. clientSecret copied to clipboard.');
                            try { await navigator.clipboard.writeText(String(cs)); } catch {}
                          } else {
                            toast('Created without clientSecret (check Stripe dashboard).');
                          }
                        } catch (e: any) {
                          toast.error(e?.message || 'Could not create test payment');
                        } finally {
                          setStripeTesting(false);
                        }
                      }}
                    >
                      {stripeTesting ? 'Testing…' : 'Run test payment'}
                    </Button>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>

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
