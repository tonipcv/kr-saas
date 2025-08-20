'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

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

export default function CampaignEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [item, setItem] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [campaignSlug, setCampaignSlug] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'DRAFT' | 'PUBLISHED' | 'ARCHIVED'>('DRAFT');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  // Design fields (landing)
  const [heroImageUrl, setHeroImageUrl] = useState('');
  const [benefitTitle, setBenefitTitle] = useState('');
  const [benefitDescription, setBenefitDescription] = useState('');
  // Headline with placeholders
  const [headline, setHeadline] = useState('');
  const [businessName, setBusinessName] = useState('');

  // Form behavior
  const [buttonText, setButtonText] = useState<string>(''); // submit button text
  const [successBtnText, setSuccessBtnText] = useState<string>('');
  const [successBtnUrl, setSuccessBtnUrl] = useState<string>('');
  // Keep theme/colors controls already present
  const [theme, setTheme] = useState<'light' | 'brand' | 'minimal'>('brand');
  const [primaryColor, setPrimaryColor] = useState<string>('');
  const [secondaryColor, setSecondaryColor] = useState<string>('');
  // Keep a copy of original form_config to merge on save
  const [originalCfg, setOriginalCfg] = useState<any>(null);

  // Offer (only amount) - not shown publicly, just captured on submit
  const [offerAmount, setOfferAmount] = useState<string>('');

  // Doctor slug for preview
  const [doctorSlug, setDoctorSlug] = useState<string | null>(null);

  // (JSON editor removed for simple UX)

  const load = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/v2/doctor/campaigns/${id}`, { cache: 'no-store' });
      let json: any = null;
      try { json = await res.json(); } catch (_) {}
      if (!res.ok || !json?.success) {
        console.error('[UI][campaign][GET] failed', { status: res.status, body: json });
        throw new Error((json && (json.error || json.message)) || `Erro ${res.status}`);
      }
      const c: Campaign = json.data;
      setItem(c);
      setTitle(c.title || '');
      setCampaignSlug(c.campaign_slug || '');
      setDescription(c.description || '');
      setStatus((c.status as any) || 'DRAFT');

      // Design fields
      setHeroImageUrl(c.hero_image_url || '');
      setBenefitTitle(c.benefit_title || '');
      setBenefitDescription(c.benefit_description || '');

      // Load existing config and design defaults
      const cfg = (c.form_config && typeof c.form_config === 'object') ? c.form_config : {};
      setOriginalCfg(cfg);
      try {
        const d = cfg?.design || {};
        setTheme((d.theme as any) || 'brand');
        setPrimaryColor(d.primary_color || '#5893ec');
        setSecondaryColor(d.secondary_color || '#9bcef7');
        setButtonText(d.submit_button_text || '');
        const sp = cfg?.success_page || {};
        setSuccessBtnText(sp.button_text || '');
        setSuccessBtnUrl(sp.button_url || cfg.redirect_url || '');
        setHeadline(d.headline || '');
        setBusinessName(d.business_name || '');
        // Offer
        const off = cfg?.offer || {};
        if (off && typeof off === 'object') {
          if (off.amount != null) setOfferAmount(String(off.amount));
        }
      } catch (_) {}
    } catch (e: any) {
      setError(e?.message || 'Erro ao carregar campanha');
      setItem(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Load doctor slug for preview
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

  const canEditSlug = useMemo(() => item?.status === 'DRAFT', [item]);
  const isArchived = useMemo(() => item?.status === 'ARCHIVED', [item]);

  const onSave = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setSaveMsg(null);
    setError(null);
    try {
      setSaving(true);
      const body: Record<string, any> = {
        title,
        description,
        status,
        // Also persist design fields into top-level columns for consistency with GET
        hero_image_url: heroImageUrl || null,
        benefit_title: benefitTitle || null,
        benefit_description: benefitDescription || null,
      };
      if (canEditSlug) body.campaign_slug = campaignSlug;

      // Build form_config merging original with selected fields and simple UX inputs
      const mergedDesign = {
        ...((originalCfg && originalCfg.design) || {}),
        theme,
        primary_color: primaryColor || undefined,
        secondary_color: secondaryColor || undefined,
        hero_image_url: heroImageUrl || undefined,
        benefit_title: benefitTitle || undefined,
        benefit_description: benefitDescription || undefined,
        submit_button_text: buttonText || undefined,
        headline: headline || undefined,
        business_name: businessName || undefined,
      };
      // Merge offer (keep only amount) and strip legacy currency
      const parsedAmount = offerAmount.trim() !== '' ? Number(offerAmount) : undefined;
      const cleanedOriginalOffer = originalCfg?.offer ? (
        (originalCfg.offer.amount != null) ? { amount: originalCfg.offer.amount } : {}
      ) : undefined;

      const mergedCfg = {
        ...(originalCfg || {}),
        design: mergedDesign,
        success_page: {
          ...((originalCfg && originalCfg.success_page) || {}),
          button_text: successBtnText || undefined,
          button_url: successBtnUrl || undefined,
        },
        offer: (parsedAmount != null && !Number.isNaN(parsedAmount))
          ? { amount: parsedAmount }
          : cleanedOriginalOffer,
      };
      body.form_config = mergedCfg;

      const res = await fetch(`/api/v2/doctor/campaigns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      let json: any = null;
      try { json = await res.json(); } catch (_) {}
      if (!res.ok || !json?.success) {
        console.error('[UI][campaign][PATCH] failed', { status: res.status, body: json });
        throw new Error((json && (json.error || json.message)) || `Erro ${res.status}`);
      }
      setSaveMsg('Alterações salvas com sucesso');
      await load();
    } catch (e: any) {
      setError(e?.message || 'Erro ao salvar campanha');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 2500);
    }
  };

  const onArchive = async () => {
    if (!confirm('Arquivar campanha? Isso a esconderá das páginas públicas.')) return;
    setError(null);
    try {
      setArchiving(true);
      const res = await fetch(`/api/v2/doctor/campaigns/${id}`, { method: 'DELETE' });
      let json: any = null;
      try { json = await res.json(); } catch (_) {}
      if (!res.ok || !json?.success) {
        console.error('[UI][campaign][DELETE] failed', { status: res.status, body: json });
        throw new Error((json && (json.error || json.message)) || `Erro ${res.status}`);
      }
      router.push('/doctor/campaigns');
    } catch (e: any) {
      setError(e?.message || 'Erro ao arquivar campanha');
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="lg:ml-64">
      <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24 bg-gray-50">
        {/* Header */}
        <div className="flex flex-col gap-3 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link href="/doctor/campaigns" className="text-xs text-gray-500 hover:text-gray-700">← Back</Link>
              <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">Editar campanha</h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onArchive}
                disabled={archiving || isArchived}
                className="inline-flex h-8 items-center rounded-full border border-gray-200 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {isArchived ? 'Arquivada' : (archiving ? 'Arquivando...' : 'Arquivar')}
              </button>
              <button
                onClick={(e) => { e.preventDefault(); const form = document.getElementById('campaign-form') as HTMLFormElement | null; form?.requestSubmit(); }}
                disabled={saving}
                className="inline-flex h-8 items-center rounded-full bg-gradient-to-r from-[#5893ec] to-[#9bcef7] px-3 text-xs font-medium text-white hover:opacity-90 shadow-sm disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
          {saveMsg && <div className="text-[11px] text-green-600">{saveMsg}</div>}
          {error && <div className="text-[11px] text-red-600">{error}</div>}
        </div>

        {/* Content */}
        {loading ? (
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4">
            <div className="h-4 w-24 bg-gray-100 rounded animate-pulse mb-3" />
            <div className="h-10 bg-gray-50 border border-gray-100 rounded-lg animate-pulse mb-2" />
            <div className="h-20 bg-gray-50 border border-gray-100 rounded-lg animate-pulse" />
          </div>
        ) : !item ? (
          <div className="text-sm text-gray-600">Campanha não encontrada.</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Main form */}
            <div className="lg:col-span-2 rounded-2xl border border-gray-200 bg-white shadow-sm p-4">
              <form id="campaign-form" onSubmit={onSave} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Título</label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5893ec]"
                    placeholder="Nome da campanha"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Slug</label>
                  <input
                    value={campaignSlug}
                    onChange={(e) => setCampaignSlug(e.target.value)}
                    disabled={!canEditSlug}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5893ec] disabled:bg-gray-50 disabled:text-gray-500"
                    placeholder="ex: black-friday-2025"
                  />
                  {!canEditSlug && (
                    <p className="mt-1 text-[11px] text-gray-500">O slug só pode ser alterado enquanto a campanha está em rascunho.</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Descrição</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5893ec]"
                    rows={5}
                    placeholder="Descrição breve"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5893ec] bg-white"
                  >
                    <option value="DRAFT">DRAFT</option>
                    <option value="PUBLISHED">PUBLISHED</option>
                    <option value="ARCHIVED">ARCHIVED</option>
                  </select>
                </div>

                {/* Design da Landing */}
                <div className="pt-2 border-t border-gray-100" />
                <h3 className="text-sm font-semibold text-gray-900">Design da Landing</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Imagem Hero (URL)</label>
                    <input
                      value={heroImageUrl}
                      onChange={(e) => setHeroImageUrl(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5893ec]"
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Tema</label>
                    <select
                      value={theme}
                      onChange={(e) => setTheme(e.target.value as any)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5893ec] bg-white"
                    >
                      <option value="brand">Brand</option>
                      <option value="light">Light</option>
                      <option value="minimal">Minimal</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Headline (template)</label>
                  <input
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5893ec]"
                    placeholder="Ex.: {user} cupom de desconto de 20% para Harmonização Facial com {business}"
                  />
                  <p className="mt-1 text-[11px] text-gray-500">Placeholders: {`{user}`}, {`{business}`}, {`{doctor}`}, {`{offer_amount}`}</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Business (para template)</label>
                  <input
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5893ec]"
                    placeholder="Nome da clínica/negócio"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Cor Primária</label>
                    <input
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5893ec]"
                      placeholder="#5893ec"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Cor Secundária</label>
                    <input
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5893ec]"
                      placeholder="#9bcef7"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Benefício (Título)</label>
                  <input
                    value={benefitTitle}
                    onChange={(e) => setBenefitTitle(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5893ec]"
                    placeholder="Ex.: Desconto exclusivo para novos pacientes"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Benefício (Descrição)</label>
                  <textarea
                    value={benefitDescription}
                    onChange={(e) => setBenefitDescription(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5893ec]"
                    rows={3}
                    placeholder="Detalhes do benefício"
                  />
                </div>

                {/* Formulário e página de sucesso */}
                <div className="pt-2 border-t border-gray-100" />
                <h3 className="text-sm font-semibold text-gray-900">Formulário</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Texto do botão</label>
                    <input
                      value={buttonText}
                      onChange={(e) => setButtonText(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5893ec]"
                      placeholder="Ex.: Quero minha avaliação"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Botão da página de sucesso (texto)</label>
                    <input
                      value={successBtnText}
                      onChange={(e) => setSuccessBtnText(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5893ec]"
                      placeholder="Ex.: Agendar no WhatsApp"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Botão da página de sucesso (link)</label>
                    <input
                      value={successBtnUrl}
                      onChange={(e) => setSuccessBtnUrl(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5893ec]"
                      placeholder="https://... (suporta {leadId} {name} {email} {coupon})"
                    />
                  </div>
                </div>

                {/* Oferta (somente valor; capturada no envio do lead) */}
                <div className="pt-2 border-t border-gray-100" />
                <h3 className="text-sm font-semibold text-gray-900">Oferta (capturada no envio do lead)</h3>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Valor (número)</label>
                    <input
                      value={offerAmount}
                      onChange={(e) => setOfferAmount(e.target.value)}
                      type="number"
                      step="0.01"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5893ec]"
                      placeholder="Ex.: 199.90"
                    />
                  </div>
                </div>
              </form>
            </div>

            {/* Side info */}
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4 space-y-3">
              <div>
                <div className="text-[11px] font-medium text-gray-500">IDs</div>
                <div className="mt-1 text-xs text-gray-800 break-all">{item.id}</div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-[11px] text-gray-600">
                <div>
                  <div className="uppercase tracking-wide text-gray-400">Criada</div>
                  <div className="text-gray-800">{new Date(item.created_at).toLocaleString('pt-BR')}</div>
                </div>
                <div>
                  <div className="uppercase tracking-wide text-gray-400">Atualizada</div>
                  <div className="text-gray-800">{new Date(item.updated_at).toLocaleString('pt-BR')}</div>
                </div>
              </div>
              <div className="pt-2 border-t border-gray-100">
                <div className="text-[11px] font-medium text-gray-500 mb-1">Preview</div>
                {process.env.NEXT_PUBLIC_ENABLE_CAMPAIGN_PREVIEW === 'true' && doctorSlug && item?.campaign_slug ? (
                  <Link
                    href={`/${doctorSlug}/${item.campaign_slug}`}
                    target="_blank"
                    className="text-[11px] text-[#5893ec] hover:underline break-all"
                  >
                    /{doctorSlug}/{item.campaign_slug}
                  </Link>
                ) : (
                  <p className="text-[11px] text-gray-500">Links de preview serão exibidos quando o preview estiver habilitado.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
