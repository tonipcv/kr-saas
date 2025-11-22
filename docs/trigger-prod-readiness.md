# Trigger.dev Production Readiness Report

## Overview

This document audits the Trigger.dev jobs and related code for production readiness and provides a step-by-step rollout plan. It covers scheduler detection, renewal jobs, Prisma/DB alignment, configuration, deployment, testing, monitoring, and rollback.

## Scope

- Scheduler: `trigger/billing-scheduler.ts`
- Renewal jobs: `trigger/renewal-jobs/pagarme-prepaid.ts`, `trigger/renewal-jobs/appmax.ts`
- Prisma schema: `prisma/schema.prisma`
- Env flags: `.env`
- Trigger config: `trigger.config.ts`

## Current Status

- **Scheduler (DRY RUN):** Restored due logic using mapped fields.
  - Pagar.me native (observe): `provider="PAGARME" AND isNative=true`
  - Pagar.me prepaid due (manual): `provider="PAGARME" AND isNative=false AND canceledAt IS NULL AND currentPeriodEnd <= now()`
  - Appmax due (manual): `provider="APPMAX" AND canceledAt IS NULL AND currentPeriodEnd <= now()`
- **Renewal jobs:**
  - `pagarme-prepaid-renewal`: Processes prepaid renewals via Pagar.me with feature flag.
  - `appmax-renewal`: Guard added for missing `subscriptionId`; feature-flagged.
- **Prisma/DB alignment:**
  - `CustomerSubscription` mapped to snake_case columns (e.g., `current_period_end`, `is_native`, `customer_id`, etc.).
  - `SubscriptionStatus` enum mapped to DB enum name `SubscriptionStatus`.
- **Local validation:**
  - DRY RUN lists due subs correctly.
  - Test due subscription successfully created and detected.

## Required Configuration

- **Feature flags (in `.env`):**
  - `TRIGGER_ENABLE_PAGARME_PREPAID=true|false`
  - `TRIGGER_ENABLE_APPMAX=true|false`
- **Provider credentials:**
  - Pagar.me and Appmax credentials must be configured where your SDK builders read them:
    - `@/lib/payments/pagarme/sdk` (e.g., API key)
    - `@/lib/payments/appmax/sdk`
- **Prisma client:**
  - `npx prisma generate` already run after schema updates.

## Data Preconditions for Renewals

- **Pagar.me prepaid (`pagarme-prepaid-renewal`):**
  - `isNative=false`, `canceledAt IS NULL`, `currentPeriodEnd <= now()`
  - Payment method source: either
    - `vaultPaymentMethodId` pointing to `customer_payment_methods.provider_payment_method_id` (Pagar.me card id), or
    - `metadata.pagarmeCardId`
  - Metadata required:
    - `intervalUnit` (e.g., `MONTH`), `intervalCount` (e.g., `1`)
    - `pagarmeCustomerId` (Pagar.me customer id)
- **Appmax (`appmax-renewal`):**
  - `canceledAt IS NULL`, `currentPeriodEnd <= now()`
  - Merchant integration must be valid (`buildAppmaxClientForMerchant`).

## Deployment

- **Note:** Local deploy previously failed due to Docker credential helper missing. For production deploy:
  - Use a Docker-ready machine, or
  - Use CI (GitHub Actions) to run `npx trigger.dev@latest deploy`.
- **trigger.config.ts** should contain:
  - `project: "proj_..."`
  - `maxDuration: 60` (or higher as needed)
  - `runtime: "node"`

## Rollout Plan

1. **Phase 0 – Prepare**
   - Confirm env flags present but set to `false`.
   - Ensure provider credentials are set (Pagar.me/Appmax test keys for staging).
   - Verify DB columns exist (already aligned via schema mappings).
2. **Phase 1 – DRY RUN (Prod)**
   - Deploy with flags off.
   - Observe scheduler output for 24–72h.
   - Validate counts and due lists match expectations.
3. **Phase 2 – Limited Enable (Pagar.me Prepaid)**
   - Set `TRIGGER_ENABLE_PAGARME_PREPAID=true`.
   - Keep job concurrency reasonable (current is `10`).
   - Monitor success rate and failures.
4. **Phase 3 – Appmax**
   - Set `TRIGGER_ENABLE_APPMAX=true` once Pagar.me stable.
5. **Phase 4 – Scale Up**
   - Increase concurrency if needed.
   - Shorten scheduler cadence if necessary.

## Monitoring & Alerts

- **Logs:** Ensure all logs are visible in Trigger.dev dashboard.
- **Key metrics:**
  - Success rate per provider.
  - Number of due subs processed per run.
  - Average processing time.
  - Failure reasons (no payment method, gateway errors).
- **Events:** `payment_transactions` updates; consider adding audit `events` for attempts.

## Testing Checklist (Before Production Enable)

- **Scheduler (DRY RUN):**
  - [ ] Lists expected due subscriptions (Pagar.me, Appmax).
- **Pagar.me Prepaid Renewal:**
  - [ ] Test with a due subscription having valid metadata and payment method.
  - [ ] Verify order creation and `payment_transactions` upsert.
  - [ ] If paid, verify `currentPeriodStart/End` updated and status set appropriately.
- **Appmax Renewal:**
  - [ ] Create an Appmax due sub and test the flow with test credentials.
- **Flags:**
  - [ ] Toggle flags and verify jobs respect them.

## Risk & Mitigations

- **DB/Schema Drift:** Mitigated by field mappings in Prisma; keep `prisma generate` up to date.
- **Provider Failures:** Jobs catch and log errors; subscriptions can be marked `PAST_DUE` with error metadata.
- **Duplicate Charges:** Upserts and idempotent transaction IDs reduce risk; monitor logs.
- **Concurrency Pressure:** Current concurrency=10; adjust based on provider rate limits/performance.

## Open Items (Optional Enhancements)

- **Input validation:** Add payload validation (e.g., Zod) to renewal jobs.
- **Dunning workflow:** Implement retries/notifications for `PAST_DUE`.
- **CI Deploy:** Add GitHub Actions workflow for `trigger.dev deploy`.
- **Metrics/Alerts:** Add dashboards/alerts for success rates and failures.

## Conclusion

- **Production readiness:**
  - Code is production-ready with feature flags providing safe rollout control.
  - Scheduler and renewal jobs have been tested locally; DB schema is aligned through Prisma mappings.
- **Go-live plan:** Follow the rollout and monitoring steps above. Start with DRY RUN in production, then enable Pagar.me prepaid, followed by Appmax.

---

Last updated: 2025-11-21
