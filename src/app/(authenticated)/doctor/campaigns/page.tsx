/* eslint-disable */
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type Campaign = {
  id: string;
  doctor_id: string;
  campaign_slug: string;
  title: string;
  description?: string | null;
  benefit_title?: string | null;
  benefit_description?: string | null;
  hero_image_url?: string | null;
  form_config?: any | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | string;
  valid_from?: string | null;
  valid_until?: string | null;
  created_at: string;
  updated_at: string;
};

export default function DoctorCampaignsPage() {
  const [items, setItems] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isCreating, setIsCreating] = useState(false);
  const [createData, setCreateData] = useState({
    campaign_slug: '',
    title: '',
    description: ''
  });
  const [createError, setCreateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [doctorSlug, setDoctorSlug] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ limit: '50', offset: '0' });
      const res = await fetch(`/api/v2/doctor/campaigns?${params.toString()}`, { cache: 'no-store' });
      let json: any = null;
      try { json = await res.json(); } catch (_) {}
      if (!res.ok) {
        console.error('[UI][campaigns] GET failed', {
          status: res.status,
          body: json,
          hint: res.status === 401 || res.status === 403 ? 'Verifique login de médico, flags globais (.env) e flag por médico' : undefined,
          envFlags: {
            NEXT_PUBLIC_ENABLE_CAMPAIGN_PAGES: process.env.NEXT_PUBLIC_ENABLE_CAMPAIGN_PAGES,
            NEXT_PUBLIC_ENABLE_CAMPAIGN_FORMS: process.env.NEXT_PUBLIC_ENABLE_CAMPAIGN_FORMS,
            NEXT_PUBLIC_ENABLE_CAMPAIGN_PREVIEW: process.env.NEXT_PUBLIC_ENABLE_CAMPAIGN_PREVIEW,
          }
        });
        const msg = (json && (json.error || json.message)) || `Request failed: ${res.status}`;
        throw new Error(msg);
      }
      const jsonOk = json ?? {};
      setItems(Array.isArray(jsonOk?.data) ? jsonOk.data : []);
    } catch (e: any) {
      setError(e?.message || 'Erro ao carregar campanhas');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  // Load doctor slug to build public campaign links
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await fetch('/api/profile', { cache: 'no-store' });
        const j = await res.json();
        if (res.ok && j?.doctor_slug) setDoctorSlug(j.doctor_slug);
      } catch (_) {}
    };
    fetchProfile();
  }, []);

  const kpis = useMemo(() => {
    const total = items.length;
    const published = items.filter(i => i.status === 'PUBLISHED').length;
    const draft = items.filter(i => i.status === 'DRAFT').length;
    const archived = items.filter(i => i.status === 'ARCHIVED').length;
    return { total, published, draft, archived };
  }, [items]);

  const onCreate = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setCreateError(null);
    if (!createData.campaign_slug || !createData.title) {
      setCreateError('Preencha slug e título');
      return;
    }
    try {
      setCreateLoading(true);
      const res = await fetch('/api/v2/doctor/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_slug: createData.campaign_slug,
          title: createData.title,
          description: createData.description,
          status: 'DRAFT'
        })
      });
      let json: any = null;
      try { json = await res.json(); } catch (_) {}
      if (!res.ok || !json?.success) {
        console.error('[UI][campaigns] POST failed', {
          status: res.status,
          body: json,
          hint: res.status === 401 || res.status === 403 ? 'Verifique login de médico, flags globais (.env) e flag por médico' : undefined,
        });
        throw new Error((json && (json.error || json.message)) || `Erro ${res.status}`);
      }
      setIsCreating(false);
      setCreateData({ campaign_slug: '', title: '', description: '' });
      refresh();
    } catch (e: any) {
      setCreateError(e?.message || 'Erro ao criar campanha');
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <div className="lg:ml-64">
      <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24 bg-gray-50">
        {/* Header */}
        <div className="flex flex-col gap-3 mb-4">
          <div className="flex items-center justify-between">
            <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">Campaigns</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsCreating(true)}
                className="inline-flex h-8 items-center rounded-full bg-gradient-to-r from-[#5893ec] to-[#9bcef7] px-3 text-xs font-medium text-white hover:opacity-90 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#5893ec]"
              >
                New campaign
              </button>
            </div>
          </div>
          {/* Top Tabs (pills) */}
          <div className="flex items-center gap-2 overflow-auto">
            {[
              { key: 'all', label: 'All campaigns', active: true },
              { key: 'draft', label: 'Draft' },
              { key: 'published', label: 'Published' },
              { key: 'archived', label: 'Archived' }
            ].map(tab => (
              <span
                key={tab.key}
                className={[
                  'whitespace-nowrap text-xs font-medium rounded-full border px-3 py-1',
                  tab.active
                    ? 'bg-white border-gray-200 text-gray-900 shadow-sm'
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-white'
                ].join(' ')}
              >
                {tab.label}
              </span>
            ))}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-2">
          {[{
            title: 'Total',
            value: kpis.total,
            note: 'todas campanhas'
          }, {
            title: 'Publicadas',
            value: kpis.published,
            note: 'ativas'
          }, {
            title: 'Rascunhos',
            value: kpis.draft,
            note: 'em edição'
          }, {
            title: 'Arquivadas',
            value: kpis.archived,
            note: 'ocultas'
          }].map((kpi) => (
            <div key={kpi.title} className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-gray-500">{kpi.title}</span>
                <span className="text-[10px] text-gray-400">{kpi.note}</span>
              </div>
              <div className="mt-1 text-[22px] leading-7 font-semibold text-gray-900">{kpi.value}</div>
            </div>
          ))}
        </div>

        {/* List */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-900">Minhas campanhas</h2>
            {error && <span className="text-xs text-red-500 font-medium">{error}</span>}
          </div>
          {loading ? (
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="px-3 py-2.5 border-b border-gray-100 rounded-t-2xl">
                <div className="h-4 w-24 bg-gray-100 rounded animate-pulse" />
              </div>
              <div className="p-3 space-y-2">
                {[...Array(5)].map((_, j) => (
                  <div key={j} className="h-10 bg-gray-50 border border-gray-100 rounded-lg animate-pulse" />
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="hidden md:grid grid-cols-12 gap-2 px-3 py-2.5 border-b border-gray-100 text-[11px] font-medium text-gray-500">
                <div className="col-span-4">Título</div>
                <div className="col-span-2">Slug</div>
                <div className="col-span-3">Link</div>
                <div className="col-span-1">Status</div>
                <div className="col-span-2 text-right">Atualizado</div>
              </div>
              <div className="divide-y divide-gray-100">
                {items.length === 0 && (
                  <div className="p-3 text-xs text-gray-500 font-medium">Nenhuma campanha</div>
                )}
                {items.map((c) => (
                  <div
                    key={c.id}
                    className="grid grid-cols-12 gap-2 px-3 py-2.5 hover:bg-gray-50 transition-colors"
                  >
                    <div className="col-span-12 md:col-span-4">
                      <div className="flex items-center gap-2">
                        <Link href={`/doctor/campaigns/${c.id}`} className="text-sm font-medium text-gray-900 truncate hover:underline">
                          {c.title}
                        </Link>
                        <Link
                          href={`/doctor/campaigns/${c.id}`}
                          className="shrink-0 text-gray-400 hover:text-gray-600"
                          title="Editar"
                          aria-label="Editar campanha"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* Pencil icon */}
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                            <path d="M13.586 3.586a2 2 0 0 1 2.828 2.828l-8.5 8.5a2 2 0 0 1-.878.515l-3.06.817a.5.5 0 0 1-.61-.61l.816-3.06a2 2 0 0 1 .516-.878l8.5-8.5Zm1.414 4.242L12.172 4 5.5 10.672a1 1 0 0 0-.258.439l-.52 1.949 1.949-.52a1 1 0 0 0 .439-.258L15 7.828Z" />
                          </svg>
                        </Link>
                      </div>
                      <div className="text-[11px] text-gray-500 truncate">{c.description || 'Sem descrição'}</div>
                    </div>
                    <div className="col-span-12 md:col-span-2 text-[13px] text-gray-700 truncate">{c.campaign_slug}</div>
                    <div className="col-span-12 md:col-span-3 text-[12px] text-gray-700 truncate">
                      {process.env.NEXT_PUBLIC_ENABLE_CAMPAIGN_PREVIEW === 'true' && doctorSlug && c.campaign_slug ? (
                        (() => {
                          const isDraft = c.status === 'DRAFT';
                          const href = `/${doctorSlug}/${c.campaign_slug}${isDraft ? '?preview=1' : ''}`;
                          return (
                            <Link
                              href={href}
                              target="_blank"
                              className="text-[#5893ec] hover:underline break-all"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {href}
                            </Link>
                          );
                        })()
                      ) : (
                        <span className="text-[11px] text-gray-400">Preview link unavailable</span>
                      )}
                    </div>
                    <div className="col-span-6 md:col-span-1">
                      <span className="inline-flex items-center rounded-full bg-gray-50 border border-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-700">{c.status}</span>
                    </div>
                    <div className="col-span-6 md:col-span-2 text-right text-[12px] text-gray-500">
                      {new Date(c.updated_at).toLocaleString('pt-BR')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Create Drawer / Modal - simples */}
        {isCreating && (
          <div className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center">
            <div className="absolute inset-0 bg-black/30" onClick={() => setIsCreating(false)} />
            <div className="relative w-full md:w-[520px] bg-white rounded-t-2xl md:rounded-2xl shadow-lg p-4 md:p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900">Nova campanha</h3>
                <button onClick={() => setIsCreating(false)} className="text-xs text-gray-500">Fechar</button>
              </div>
              <form onSubmit={onCreate} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Slug</label>
                  <input
                    value={createData.campaign_slug}
                    onChange={e => setCreateData(s => ({ ...s, campaign_slug: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5893ec]"
                    placeholder="ex: black-friday-2025"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Título</label>
                  <input
                    value={createData.title}
                    onChange={e => setCreateData(s => ({ ...s, title: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5893ec]"
                    placeholder="Nome da campanha"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Descrição</label>
                  <textarea
                    value={createData.description}
                    onChange={e => setCreateData(s => ({ ...s, description: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5893ec]"
                    rows={3}
                    placeholder="Descrição breve"
                  />
                </div>
                {createError && <div className="text-xs text-red-500">{createError}</div>}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button type="button" onClick={() => setIsCreating(false)} className="h-8 px-3 text-xs rounded-full border border-gray-200">Cancelar</button>
                  <button
                    type="submit"
                    disabled={createLoading}
                    className="inline-flex h-8 items-center rounded-full bg-gradient-to-r from-[#5893ec] to-[#9bcef7] px-3 text-xs font-medium text-white hover:opacity-90 shadow-sm disabled:opacity-50"
                  >
                    {createLoading ? 'Salvando...' : 'Criar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
