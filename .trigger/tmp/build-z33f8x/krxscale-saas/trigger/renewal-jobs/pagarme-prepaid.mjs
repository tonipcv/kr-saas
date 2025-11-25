import {
  prisma,
  task
} from "../../../chunk-Y7OMAXU5.mjs";
import "../../../chunk-C2UOA3RT.mjs";
import {
  __name,
  init_esm
} from "../../../chunk-UMSOOAUP.mjs";

// trigger/renewal-jobs/pagarme-prepaid.ts
init_esm();

// src/lib/payments/pagarme/sdk.ts
init_esm();
var PAGARME_API_KEY = process.env.PAGARME_API_KEY || "";
var PAGARME_BASE_URL = process.env.PAGARME_BASE_URL || "https://api.pagar.me/1";
var PAGARME_WEBHOOK_SECRET = process.env.PAGARME_WEBHOOK_SECRET || "";
var IS_V5 = PAGARME_BASE_URL.includes("/core/v5");
var AUTH_SCHEME = (process.env.PAGARME_AUTH_SCHEME || "basic").toLowerCase();
var PAGARME_ACCOUNT_ID = process.env.PAGARME_ACCOUNT_ID || "";
async function pagarmeGetOrder(orderId) {
  const res = await fetch(`${PAGARME_BASE_URL}/orders/${encodeURIComponent(orderId)}`, {
    method: "GET",
    headers: authHeaders(),
    cache: "no-store"
  });
  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
  }
  if (!res.ok) {
    const msgFromArray = Array.isArray(data?.errors) ? data.errors.map((e) => e?.message || e?.code || JSON.stringify(e)).join(" | ") : void 0;
    const msg = msgFromArray || data?.message || data?.error || text || `Pagarme error ${res.status}`;
    const err = new Error(`[Pagarme ${res.status}] ${msg}`);
    err.status = res.status;
    err.responseText = text;
    err.responseJson = data;
    throw err;
  }
  return data;
}
__name(pagarmeGetOrder, "pagarmeGetOrder");
function authHeaders() {
  if (AUTH_SCHEME === "bearer") {
    const h2 = {
      Authorization: `Bearer ${PAGARME_API_KEY}`,
      "Content-Type": "application/json"
    };
    if (PAGARME_ACCOUNT_ID) h2["X-PagarMe-Account-Id"] = PAGARME_ACCOUNT_ID;
    return h2;
  }
  const token = Buffer.from(`${PAGARME_API_KEY}:`).toString("base64");
  const h = {
    Authorization: `Basic ${token}`,
    "Content-Type": "application/json"
  };
  if (PAGARME_ACCOUNT_ID) h["X-PagarMe-Account-Id"] = PAGARME_ACCOUNT_ID;
  return h;
}
__name(authHeaders, "authHeaders");
async function pagarmeCreateOrder(payload) {
  const res = await fetch(`${PAGARME_BASE_URL}/orders`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
    cache: "no-store"
  });
  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
  }
  if (!res.ok) {
    const msgFromArray = Array.isArray(data?.errors) ? data.errors.map((e) => e?.message || e?.code || JSON.stringify(e)).join(" | ") : void 0;
    const msg = msgFromArray || data?.message || data?.error || text || `Pagarme error ${res.status}`;
    const err = new Error(`[Pagarme ${res.status}] ${msg}`);
    err.status = res.status;
    err.responseText = text;
    err.responseJson = data;
    throw err;
  }
  return data;
}
__name(pagarmeCreateOrder, "pagarmeCreateOrder");

