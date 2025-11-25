# Trigger.dev Jobs Overview

This document explains all Trigger.dev tasks in this repo: schedules, inputs/outputs, feature flags, and execution flow. File references point to the exact source files.

## Runtime and Conventions

- Trigger SDK: `@trigger.dev/sdk/v3`.
- Jobs are defined in `trigger/`.
- Schedules (cron) run only when a worker is active:
  - Dev: `npx trigger.dev dev` must be running.
  - Staging/Production: the latest deployment must be active.
- Feature flags via env vars gate certain tasks:
  - `TRIGGER_ENABLE_APPMAX` controls Appmax renewal.
  - `TRIGGER_ENABLE_PAGARME_PREPAID` controls Pagar.me prepaid renewal.

---

## Scheduled Jobs

### 1) `daily-billing-renewal`
- File: `trigger/billing-renewal.ts`
- Type: `schedules.task`
- Schedule: `0 9 * * *` (09:00 America/Sao_Paulo)
- Purpose: Find due subscriptions (non-native, managed here) and enqueue provider-specific renewal tasks.
- Flow:
  1. Query `customer_subscriptions` due now (`canceled_at IS NULL`, `is_native = false`, `status IN ('ACTIVE','PAST_DUE')`, `current_period_end <= now`).
  2. Partition by provider:
     - `PAGARME` → enqueue `pagarme-prepaid-renewal` if `TRIGGER_ENABLE_PAGARME_PREPAID === "true"`.
     - `APPMAX` → enqueue `appmax-renewal` if `TRIGGER_ENABLE_APPMAX === "true"`.
  3. Log a summary of queued/failed triggers.
- Inputs to child tasks: `{ subscriptionId }`.
- Output: JSON summary `{ period, pagarme: { queued, failed }, appmax: { queued, failed } }`.

### 2) `billing-scheduler-dry-run`
- File: `trigger/billing-scheduler.ts`
- Type: `schedules.task`
- Schedule: `0 * * * *` (every hour)
- Purpose: DRY-RUN visibility of how many subscriptions would be renewed for each provider without performing any charges.
- Flow:
  1. Count Stripe native and Pagar.me native subscriptions (observability only).
  2. List due Pagar.me prepaid and Appmax subscriptions (non-native) and log which would be renewed.
- Output: JSON summary indicating counts and that it is DRY_RUN.

### 3) `expiring-cards-notifier`
- File: `trigger/expiring-cards-notifier.ts`
- Type: `schedules.task`
- Schedule: `0 10 * * 1` (Mondays 10:00 America/Sao_Paulo)
- Purpose: Detect default payment methods expiring this month or next and plan notifications.
- Flow:
  1. Query `customer_payment_methods` where `status='ACTIVE'`, `is_default=true`, expiring in current or next month; include `customer`.
  2. Log a "Would send email" line per card (no email send implemented here).
- Output: `{ total, planned }`.

---

## Renewal Worker Jobs

### 4) `pagarme-prepaid-renewal`
- File: `trigger/renewal-jobs/pagarme-prepaid.ts`
- Type: `task`
- Retry/Queue: up to 5 attempts (exponential backoff), concurrency 10.
- Triggered by: `daily-billing-renewal` (and can be run manually from Trigger.dev UI/Test).
- Purpose: For non-native Pagar.me subscriptions, create a new order and charge the saved card.
- Preconditions:
  - Feature flag `TRIGGER_ENABLE_PAGARME_PREPAID === "true"`.
  - Subscription is due (`current_period_end <= now`) and not native.
  - Must have Pagar.me identifiers: `pagarmeCustomerId`, saved card id in `customer_payment_methods` (or metadata fallback).
