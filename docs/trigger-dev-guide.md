# Trigger.dev Billing Orchestration Guide

This document explains what was implemented, how to run it, how to roll it out safely, and how to troubleshoot.

---

## What Was Implemented

- Files added (non-breaking):
  - `trigger.config.ts`
  - `trigger/billing-scheduler.ts` (DRY RUN scheduler)
  - `trigger/renewal-jobs/pagarme-prepaid.ts` (manual renewal job)
  - `trigger/renewal-jobs/appmax.ts` (manual renewal job)

- Design choices:
  - Uses `@trigger.dev/sdk` v4 CLI with code importing APIs from `@trigger.dev/sdk/v3` (v4-compatible path).
  - Feature-flagged execution so production can start in DRY RUN.
  - Reuses existing integrations and Prisma models.

- Key models leveraged (from `prisma/schema.prisma`):
  - `CustomerSubscription` with `provider`, `isNative`, `status`, `currentPeriodStart|End`, `metadata`.
  - `PaymentTransaction` with `customerSubscriptionId`, `billingPeriodStart|End`, `provider_v2`, `status_v2`, `paymentMethodType`.
  - `WebhookEvent` retry system (future optional drain job).

---

## Environment Variables

Add to `.env` (or your env manager):

```
TRIGGER_API_KEY=tr_pat_or_tr_dev_your_key
TRIGGER_API_URL=https://api.trigger.dev

# Feature flags (start disabled)
TRIGGER_ENABLE_PAGARME_PREPAID=false
TRIGGER_ENABLE_APPMAX=false
TRIGGER_ENABLE_DUNNING=false
TRIGGER_ENABLE_WEBHOOK_DRAIN=false
```

- Project id is set in `trigger.config.ts`: `project: "proj_naaseftufwbqfmmzzdth"`.
- v4 requirement: `maxDuration: 60` is set in `trigger.config.ts`.

---

## How to Run (Local)

1) Ensure packages
```
npm install @trigger.dev/sdk@4 --save-exact
```

2) Login and start dev worker
```
npx trigger.dev@latest dev
```
- This builds a local worker. It will register tasks from the `trigger/` directory.

3) Deploy (when ready)
```
npx trigger.dev@latest deploy
```

---

## What the Scheduler Does (DRY RUN)

File: `trigger/billing-scheduler.ts`
- Runs hourly (`cron: "0 * * * *"`).
- Logs:
  - Stripe native (observe only).
  - Pagar.me native (observe only).
  - Pagar.me prepaid due subscriptions (would renew).
  - Appmax due subscriptions (would renew).
- No charges are triggered while flags are false.

---

## Renewal Jobs (when enabled)

- `trigger/renewal-jobs/pagarme-prepaid.ts`
  - Preconditions: subscription `provider='PAGARME'` and `isNative=false`.
  - Resolves payment method from `vaultPaymentMethodId` or customer default PAGARME method.
  - Computes next period from `metadata.intervalUnit|intervalCount`.
  - Creates Pagar.me order (`pagarmeCreateOrder`), upserts `PaymentTransaction` with `paymentMethodType='subscription_renewal'`.
  - If immediate payment success, updates `CustomerSubscription` to the next period and creates an `Event`.

- `trigger/renewal-jobs/appmax.ts`
  - Preconditions: subscription `provider='APPMAX'`.
  - Builds client via `buildAppmaxClientForMerchant()`.
  - Creates order and attempts charge if token exists in metadata.
  - Creates `PaymentTransaction` and updates subscription status accordingly.

Note: Even when job creates an order, webhooks remain the source of truth to finalize statuses.

---

## Rollout Plan

1) DRY RUN (1 week)
- Keep flags off.
- Monitor runs in Trigger.dev dashboard.

2) Enable Pagar.me Prepaid gradually
- Set `TRIGGER_ENABLE_PAGARME_PREPAID=true`.
- Optionally cap throughput by adjusting query `take` in `billing-scheduler.ts`.
- Monitor success rate, errors, and webhooks.

3) Enable Appmax gradually
- Set `TRIGGER_ENABLE_APPMAX=true`.
- Start with small cap, then scale.

4) Optional: Dunning & Webhook drain
- Add scheduled tasks later if desired (`TRIGGER_ENABLE_DUNNING`, `TRIGGER_ENABLE_WEBHOOK_DRAIN`).

---

## Validation Checklist

- Subscriptions categorized correctly:
  - Stripe / Pagar.me native: observed only.
  - Pagar.me prepaid: `isNative=false`.
  - Appmax: manual.
- Due detection uses `currentPeriodEnd <= now()`.
- Payment method exists for prepaid/Appmax (via `vaultPaymentMethodId` or default method).
- `metadata` includes provider IDs when needed (e.g., `pagarmeCustomerId`, `pagarmeCardId`).
- `PaymentTransaction` records include `billingPeriodStart|End` and `paymentMethodType='subscription_renewal'`.

---

## Troubleshooting

- Project not found
  - Ensure `project` in `trigger.config.ts` is your project id.
  - Ensure you’re logged into the correct org/profile.

- CLI suggests `@trigger.dev/nextjs@4.x`
  - Not needed; we removed that package. Our code doesn’t use it.

- Missing API key
  - Set `TRIGGER_API_KEY` and `TRIGGER_API_URL` envs.

- "No payment method found"
  - Ensure the subscription has a `vaultPaymentMethodId` or the customer has a default method for the provider.

- Provider IDs missing
  - Check `CustomerSubscription.metadata` contains the required external identifiers.

---

## File References

- Config: `trigger.config.ts`
- Scheduler: `trigger/billing-scheduler.ts`
- Pagar.me renewal: `trigger/renewal-jobs/pagarme-prepaid.ts`
- Appmax renewal: `trigger/renewal-jobs/appmax.ts`

---

## Next Actions

- Verify `.env` keys for Trigger.dev.
- Run `npx trigger.dev@latest dev` and check the dashboard.
- Keep feature flags off until DRY RUN results look good.
- Then enable providers gradually and monitor.
