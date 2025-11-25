import {
  prisma,
  task
} from "../../../chunk-Y7OMAXU5.mjs";
import "../../../chunk-C2UOA3RT.mjs";
import {
  __name,
  init_esm
} from "../../../chunk-UMSOOAUP.mjs";

// trigger/renewal-jobs/appmax.ts
init_esm();

// src/lib/payments/appmax/sdk.ts
init_esm();
var AppmaxClient = class {
  static {
    __name(this, "AppmaxClient");
  }
  constructor(apiKey, opts) {
    this.apiKey = (apiKey || "").trim();
    const explicit = opts?.baseURL;
    const test = opts?.testMode === true;
    this.baseURL = explicit || (test ? "https://homolog.sandboxappmax.com.br/api/v3" : "https://admin.appmax.com.br/api/v3");
  }
  async post(path, body, retryAttempts = 2) {
    const url = `${this.baseURL}${path}`;
    const payload = { ...body || {} };
    const headers = {
      "Content-Type": "application/json",
      "access-token": this.apiKey
    };
    const sanitize = /* @__PURE__ */ __name((obj) => {
      try {
        const c = JSON.parse(JSON.stringify(obj || {}));
        if (c && typeof c === "object") {
          if ("access-token" in c) c["access-token"] = "***";
          if (c.payment && c.payment.CreditCard && c.payment.CreditCard.number) c.payment.CreditCard.number = "****";
          if (c.payment && c.payment.pix && c.payment.pix.document_number) c.payment.pix.document_number = "****";
        }
        return c;
      } catch {
        return obj;
      }
    }, "sanitize");
    let lastErr = null;
    for (let attempt = 1; attempt <= Math.max(1, retryAttempts); attempt++) {
      const controller = new AbortController();
      const timeoutMs = 2e4;
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const start = Date.now();
      try {
        const tokenLen = this.apiKey ? this.apiKey.length : 0;
        const tokenPreview = this.apiKey ? `${this.apiKey.slice(0, 8)}...${this.apiKey.slice(-8)}` : "MISSING";
        console.log("[appmax][request]", {
          url,
          path,
          attempt,
          tokenLen,
          tokenPreview,
          headersPresent: Object.keys(headers),
          payload: sanitize(payload)
        });
        const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload), signal: controller.signal });
        const text = await res.text();
        let json = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = { raw: text };
        }
        const durationMs = Date.now() - start;
        console.log("[appmax][response]", { url, path, attempt, status: res.status, durationMs, body: sanitize(json) });
        if (!res.ok) {
          const err = new Error(json?.message || "appmax_error");
          err.status = res.status;
          err.response = json;
          throw err;
        }
        clearTimeout(timer);
        return json;
      } catch (e) {
        clearTimeout(timer);
        lastErr = e;
        const durationMs = Date.now() - start;
        console.error("[appmax][error]", { url, path, attempt, durationMs, message: e?.message, status: e?.status, response: sanitize(e?.response) });
        const retriable = e?.name === "AbortError" || Number(e?.status) >= 500;
        if (attempt < Math.max(1, retryAttempts) && retriable) {
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
        break;
      }
    }
    if (lastErr) throw lastErr;
    throw new Error("appmax_error");
  }
  customersCreate(body) {
    return this.post("/customer", body);
  }
  ordersCreate(body) {
    return this.post("/order", body);
  }
  paymentsCreditCard(body) {
    return this.post("/payment/credit-card", body, 2);
  }
  // Important: avoid automatic retry for payments, as the gateway may cancel the order after a failed attempt
  paymentsCreditCardNoRetry(body) {
    return this.post("/payment/credit-card", body, 1);
  }
  paymentsPix(body) {
    return this.post("/payment/pix", body);
  }
  paymentsBillet(body) {
    return this.post("/payment/billet", body);
  }
  tokenizeCard(body) {
    return this.post("/tokenize/card", body);
  }
  refund(body) {
    return this.post("/refund", body);
  }
};
async function buildAppmaxClientForMerchant(merchantId) {
  const integ = await prisma.merchantIntegration.findUnique({
    where: { merchantId_provider: { merchantId: String(merchantId), provider: "APPMAX" } },
    select: { credentials: true, isActive: true }
  });
  if (!integ || !integ.isActive) throw new Error("appmax_integration_inactive");
  const creds = integ.credentials || {};
  const apiKey = creds?.apiKey;
  const testMode = !!creds?.testMode;
  if (!apiKey) throw new Error("appmax_api_key_missing");
  return new AppmaxClient(apiKey, { testMode });
}
__name(buildAppmaxClientForMerchant, "buildAppmaxClientForMerchant");

