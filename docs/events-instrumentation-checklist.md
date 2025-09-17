# Events Instrumentation Checklist

This checklist maps every canonical `EventType` and `EventActor` (as defined in `prisma/schema.prisma`) to concrete instrumentation points across the codebase. Use it to ensure data is emitted consistently via `POST /api/events/ingest` or `emitEvent()`.

Paths referenced below are examples from this codebase. Prefer emitting on the server (API routes) to ensure reliability.

## Foundations (done)
- [x] Unified table `events` (enums + indexes)
- [x] Migration scripts
  - `scripts/migrations/20250915_create_events.js`
  - `scripts/migrations/20250915_create_event_enums.js`
- [x] Prisma enums: `EventType`, `EventActor`
- [x] Zod registry and envelope
  - `src/lib/event-schemas.ts`
  - `src/lib/events.ts` (`emitEvent()`)
- [x] Ingest endpoint
  - `POST /api/events/ingest`
- [x] First instrumentation: WhatsApp connect → `integration_added`
  - `src/app/api/integrations/whatsapp/connect/route.ts`

---

## Cliente (Ciclo de Vida)
- [ ] `customer_created` (actor: clinic|system)
  - Where: patient creation endpoints or onboarding flows
  - Metadata: `{ nome, idade?, gênero?, canal_origem?, consentimento_marketing? }`
- [ ] `customer_updated` (actor: clinic|system|customer)
  - Where: profile update API
  - Metadata: `{ changes: { field: old→new } }`
- [ ] `customer_visit` (actor: clinic|system)
  - Where: visits/appointments completion handler
  - Metadata: `{ visit_type: walk-in|appointment, duration? }`
- [ ] `lead_created` (actor: system)
  - Where: `ReferralLead` creation or public form submit
  - Metadata: `{ source, device?, campaign_id? }`
- [ ] `lead_converted` (actor: system)
  - Where: lead → patient conversion logic
  - Metadata: `{ conversion_channel?, time_to_convert_days? }`
- [ ] `review_submitted` (actor: customer)
  - Where: NPS/review submission
  - Metadata: `{ nps_score?, text?, sentiment_score? }`
- [ ] `feedback_negative` (actor: customer)
  - Where: feedback UI
  - Metadata: `{ reason: price|service|delay }`

## Transação / Pagamento
- [ ] `purchase_made` (actor: clinic|system)
  - Where: checkout success (POS/online/WhatsApp)
  - Metadata: `{ value, currency, items[{categoria,qty,price}], channel? }`
- [ ] `purchase_refund` (actor: clinic|system)
  - Where: refunds
  - Metadata: `{ value, reason? }`
- [ ] `payment_processed` (actor: system)
  - Where: payment webhooks (Stripe/Pagarme)
  - Metadata: `{ method: card|pix|cash, status: success|failed }`
- [ ] `subscription_billed` (actor: system)
  - Where: recurring billing webhook
  - Metadata: `{ plan_id, amount, status }`
- [ ] `subscription_canceled` (actor: clinic|system)
  - Where: cancel flow
  - Metadata: `{ reason: no_value|too_expensive|moved }`
- [ ] `chargeback_reported` (actor: system)
  - Where: processor webhook
  - Metadata: `{ amount, processor }`

## Loyalty / Rewards
- [ ] `reward_created` (actor: clinic)
  - Where: create reward
  - Metadata: `{ reward_id, type: cashback|points|discount, rules, expiry? }`
- [ ] `reward_offered` (actor: clinic|ai)
  - Where: trigger offer (WhatsApp/Email/SMS)
  - Metadata: `{ channel, trigger: ai|manual }`
- [ ] `reward_viewed` (actor: customer)
  - Where: landing/view event
  - Metadata: `{ channel, time_to_view_seconds? }`
- [ ] `reward_claimed` (actor: customer)
  - Where: claim flow
  - Metadata: `{ reward_id }`
- [ ] `reward_redeemed` (actor: system)
  - Where: redemption success
  - Metadata: `{ purchase_id?, value_applied? }`
- [ ] `reward_expired` (actor: system)
  - Where: scheduled job
  - Metadata: `{ reward_id }`
