"use client";

import { useEffect, useMemo, useState } from 'react';

export type CampaignField = {
  name: string;
  label?: string;
  type?: string; // text, email, tel, textarea, select, checkbox
  required?: boolean;
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
};

export type CampaignConsent = {
  name: string;
  label: string;
  required?: boolean;
};

export default function CampaignDynamicForm({
  campaignId,
  formConfig,
  allowPreview,
  classNames,
}: {
  campaignId: string;
  formConfig: any;
  allowPreview?: boolean;
  classNames?: {
    buttonClass?: string;
    titleClass?: string;
    subtitleClass?: string;
    cardClass?: string;
  };
}) {
  // Simple mode only: fixed fields (name, email, phone)
  const consents: CampaignConsent[] = [];
  const submitButtonText: string =
    formConfig?.design?.submit_button_text ||
    formConfig?.submit_button_text ||
    'Quero participar';

  const whatsappCfg: any = formConfig?.whatsapp || formConfig?.design?.whatsapp || null;
  const redirectUrl: string | undefined = formConfig?.redirect_url;
  const successPageCfg: any = formConfig?.success_page || formConfig?.design?.success_page || {};

  const effectiveFields: CampaignField[] = useMemo(() => {
    // Always the same three fields in simple mode
    return [
      { name: 'name', label: 'Nome completo', type: 'text', required: true, placeholder: 'Seu nome completo' },
      { name: 'email', label: 'Email', type: 'email', required: true, placeholder: 'seu@email.com' },
      { name: 'phone', label: 'Telefone', type: 'tel', required: false, placeholder: '(11) 99999-9999' },
    ];
  }, []);

  const [values, setValues] = useState<Record<string, any>>({});
  const [consentValues, setConsentValues] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [coupon, setCoupon] = useState<{ code: string; amount?: number | null } | null>(null);

  // Rehydrate success state on mount (so refresh keeps the coupon page)
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      const key = `campaignSuccess:${campaignId}`;
      const raw = sessionStorage.getItem(key);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved && saved.leadId && saved.coupon && saved.values) {
        setLeadId(saved.leadId);
        setCoupon(saved.coupon);
        setValues((v) => ({ ...saved.values, ...v }));
        setSuccess(true);
      }
    } catch (_) {}
  }, [campaignId]);

  const handleChange = (name: string, val: any) => setValues((v) => ({ ...v, [name]: val }));
  const handleConsent = (name: string, checked: boolean) => setConsentValues((v) => ({ ...v, [name]: checked }));

  const nameFieldName = 'name';
  const emailFieldName = 'email';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const name = values[nameFieldName];
    const email = values[emailFieldName];

    if (!name || !email) {
      setSubmitting(false);
      setError('Nome e email são obrigatórios');
      return;
    }

    try {
      // Build URL with current query params to capture referrer/UTM on backend
      let submitUrl = `/api/campaigns/${campaignId}/submit`;
      if (typeof window !== 'undefined') {
        const current = new URLSearchParams(window.location.search || '');
        if (allowPreview) current.set('preview', '1');
        const qs = current.toString();
        submitUrl = qs ? `${submitUrl}?${qs}` : submitUrl;
      } else if (allowPreview) {
        submitUrl = `${submitUrl}?preview=1`;
      }
      const res = await fetch(submitUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          phone: values['phone'] || undefined,
          message: values['message'] || undefined,
          form_data: values,
          consents: consentValues,
          // also pass referrer code redundantly in body for robustness
          ...(typeof window !== 'undefined' ? (() => {
            const p = new URLSearchParams(window.location.search || '');
            const ref = p.get('referrerCode') || p.get('ref');
            return ref ? { referrerCode: ref } : {};
          })() : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.success === false) {
        throw new Error(data?.error || 'Erro ao enviar');
      }
      const newLeadId: string = data?.data?.id || data?.leadId || '';
      const newCoupon = data?.data?.coupon || null;
      setLeadId(newLeadId || null);
      setCoupon(newCoupon || null);

      // Default: show in-app success page with coupon, unless explicit redirect mode requested
      const redirectMode: string | undefined = successPageCfg?.mode || formConfig?.redirect_mode;
      if (redirectUrl && typeof window !== 'undefined' && redirectMode === 'redirect') {
        const replacePlaceholders = (url: string) =>
          url
            .replace('{leadId}', encodeURIComponent(newLeadId))
            .replace('{name}', encodeURIComponent(values[nameFieldName] || ''))
            .replace('{email}', encodeURIComponent(values[emailFieldName] || ''))
            .replace('{coupon}', encodeURIComponent(newCoupon?.code || ''));

        const currentQs = window.location.search?.replace(/^\?/, '') || '';
        const urlHasQs = redirectUrl.includes('?');
        const redirectWithQs = currentQs
          ? `${redirectUrl}${urlHasQs ? '&' : '?'}${currentQs}`
          : redirectUrl;

        const finalUrl = replacePlaceholders(redirectWithQs);
        window.location.replace(finalUrl);
        return;
      }
      setSuccess(true);
      // persist success so refresh keeps coupon page
      try {
        if (typeof window !== 'undefined') {
          const key = `campaignSuccess:${campaignId}`;
          sessionStorage.setItem(key, JSON.stringify({ leadId: newLeadId, coupon: newCoupon, values }));
        }
      } catch (_) {}
      // keep values so user can editar; we'll clear only if user resets
    } catch (err: any) {
      setError(err?.message || 'Erro de conexão');
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    const successTitle: string = successPageCfg?.title || 'Pronto! Seu cupom exclusivo foi gerado';
    const successDescription: string = successPageCfg?.description || 'Use o código abaixo ao falar com nossa equipe.';
    const buttonText: string | undefined = successPageCfg?.button_text || successPageCfg?.cta_text;
    const buttonUrl: string | undefined = successPageCfg?.button_url || successPageCfg?.cta_url;
    const replaceBtnPlaceholders = (url: string) =>
      url
        .replace('{leadId}', encodeURIComponent(leadId || ''))
        .replace('{name}', encodeURIComponent(values[nameFieldName] || ''))
        .replace('{email}', encodeURIComponent(values[emailFieldName] || ''))
        .replace('{coupon}', encodeURIComponent(coupon?.code || ''));
    return (
      <div className="space-y-4">
        <div className="text-center space-y-1">
          <h3 className={`text-base md:text-lg font-semibold text-gray-900 ${classNames?.titleClass || ''}`}>{successTitle}</h3>
          <p className={`text-sm text-gray-600 ${classNames?.subtitleClass || ''}`}>{successDescription}</p>
        </div>
        {coupon?.code ? (
          <div className="mx-auto max-w-md">
            <div
              className="rounded-xl shadow-sm p-4 md:p-5 text-center overflow-hidden"
              style={{ background: 'linear-gradient(180deg, #e5eaf5 0%, #f7f7fc 100%)' }}
            >
              <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Cupom exclusivo</div>
              <div className={`font-mono text-2xl tracking-[.35em] text-gray-900 ${classNames?.titleClass || ''}`}>{coupon.code}</div>
              {typeof coupon.amount === 'number' ? (
                <div className={`text-xs mt-2 text-gray-600 ${classNames?.subtitleClass || ''}`}>Desconto: {coupon.amount}</div>
              ) : null}
              <div className="mt-4 flex items-center justify-center gap-2">
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg text-sm border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                  onClick={async () => {
                    try { await navigator.clipboard.writeText(coupon.code); } catch {}
                  }}
                >
                  Copiar código
                </button>
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg text-sm border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                  onClick={() => {
                    setSuccess(false);
                    try {
                      if (typeof window !== 'undefined') {
                        sessionStorage.removeItem(`campaignSuccess:${campaignId}`);
                      }
                    } catch (_) {}
                  }}
                >
                  Editar informações
                </button>
              </div>
            </div>
            {buttonText && buttonUrl ? (
              <a
                href={replaceBtnPlaceholders(buttonUrl)}
                className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-[#5893ec] to-[#9bcef7] text-white py-4 px-6 font-medium text-base md:text-lg transition-all duration-300 hover:opacity-90 shadow-sm"
              >
                {buttonText}
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* Fixed simple fields */}
      <div>
        <label className={`block text-xs md:text-sm font-medium ${classNames?.titleClass || ''} mb-2 opacity-90`}>
          Nome completo *
        </label>
        <input
          type="text"
          value={values['name'] || ''}
          onChange={(e) => handleChange('name', e.target.value)}
          required
          placeholder="Seu nome completo"
          className="w-full px-4 py-3 bg-gray-50/80 backdrop-blur-sm border border-gray-300/50 rounded-xl text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all duration-200"
        />
      </div>
      <div>
        <label className={`block text-xs md:text-sm font-medium ${classNames?.titleClass || ''} mb-2 opacity-90`}>
          Email *
        </label>
        <input
          type="email"
          value={values['email'] || ''}
          onChange={(e) => handleChange('email', e.target.value)}
          required
          placeholder="seu@email.com"
          className="w-full px-4 py-3 bg-gray-50/80 backdrop-blur-sm border border-gray-300/50 rounded-xl text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all duration-200"
        />
      </div>
      <div>
        <label className={`block text-xs md:text-sm font-medium ${classNames?.titleClass || ''} mb-2 opacity-90`}>
          Telefone
        </label>
        <input
          type="tel"
          value={values['phone'] || ''}
          onChange={(e) => handleChange('phone', e.target.value)}
          placeholder="(11) 99999-9999"
          className="w-full px-4 py-3 bg-gray-50/80 backdrop-blur-sm border border-gray-300/50 rounded-xl text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all duration-200"
        />
      </div>

      {consents && consents.length > 0 && (
        <div className="space-y-2">
          {consents.map((c) => (
            <label key={c.name} className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={!!consentValues[c.name]}
                onChange={(e) => handleConsent(c.name, e.target.checked)}
                required={!!c.required}
                className="mt-1"
              />
              <span>
                {c.label}
                {c.required ? <span className="text-red-500"> *</span> : null}
              </span>
            </label>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-500/20 backdrop-blur-sm border border-red-400/30 text-red-100 text-sm p-4 rounded-xl">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <button
          type="submit"
          disabled={submitting}
          className={`w-full ${classNames?.buttonClass || 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700'} text-white py-4 px-6 rounded-xl font-medium text-base md:text-lg transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {submitting ? 'Enviando...' : submitButtonText}
        </button>

        {whatsappCfg?.number ? (
          <a
            href={`https://wa.me/${encodeURIComponent(whatsappCfg.number)}?text=${encodeURIComponent(
              (whatsappCfg.message || 'Olá! Tenho interesse e gostaria de saber mais.').replace('{name}', values['name'] || '').replace('{email}', values['email'] || '')
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl py-3 px-4 text-sm font-medium text-white bg-green-500 hover:bg-green-600 transition-colors"
          >
            {whatsappCfg.button_text || 'Falar no WhatsApp'}
          </a>
        ) : null}
      </div>
    </form>
  );
}