- High-level flow:
  1. Load subscription + customer + default Pagar.me card.
  2. Compute next period (`calculateNextPeriod()`).
  3. Build Pagar.me customer payload (includes document/type/phones) and create order (`pagarmeCreateOrder`).
  4. Inspect order if not paid; log acquirer message/return_code.
  5. Upsert `payment_transactions` with mapping to `status_v2`.
  6. If `paid`, update subscription to `ACTIVE`, roll period forward, mark tx as `SUCCEEDED`, emit `subscription_billed` event.
- Output: `{ success, transactionId, paid }` if processed; `{ skipped: true, reason }` when not applicable.

### 5) `appmax-renewal`
- File: `trigger/renewal-jobs/appmax.ts`
- Type: `task`
- Retry/Queue: up to 5 attempts (exponential backoff), concurrency 10.
- Triggered by: `daily-billing-renewal` (and can be run manually from Trigger.dev UI/Test).
- Purpose: For Appmax subscriptions, create an order and charge the saved card token.
- Preconditions:
  - Feature flag `TRIGGER_ENABLE_APPMAX === "true"`.
  - Subscription is due and has a saved Appmax card (`customer_payment_methods`), and metadata includes `appmaxCustomerId`.
- High-level flow:
  1. Load subscription and check due date.
  2. Normalize subscription metadata to extract interval and `appmaxCustomerId`.
  3. Build Appmax client using `merchant_integrations` (`src/lib/payments/appmax/sdk.ts`).
  4. Create Appmax order with REAIS amounts and `products` array.
  5. Charge with saved token via `paymentsCreditCardNoRetry` and buyer document/name from the unified customer.
  6. Map gateway status → internal status; upsert `payment_transactions` record (id per subscription+period). Update subscription if paid.
- Output: `{ success: true, status }` or `{ skipped: true, reason }`.
- Notes on current error (sandbox): payment step may 500 with "Error Processing from pay_reference ..." when token/document/env mismatch occurs; order creation succeeds.

---

## Shared SDKs and Utilities (used by jobs)

- Appmax SDK: `src/lib/payments/appmax/sdk.ts`
  - Builds base URL from `credentials.testMode`.
  - Auth via header `access-token`.
  - Methods: `customersCreate`, `ordersCreate`, `paymentsCreditCard`, `paymentsCreditCardNoRetry`, `paymentsPix`, `tokenizeCard`, `refund`.
  - Structured request/response logging with sanitized payloads.
- Vault Manager and Gateways: `src/lib/payments/vault/manager.ts`, `src/lib/payments/vault/gateways/*`
  - Standardized save/list/charge APIs for saved cards across providers.

---

## How to Run in Dev

- Start worker: `npx trigger.dev dev`
  - Shows build, local worker version, and each task run with links to logs.
- Use the Trigger.dev dashboard (Test tab) to invoke tasks manually with a payload, e.g.:
  - `pagarme-prepaid-renewal` → `{ "subscriptionId": "..." }`
  - `appmax-renewal` → `{ "subscriptionId": "..." }`

---

## Observability and Diagnostics

- All tasks `console.log` structured payloads. For Appmax, SDK logs `[appmax][request]`, `[appmax][response]`, and `[appmax][error]` with sanitized payloads.
- Renewal jobs persist or upsert `payment_transactions` with `raw_payload` for later forensic analysis.
- Feature flags and skip reasons ensure tasks do not crash when prerequisites are missing.

---

## Quick Reference

- Tasks defined:
  - `daily-billing-renewal` (cron 09:00) → fan-out to provider renewals based on flags.
  - `billing-scheduler-dry-run` (hourly) → observability only.
  - `expiring-cards-notifier` (Mondays 10:00) → plan notifications.
  - `pagarme-prepaid-renewal` (worker) → creates Pagar.me order, charges saved card.
  - `appmax-renewal` (worker) → creates Appmax order, charges saved card token.

- Key tables touched: `customer_subscriptions`, `customer_payment_methods`, `merchant_integrations`, `payment_transactions`.

- Important env flags: `TRIGGER_ENABLE_PAGARME_PREPAID`, `TRIGGER_ENABLE_APPMAX`.
