# Payments Ledger Coverage

This document maps how the following Prisma models are populated across KRXLabs (Pagar.me), Appmax, and Stripe flows:

- `payment_transactions` (`PaymentTransaction`)
- `customers` (`Customer`)
- `customer_providers` (`CustomerProvider`)
- `customer_payment_methods` (`CustomerPaymentMethod`)
- `customer_subscriptions` (`CustomerSubscription`)

It lists the endpoints that write to each model, what fields are covered today, and what is missing to achieve a complete ledger. Use this as a checklist when evolving providers or adding new ones.

## Legend

- Providers: KRXPAY (Pagar.me v5), Stripe, Appmax
- Endpoints are given as file paths under `src/app/api/...`
- Webhooks are first-class sources of truth for status changes

---

## Model: PaymentTransaction

Schema excerpt (`prisma/schema.prisma`):

- Keys: `id`, `provider`, `providerOrderId`, `providerChargeId`, `doctorId`, `patientProfileId`, `clinicId`, `merchantId`, `productId`
- Financials: `amountCents`, `currency`, `installments`, `paymentMethodType`, `status`, `status_v2`, `rawPayload`
- Audit: `paidAt`, `capturedAt`, `refundStatus`, `refundedAt`, `routedProvider`
- Orchestration: `customerId`, `customerProviderId`, `customerPaymentMethodId`, `customerSubscriptionId`, `billingPeriodStart`, `billingPeriodEnd`

### Fields to populate (minimum viable)

- **[identity]** `provider` (string), `provider_v2` (enum; prefer), `providerOrderId`, `providerChargeId`
- **[context]** `merchantId`, `clinicId`, `doctorId`, `productId`, `routedProvider`
- **[amounts]** `amountCents`, `currency`, `installments`, `paymentMethodType`
- **[status]** `status` (string), `status_v2` (enum; prefer), `paidAt`, `capturedAt`, `refundStatus`, `refundedAt`
- **[orchestration]** `customerId`, `customerProviderId`, `customerPaymentMethodId`, `customerSubscriptionId`, `billingPeriodStart`, `billingPeriodEnd`
- **[debug]** `rawPayload`

### Legacy vs canonical

- **Legacy (keep for compatibility):** `provider` (string), `status` (string)
- **Canonical (new):** `provider_v2` (PaymentProvider), `status_v2` (PaymentStatus)
- **Notes:** continuar gravando `provider/status` enquanto migramos, mas priorizar `provider_v2/status_v2` em novas escritas e leituras.

### Who writes it

- KRXPAY one-time/prepaid:
  - `src/app/api/checkout/create/route.ts` → INSERT on success; fields:
    - `provider='pagarme'`, `providerOrderId`, `doctorId`, `clinicId`, `productId`, `amountCents`, `currency='BRL'`, `installments`, `paymentMethodType ('credit_card'|'pix'|'boleto')`, `status='processing'`, `rawPayload`, `routedProvider='KRXPAY'`.
  - `src/app/api/payments/pagarme/webhook/route.ts` → UPDATE/UPSERT on events; fields:
    - Upserts by `providerOrderId` and/or `providerChargeId`.
    - `status` transitions with anti-downgrade, `paymentMethodType`, `installments`, `rawPayload`.
    - Split snapshots: `clinic_amount_cents`, `platform_amount_cents`, `platform_fee_cents` when derivable.
    - Audit: sets `paid` indirectly via status; `paidAt` not always set (GAP).
    - Reconciliation: creates placeholder rows if webhooks arrive before checkout/DB insert.
- KRXPAY subscriptions (card):
  - `src/app/api/checkout/subscribe/route.ts` → primarily touches `customer_subscriptions`. `payment_transactions` persistence happens indirectly (first charge split via webhook) or best-effort after.
  - `src/app/api/payments/pagarme/webhook/route.ts` → subscription invoice charges update/create `payment_transactions` similar to one-time (by order/charge id).
