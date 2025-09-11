'use client';

import React, { useMemo, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { CogIcon, LinkIcon, LockClosedIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useClinic } from '@/contexts/clinic-context';
import { Input } from '@/components/ui/input';
import { toast } from 'react-hot-toast';

export default function IntegrationsPage() {
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

  useEffect(() => {
    loadStatus();
  }, [currentClinic?.id]);

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
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="lg:ml-64">
          <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24">
            {/* Header Skeleton */}
            <div className="flex justify-between items-start mb-8">
              <div>
                <div className="h-8 bg-gray-200 rounded-lg w-32 mb-2 animate-pulse"></div>
                <div className="h-5 bg-gray-100 rounded-lg w-64 animate-pulse"></div>
              </div>
              <div className="h-10 bg-gray-200 rounded-xl w-32 animate-pulse"></div>
            </div>

            {/* Cards Skeleton */}
            <div className="grid gap-6 md:grid-cols-2">
              {[1, 2].map((i) => (
                <Card key={i} className="bg-white border-gray-200 shadow-lg rounded-2xl">
                  <CardHeader className="pb-4">
                    <div className="h-6 bg-gray-200 rounded-lg w-2/3 animate-pulse"></div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="h-4 bg-gray-100 rounded w-full animate-pulse"></div>
                    <div className="h-4 bg-gray-100 rounded w-2/3 animate-pulse"></div>
                    <div className="flex items-center gap-2 pt-2">
                      <div className="h-9 bg-gray-100 rounded-xl w-36 animate-pulse"></div>
                      <div className="h-9 bg-gray-100 rounded-xl w-28 animate-pulse"></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24">
          {/* Header */}
          <div className="flex justify-between items-start mb-8">
            <div>
              <h1 className="text-xl font-semibold text-gray-900 mb-1">Integrations</h1>
              <p className="text-sm text-gray-500">Connect external tools and services</p>
            </div>
          </div>

          {/* Free plan banner */}
          {isFree && (
            <div className="mb-4 rounded-2xl px-4 py-4 text-white bg-gradient-to-r from-[#5893ec] to-[#9bcef7] shadow-sm">
              <p className="text-sm font-semibold">You're on the Free plan — Integrations are limited.</p>
              <p className="text-xs mt-1 opacity-95">Upgrade to the Creator plan to unlock full integrations and automations.</p>
              <div className="mt-3">
                <Link href="/clinic/subscription">
                  <Button size="sm" variant="secondary" className="h-8 rounded-lg bg-white text-gray-800 hover:bg-gray-100">
                    See plans
                  </Button>
                </Link>
              </div>
            </div>
          )}

          {/* Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* WhatsApp (Xase.ai) */}
            <Card className="relative bg-white border border-gray-200 rounded-xl hover:border-gray-300 transition">
              {blocked && (
                <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-600 px-2 py-1 text-xs">
                  <LockClosedIcon className="h-3.5 w-3.5" /> Locked
                </div>
              )}
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
                    <CogIcon className="h-5 w-5 text-gray-500" /> WhatsApp (via Xase.ai)
                  </CardTitle>
                  <div className="text-xs">
                    {statusLoading ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 ring-1 ring-inset ring-gray-200">Loading...</span>
                    ) : status === 'CONNECTED' ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-50 text-green-700 ring-1 ring-inset ring-green-200">Connected</span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-50 text-gray-700 ring-1 ring-inset ring-gray-200">Disconnected</span>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-sm">
                  <div className={blocked ? 'opacity-50 blur-[1px] select-none pointer-events-none space-y-3' : 'space-y-3'}>
                    <p className="text-gray-600">
                      Cole sua API Key da Xase.ai e conecte seu WhatsApp. A Zuzz usará essa conexão para disparos.
                    </p>
                    <div className="flex items-center gap-2">
                      <Input
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="Xase API Key"
                      />
                      <Button onClick={connect} disabled={connecting || !apiKey.trim()} className="rounded-xl">
                        {connecting ? 'Connecting...' : 'Connect'}
                      </Button>
                      <Button variant="outline" onClick={loadStatus} disabled={statusLoading} className="rounded-xl">
                        Refresh
                      </Button>
                    </div>
                    <Separator />
                    <div className="grid grid-cols-2 gap-3 text-sm">
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
                    <Separator />
                    <div className="space-y-2">
                      <div className="text-gray-700 font-medium">Enviar mensagem de teste</div>
                      <div className="flex items-center gap-2">
                        <Input
                          value={testTo}
                          onChange={(e) => setTestTo(e.target.value)}
                          placeholder="Número destino (+5511999999999)"
                        />
                        <Input
                          value={testMsg}
                          onChange={(e) => setTestMsg(e.target.value)}
                          placeholder="Mensagem"
                        />
                        <Button onClick={sendTest} disabled={testing || status !== 'CONNECTED'} className="rounded-xl">
                          {testing ? 'Sending...' : 'Send test'}
                        </Button>
                      </div>
                    </div>
                    {status !== 'CONNECTED' && (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                        Sua instância parece desconectada. Abra o app da Xase.ai para reconectar via QR code.
                      </p>
                    )}
                  </div>
                  {!isAtLeastStarter && (
                    <div className="pt-2">
                      <Link href="/clinic/subscription">
                        <Button variant="outline" className="border-gray-200 bg-white text-gray-700 hover:bg-gray-50 rounded-lg h-9 px-4">
                          Upgrade plan
                        </Button>
                      </Link>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            {/* Stripe */}
            <Card className="relative bg-white border border-gray-200 rounded-xl hover:border-gray-300 transition">
              {blocked && (
                <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-600 px-2 py-1 text-xs">
                  <LockClosedIcon className="h-3.5 w-3.5" /> Locked
                </div>
              )}
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
                    <CogIcon className="h-5 w-5 text-gray-500" /> Payments (Stripe)
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-sm">
                  <div className={blocked ? 'opacity-50 blur-[1px] select-none pointer-events-none' : ''}>
                    <p className="text-gray-600">
                      Enable online payments for your services by connecting a Stripe account.
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      {/* Keep learn more inside blurred block so it appears disabled when blocked */}
                      <a
                        href="https://stripe.com/"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium"
                      >
                        <LinkIcon className="h-4 w-4" /> Learn more
                      </a>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    {isCreator ? (
                      <Link href="/doctor/payments">
                        <Button className="bg-gradient-to-r from-[#5893ec] to-[#9bcef7] hover:opacity-90 text-white rounded-xl h-9 px-4 font-medium">
                          Open payment setup
                        </Button>
                      </Link>
                    ) : (
                      <Link href="/clinic/subscription">
                        <Button variant="outline" className="border-gray-200 bg-white text-gray-700 hover:bg-gray-50 rounded-lg h-9 px-4">
                          Upgrade to Creator
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Webhooks */}
            <Card className="relative bg-white border border-gray-200 rounded-xl hover:border-gray-300 transition">
              {blocked && (
                <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-600 px-2 py-1 text-xs">
                  <LockClosedIcon className="h-3.5 w-3.5" /> Locked
                </div>
              )}
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
                    <LinkIcon className="h-5 w-5 text-gray-500" /> Webhooks & Automations
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-sm">
                  <div className={blocked ? 'opacity-50 blur-[1px] select-none pointer-events-none space-y-4' : 'space-y-4'}>
                    <p className="text-gray-600">
                      Use webhooks to connect with automation platforms (Zapier, Make, n8n) or your own systems.
                    </p>
                    <div className="space-y-2">
                      <p className="text-gray-700 font-medium">Common events:</p>
                      <ul className="list-disc list-inside text-gray-600">
                        <li>New referral received</li>
                        <li>Service purchased</li>
                        <li>Patient assigned to protocol</li>
                      </ul>
                    </div>
                    <Separator />
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        className="border-gray-200 bg-white text-gray-700 hover:bg-gray-50 rounded-lg h-9 px-4"
                      >
                        View docs
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isCreator ? (
                      <Button className="bg-gradient-to-r from-[#5893ec] to-[#9bcef7] hover:opacity-90 text-white rounded-xl h-9 px-4 font-medium">
                        Create webhook
                      </Button>
                    ) : (
                      <Link href="/clinic/subscription">
                        <Button variant="outline" className="border-gray-200 bg-white text-gray-700 hover:bg-gray-50 rounded-lg h-9 px-4">
                          Upgrade to Creator
                        </Button>
                      </Link>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">Need a custom integration? Contact support.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
