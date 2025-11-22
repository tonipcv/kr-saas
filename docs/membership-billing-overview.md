# Membership & Billing System Overview (Gateways, Subscriptions, and Cron Strategy)

## Scope
- Map how subscriptions/membership and charges work across gateways.
- Identify gateways with native subscriptions vs those requiring manual recurrence.
- Propose a minimal Vercel Cron strategy to keep billing consistent from day 1.

---

## Data Model (relevant)
- **Plans/Memberships (SaaS for clinics)**
  - `prisma/schema.prisma` → `ClinicPlan`, `ClinicSubscription`, `ClinicAddOn`, `ClinicAddOnSubscription`, enums `SubscriptionStatus`, `PlanTier`.
- **Commerce/Subscriptions for products**
  - `Product` (`type`, `interval`, `intervalCount`, `trialDays`, `providerPlanId`, `autoRenew`).
  - `Offer` (`isSubscription`, `intervalUnit`, `intervalCount`, `trialDays`, `preferredProvider`).
  - `OfferPrice` (per-country price per provider).
- **Transactions & Subscriptions (unified)**
  - `PaymentTransaction` (stores provider ids, status, customer links, `customerSubscriptionId`, billing periods).
  - `CustomerSubscription` (provider: STRIPE | PAGARME | APPMAX | ...; `providerSubscriptionId`, periods, `status`).
  - `Customer`, `CustomerProvider`, `CustomerPaymentMethod` (vault & mapping to provider customer/payment method).

---

## Gateways and Current Behaviors

### 1) KRXPAY (Pagar.me v5)
- **Code**: `src/app/api/checkout/subscribe/route.ts`, `src/app/api/checkout/create/route.ts`, `src/lib/payments/pagarme/sdk.ts`, `src/app/api/payments/pagarme/webhook/route.ts`.
- **Subscription capability**: Supports provider-native subscription when using plan (or planless via items).
- **Persistence**:
  - Creates `PaymentTransaction` early (dual-write best-effort) with `status_v2=PROCESSING`, `provider_v2=PAGARME` and later updates by webhooks.
  - Upserts `Customer`, `CustomerProvider` during subscribe; card saved as provider card (not always into `CustomerPaymentMethod`).
  - Creates/updates `CustomerSubscription` row on subscribe; activates on `charge.paid`/`order.paid` webhook.
- **Split**: Handled at subscription creation or via `charge.created` webhook repair (`pagarmeUpdateCharge`).
- **Webhooks**: `src/app/api/payments/pagarme/webhook/route.ts` reconciles `payment_transactions` and activates subscriptions.
- **Cron need**: Low for native cards. Needed for:
  - PIX “prepaid subscriptions” (created via one-time charges) → manual monthly renewal.
  - Repair jobs (webhook retry/drain) in Vercel environment.

### 2) Stripe
- **Code**: `src/app/api/checkout/stripe/subscribe/route.ts`, `src/app/api/stripe/webhook/route.ts`, `src/lib/providers/stripe/`.
- **Subscription capability**: Native subscriptions (items with `price`), Stripe invoices handle billing/dunning.
- **Persistence**:
  - `stripe/subscribe` persists `Customer`, `CustomerProvider`, optionally `CustomerPaymentMethod`, and `CustomerSubscription` (snake_case table) with periods and status.
  - `invoice.*` webhooks upsert `PaymentTransaction` linked to `CustomerSubscription` and periods.
- **Webhooks**: Signature verified per-merchant; updates transactions and subscription status/periods.
- **Cron need**: Minimal. Stripe handles renewals/dunning. Useful cron: webhook retry drain and reconciliation sanity checks.

### 3) Appmax
- **Code**: `src/app/api/checkout/appmax/create/route.ts`, `src/app/api/webhooks/appmax/route.ts`.
- **Subscription capability**: No native subscription API used. Current flow creates a `CustomerSubscription` row for `Product.type='SUBSCRIPTION'` and computes periods locally. Billing event happens only when an order/payment is created.
- **Persistence**:
  - On checkout create: creates `PaymentTransaction` and, if product is subscription, inserts/updates `CustomerSubscription` with computed `current_period_end` and `status=TRIAL|PENDING`.
  - On webhook paid: activates the subscription and updates periods.
- **Webhooks**: Map status to `PaymentTransaction`. No provider-driven renewals.
- **Cron need**: High. Manual recurrence required: on/after `current_period_end`, create a new Appmax order/payment and update rows.

### 4) Open Finance (OB)
- **Code**: OB payment flows outside the main three; grep shows `src/app/api/open-finance/recurring/run/route.ts` exists, and open-banking tables are separate.
- **Subscription capability**: Recurring via consents/enrollments; typically requires a scheduler to create recurring payments using an existing consent.
- **Persistence**: Uses `OpenBankingPayment`, `OpenBankingConsent`, then migrates into `PaymentTransaction` via scripts.
- **Cron need**: Medium-High. Requires scheduler to generate recurring payments where `EnrollmentContext.recurringEnabled=true` and `next_due_at` logic.

---

## What needs Cron vs Native
- **Native (no manual cron for renewal)**
  - **Stripe**: Provider renews. Keep webhook drain/retry and audit jobs only.
  - **Pagar.me**: Card subscriptions created via provider plans/items: provider renews; we only consume webhooks.