- Stripe:
  - `src/app/api/checkout/create/route.ts` (Stripe PI branch) → INSERT lightweight row when routing to Stripe PI.
  - `src/app/api/stripe/webhook/route.ts` → UPDATE on `payment_intent.succeeded|failed`, `charge.succeeded|captured|refunded`, and create/update for `invoice.*` events linking to `customer_subscriptions`.
    - Fills: `providerChargeId`, `status`, `amountCents`, `currency`, `paidAt/capturedAt/refundedAt`, `billingPeriodStart/End`, `customerSubscriptionId`, `customerId`.
- Appmax:
  - `src/app/api/checkout/appmax/create/route.ts` → INSERT early placeholder on order creation; then UPDATE with `status` after `paymentsCreditCard` or `paymentsPix`.
    - Fills: `provider='appmax'`, `providerOrderId`, `clinicId`, `productId`, `amountCents` (from product), `currency='BRL'`, `paymentMethodType`, `status`, `rawPayload`, `routedProvider='APPMAX'`.
  - No webhook implemented; status changes rely on DB writes at create-time (GAP for refunds/chargebacks).

### Gaps (PaymentTransaction)

- **paidAt/capturedAt/refundedAt**: consistently set by Stripe; not always set by KRXPAY/Appmax. Improve in webhooks or after successful responses.
- **status_v2**: rarely set; add normalized enum writes on terminal transitions.
- **customerId/customerProviderId/customerPaymentMethodId**: mostly filled in Stripe invoice events; KRXPAY/Appmax do not link to these vault entities today.
- **billingPeriodStart/End**: Stripe invoices fill; KRXPAY recurring invoices (if mapped) should set via webhook.
- **routedProvider**: set in create flows; ensure carried in webhook reconciliation.

### Fill status mapping (suggested)

- Mapear provider→`status_v2` em webhooks/rotas:
  - paid/captured/succeeded → `PAID`
  - authorized → `AUTHORIZED`
  - pending/processing → `PROCESSING`
  - failed/refused/canceled/refunded/chargedback → `FAILED`/`CANCELED`/`REFUNDED`/`CHARGEBACK`

---

## Model: Customer

Fields: `id, merchantId, name, email, phone, document, address, metadata`

### Who writes it

- KRXPAY subscribe:
  - `src/app/api/checkout/subscribe/route.ts` → best-effort upsert:
    - When creating a subscription, resolves or creates `customers` row based on `email`. Uses raw SQL fallback (snake/camel compatibility).
    - Fills: `merchantId`, `name`, `email`, `phone`, `metadata` with `clinicId/productId/offerId`.
- Stripe:
  - Webhook does not create `Customer`; typically created during Stripe PI, but we do not persist our `Customer` entity consistently (GAP).
- Appmax:
  - Not creating `Customer` (GAP). `appmax/create` creates customer remotely but only logs minimal info in `payment_transactions`.

### Gaps (Customer)

- **Stripe**: create/update internal `customers` on PI or via webhook context to link `merchantId+email`.
- **Appmax**: create/update internal `customers` similarly when creating Appmax orders.
- **Document/address**: capture buyer address/doc in `customers.address/document` when available.

### Recommended source of truth

- Criar/atualizar `Customer` na primeira interação (checkout create/subscribe) usando `merchantId+email` como chave de busca.

---

## Model: CustomerProvider

Schema excerpt (`prisma/schema.prisma`):

- Keys: `customerId`, `provider`
- Meta: `accountId`, `providerCustomerId`, `metadata`

### Fields to populate (minimum viable)

- **[meta]** `metadata` (opcional, ex.: flags do provider)

### Legacy vs canonical

- Canonical atual; sem pares v1/v2. Usar `provider` enum (PaymentProvider).

### Who writes it

- KRXPAY subscribe:
  - Currently not creating `customer_providers` rows (GAP). We create provider customer remotely and keep `providerCustomerId` transient.
- Stripe:
  - Webhook does not create; PI flow creates Stripe Customer remotely but we do not persist `CustomerProvider` row (GAP).
- Appmax:
  - `appmax/create` builds provider customer remotely; no `CustomerProvider` persisted (GAP).

### Gaps (CustomerProvider)