- [ ] `points_earned` (actor: system)
  - Where: earning rules (purchase/referral/review)
  - Metadata: `{ value, source }`
- [ ] `points_spent` (actor: customer|system)
  - Where: redemption/discount use
  - Metadata: `{ value, usage: discount|gift }`

## Comunicação / Engajamento
- [ ] `campaign_sent` (actor: clinic|system)
  - Where: campaign dispatcher
  - Metadata: `{ campaign_id, channel?, audience_size? }`
- [ ] `campaign_opened` (actor: customer|system)
  - Where: email open or WA read (when webhooks ativas)
  - Metadata: `{ campaign_id, device? }`
- [ ] `campaign_clicked` (actor: customer)
  - Where: tracked link click
  - Metadata: `{ campaign_id, link_id? }`
- [ ] `campaign_replied` (actor: customer)
  - Where: inbound message handling
  - Metadata: `{ campaign_id, message_text?, sentiment_score? }`
- [ ] `conversation_started` (actor: clinic|system)
  - Where: WA test send or first outbound message
  - Metadata: `{ channel: whatsapp|chatbot }`
- [ ] `conversation_closed` (actor: clinic|system)
  - Where: conversation resolution
  - Metadata: `{ outcome: booked|ignored|opted_out }`

## Membership
- [ ] `membership_started` (actor: clinic|system)
  - Where: plan purchase start
  - Metadata: `{ plan_id, tier: basic|premium, price?, duration? }`
- [ ] `membership_renewed` (actor: system)
  - Where: renewal success
  - Metadata: `{ plan_id, payment_status? }`
- [ ] `membership_canceled` (actor: clinic|system)
  - Where: cancel flow
  - Metadata: `{ reason? }`
- [ ] `membership_upgraded` (actor: clinic|system)
  - Where: upgrade flow
  - Metadata: `{ from_plan, to_plan }`

## IA (Feedback Loop)
- [ ] `prediction_made` (actor: ai|system)
  - Where: scoring jobs / recommendations
  - Metadata: `{ model: churn|ltv|next_best_offer, score, features_used? }`
- [ ] `action_taken` (actor: clinic|system)
  - Where: acceptance of AI suggestion
  - Metadata: `{ accepted, by: clinic|system }`
- [ ] `outcome_recorded` (actor: system)
  - Where: post-outcome evaluation
  - Metadata: `{ success, lag_days? }`

## Sistema / Infra
- [ ] `user_logged_in` (actor: system)
  - Where: auth callback/success handler (`next-auth`)
  - Metadata: `{ user_id, role? }`
- [x] `integration_added` (actor: clinic)
  - Where: WhatsApp connect
  - Metadata: `{ provider: 'whatsapp', phone?, phoneNumberId?, wabaId? }`
- [ ] `config_changed` (actor: clinic|system)
  - Where: settings update endpoints
  - Metadata: `{ field_changed, old_value?, new_value? }`

---

## Emissão (padrões)
- Preferir server-side: chamar `emitEvent()` nas rotas em `src/app/api/...`.
- Se houver contexto de idempotência (webhooks, replays), usar `eventId` externo.
- Preencher `timestamp` com o momento real do evento; `createdAt` será o momento do insert.

## Observabilidade & DX
- [ ] Logger para falhas de emissão (não bloquear requisição principal)
- [ ] Playground: rota internal-only para listar últimos 100 eventos por `clinicId`
- [ ] Métricas básicas: `GET /api/events/metrics` (por dia e tipo)
- [ ] Timeline: `GET /api/events/by-customer`

## Índices funcionais (on-demand)
- [ ] Adicionar índice para `(metadata->>'campaign_id')` se dashboards filtrarem muito por campanha
- [ ] Outros campos de negócio frequentes: `(metadata->>'plan_id')`, `(metadata->>'reward_id')`

## Segurança & Privacidade
- [ ] Evitar PII desnecessária em `metadata`
- [ ] Limitar acesso a `clinicId` pela sessão do usuário nas APIs
- [ ] Anonimização/mascaração quando aplicável

---

## Como emitir
- API: `POST /api/events/ingest` com envelope
- Server helper: `await emitEvent({ eventType, actor, clinicId, customerId?, timestamp?, eventId?, metadata })`