- **Manual recurrence (needs cron)**
  - **Appmax**: Implement renewal via API at `current_period_end`.
  - **KRXPAY Prepaid Subscriptions via one-time**: If using `create` with `subscriptionPeriodMonths` → must generate next invoice/charge on schedule.
  - **Open Finance**: Generate recurring payments using valid consents per schedule.

---

## Minimal Vercel Cron Strategy (Phase 1)

Create HTTP routes that are idempotent and cheap. Suggested schedules are examples; tune in project settings.

- **/api/cron/webhooks/drain** (every 1-5 min)
  - **Goal**: Drain `webhook_events` like `workers/webhook-processor.ts` does in infra where no background workers run.
  - **Logic**:
    - Pick up to N oldest `webhook_events` with `processed=false AND (next_retry_at IS NULL OR <= now())` and call the same normalization/update paths used today (`lib/queue/pgboss.ts` logic ported into the route).
    - Mark processed, reschedule on failure with backoff.

- **/api/cron/subscriptions/renew-appmax** (every 1 hour)
  - **Goal**: Manual recurrence for Appmax subscriptions.
  - **Select**: `customer_subscriptions WHERE provider='APPMAX' AND status IN ('ACTIVE','TRIAL','PAST_DUE') AND current_period_end <= now()`.
  - **Action**:
    - For each: compute next period from `metadata.interval/intervalCount` (or product/offer), create Appmax order and payment (card or pix depending on stored `vault_payment_method_id`/customer data), upsert `PaymentTransaction`, bump periods, and set status accordingly.
    - If payment fails → mark `PAST_DUE`, enqueue dunning (email/SMS optional).

- **/api/cron/subscriptions/renew-krxpay-prepaid** (every 1 hour)
  - **Goal**: Renewal for KRXPAY subscriptions implemented as prepaid one-time (`subscriptionPeriodMonths`).
  - **Select**: `customer_subscriptions WHERE provider='PAGARME' AND is_native=false AND current_period_end <= now()` (or detect by metadata flag set at creation).
  - **Action**: Create new order/charge via KRXPAY, link to subscription, update periods and transactions.

- **/api/cron/subscriptions/open-finance** (every 1 hour)
  - **Goal**: Create recurring OB payments where consent/enrollment permits.
  - **Select**: `enrollment_contexts WHERE recurring_enabled=true` joined with scheduled products/plans; consult consent validity.
  - **Action**: Create OB payment, persist `OpenBankingPayment`, mirror into `PaymentTransaction` once accepted, update `CustomerSubscription` periods.

- **/api/cron/subscriptions/dunning** (every day)
  - **Goal**: Dunning/retry for manual gateways.
  - **Select**: `customer_subscriptions WHERE status='PAST_DUE'` and still within grace window.
  - **Action**: Retry payment (Appmax card path, KRXPAY one-time), escalate reminders, and cancel after max attempts; set `CANCELED` and `canceled_at`.

- **/api/cron/metrics/subscription-usage** (daily)
  - **Goal**: Update `system_metrics` and enforce/monitor plan usage caps.
  - **Logic**: Run `src/lib/subscription.ts:updateSystemMetrics()` and optional checks.

Notes:
- Each route should accept a `limit` parameter and be idempotent per subscription id for safety.
- Persist a run log row for observability.

---

## Queries and Identifiers to Drive Cron

- **Subscriptions to renew (Appmax)**
  - `SELECT id, customer_id, product_id, offer_id, metadata FROM customer_subscriptions WHERE provider = 'APPMAX' AND status IN ('ACTIVE','TRIAL','PAST_DUE') AND current_period_end <= NOW() LIMIT $N;`
- **KRXPAY prepaid renewals**
  - Same pattern, add filter `is_native=false` or a metadata flag (e.g., `metadata->>'planless' = 'true'`). If absent, infer by `provider_subscription_id IS NULL`.
- **Determine interval**
  - Prefer `metadata.interval/intervalCount`; fallback to `Offer.intervalUnit/intervalCount` or `Product.interval/intervalCount`.
- **Locate vault payment method**
  - `customer_payment_methods` by `customer_provider_id` or `vault_payment_method_id` on `customer_subscriptions` if already stored.

---

## Gaps to Close (high impact)
- **Customer vault alignment**: Ensure KRXPAY and Appmax save `CustomerPaymentMethod` when card present so dunning works.
- **CheckoutSession linkage**: Always set `checkout_sessions.payment_transaction_id` to the created transaction.
- **Enums**: Fill `provider_v2` and `status_v2` everywhere for consistency.
- **Single provider adapter**: Drive creation via `lib/providers/factory.ts` and unify flows; deprecate legacy diverging paths.

---

## Implementation Hints
- Reuse existing logic from:
  - Webhook worker: `lib/queue/pgboss.ts` for normalization/upserts.
  - Period math: see `pagarme` and `appmax` webhook activation code where periods are calculated.
- Add feature flags to enable cron routes progressively: `CRON_ENABLE_APPMAX`, `CRON_ENABLE_PREPAID_PAGARME`, `CRON_ENABLE_OB`.
- All cron routes must be auth-protected (e.g., `X-Internal-Secret`) and idempotent.

---

## Summary
- **Stripe** and **KRXPAY (native subs)**: rely on provider renewals + webhooks.
- **Appmax**, **KRXPAY prepaid**, **Open Finance**: require scheduled renewals and dunning.
- Add small, idempotent HTTP cron routes to Vercel to drain webhooks, renew subscriptions, and run dunning/metrics.
