"use client";

import { useEffect, useState } from "react";

export default function RedirectPage() {
  const [status, setStatus] = useState<string>("Validando autenticação com o banco...");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
      const mirror = async (tag: string, data: any) => {
        try {
          await fetch('/api/debug/log', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tag, data })
          });
        } catch {}
      };
      // Prefer backend source-of-truth for resuming old redirect-based payments
      let paymentLinkId: string | null = null;
      try {
        const latest = await fetch('/api/open-finance/payment-requests/latest', { cache: 'no-store' });
        const lj = await latest.json().catch(() => ({}));
        if (latest.ok && lj?.found && lj?.paymentLinkId) paymentLinkId = String(lj.paymentLinkId);
        try { console.log('🔎 [redirect] init', { hasPaymentLinkId: !!paymentLinkId, via: 'backend.latest' }); } catch {}
        mirror('redirect.init', { hasPaymentLinkId: !!paymentLinkId, via: 'backend.latest' });
      } catch {
        const ss = typeof window !== 'undefined' ? window.sessionStorage.getItem('of_payment_link_id') : null;
        paymentLinkId = ss;
        try { console.log('🔎 [redirect] init (fallback sessionStorage)', { hasPaymentLinkId: !!paymentLinkId }); } catch {}
        mirror('redirect.init', { hasPaymentLinkId: !!paymentLinkId, via: 'sessionStorage' });
      }
      if (paymentLinkId) {
        // If backend has redirectUri and the payment is still PENDING, immediately send user to bank
        try {
          const latest2 = await fetch('/api/open-finance/payment-requests/latest', { cache: 'no-store' });
          const lj2 = await latest2.json().catch(() => ({}));
          if (latest2.ok && lj2?.found && String(lj2?.paymentLinkId) === String(paymentLinkId) && String(lj2?.status || '').toUpperCase() === 'PENDING' && lj2?.redirectUri) {
            setStatus('Redirecionando ao banco para autorizar o pagamento...');
            mirror('redirect.fallback.redirect', { redirectUri: lj2.redirectUri, paymentLinkId });
            window.location.href = String(lj2.redirectUri);
            return;
          }
        } catch {}
        setStatus('Verificando status do pagamento...');
        mirror('redirect.poll.payment.start', { paymentLinkId });
        let attempts = 0;
        const maxAttempts = 40; // ~120s window
        const poll = async (): Promise<void> => {
          attempts += 1;
          const res = await fetch(`/api/open-finance/payment-requests/${encodeURIComponent(paymentLinkId)}`, { cache: 'no-store' });
          if (!res.ok) throw new Error('Falha ao consultar status do pagamento');
          const data = await res.json();
          const st = String(data?.status || '').toUpperCase();
          mirror('redirect.poll.payment.tick', { attempts, st, transactionId: data?.transactionId });
          if (st === 'COMPLETED') {
            const productId = typeof window !== 'undefined' ? window.sessionStorage.getItem('of_payment_product_id') : null;
            const orderRef = typeof window !== 'undefined' ? window.sessionStorage.getItem('of_payment_order_ref') : null;
            mirror('redirect.poll.payment.completed', { productId, orderRef, transactionId: data?.transactionId });
            // Clear session markers
            try {
              window.sessionStorage.removeItem('of_payment_link_id');
              window.sessionStorage.removeItem('of_payment_product_id');
              window.sessionStorage.removeItem('of_payment_order_ref');
            } catch {}
            // Build success URL, prefer branded path when clinic slug exists
            let destBase = '/checkout/success';
            try {
              if (productId) {
                const pRes = await fetch(`/api/products/public/${encodeURIComponent(productId)}`, { cache: 'no-store' });
                const p = await pRes.json().catch(() => ({}));
                const slug = p?.clinic?.slug;
                if (pRes.ok && slug) destBase = `/${slug}/checkout/success`;
              }
            } catch {}
            const q = new URLSearchParams({
              product_id: String(productId || ''),
              method: 'pix_ob',
              order_id: String(orderRef || ''),
              transaction_id: String(data?.transactionId || ''),
            });
            mirror('redirect.success.redirect', { destBase, query: Object.fromEntries(q.entries()) });
            window.location.replace(`${destBase}?${q.toString()}`);
            return;
          }
          if (st === 'PENDING' || st === 'PROCESSING') {
            setStatus('Pagamento em processamento...');
            mirror('redirect.poll.payment.processing', { attempts });
            if (attempts < maxAttempts) {
              setTimeout(poll, 3000);
              return;
            }
            setStatus('Ainda processando. Você receberá um email quando concluir.');
            mirror('redirect.poll.payment.timeout', {});
            return;
          }
          if (st === 'REJECTED' || st === 'CANCELLED' || st === 'EXPIRED') {
            setStatus(st === 'REJECTED' ? 'Pagamento rejeitado pelo banco.' : st === 'CANCELLED' ? 'Pagamento cancelado.' : 'Sessão de pagamento expirada.');
            const productId = typeof window !== 'undefined' ? window.sessionStorage.getItem('of_payment_product_id') : null;
            mirror('redirect.poll.payment.terminal', { st, productId });
            setTimeout(() => { window.location.replace(`/checkout/${productId || ''}`); }, 2000);
            return;
          }
          throw new Error(`Status desconhecido: ${st}`);
        };
        await poll();
        return;
      }
      const search = typeof window !== 'undefined' ? window.location.search : '';
      const hash = typeof window !== 'undefined' ? window.location.hash : '';
      const params = new URLSearchParams(search && search.length > 1 ? search : (hash || '').replace('#', '?'));
      const code = params.get("code");
      const state = params.get("state");
      const asError = params.get("error");
      const error_description = params.get("error_description");
      mirror('redirect.url.params', { hasCode: !!code, hasState: !!state, asError, error_description });
        console.time('[debug][redirect.flow] total');
        console.log('[debug][redirect.start]', {
          hasSearch: !!search, hasHash: !!hash,
          codePresent: !!code, statePresent: !!state,
          asErrorPresent: !!asError,
        });

      if (!state) {
        setStatus("Callback sem estado (state) — não é possível continuar.");
        setError("STATE ausente");
        return;
      }

      // If the AS returned an error (cancel/denied/timeout), persist and stop
      if (asError) {
        setStatus("Operação cancelada pelo banco. Registrando status...");
        const res = await fetch("/api/v2/oauth/authorization-endpoint/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state, error: asError, error_description }),
        });
        const data = await res.json().catch(() => ({}));
        mirror('redirect.oauth.error', { status: res.status, data });
        setError(`${asError}${data?.message ? `: ${data.message}` : ''}`);
        setStatus("Pagamento não autorizado.");
        return;
      }

      if (!code) {
        setStatus('Vínculo pendente: acesse o banco e finalize a autenticação. Depois volte ao checkout para pagar.');
        return;
      }

      // Before validation/consent: complete device options + device registration (per EPM order)
      const idTokenFromUrl = params.get('id_token') || params.get('idToken');
      try {
        setStatus('Obtendo opções de registro do dispositivo...');
        const devOptsRes = await fetch('/api/v2/enrollments/device/options', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ state, code, idToken: idTokenFromUrl, tenantId: 'lina', platform: 'BROWSER' })
        });
        const devOpts = await devOptsRes.json().catch(() => ({}));
        console.log('[debug][device.options] response', { status: devOptsRes.status, ok: devOptsRes.ok, body: devOpts });
        mirror('redirect.device.options', { status: devOptsRes.status, ok: devOptsRes.ok });
        try {
          const pk0: any = devOpts?.data?.publicKey || devOpts?.data || devOpts?.PublicKey || devOpts;
          const algs = Array.isArray(pk0?.pubKeyCredParams) ? pk0.pubKeyCredParams.map((x: any) => x?.alg) : [];
          console.log('[debug][device.options] details', {
            hasPublicKey: !!pk0,
            rpId: pk0?.rp?.id,
            rpName: pk0?.rp?.name,
            userName: pk0?.user?.name,
            userIdLen: typeof pk0?.user?.id === 'string' ? pk0.user.id.length : (pk0?.user?.id?.byteLength || null),
            challengeLen: typeof pk0?.challenge === 'string' ? pk0.challenge.length : (pk0?.challenge?.byteLength || null),
            timeout: pk0?.timeout,
            attestation: pk0?.attestation,
            algs,
          });
        } catch {}
        if (!devOptsRes.ok) {
          console.error('[device.options] upstream failure', {
            status: devOptsRes.status,
            body: devOpts,
          });
          throw new Error(devOpts?.error || 'Falha ao obter device options');
        }
        const storedCtx = typeof window !== 'undefined' ? window.sessionStorage.getItem('of_enroll_ctx') : null;
        let ctx2: any = null; try { ctx2 = JSON.parse(storedCtx || '{}'); } catch {}
        const enrollmentId2: string | undefined = ctx2?.enrollmentId;
        console.log('[debug][session.ctx]', { hasStoredCtx: !!storedCtx, parsedKeys: Object.keys(ctx2 || {}), enrollmentId2 });
        if (!enrollmentId2) throw new Error('EnrollmentId ausente para registrar dispositivo');

        // Try to map provider data to WebAuthn PublicKeyCreationOptions
        const pk: any = devOpts?.data?.publicKey || devOpts?.data || devOpts?.PublicKey || devOpts;
        if (!pk) throw new Error('Opções de WebAuthn inválidas');

        const toBuf = (b64url: string) => Uint8Array.from(atob(b64url.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
        if (pk.challenge && typeof pk.challenge === 'string') pk.challenge = toBuf(pk.challenge);
        if (pk.user && pk.user.id && typeof pk.user.id === 'string') pk.user.id = toBuf(pk.user.id);

        setStatus('Solicitando criação de credencial no dispositivo...');
        console.time('[debug][webauthn.create]');
        const cred: any = await navigator.credentials.create({ publicKey: pk } as any);
        console.timeEnd('[debug][webauthn.create]');
        if (!cred) throw new Error('WebAuthn criou credencial vazia');
        try {
          console.log('[debug][webauthn.create] success', {
            id: cred?.id,
            type: cred?.type,
            authenticatorAttachment: cred?.authenticatorAttachment,
          });
        } catch {}

        const bufToB64Url = (buf: ArrayBuffer) => {
          const bytes = new Uint8Array(buf);
          let str = '';
          for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
          return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
        };

        const attObj = cred.response?.attestationObject ? bufToB64Url(cred.response.attestationObject) : undefined;
        const clientDataJSON = cred.response?.clientDataJSON ? bufToB64Url(cred.response.clientDataJSON) : undefined;
        console.log('[debug][webauthn.create] sizes', {
          attestationLen: attObj?.length || 0,
          clientDataLen: clientDataJSON?.length || 0,
          transportsCount: Array.isArray(cred.response?.getTransports?.()) ? cred.response.getTransports().length : 0,
        });
        const transports = (cred.response?.getTransports && typeof cred.response.getTransports === 'function') ? cred.response.getTransports() : ['internal'];
        const payload = {
          id: cred.id,
          rawId: cred.rawId ? bufToB64Url(cred.rawId) : cred.id,
          response: {
            attestationObject: attObj,
            clientDataJSON,
            transports,
          },
          type: cred.type || 'public-key',
          authenticatorAttachment: (cred.authenticatorAttachment || 'platform'),
        };

        setStatus('Registrando dispositivo no provedor...');
        const devRegRes = await fetch(`/api/v2/enrollments/${encodeURIComponent(enrollmentId2)}/device`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload)
        });
        const devRegJson = await devRegRes.json().catch(() => ({}));
        console.log('[debug][device.register] response', {
          status: devRegRes.status, ok: devRegRes.ok,
          body: devRegJson,
          payloadMeta: { id: payload?.id, responseKeys: Object.keys(payload?.response || {}) }
        });
        mirror('redirect.device.register', { status: devRegRes.status, ok: devRegRes.ok });
        if (!devRegRes.ok) {
          throw new Error(devRegJson?.error || 'Falha ao registrar dispositivo');
        }
      } catch (e: any) {
        console.warn('[redirect] dispositivo opc/register falhou (seguindo mesmo assim)', { error: String(e?.message || e) });
        try { console.error('[debug][device.flow] error stack', e?.stack || e); } catch {}
      }

      // Step 1: validate ID token (no consent/payment here in JSR-puro)
      console.log('[redirect] calling validate', { hasCode: !!code, hasState: !!state });
      const validateRes = await fetch("/api/v2/oauth/authorization-endpoint/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({
          code,
          state,
          tenantId: "opfi:acme1",
          platform: "BROWSER",
        }),
      });
      const validateData = await validateRes.json().catch(() => ({}));
      console.log('[redirect] validate response', { status: validateRes.status, body: validateData });
      mirror('redirect.oauth.validate', { status: validateRes.status, ok: validateRes.ok });
      if (!validateRes.ok) {
        setStatus(`Falha na validação (${validateRes.status})`);
        setError(validateData?.message || 'Falha na validação');
        return;
      }

      // Auto-pay: after enrollment validation, create a payment and redirect to bank
      try {
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem('of_enrollment_complete', '1');
          let ctxStr = window.sessionStorage.getItem('of_enroll_ctx');
          console.log('[redirect] read of_enroll_ctx(raw):', ctxStr);
          mirror('redirect.ctx.read', { hasCtx: !!ctxStr });
          let ctx: any = null; try { ctx = JSON.parse(ctxStr || '{}'); } catch {}
          console.log('[redirect] parsed enroll ctx:', { keys: Object.keys(ctx || {}), enrollmentId: ctx?.enrollmentId, productId: ctx?.productId });
          // Fallback: derive minimal product context via state-meta if needed
          if (!ctx || !ctx.enrollmentId) {
            try {
              const smRes = await fetch(`/api/v2/oauth/state-meta?state=${encodeURIComponent(state!)}`, { cache: 'no-store' });
              const sm = await smRes.json().catch(() => ({}));
              if (smRes.ok) {
                ctx = {
                  ...(ctx || {}),
                  productId: ctx?.productId || sm?.productId || sm?.data?.productId,
                  amountCents: ctx?.amountCents || sm?.amountCents || sm?.data?.amountCents,
                  currency: ctx?.currency || sm?.currency || sm?.data?.currency || 'BRL',
                };
              }
            } catch {}
          }
          if (ctx && ctx.enrollmentId && ctx.productId) {
            setStatus('Cadastro concluído! Criando pagamento...');
            // Resolve profile for payer info (best-effort)
            let profile: any = {};
            try { const pr = await fetch('/api/profile', { cache: 'no-store' }); profile = await pr.json().catch(() => ({})); } catch {}
            // Try to force-activate enrollment (mock/hml) before waiting
            try {
              console.log('[redirect] calling /api/v2/enrollments/activate', { enrollmentId: ctx.enrollmentId });
              const actRes = await fetch('/api/v2/enrollments/activate', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enrollmentId: ctx.enrollmentId })
              });
              console.log('[redirect] activate response', { status: actRes.status, ok: actRes.ok });
              mirror('redirect.enroll.activate', { status: actRes.status, ok: actRes.ok });
            } catch (e) { console.warn('[redirect] activate call failed (continuing)', e); }
            // Ensure link is ACTIVE before trying to create payment (backend rejects PENDING)
            let linkActive = false;
            try {
              if (ctx?.userId && ctx?.organisationId) {
                setStatus('Aguardando ativação do vínculo com o banco...');
                let tries = 0; const max = 6; // ~12-18s total
                while (!linkActive && tries < max) {
                  tries += 1;
                  const chkRes = await fetch('/api/v2/enrollments/check', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
                    body: JSON.stringify({ userId: ctx.userId, organisationId: ctx.organisationId })
                  });
                  const chk = await chkRes.json().catch(() => ({}));
                  try { console.log('🔍 [redirect] Check response:', chk); } catch {}
                  mirror('redirect.check', chk);
                  if (chkRes.ok && chk?.needsEnrollment === false) {
                    linkActive = true;
                    try { console.log('✅ [redirect] Enrollment ACTIVE confirmado!'); } catch {}
                    break;
                  }
                  if (tries < max) {
                    try { console.log(`⏳ [redirect] Tentativa ${tries}/${max}, aguardando...`); } catch {}
                    await new Promise(r => setTimeout(r, 2000));
                  }
                }
              }
            } catch {}

            // Log final polling outcome and bail out early if not ACTIVE
            try { console.log('🔍 [redirect] Resultado do polling:', { active: linkActive }); } catch {}
            mirror('redirect.polling.result', { active: linkActive });
            if (!linkActive) {
              console.error('❌ [redirect] Polling falhou - enrollment não ficou ACTIVE');
              setStatus('Falha ao ativar vínculo. Tente novamente.');
              setError('Timeout aguardando ativação do vínculo');
              return;
            }
            try { console.log('✅ [redirect] Enrollment ACTIVE confirmado, iniciando JSR'); } catch {}
            mirror('redirect.active', { active: true });
            // Small delay to allow provider to settle enrollment state before consent
            try { console.log('⏳ [redirect] Aguardando 5 segundos antes de criar consent...'); } catch {}
            await new Promise(r => setTimeout(r, 5000));
            try { console.log('✅ [redirect] Delay concluído, criando consent'); } catch {}

            // Embedded JSR flow with fallback
            const orderRef = ctx.orderRef || `ORDER_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
            try {
              setStatus('Criando autorização de pagamento...');
              console.log('[redirect] Criando consent JSR');
              mirror('redirect.jsr.consent.start', { enrollmentId: ctx.enrollmentId, amountCents: ctx.amountCents });
              const consentRes = await fetch('/api/open-finance/jsr/consents', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  enrollmentId: ctx.enrollmentId,
                  organisationId: ctx.organisationId,
                  authorisationServerId: ctx.authorisationServerId,
                  payment: {
                    details: `Pagamento - Produto ${ctx.productId}`,
                    externalId: orderRef,
                    value: Number(ctx.amountCents || 0) / 100,
                    cpfCnpj: (ctx?.document || '').replace(/[^0-9]/g, ''),
                    creditor: {
                      name: process.env.NEXT_PUBLIC_CREDITOR_NAME || 'Mock Recebedor Sandbox',
                      personType: 'PESSOA_NATURAL',
                      cpfCnpj: '11111111111',
                      accountNumber: '123456',
                      accountIssuer: '1774',
                      accountPixKey: 'sandbox@linaob.com.br',
                      accountIspb: '60701190',
                      accountType: 'CACC',
                    },
                  },
                })
              });
              const consentData = await consentRes.json().catch(() => ({}));
              console.log('[redirect] Consent criado:', { ok: consentRes.ok, hasPublicKey: !!consentData?.publicKey });
              mirror('redirect.jsr.consent.res', { ok: consentRes.ok, status: consentRes.status, hasPublicKey: !!consentData?.publicKey });
              if (!consentRes.ok) throw new Error(consentData?.error || 'Falha ao criar consent');

              const paymentRequestId = consentData?.paymentRequestId;
              const publicKey = consentData?.publicKey;

              setStatus('Autorizando pagamento (biometria)...');
              console.log('[redirect] Solicitando WebAuthn');
              mirror('redirect.jsr.webauthn.start', {});
              const { getPaymentAssertion } = await import('@/lib/webauthn');
              const fidoAssertion = await getPaymentAssertion(publicKey);
              console.log('[redirect] WebAuthn assinado com sucesso');
              mirror('redirect.jsr.webauthn.ok', {});

              setStatus('Finalizando pagamento...');
              console.log('[redirect] Finalizando pagamento JSR');
              mirror('redirect.jsr.pay.start', { paymentRequestId });
              const paymentRes = await fetch('/api/open-finance/jsr/payments', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  paymentRequestId,
                  enrollmentId: ctx.enrollmentId,
                  fidoAssertion,
                  riskSignals: {
                    deviceId: ctx.deviceId || crypto.randomUUID(),
                    osVersion: '10.15.7',
                    userTimeZoneOffset: String(-(new Date().getTimezoneOffset()/60)).padStart(2,'0'),
                    language: (typeof navigator !== 'undefined' ? navigator.language : 'pt-BR').slice(0,2),
                    screenDimensions: { width: typeof window !== 'undefined' ? window.innerWidth : 1080, height: typeof window !== 'undefined' ? window.innerHeight : 1920 },
                    accountTenure: ctx.accountTenure || new Date(Date.now() - 365*24*60*60*1000).toISOString().slice(0,10),
                  },
                  productId: ctx.productId,
                  amountCents: Number(ctx.amountCents || 0),
                  clinicId: ctx.clinicId || undefined,
                  metadata: { orderRef },
                })
              });
              const paymentData = await paymentRes.json().catch(() => ({}));
              console.log('[redirect] Pagamento finalizado:', { ok: paymentRes.ok, status: paymentData?.status });
              mirror('redirect.jsr.pay.res', { ok: paymentRes.ok, status: paymentData?.status, providerStatus: paymentData?.providerResponse?.status });
              if (!paymentRes.ok) throw new Error(paymentData?.error || 'Falha ao finalizar pagamento');

              if (String(paymentData?.status || '').toUpperCase() === 'COMPLETED' || String(paymentData?.providerResponse?.status || '').toUpperCase() === 'COMPLETED') {
                setStatus('Pagamento concluído com sucesso!');
                let destBase = '/checkout/success';
                try {
                  if (ctx.productId) {
                    const pRes = await fetch(`/api/products/public/${encodeURIComponent(ctx.productId)}`, { cache: 'no-store' });
                    const p = await pRes.json().catch(() => ({}));
                    const slug = p?.clinic?.slug;
                    if (pRes.ok && slug) destBase = `/${slug}/checkout/success`;
                  }
                } catch {}
                const q = new URLSearchParams({
                  product_id: String(ctx.productId || ''),
                  method: 'pix_ob',
                  order_id: String(orderRef || ''),
                  transaction_id: String(paymentData?.paymentId || ''),
                });
                window.location.replace(`${destBase}?${q.toString()}`);
                return;
              }
              throw new Error(`Status inesperado: ${paymentData?.status || paymentData?.providerResponse?.status}`);
            } catch (err) {
              console.warn('[redirect][embedded-jsr] falhou, usando fallback redirect-based', err);
              mirror('redirect.jsr.fallback', { error: String((err as any)?.message || err) });
              const payRes = await fetch('/api/open-finance/payments', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  productId: ctx.productId,
                  enrollmentId: ctx.enrollmentId,
                  amount: Number(ctx.amountCents || 0),
                  currency: ctx.currency || 'BRL',
                  payer: { name: profile?.name || 'Cliente', email: profile?.email || undefined, cpf: (ctx?.document || '').replace(/[^0-9]/g, '') || undefined },
                  orderRef,
                  userId: ctx?.userId || profile?.id || undefined,
                })
              });
              const payJson = await payRes.json().catch(() => ({}));
              const redirectUri = payJson?.data?.redirectUrl || payJson?.data?.redirect_uri || payJson?.redirectUrl || payJson?.redirect_uri;
              const paymentLinkId = payJson?.data?.id || payJson?.paymentLinkId || payJson?.payment_request_id || payJson?.paymentRequestId || payJson?.id;
              if (payRes.ok && redirectUri && paymentLinkId) {
                try {
                  window.sessionStorage.setItem('of_payment_link_id', String(paymentLinkId));
                  if (ctx?.productId) window.sessionStorage.setItem('of_payment_product_id', String(ctx.productId));
                  window.sessionStorage.setItem('of_payment_order_ref', String(orderRef));
                } catch {}
                setStatus('Redirecionando ao banco...');
                mirror('redirect.fallback.redirect', { redirectUri, paymentLinkId });
                window.location.href = redirectUri;
                return;
              }
              console.warn('[redirect][auto-pay] criação de pagamento falhou', { status: payRes.status, body: payJson });
              mirror('redirect.fallback.error', { status: payRes.status, body: payJson });
            }
          }
          // Fallback: redirect back to checkout to let user click Pagar
          let back = window.sessionStorage.getItem('of_return_to');
          if (!back) {
            try {
              const smRes = await fetch(`/api/v2/oauth/state-meta?state=${encodeURIComponent(state!)}`, { cache: 'no-store' });
              const sm = await smRes.json().catch(() => ({}));
              if (smRes.ok && (sm?.productId || sm?.data?.productId)) {
                const productId = sm.productId || sm.data?.productId;
                let dest = `/krx/checkout/${productId}`;
                try {
                  const pRes = await fetch(`/api/products/public/${encodeURIComponent(productId)}`, { cache: 'no-store' });
                  const p = await pRes.json().catch(() => ({}));
                  const slug = p?.clinic?.slug;
                  if (pRes.ok && slug) dest = `/${slug}/checkout/${productId}`;
                } catch {}
                back = dest;
              }
            } catch {}
          }
          const finalBack = back || '/';
          setStatus('Cadastro concluído. Voltando ao checkout...');
          window.location.replace(finalBack);
          return;
        }
      } catch {}
      setStatus('Cadastro concluído. Você já pode pagar.');
      console.timeEnd('[debug][redirect.flow] total');
      return;
    } catch (e: any) {
      setStatus(`Erro inesperado: ${e?.message || e}`);
      setError(String(e?.message || e));
    }
    })();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <div className="w-full max-w-md text-center">
        {!error && /Verificando|processando|Obtendo|Registrando|Criando|Redirecionando/i.test(status) && (
          <div className="mx-auto mb-4 h-8 w-8 rounded-full border-2 border-blue-300 border-t-blue-600 animate-spin" />
        )}
        <h1 className="text-[18px] font-semibold text-gray-900">
          {error ? 'Erro no pagamento' : 'Processando pagamento'}
        </h1>
        <p className="mt-2 text-sm text-gray-600">{status}</p>
        {error && (
          <div className="mt-3 inline-block text-left w-full">
            <div className="rounded-md border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        )}
        {!error && (
          <p className="mt-4 text-xs text-gray-500">Aguarde enquanto confirmamos seu pagamento…</p>
        )}
      </div>
    </div>
  );
}