- Add creation in:
  - KRXPAY subscribe: after `pagarmeCreateCustomer` success.
  - Stripe PI branch: after creating Stripe Customer.
  - Appmax create: after `customersCreate` success.
- Populate `accountId` (if applicable per merchant account) and `providerCustomerId`.

### Recommended source of truth

- Criar logo após criar o cliente no provedor (Pagar.me/Stripe/Appmax) e vincular a `Customer` interno.

---

## Model: CustomerPaymentMethod

Fields: `customerId, customerProviderId, provider, accountId, providerPaymentMethodId, brand, last4, expMonth, expYear, isDefault, status, fingerprint`

### Who writes it

- KRXPAY subscribe:
  - Saves card on provider (v5), but defers persistence locally; not actually creating `customer_payment_methods` row (GAP).
- Stripe:
  - For PI or Subscribe, we do not persist a `customer_payment_methods` entry on confirmation (GAP). Some info could be read from Charges/PaymentMethods.
- Appmax:
  - Tokenization or raw card payment; not persisting `customer_payment_methods` (GAP).

### Gaps (CustomerPaymentMethod)

- On successful card save/usage:
  - Create row with `provider`, `providerPaymentMethodId` (e.g., Pagar.me `card_id`, Stripe `pm_xxx`), brand/last4/exp.
  - Link to `Customer` and `CustomerProvider`.

### Recommended source of truth

- Persistir quando o cartão é salvo/validado (ex.: `pagarmeCreateCustomerCard`, Stripe PM attach) e/ou no primeiro uso com sucesso.

---

## Model: CustomerSubscription

Fields: `customerId, merchantId, productId, offerId, provider, accountId, isNative, customerProviderId, providerSubscriptionId, vaultPaymentMethodId, status, startAt, trialEndsAt, currentPeriodStart, currentPeriodEnd, priceCents, currency, metadata`

### Who writes it

- KRXPAY subscribe:
  - `src/app/api/checkout/subscribe/route.ts` → INSERT or UPDATE by `provider_subscription_id` (snake-case column) with status mapping and period dates.
  - Links `merchantId`, `productId`, `offerId`, and sets `priceCents/currency` via OfferPrice resolution.
  - Sets `customerId` via local `customers` row (created if missing).
- Stripe:
  - `src/app/api/stripe/webhook/route.ts` updates `customer_subscriptions` by `provider_subscription_id` with status and period dates; cancellation on `customer.subscription.deleted`.
- Appmax:
  - No subscription flow implemented (N/A).

### Gaps (CustomerSubscription)

- **KRXPAY**: set `customerProviderId` linking to provider customer row when we implement `CustomerProvider` creation.
- **Stripe**: when creating subscriptions via our `/api/checkout/stripe/subscribe`, ensure we upsert `customers` and link ids upfront.

### Recommended source of truth

- Inserir no momento da criação (subscribe) e atualizar via webhooks do provider; usar `provider_subscription_id` como chave externa.

---

## Endpoint Coverage Matrix (Summary)

- `api/checkout/create` (KRXPAY one-time/prepaid):
  - PaymentTransaction: INSERT (processing) with rich metadata, split applied via payload; webhook finalizes.
  - Customer/Provider/PaymentMethod: not persisted (GAP for card saved flow unless extended).
- `api/checkout/subscribe` (KRXPAY):
  - Customer: upsert (best-effort).
  - CustomerSubscription: INSERT/UPDATE with status and pricing.
  - PaymentTransaction: via webhooks on charges; may add immediate insert on first authorization (optional).
  - CustomerProvider/PaymentMethod: not created (GAP).
- `api/checkout/stripe/intent` branch in `checkout/create`:
  - PaymentTransaction: INSERT lightweight PI row.
  - Customer/Provider/PaymentMethod: not persisted (GAP).
- `api/stripe/webhook`:
  - PaymentTransaction: PI/Charge/Invoice events → update/create and link to CustomerSubscription.
  - CustomerSubscription: status updates and cancellation.
  - Customer/Provider/PaymentMethod: not created (GAP).
