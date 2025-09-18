'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useClinic } from '@/contexts/clinic-context';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

type Template = {
  id: string;
  doctor_id: string;
  name: string;
  slug: string;
  display_title?: string | null;
  display_message?: string | null;
  config?: any;
  is_active: boolean;
  updated_at: string;
};

type Product = {
  id: string;
  name: string;
};

export default function DoctorCouponTemplatesPage() {
  const { currentClinic } = useClinic();
  const [items, setItems] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [doctorSlug, setDoctorSlug] = useState<string | null>(null);
  const clinicSlug = (currentClinic?.slug || '').trim() || null;

  const [isCreating, setIsCreating] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createData, setCreateData] = useState({
    slug: '',
    name: '',
    display_title: '',
    display_message: '',
    is_active: true,
    // keep internal JSON text to submit config; UI controls will manage product_ids
    config_text: '{\n  "product_ids": []\n}',
  });

  // Products state
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState({
    slug: '',
    name: '',
    display_title: '',
    display_message: '',
    is_active: true,
    config_text: '{\n  "product_ids": []\n}',
  });

  // Helpers to work with config JSON text safely
  const parseConfig = (text: string): any => {
    try { return text ? JSON.parse(text) : {}; } catch { return {}; }
  };
  const stringifyConfig = (obj: any): string => {
    try { return JSON.stringify(obj ?? {}, null, 2); } catch { return '{\n}'; }
  };
  const getProductIdsFromText = (text: string): string[] => {
    const cfg = parseConfig(text);
    if (Array.isArray(cfg?.product_ids)) return cfg.product_ids.filter((x: any) => typeof x === 'string');
    if (cfg?.product_id) return [String(cfg.product_id)]; // backward compatibility
    return [];
  };
  const setProductIdsInText = (text: string, productIds: string[]): string => {
    const cfg = parseConfig(text);
    cfg.product_ids = (productIds || []).filter(Boolean);
    // normalize legacy field
    if ('product_id' in cfg) cfg.product_id = null;
    return stringifyConfig(cfg);
  };

  const refresh = async () => {
    if (!currentClinic) {
      setItems([]);
      return;
    }

    try {
      setLoading(true);
      const params = new URLSearchParams({ 
        limit: '50', 
        offset: '0',
        clinicId: currentClinic.id
      });
      const res = await fetch(`/api/v2/doctor/coupon-templates?${params.toString()}`, { cache: 'no-store' });
      let json: any = null;
      try { json = await res.json(); } catch (_) {}
      if (!res.ok) {
        const msg = (json && (json.error || json.message)) || `Request failed: ${res.status}`;
        throw new Error(msg);
      }
      setItems(Array.isArray(json?.data) ? json.data : []);
    } catch (e: any) {
      setError(e?.message || 'Erro ao carregar modelos');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, [currentClinic]);

  // Load products for the doctor (used by Create/Edit drawers)
  const loadProducts = async () => {
    if (!currentClinic) {
      setProducts([]);
      return;
    }

    try {
      setProductsError(null);
      setProductsLoading(true);
      const res = await fetch(`/api/products?clinicId=${currentClinic.id}`, { cache: 'no-store' });
      const json = await res.json().catch(() => []);
      if (!res.ok) throw new Error(json?.error || 'Erro ao carregar produtos');
      const opts = Array.isArray(json) ? json.map((p: any) => ({ id: p.id, name: p.name })) : [];
      setProducts(opts);
    } catch (e: any) {
      setProductsError(e?.message || 'Erro ao carregar produtos');
      setProducts([]);
    } finally {
      setProductsLoading(false);
    }
  };

  // Load doctor slug to build public links
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
    const active = items.filter(i => i.is_active).length;
    const inactive = total - active;
    return { total, active, inactive };
  }, [items]);

  const onCreate = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setCreateError(null);
    if (!createData.slug || !createData.name) {
      setCreateError('Preencha slug e nome');
      return;
    }
    let parsedConfig: any = null;
    try {
      parsedConfig = createData.config_text ? JSON.parse(createData.config_text) : {};
    } catch {
      setCreateError('Config JSON inválido');
      return;
    }
    try {
      setCreateLoading(true);
      const res = await fetch('/api/v2/doctor/coupon-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: createData.slug,
          name: createData.name,
          display_title: createData.display_title || undefined,
          display_message: createData.display_message || undefined,
          config: parsedConfig,
          is_active: !!createData.is_active,
          clinicId: currentClinic?.id,
        })
      });
      let json: any = null;
      try { json = await res.json(); } catch (_) {}
      if (!res.ok || !json?.success) {
        throw new Error((json && (json.error || json.message)) || `Erro ${res.status}`);
      }
      setIsCreating(false);
      setCreateData({ slug: '', name: '', display_title: '', display_message: '', is_active: true, config_text: '{\n  "product_ids": []\n}' });
      refresh();
    } catch (e: any) {
      setCreateError(e?.message || 'Erro ao criar template');
    } finally {
      setCreateLoading(false);
    }
  };

  if (!currentClinic) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="lg:ml-64">
          <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24 flex items-center justify-center min-h-[calc(100vh-88px)]">
            <Card className="w-full max-w-md bg-white border-gray-200 shadow-lg rounded-2xl">
              <CardHeader className="text-center p-6">
                <CardTitle className="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
                  Select a Clinic
                </CardTitle>
                <CardDescription className="text-gray-600 font-medium mt-2">
                  Please select a clinic from the sidebar to view coupon templates.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lg:ml-64">
      <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24 bg-gray-50">
        {/* Header */}
        <div className="flex flex-col gap-3 mb-4">
          <div className="flex items-center justify-between">
            <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">Modelos de cupom</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsCreating(true)}
                className="inline-flex h-8 items-center rounded-full bg-gray-900 px-3 text-xs font-medium text-white hover:bg-black shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900"
              >
                Novo modelo
              </button>
            </div>
          </div>
          {/* Top Pills */}
          <div className="flex items-center gap-2 overflow-auto">
            {[{ key: 'all', label: 'Todos' }, { key: 'active', label: 'Ativos' }, { key: 'inactive', label: 'Inativos' }].map(tab => (
              <span key={tab.key} className="whitespace-nowrap text-xs font-medium rounded-full border px-3 py-1 bg-white border-gray-200 text-gray-900 shadow-sm">
                {tab.label}
              </span>
            ))}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-2">
          {[{ title: 'Total', value: kpis.total, note: 'modelos' }, { title: 'Ativos', value: kpis.active, note: 'habilitados' }, { title: 'Inativos', value: kpis.inactive, note: 'desabilitados' }].map(k => (
            <div key={k.title} className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-gray-500">{k.title}</span>
                <span className="text-[10px] text-gray-400">{k.note}</span>
              </div>
              <div className="mt-1 text-[22px] leading-7 font-semibold text-gray-900">{k.value}</div>
            </div>
          ))}
        </div>

        {/* List */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-900">Meus modelos</h2>
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
                <div className="col-span-4">Nome</div>
                <div className="col-span-2">Slug</div>
                <div className="col-span-3">Link</div>
                <div className="col-span-1">Status</div>
                <div className="col-span-2 text-right">Atualizado</div>
              </div>
              {actionMsg && (
                <div className="px-3 py-2 text-[11px] text-green-700 bg-green-50 border-b border-green-100">{actionMsg}</div>
              )}

        {/* Edit Drawer */}
        {isEditing && (
          <div className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center">
            <div className="absolute inset-0 bg-black/30" onClick={() => setIsEditing(false)} />
            <div className="relative w-full md:w-[560px] bg-white rounded-t-2xl md:rounded-2xl shadow-lg p-4 md:p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900">Editar modelo de cupom</h3>
                <button onClick={() => setIsEditing(false)} className="text-xs text-gray-500">Fechar</button>
              </div>
              <form
                onSubmit={async (ev) => {
                  ev.preventDefault();
                  if (!editId) return;
                  setEditError(null);
                  let parsed: any = {};
                  try { parsed = editData.config_text ? JSON.parse(editData.config_text) : {}; } catch {
                    setEditError('Config JSON inválido');
                    return;
                  }
                  try {
                    setEditLoading(true);
                    const res = await fetch(`/api/v2/doctor/coupon-templates/${encodeURIComponent(editId)}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        slug: editData.slug,
                        name: editData.name,
                        display_title: editData.display_title || null,
                        display_message: editData.display_message || null,
                        is_active: !!editData.is_active,
                        config: parsed,
                      })
                    });
                    const json = await res.json().catch(() => ({}));
                    if (!res.ok || !json?.success) {
                      throw new Error(json?.error || json?.message || `Erro ${res.status}`);
                    }
                    setIsEditing(false);
                    setActionMsg('Template atualizado com sucesso');
                    refresh();
                  } catch (e: any) {
                    setEditError(e?.message || 'Erro ao atualizar');
                  } finally {
                    setEditLoading(false);
                    setTimeout(() => setActionMsg(null), 3000);
                  }
                }}
                className="space-y-3"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Slug</label>
                    <input value={editData.slug} onChange={e => setEditData(s => ({ ...s, slug: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Nome</label>
                    <input value={editData.name} onChange={e => setEditData(s => ({ ...s, name: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Título de exibição</label>
                  <input value={editData.display_title} onChange={e => setEditData(s => ({ ...s, display_title: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Mensagem de exibição</label>
                  <textarea value={editData.display_message} onChange={e => setEditData(s => ({ ...s, display_message: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" rows={3} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Produtos vinculados (opcional)</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 border border-gray-200 rounded-lg p-2 bg-white">
                    {products.map((p) => {
                      const selected = getProductIdsFromText(editData.config_text);
                      const checked = selected.includes(p.id);
                      return (
                        <label key={p.id} className="flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            className="h-4 w-4 border-gray-300 rounded"
                            checked={checked}
                            onChange={(e) => {
                              const current = new Set(getProductIdsFromText(editData.config_text));
                              if (e.target.checked) current.add(p.id); else current.delete(p.id);
                              setEditData(s => ({ ...s, config_text: setProductIdsInText(s.config_text, Array.from(current)) }));
                            }}
                            onFocus={() => { if (products.length === 0) loadProducts(); }}
                          />
                          <span className="truncate">{p.name}</span>
                        </label>
                      );
                    })}
                    {products.length === 0 && !productsLoading && (
                      <div className="text-[12px] text-gray-500">Nenhum produto encontrado</div>
                    )}
                  </div>
                  {productsLoading && <div className="text-[11px] text-gray-500 mt-1">Carregando produtos...</div>}
                  {productsError && <div className="text-[11px] text-red-500 mt-1">{productsError}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <input id="edit_is_active" type="checkbox" checked={editData.is_active} onChange={e => setEditData(s => ({ ...s, is_active: e.target.checked }))} className="h-4 w-4 border-gray-300 rounded" />
                  <label htmlFor="edit_is_active" className="text-xs text-gray-700">Ativo</label>
                </div>
                {editError && <div className="text-xs text-red-500">{editError}</div>}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button type="button" onClick={() => setIsEditing(false)} className="h-8 px-3 text-xs rounded-full border border-gray-200">Cancelar</button>
                  <button type="submit" disabled={editLoading} className="inline-flex h-8 items-center rounded-full bg-gray-900 px-3 text-xs font-medium text-white hover:bg-black shadow-sm disabled:opacity-50">
                    {editLoading ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
              <div className="divide-y divide-gray-100">
                {items.length === 0 && (
                  <div className="p-3 text-xs text-gray-500 font-medium">Nenhum modelo</div>
                )}
                {items.map((t) => (
                  <div key={t.id} className="grid grid-cols-12 gap-2 px-3 py-2.5 hover:bg-gray-50 transition-colors">
                    <div className="col-span-12 md:col-span-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 truncate">{t.name}</span>
                        <button
                          type="button"
                          className="shrink-0 text-xs px-2 py-0.5 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50"
                          title="Editar"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditId(t.id);
                            setEditError(null);
                            setEditData({
                              slug: t.slug || '',
                              name: t.name || '',
                              display_title: t.display_title || '',
                              display_message: t.display_message || '',
                              is_active: !!t.is_active,
                              config_text: (() => { try { return JSON.stringify(t.config || {}, null, 2); } catch { return '{\n}'; } })(),
                            });
                            // Ensure products list is available when opening edit
                            if (products.length === 0) { loadProducts(); }
                            setIsEditing(true);
                          }}
                        >
                          Editar
                        </button>
                      </div>
                      <div className="text-[11px] text-gray-500 truncate">{t.display_title || 'Sem título de exibição'}</div>
                    </div>
                    <div className="col-span-12 md:col-span-2 text-[13px] text-gray-700 truncate">{t.slug}</div>
                    <div className="col-span-12 md:col-span-3 text-[12px] text-gray-700 truncate">
                      {(clinicSlug || doctorSlug) && t.slug ? (
                        (() => {
                          const origin = typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL || '');
                          const path = `/${clinicSlug || doctorSlug}`;
                          const href = `${origin}${path}?cupom=${encodeURIComponent(t.slug)}`;
                          return (
                            <a href={href} target="_blank" className="text-gray-700 hover:text-gray-900 hover:underline break-all" onClick={(e) => e.stopPropagation()} rel="noreferrer">
                              {href}
                            </a>
                          );
                        })()
                      ) : (
                        <span className="text-[11px] text-gray-400">Link indisponível</span>
                      )}
                    </div>
                    <div className="col-span-6 md:col-span-1">
                      <div className="flex items-center justify-between md:justify-start gap-2">
                        <span className="inline-flex items-center rounded-full bg-gray-50 border border-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-700">
                          {t.is_active ? 'ATIVO' : 'INATIVO'}
                        </span>
                        <div className="relative">
                          <button
                            onClick={(e) => { e.stopPropagation(); setOpenMenuId((prev) => prev === t.id ? null : t.id); }}
                            onBlur={(e) => {
                              const btn = e.currentTarget;
                              setTimeout(() => {
                                if (!btn.parentElement?.contains(document.activeElement)) {
                                  setOpenMenuId((prev) => prev === t.id ? null : prev);
                                }
                              }, 0);
                            }}
                            className="h-7 w-7 inline-flex items-center justify-center rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50"
                            aria-haspopup="menu"
                            aria-expanded={openMenuId === t.id}
                            title="Ações"
                          >
                            •••
                          </button>
                          {openMenuId === t.id && (
                            <div role="menu" className="absolute right-0 mt-1 w-40 rounded-md border border-gray-200 bg-white shadow-lg z-10 py-1">
                              <button
                                role="menuitem"
                                className="w-full text-left text-[12px] px-3 py-2 hover:bg-gray-50"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  setOpenMenuId(null);
                                  setEditId(t.id);
                                  setEditError(null);
                                  setEditData({
                                    slug: t.slug || '',
                                    name: t.name || '',
                                    display_title: t.display_title || '',
                                    display_message: t.display_message || '',
                                    is_active: !!t.is_active,
                                    config_text: (() => {
                                      try { return JSON.stringify(t.config || {}, null, 2); } catch { return '{\n}'; }
                                    })(),
                                  });
                                  if (products.length === 0) { loadProducts(); }
                                  setIsEditing(true);
                                }}
                              >
                                Editar
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="col-span-6 md:col-span-2 text-right text-[12px] text-gray-500">{new Date(t.updated_at).toLocaleString('pt-BR')}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Create Drawer */}
        {isCreating && (
          <div className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center">
            <div className="absolute inset-0 bg-black/30" onClick={() => setIsCreating(false)} />
            <div className="relative w-full md:w-[560px] bg-white rounded-t-2xl md:rounded-2xl shadow-lg p-4 md:p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900">Novo modelo de cupom</h3>
                <button onClick={() => setIsCreating(false)} className="text-xs text-gray-500">Fechar</button>
              </div>
              <form onSubmit={onCreate} className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Slug</label>
                    <input value={createData.slug} onChange={e => setCreateData(s => ({ ...s, slug: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" placeholder="ex: avaliacao-gratis" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Nome</label>
                    <input value={createData.name} onChange={e => setCreateData(s => ({ ...s, name: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" placeholder="Nome interno" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Título de exibição (opcional)</label>
                  <input value={createData.display_title} onChange={e => setCreateData(s => ({ ...s, display_title: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" placeholder="Ex: Desconto de 20% no primeiro procedimento" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Mensagem de exibição (opcional)</label>
                  <textarea value={createData.display_message} onChange={e => setCreateData(s => ({ ...s, display_message: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" rows={3} placeholder="Texto a ser mostrado no cupom" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Produtos vinculados (opcional)</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 border border-gray-200 rounded-lg p-2 bg-white">
                    {products.map((p) => {
                      const selected = getProductIdsFromText(createData.config_text);
                      const checked = selected.includes(p.id);
                      return (
                        <label key={p.id} className="flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            className="h-4 w-4 border-gray-300 rounded"
                            checked={checked}
                            onChange={(e) => {
                              const current = new Set(getProductIdsFromText(createData.config_text));
                              if (e.target.checked) current.add(p.id); else current.delete(p.id);
                              setCreateData(s => ({ ...s, config_text: setProductIdsInText(s.config_text, Array.from(current)) }));
                            }}
                            onFocus={() => { if (products.length === 0) loadProducts(); }}
                          />
                          <span className="truncate">{p.name}</span>
                        </label>
                      );
                    })}
                    {products.length === 0 && !productsLoading && (
                      <div className="text-[12px] text-gray-500">Nenhum produto encontrado</div>
                    )}
                  </div>
                  {productsLoading && <div className="text-[11px] text-gray-500 mt-1">Carregando produtos...</div>}
                  {productsError && <div className="text-[11px] text-red-500 mt-1">{productsError}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <input id="is_active" type="checkbox" checked={createData.is_active} onChange={e => setCreateData(s => ({ ...s, is_active: e.target.checked }))} className="h-4 w-4 border-gray-300 rounded" />
                  <label htmlFor="is_active" className="text-xs text-gray-700">Ativo</label>
                </div>
                {createError && <div className="text-xs text-red-500">{createError}</div>}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button type="button" onClick={() => setIsCreating(false)} className="h-8 px-3 text-xs rounded-full border border-gray-200">Cancelar</button>
                  <button type="submit" disabled={createLoading} className="inline-flex h-8 items-center rounded-full bg-gray-900 px-3 text-xs font-medium text-white hover:bg-black shadow-sm disabled:opacity-50">
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