// trigger/renewal-jobs/appmax.ts
var appmaxRenewal = task({
  id: "appmax-renewal",
  retry: { maxAttempts: 5, minTimeoutInMs: 2e3, maxTimeoutInMs: 6e4, factor: 2 },
  queue: { concurrencyLimit: 10 },
  run: /* @__PURE__ */ __name(async (payload) => {
    const { subscriptionId } = payload;
    console.log(`🔄 Processing Appmax renewal for subscription: ${subscriptionId}`);
    if (!subscriptionId) {
      console.warn("⚠️  Missing subscriptionId in payload. Skipping Appmax renewal.");
      return { skipped: true, reason: "missing_subscription_id" };
    }
    if (process.env.TRIGGER_ENABLE_APPMAX !== "true") {
      console.log("⚠️  Feature disabled: TRIGGER_ENABLE_APPMAX");
      return { skipped: true, reason: "feature_disabled" };
    }
    const subscription = await prisma.customerSubscription.findUnique({
      where: { id: subscriptionId },
      include: { customer: true }
    });
    if (!subscription) throw new Error(`Subscription ${subscriptionId} not found`);
    if (!subscription.currentPeriodEnd) return { skipped: true, reason: "missing_current_period" };
    if (subscription.currentPeriodEnd > /* @__PURE__ */ new Date()) return { skipped: true, reason: "not_due" };
    const normalizeMeta = /* @__PURE__ */ __name((m) => {
      if (!m || typeof m !== "object") return {};
      let node = m;
      let extras = {};
      while (node && typeof node === "object" && node.set && typeof node.set === "object") {
        const { set, ...rest } = node;
        extras = { ...rest, ...extras };
        node = set;
      }
      const leaf = node && typeof node === "object" ? node : {};
      return { ...leaf, ...extras };
    }, "normalizeMeta");
    const meta = normalizeMeta(subscription.metadata || {});
    const intervalUnit = meta.intervalUnit || "MONTH";
    const intervalCount = Number(meta.intervalCount || 1);
    const nextPeriodStart = subscription.currentPeriodEnd;
    const nextPeriodEnd = calculateNextPeriod(nextPeriodStart, intervalUnit, intervalCount);
    const client = await buildAppmaxClientForMerchant(subscription.merchantId);
    const paymentMethod = await prisma.customerPaymentMethod.findFirst({
      where: {
        customerId: subscription.customerId,
        provider: "APPMAX",
        status: "ACTIVE"
      },
      orderBy: { isDefault: "desc" }
    });
    if (!paymentMethod?.providerPaymentMethodId) {
      console.warn("⚠️  No saved Appmax card found for customer");
      return { skipped: true, reason: "no_payment_method" };
    }
    const appmaxCardToken = paymentMethod.providerPaymentMethodId;
    const metaCustomerId = meta.appmaxCustomerId;
    if (!metaCustomerId) {
      console.warn("⚠️  Missing appmaxCustomerId in metadata. Skipping Appmax renewal.");
      return { skipped: true, reason: "missing_appmax_customer_id" };
    }
    const totalReais = Number((subscription.priceCents / 100).toFixed(2));
    const shippingReais = 0;
    const orderPayload = {
      total: totalReais,
      // AppMax expects REAIS (Decimal 10,2)
      products: [
        {
          sku: String(subscription.productId || subscription.id || "subscription"),
          name: `Renovação ${subscription.productId || "subscription"}`,
          qty: 1,
          price: totalReais
          // Price in REAIS
        }
      ],
      shipping: shippingReais,
      // Number (not object)
      discount: 0,
      customer_id: Number(metaCustomerId),
      // Appmax expects numeric customer_id
      freight_type: "PAC",
      // Required string
      digital_product: 1
      // Subscription is digital
    };
    console.log("[appmax][order][payload]", orderPayload);
    let order = null;
    try {
      order = await client.ordersCreate(orderPayload);
    } catch (e) {
      console.error("❌ Appmax order creation failed", {
        message: e?.message,
        status: e?.status,
        response: e?.response
      });
      throw e;
    }
    const orderId = Number(order?.data?.id ?? order?.id ?? order?.order_id ?? NaN) || null;
    let paymentResp = null;
    try {
      const buyerDoc = String(subscription.customer?.document || "").toString().replace(/\D+/g, "").slice(0, 14);
      const buyerName = String(subscription.customer?.name || "Cliente");
      const payPayload = {
        cart: { order_id: orderId },
        customer: { customer_id: Number(metaCustomerId) },
        payment: {
          CreditCard: {
            token: appmaxCardToken,
            installments: 1,
            soft_descriptor: "KRXLABS",
            document_number: buyerDoc,
            name: buyerName
          }
        }
      };
      paymentResp = await client.paymentsCreditCardNoRetry(payPayload);
    } catch (e) {
      console.error("❌ Appmax payment error", { message: e?.message, status: e?.status });
    }
    const mappedStatus = (() => {
      const s = String(paymentResp?.status || paymentResp?.data?.status || "").toLowerCase();
      const txt = String(paymentResp?.text || paymentResp?.data?.text || "").toLowerCase();
      if (s.includes("aprov")) return "paid";
      if (s.includes("autor")) return "authorized";
      if (s.includes("pend")) return "pending";
      if (txt.includes("captur") || txt.includes("autoriz") && txt.includes("sucesso")) return "paid";
      return "processing";
    })();
    const periodKey = `${nextPeriodStart.getUTCFullYear()}${String(nextPeriodStart.getUTCMonth() + 1).padStart(2, "0")}`;
    const txId = `tx_appmax_${subscriptionId}_${periodKey}`;
    const providerOrderIdStr = orderId ? String(orderId) : null;
    const providerChargeIdStr = paymentResp?.id ? String(paymentResp.id) : null;
    let txIdToUse = txId;
    if (providerChargeIdStr) {
      const existing = await prisma.paymentTransaction.findFirst({
        where: { provider: "appmax", providerChargeId: providerChargeIdStr },
        select: { id: true }
      });
      if (existing?.id && existing.id !== txIdToUse) {
        txIdToUse = existing.id;
      }
    }
    await prisma.paymentTransaction.upsert({
      where: { id: txIdToUse },
      create: {
        id: txIdToUse,
        provider: "appmax",
        provider_v2: "APPMAX",
        providerOrderId: providerOrderIdStr,
        ...providerChargeIdStr ? { providerChargeId: providerChargeIdStr } : {},
        merchantId: subscription.merchantId,
        customerId: subscription.customerId,
        customerSubscriptionId: subscription.id,
        productId: subscription.productId,
        amountCents: subscription.priceCents,
        currency: String(subscription.currency).toLowerCase(),
        status: mappedStatus,
        status_v2: mapStatus(mappedStatus),
        paymentMethodType: "subscription_renewal",
        billingPeriodStart: nextPeriodStart,
        billingPeriodEnd: nextPeriodEnd,
        rawPayload: { order, paymentResp }
      },
      update: {
        providerOrderId: providerOrderIdStr,
        ...providerChargeIdStr ? { providerChargeId: providerChargeIdStr } : {},
        status: mappedStatus,
        status_v2: mapStatus(mappedStatus),
        rawPayload: { order, paymentResp }
      }
    });
    if (mappedStatus === "paid" || mappedStatus === "completed" || mappedStatus === "approved") {
      await prisma.customerSubscription.update({
        where: { id: subscriptionId },
        data: {
          status: "ACTIVE",
          currentPeriodStart: nextPeriodStart,
          currentPeriodEnd: nextPeriodEnd
        }
      });
    } else if (mappedStatus === "failed" || mappedStatus === "rejected") {
      await prisma.customerSubscription.update({
        where: { id: subscriptionId },
        data: {
          status: "PAST_DUE",
          metadata: {
            ...subscription.metadata,
            lastRenewalError: `appmax_status_${mappedStatus}`,
            lastRenewalAttempt: (/* @__PURE__ */ new Date()).toISOString()
          }
        }
      });
    }
    console.log(`✅ Renewal processed (Appmax)`, { subscriptionId, status: mappedStatus });
    return { success: true, status: mappedStatus };
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
function mapStatus(status) {
  const map = {
    paid: "SUCCEEDED",
    approved: "SUCCEEDED",
    completed: "SUCCEEDED",
    processing: "PROCESSING",
    pending: "PROCESSING",
    failed: "FAILED",
    rejected: "FAILED",
    canceled: "CANCELED",
    refunded: "REFUNDED"
  };
  return status ? map[status] || "PROCESSING" : "PROCESSING";
}
__name(mapStatus, "mapStatus");
export {
  appmaxRenewal
};
//# sourceMappingURL=appmax.mjs.map