- `api/checkout/appmax/create`:
  - PaymentTransaction: INSERT early, UPDATE status post payment.
  - Customer/Provider/PaymentMethod: not created (GAP).
- `api/payments/pagarme/webhook`:
  - PaymentTransaction: upsert/update, split application, reconciliation, emails.
  - Customer/Provider/PaymentMethod: backfill attempted via patient/email mapping only for PaymentTransaction; no vault entities.

---

## What’s Missing to Have a Complete Ledger

- **Vault entities for all providers**
  - Persist `Customer` for every successful checkout (derive from buyer email/phone/doc), with `merchantId`.
  - Persist `CustomerProvider` whenever a provider customer is created (Pagar.me/Stripe/Appmax), including `accountId` for Stripe Connect.
  - Persist `CustomerPaymentMethod` when a card is saved/used (brand/last4/exp, provider PM id), linked to `CustomerProvider`.

- **Audit fields**
  - Set `paidAt/capturedAt/refundedAt` consistently in webhooks for KRXPAY/Appmax, not only Stripe.
  - Set `status_v2` transitions on terminals.

- **Linkages**
  - `PaymentTransaction.customerId` should be set whenever we can map an internal `Customer`.
  - For subscription invoices, ensure `customerSubscriptionId` and `billingPeriodStart/End` are set (Stripe already does; add KRXPAY if applicable).

- **Appmax webhooks**
  - Implement a webhook route for Appmax to handle refunds/chargebacks and status transitions; upsert transactions by `provider_order_id`/`provider_charge_id`.

---

## Action Plan (Incremental)

1) KRXPAY subscribe: after `pagarmeCreateCustomer`/card save, create:
   - `Customer` (if missing), `CustomerProvider` (providerCustomerId), `CustomerPaymentMethod` (card_id, brand/last4/exp).
   - Link `customerId`/`customerProviderId`/`customerPaymentMethodId` in the first `payment_transactions` upsert.

2) Stripe PI branch: after creating Stripe Customer/PI, create `Customer` and `CustomerProvider` locally; on `charge.succeeded`, create `CustomerPaymentMethod` if missing.

3) Appmax: after `customersCreate` and tokenization/card payment, create `Customer`/`CustomerProvider`/`CustomerPaymentMethod` and link to `payment_transactions` row.

4) Webhooks:
   - KRXPAY: set `paidAt/capturedAt/refundedAt` and `status_v2`; attempt to link `customerId` via metadata or order payload.
   - Appmax: add webhook handler and normalize status; update audit fields.

5) Subscription invoices:
   - KRXPAY (if using recurring invoices): write `payment_transactions` with `billingPeriodStart/End` and `customerSubscriptionId`.

---

## References (Files)

- Checkout one-time: `src/app/api/checkout/create/route.ts`
- Checkout subscribe (Pagar.me): `src/app/api/checkout/subscribe/route.ts`
- Appmax create: `src/app/api/checkout/appmax/create/route.ts`
- Status normalization: `src/app/api/checkout/status/route.ts`
- Pagar.me webhook: `src/app/api/payments/pagarme/webhook/route.ts`
- Stripe webhook: `src/app/api/stripe/webhook/route.ts`
- Pagar.me SDK helpers: `src/lib/payments/pagarme/sdk.ts`
- Appmax SDK: `src/lib/payments/appmax/sdk.ts`
- Providers (legacy/adapter): `src/lib/providers/pagarme/{legacy.ts,adapter.ts}`

---

## Checklist (when adding/updating a provider)

- [ ] Create/ensure Customer (internal)
- [ ] Create CustomerProvider (provider customer id, account id)
- [ ] Create CustomerPaymentMethod when applicable (card)
- [ ] Insert PaymentTransaction on initiation; update on webhook (status/audit)
- [ ] Set routedProvider and link merchant/clinic/product
- [ ] For subscriptions: insert CustomerSubscription and link invoice transactions
- [ ] Implement webhook with signature verification and idempotency
- [ ] Set status_v2 and audit timestamps consistently
- [ ] Persist split snapshots (clinic/platform amounts/fees) when possible
