# Events Instrumentation – Gap Analysis

This document summarizes what is already implemented and what is still missing from the event instrumentation plan, with concrete file hooks and suggested next steps. It complements `docs/events-instrumentation-checklist.md`.

## Summary

- Foundations complete (table, enums, ingest, schemas, helper).
- Major flows instrumented without altering existing behavior.
- Remaining items cluster around campaigns (webhooks), loyalty edge cases, membership lifecycle edges, generic payments, security hardening, and observability.

---

## Implemented (reference)

- Infra
  - `prisma/schema.prisma` (Event + enums)
  - Migrations: `scripts/migrations/20250915_*`
  - Zod registry + helper: `src/lib/event-schemas.ts`, `src/lib/events.ts`
  - Ingest + queries: `POST /api/events/ingest`, `GET /api/events/metrics`, `GET /api/events/by-customer`

- WhatsApp / Auth
  - `integration_added`: `src/app/api/integrations/whatsapp/connect/route.ts`
  - `conversation_started`: `src/app/api/integrations/whatsapp/send/route.ts`
  - `user_logged_in`: `src/lib/auth.ts` (NextAuth signIn event)

- Stripe (subscriptions)
  - `membership_started`, `subscription_billed`, `subscription_canceled`: `src/app/api/stripe/webhook/route.ts`

- Leads
  - `lead_created`: `src/app/api/referrals/submit/route.ts`, `src/app/api/campaigns/[id]/submit/route.ts`
  - `lead_converted`: DB trigger (`scripts/migrations/20250915_events_referral_lead_trigger.js`) on `referral_leads`

- Rewards / Loyalty
  - `reward_claimed`: `src/app/api/referrals/patient/route.ts` (resgate PENDING)
  - `reward_created`: `src/app/api/referrals/rewards/route.ts` (POST)
  - `reward_redeemed` + `points_spent`: `src/app/api/referrals/redemptions/fulfill-confirm/route.ts` (FULFILLED)

- Customer lifecycle
  - `customer_created`: `src/app/api/auth/register/route.ts`
  - `customer_updated`: `src/app/api/auth/register/route.ts` (update) e `src/app/api/patient/profile/route.ts` (PUT)
  - `customer_visit`: `src/app/api/v2/doctor/appointments/[id]/route.ts` (PATCH quando `status`→`COMPLETED`)

- Transactions
  - `purchase_made`: `src/app/api/purchases/route.ts`
  - `points_earned` (mirror ledger on purchase): `src/app/api/purchases/route.ts`

- Doctor UI
  - Página de métricas: `src/app/(authenticated)/doctor/events/page.tsx`
  - Link na navegação: `src/components/Navigation.tsx` → “Events”

---

## Missing / To Do

### 1) Campaigns (aguardando webhooks)
- __campaign_opened__: instrumentar em handlers de webhook (WhatsApp/Email) quando habilitados.
- __campaign_replied__: idem, mapeando replies.
- __Notes__: endpoint de envio já criado para emissão de `campaign_sent`: `POST /api/v2/doctor/campaigns/[id]/send`.

### 2) Security hardening (read APIs)
- __events read endpoints__: adicionar verificação de acesso por `clinicId` ao usuário logado.
  - Arquivos:
    - `src/app/api/events/metrics/route.ts`
    - `src/app/api/events/by-customer/route.ts`
  - Verificar que o usuário pertence/tem acesso à clínica (owner ou `clinic_members` ativo).

### 3) Membership lifecycle (além do Stripe básico)
- __membership_upgraded__: emitir onde ocorrer upgrade de plano (rota ainda não localizada).
- __membership_renewed__: se necessário distinguir de `subscription_billed`, detectar “novo period start” e emitir.

### 4) Payments (genérico fora de assinatura)
- __payment_processed__: para checkouts one-off via outros provedores/webhooks (não localizados). Emita com `{ method, status }`.

### 5) Loyalty / Rewards (complementos)
- __reward_offered__: emitir quando disparar oferta (WhatsApp/Email dispatcher).
- __reward_viewed__: emitir quando existir landing/rota de visualização do reward.
- __reward_expired__: se existir job/batch de expiração, emitir ao expirar (reward/codes).
- __points_earned__: além de compras, emitir em outras fontes (referrals aprovados, reviews) quando padronizadas.

### 6) Customer experience
- __review_submitted__: quando houver endpoint (NPS/feedback), emitir com `{ nps_score?, text?, sentiment_score? }`.
- __feedback_negative__: quando existir fluxo/rota de feedback, emitir com `{ reason }`.
- __customer_visit__ (outros fluxos): se houver finalização de visita fora de appointments, instrumentar também.

### 7) Observability / DX
- __Admin QA endpoint__: `GET /api/events/last?clinicId=...&limit=100` para inspeção rápida.
- __UI filtros adicionais__: na página `/doctor/events`, adicionar filtro por `types` e links para timeline por cliente.
- __Structured logging opcional__: padronizar logs de falhas de emissão com flag.

### 8) Performance & Data
- __Indices funcionais__: adicionar conforme uso de dashboards (ex.: `(metadata->>'campaign_id')`).
- __Retention / PII__: validar tempos de retenção e evitar PII em `metadata` desnecessário.

---

## Suggested Hooks (files) when flows become available

- Webhooks (WhatsApp/Email): `src/app/api/integrations/*/webhook/route.ts` (ou equivalente)
  - Emitir: `campaign_opened`, `campaign_replied`

- Membership upgrade/renew
  - Onde: rotas de upgrade e/ou webhook detalhado de provider
  - Emitir: `membership_upgraded`, `membership_renewed`

- Generic payments (non-subscription)
  - Onde: webhook/rota de pagamento concluído
  - Emitir: `payment_processed` com `{ method, status }`

- Loyalty complementos
  - Oferta/visualização: dispatcher/landing de reward
  - Expiração: job/cron de expiração

- Reviews/Feedback
  - Onde: rotas de review/feedback quando criadas
  - Emitir: `review_submitted`, `feedback_negative`

---

## Validation Checklist

- __Metrics__: `GET /api/events/metrics?clinicId=...&from=...&groupBy=day` (testar por tipo)
- __Timeline__: `GET /api/events/by-customer?clinicId=...&customerId=...`
- __Idempotência__: quando disponível `eventId` (ex.: `idempotency_key`), garantir não duplicar
- __Segurança__: endpoints de leitura validam acesso por `clinicId`
- __PII__: metadados sem informações sensíveis; use referências/ids

---

## Next Actions (proposta)

1) Security hardening nas leituras (`/api/events/metrics`, `/api/events/by-customer`).
2) Preparar handlers de webhooks de campanhas e adicionar `campaign_opened`/`campaign_replied` quando estiverem ativos.
3) Definir/implementar `membership_upgraded` (e opcional `membership_renewed`) conforme UX de planos.
4) Planejar `payment_processed` para pagamentos one-off.
5) Extender Loyalty: `reward_offered`, `reward_viewed`, `reward_expired`, e `points_earned` de fontes não-compra.
6) Criar endpoint admin de QA (`/api/events/last`).
7) Adicionar índices funcionais quando os dashboards pedirem.
