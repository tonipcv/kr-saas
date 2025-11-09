"use client";

import { useEffect, useMemo, useState } from "react";

type Participant = {
  name?: string;
  organisationId?: string;
  OrganisationId?: string;
  organisation_id?: string;
  OrganisationID?: string;
  authorisationServerId?: string;
  AuthorisationServerId?: string;
  authorisation_server_id?: string;
  AuthorisationServerID?: string;
  authorisationServers?: any[];
  AuthorisationServers?: any[];
};

export default function SelectBankPage() {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [query, setQuery] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [openList, setOpenList] = useState<boolean>(false);
  const [productInfo, setProductInfo] = useState<{ id?: string; name?: string; imageUrl?: string | null; amountCents?: number; currency?: string } | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        const res = await fetch("/api/open-finance/participants", { cache: "no-store" });
        const j = await res.json();
        if (!active) return;
        if (!res.ok) {
          setError(j?.error || "Falha ao carregar participantes");
        } else {
          const list = Array.isArray(j?.participants) ? j.participants : [];
          setParticipants(list);
        }
        // Resolve product context (name, image, amount) from session
        try {
          const enroll = typeof window !== 'undefined' ? window.sessionStorage.getItem('of_enroll') : null;
          const ctxStr = typeof window !== 'undefined' ? window.sessionStorage.getItem('of_enroll_ctx') : null;
          let ctx: any = null; try { ctx = JSON.parse(ctxStr || '{}'); } catch {}
          let payload: any = null; try { payload = JSON.parse(enroll || '{}'); } catch {}
          const productId: string | undefined = (ctx?.productId || payload?.context?.productId) || undefined;
          const amountCents: number | undefined = Number(ctx?.amountCents || payload?.context?.amountCents || 0) || undefined;
          const currency: string = (ctx?.currency || payload?.context?.currency || 'BRL');
          if (productId) {
            const pRes = await fetch(`/api/products/public/${encodeURIComponent(productId)}`, { cache: 'no-store' });
            const p = await pRes.json().catch(() => ({}));
            if (!active) return;
            setProductInfo({ id: productId, name: p?.name || 'Produto', imageUrl: p?.imageUrl || p?.image || null, amountCents, currency });
          } else if (amountCents) {
            setProductInfo({ amountCents, currency });
          }
        } catch {}
      } catch (e: any) {
        if (active) setError(e?.message || "Erro inesperado");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, []);

  // When only one bank after filtering, auto-select it
  useEffect(() => {
    if (loading) return;
    if (participants.length === 0) { setSelected(null); return; }
    if (filtered.length === 1) setSelected(0);
  }, [loading, participants, query]);

  // Build filtered list with stable mapping
  const filtered = useMemo(() => {
    const q = (query || '').toLowerCase().trim();
    const rows = participants.map((p, idx) => ({ p, idx, name: extractName(p, idx) }));
    if (!q) return rows;
    return rows.filter(r => r.name.toLowerCase().includes(q));
  }, [participants, query]);

  const canContinue = useMemo(() => selected != null && filtered[selected as number], [selected, filtered]);

  function extractIds(p: any): { organisationId?: string; authorisationServerId?: string } {
    const organisationId = p?.organisationId || p?.organisation_id || p?.OrganisationId || p?.OrganisationID || p?.Organisation?.OrganisationId || p?.Organisation?.id;
    let authorisationServerId = p?.authorisationServerId || p?.authorisation_server_id || p?.AuthorisationServerId || p?.AuthorisationServerID;
    if (!authorisationServerId) {
      const arr = p?.authorisationServers || p?.AuthorisationServers || p?.authorisation_servers || [];
      if (Array.isArray(arr) && arr.length > 0) {
        const as = arr[0];
        authorisationServerId = as?.authorisationServerId || as?.AuthorisationServerId || as?.id || as?.AuthorisationServerID;
      }
    }
    return { organisationId, authorisationServerId };
  }

  function extractName(p: any, idx: number): string {
    return p?.name || p?.OrganisationName || p?.organisationName || `Banco ${idx + 1}`;
  }

  function extractLogo(p: any): string | null {
    // Common places where logo can be present
    const direct = p?.logo || p?.LogoUri || p?.logoUri || p?.CustomerFriendlyLogoUri || null;
    if (direct) return direct;
    const servers = p?.authorisationServers || p?.AuthorisationServers || [];
    if (Array.isArray(servers) && servers.length > 0) {
      const s0 = servers[0];
      return s0?.CustomerFriendlyLogoUri || s0?.logo || s0?.logoUri || null;
    }
    return null;
  }

  async function onContinue() {
    try {
      if (!canContinue) return;
      setSubmitting(true);
      const sel = filtered[selected as number];
      const p = (sel?.p || participants[0]) as any;
      const { organisationId, authorisationServerId } = extractIds(p);
      const idsComplete = !!organisationId && !!authorisationServerId;
      const s = typeof window !== 'undefined' ? window.sessionStorage.getItem('of_enroll') : null;
      if (!s) { setError('Dados do enrollment não encontrados. Volte ao checkout.'); setSubmitting(false); return; }
      let payload: any = null; try { payload = JSON.parse(s); } catch {}
      if (!payload) { setError('Dados inválidos.'); setSubmitting(false); return; }
      // Padronização com EPM: criar enrollment para obter enrollmentId, depois criar consent com payload completo, depois authorization-url
      const ctx = payload.context || {};
      const amountCents = Number(ctx.amountCents || 0);
      const currency = ctx.currency || 'BRL';
      const productId = ctx.productId || null;
      const orderRef = ctx.orderRef || undefined;

      // 1) Criar enrollment e obter enrollmentId (ignorar redirectUrl do provider)
      const enrollBody = {
        userId: payload.userId,
        clinicId: payload.clinicId ?? null,
        organisationId: idsComplete ? organisationId : undefined,
        authorisationServerId: idsComplete ? authorisationServerId : undefined,
        redirectUri: payload.redirectUri,
        returnUrl: (typeof window !== 'undefined') ? `${window.location.origin}/redirect` : undefined,
        enrollment: payload.enrollment,
        riskSignals: payload.riskSignals,
        context: payload.context || {},
      };
      const enrollRes = await fetch('/api/open-finance/enrollments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(enrollBody) });
      const enrollText = await enrollRes.text();
      let enrollJson: any = null; try { enrollJson = JSON.parse(enrollText); } catch {}
      if (!enrollRes.ok) {
        setError(enrollJson?.error || 'Falha ao criar enrollment');
        setSubmitting(false);
        return;
      }
      const enrollmentId: string | null = enrollJson?.enrollmentId || enrollJson?.providerResponse?.data?.id || null;
      if (!enrollmentId) {
        setError('EnrollmentId ausente na resposta do provider');
        setSubmitting(false);
        return;
      }

      // 2) Guardar contexto p/ callback e redirecionar usuário ao banco
      const enrollCtx = {
        enrollmentId,
        organisationId: idsComplete ? organisationId : null,
        authorisationServerId: idsComplete ? authorisationServerId : null,
        productId,
        amountCents,
        currency,
        orderRef,
        document: payload?.enrollment?.document || payload?.enrollment?.cpf || '',
        email: payload?.enrollment?.email || null,
        userId: payload?.userId || null,
      };
      try { window.sessionStorage.setItem('of_enroll_ctx', JSON.stringify(enrollCtx)); } catch {}
      // Redirecionar para o redirectUrl do provider (usuário faz login/autorização)
      window.location.href = enrollJson?.redirectUrl || enrollJson?.providerResponse?.data?.redirectUrl || enrollJson?.providerResponse?.redirectUrl || '';
    } catch (e: any) {
      setError(e?.message || 'Erro inesperado');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <h1 className="text-lg font-medium">Selecione o banco</h1>
        {loading && <p className="mt-3 text-sm text-gray-600">Carregando...</p>}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {!loading && !error && (
          <div className="mt-3 space-y-2">
            {/* Checkout summary */}
            {productInfo && (
              <div className="rounded-xl bg-white border border-gray-200 p-4 mb-2">
                <div className="flex items-center gap-3">
                  {productInfo.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={productInfo.imageUrl} alt={productInfo.name || 'Produto'} className="h-16 w-16 rounded object-cover border border-gray-200" />
                  )}
                  <div className="flex-1">
                    <div className="text-[15px] font-medium text-gray-900">{productInfo.name || 'Produto'}</div>
                    <div className="text-sm text-gray-600">Total</div>
                    <div className="text-base font-semibold text-gray-900">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: (productInfo.currency as any) || 'BRL' }).format(((productInfo.amountCents || 0) / 100))}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {/* Combobox: single field with type-to-search and pick */}
            <div className="relative">
              <label className="block text-sm text-gray-600 mb-1">Banco</label>
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelected(null); setOpenList(true); }}
                onFocus={() => setOpenList(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (filtered.length > 0) { setSelected(0); setQuery(filtered[0].name); setOpenList(false); }
                  } else if (e.key === 'Escape') {
                    setOpenList(false);
                  }
                }}
                placeholder="Digite para buscar e selecione"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                aria-autocomplete="list"
                aria-expanded={openList}
              />
              {openList && (
                <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-md max-h-56 overflow-auto">
                  {filtered.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-500">Nenhum participante encontrado.</div>
                  ) : (
                    filtered.map((row, i) => {
                      const active = selected === i;
                      return (
                        <button
                          key={`${row.idx}-${i}`}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => { setSelected(i); setQuery(row.name); setOpenList(false); }}
                          className={`w-full text-left px-3 py-2 text-sm ${active ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'}`}
                        >
                          {row.name}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        <div className="mt-4 flex items-center gap-2">
          <a href="/" className="px-3 py-2 text-sm border rounded">Voltar</a>
          <button
            disabled={!canContinue || submitting}
            onClick={onContinue}
            className="px-3 py-2 text-sm rounded bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-50"
          >
            {submitting ? 'Processando…' : 'Continuar'}
          </button>
        </div>
      </div>
    </div>
  );
}