// trigger/renewal-jobs/pagarme-prepaid.ts
var pagarmePrepaidRenewal = task({
  id: "pagarme-prepaid-renewal",
  retry: { maxAttempts: 5, minTimeoutInMs: 2e3, maxTimeoutInMs: 6e4, factor: 2 },
  queue: { concurrencyLimit: 10 },
  run: /* @__PURE__ */ __name(async (payload) => {
    const { subscriptionId } = payload;
    console.log(`🔄 Processing Pagar.me prepaid renewal for subscription: ${subscriptionId}`);
    if (process.env.TRIGGER_ENABLE_PAGARME_PREPAID !== "true") {
      console.log("⚠️  Feature disabled: TRIGGER_ENABLE_PAGARME_PREPAID");
      return { skipped: true, reason: "feature_disabled" };
    }
    const subscription = await prisma.customerSubscription.findUnique({
      where: { id: subscriptionId },
      include: {
        customer: {
          include: {
            paymentMethods: {
              where: { provider: "PAGARME" },
              orderBy: { isDefault: "desc" },
              take: 1
            }
          }
        }
      }
    });
    if (!subscription) throw new Error(`Subscription ${subscriptionId} not found`);
    if (!subscription.currentPeriodEnd) return { skipped: true, reason: "missing_current_period" };
    if (subscription.currentPeriodEnd > /* @__PURE__ */ new Date()) {
      return { skipped: true, reason: "not_due" };
    }
    if (!subscription.isNative) {
      const paymentMethod = subscription.vaultPaymentMethodId ? await prisma.customerPaymentMethod.findUnique({ where: { id: subscription.vaultPaymentMethodId } }) : subscription.customer.paymentMethods?.[0];
      if (!paymentMethod) {
        await prisma.customerSubscription.update({
          where: { id: subscriptionId },
          data: {
            status: "PAST_DUE",
            metadata: {
              ...subscription.metadata,
              lastRenewalError: "no_payment_method",
              lastRenewalAttempt: (/* @__PURE__ */ new Date()).toISOString()
            }
          }
        });
        throw new Error("No payment method found");
      }
      const meta = subscription.metadata || {};
      const intervalUnit = meta.intervalUnit || "MONTH";
      const intervalCount = Number(meta.intervalCount || 1);
      const nextPeriodStart = subscription.currentPeriodEnd;
      const nextPeriodEnd = calculateNextPeriod(nextPeriodStart, intervalUnit, intervalCount);
      const pagarmeCustomerId = meta.pagarmeCustomerId;
      const pagarmeCardId = paymentMethod.providerPaymentMethodId || meta.pagarmeCardId;
      if (!pagarmeCustomerId || !pagarmeCardId) throw new Error("Missing Pagar.me identifiers in metadata/payment method");
      const customerDoc = String(subscription.customer?.document || "").replace(/\D+/g, "");
      const customerType = customerDoc && customerDoc.length > 11 ? "company" : customerDoc ? "individual" : void 0;
      const phoneRaw = String(subscription.customer?.telephone || "");
      const phoneDigits = phoneRaw.replace(/\D+/g, "");
      const mobile_phone = phoneDigits.length >= 10 ? {
        country_code: phoneDigits.length >= 12 ? phoneDigits.slice(0, 2) : "55",
        area_code: phoneDigits.length >= 12 ? phoneDigits.slice(2, 4) : phoneDigits.slice(0, 2),
        number: phoneDigits.length >= 12 ? phoneDigits.slice(4) : phoneDigits.slice(2)
      } : void 0;
      const customerPayload = {
        id: pagarmeCustomerId,
        name: subscription.customer?.name || "Cliente",
        email: subscription.customer?.email || void 0,
        document: customerDoc || void 0,
        type: customerType,
        phones: mobile_phone ? { mobile_phone } : void 0
      };
      const order = await pagarmeCreateOrder({
        customer: customerPayload,
        items: [
          {
            amount: subscription.priceCents,
            description: `Renovação ${subscription.productId || "subscription"}`,
            quantity: 1,
            code: subscription.productId || "subscription"
          }
        ],
        payments: [
          {
            payment_method: "credit_card",
            credit_card: { card_id: pagarmeCardId, installments: 1, capture: true }
          }
        ],
        currency: "BRL",
        metadata: {
          type: "subscription_renewal",
          subscriptionId: subscription.id,
          billingCycle: "renewal",
          periodStart: nextPeriodStart.toISOString(),
          periodEnd: nextPeriodEnd.toISOString()
        }
      });
      try {
        if (order?.status !== "paid") {
          const inspected = await pagarmeGetOrder(order.id).catch(() => order);
          const ch = Array.isArray(inspected?.charges) ? inspected.charges[0] : null;
          const tx = ch?.last_transaction || (Array.isArray(inspected?.payments) ? inspected.payments?.[0]?.last_transaction : null) || null;
          const summary = tx ? {
            tx_status: tx?.status,
            acquirer_message: tx?.acquirer_message,
            acquirer_return_code: tx?.acquirer_return_code,
            code: tx?.code,
            message: tx?.message
          } : { no_transaction: true };
          console.log("[pagarme-prepaid][order inspection]", {
            order_id: order?.id,
            order_status: order?.status,
            charge_status: ch?.status,
            last_transaction: summary
          });
        }
      } catch {
      }
      const txId = `tx_pagarme_${order.id}`;
      const transaction = await prisma.paymentTransaction.upsert({
        where: { id: txId },
        create: {
          id: txId,
          provider: "pagarme",
          provider_v2: "PAGARME",
          providerOrderId: order.id,
          merchantId: subscription.merchantId,
          customerId: subscription.customerId,
          customerSubscriptionId: subscription.id,
          productId: subscription.productId,
          amountCents: subscription.priceCents,
          currency: String(subscription.currency).toLowerCase(),
          status: order.status || "processing",
          status_v2: mapPagarmeStatus(order.status),
          paymentMethodType: "subscription_renewal",
          billingPeriodStart: nextPeriodStart,
          billingPeriodEnd: nextPeriodEnd,
          rawPayload: order
        },
        update: {
          status: order.status || "processing",
          status_v2: mapPagarmeStatus(order.status),
          rawPayload: order
        }
      });
      if (order.status === "paid") {
        await prisma.$transaction([
          prisma.customerSubscription.update({
            where: { id: subscriptionId },
            data: {
              status: "ACTIVE",
              currentPeriodStart: nextPeriodStart,
              currentPeriodEnd: nextPeriodEnd
            }
          }),
          prisma.paymentTransaction.update({
            where: { id: txId },
            data: {
              status: "paid",
              status_v2: "SUCCEEDED",
              paidAt: /* @__PURE__ */ new Date(),
              capturedAt: /* @__PURE__ */ new Date()
            }
          }),
          prisma.event.create({
            data: {
              eventType: "subscription_billed",
              clinicId: subscription.merchantId,
              customerId: subscription.customerId,
              actor: "system",
              metadata: {
                subscriptionId: subscription.id,
                transactionId: transaction.id,
                amount: subscription.priceCents,
                provider: "PAGARME",
                type: "prepaid_renewal"
              }
            }
          })
        ]);
      }
      console.log(`✅ Renewal processed (Pagar.me prepaid)`, {
        subscriptionId: subscription.id,
        transactionId: txId,
        paid: order.status === "paid"
      });
      return { success: true, transactionId: txId, paid: order.status === "paid" };
    }
    return { skipped: true, reason: "native_subscription" };
  }, "run")
});
function calculateNextPeriod(current, unit, count) {
  const next = new Date(current);
  switch (unit) {
    case "DAY":
      next.setDate(next.getDate() + count);
      break;
    case "WEEK":
      next.setDate(next.getDate() + count * 7);
      break;
    case "MONTH":
      next.setMonth(next.getMonth() + count);
      break;
    case "YEAR":
      next.setFullYear(next.getFullYear() + count);
      break;
  }
  return next;
}
__name(calculateNextPeriod, "calculateNextPeriod");
function mapPagarmeStatus(status) {
  const map = {
    paid: "SUCCEEDED",
    pending: "PROCESSING",
    processing: "PROCESSING",
    canceled: "CANCELED",
    failed: "FAILED",
    refunded: "REFUNDED"
  };
  return status ? map[status] || "PROCESSING" : "PROCESSING";
}
__name(mapPagarmeStatus, "mapPagarmeStatus");
export {
  pagarmePrepaidRenewal
};
//# sourceMappingURL=pagarme-prepaid.mjs.map
