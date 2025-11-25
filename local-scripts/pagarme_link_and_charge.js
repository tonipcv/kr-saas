// Create a one-off Pagar.me order/charge for due subscriptions (or a specific one)
// Usage examples:
//   PAGARME_API_KEY=xxx node local-scripts/pagarme_link_and_charge.js
//   PAGARME_API_KEY=xxx TARGET_SUBSCRIPTION_ID=cmid... node local-scripts/pagarme_link_and_charge.js
// Optional envs:
//   PAGARME_BASE_URL (default: https://api.pagar.me/core/v5)
//   PAGARME_AUTH_SCHEME=basic|bearer (default: basic)
//   DRY=true (only prints actions, no writes)

const { prisma } = require("../dist/lib/prisma.js");

// Align default with project SDK default (v1). Override via PAGARME_BASE_URL if you use Core v5
const BASE_URL = process.env.PAGARME_BASE_URL || "https://api.pagar.me/1";
const API_KEY = process.env.PAGARME_API_KEY || "";
const AUTH_SCHEME = (process.env.PAGARME_AUTH_SCHEME || "basic").toLowerCase();
const ACCOUNT_ID = process.env.PAGARME_ACCOUNT_ID || "";
const TARGET_SUBSCRIPTION_ID = process.env.TARGET_SUBSCRIPTION_ID || "";
const DRY = String(process.env.DRY || "").toLowerCase() === "true";
const PREPARE_ONLY = String(process.env.PREPARE_ONLY || "").toLowerCase() === "true";
// Fallback identifiers provided by the operator
const DEFAULT_CUSTOMER_ID = process.env.PAGARME_DEFAULT_CUSTOMER_ID || process.env.PAGARME_CUSTOMER_ID || "";
const DEFAULT_CARD_ID = process.env.PAGARME_DEFAULT_CARD_ID || process.env.PAGARME_CARD_ID || "";
// Optional customer overrides
const OV_NAME = process.env.P_CUSTOMER_NAME || process.env.PAGARME_CUSTOMER_NAME || "";
const OV_EMAIL = process.env.P_CUSTOMER_EMAIL || process.env.PAGARME_CUSTOMER_EMAIL || "";
const OV_DOCUMENT = process.env.P_CUSTOMER_DOCUMENT || process.env.PAGARME_CUSTOMER_DOCUMENT || ""; // CPF/CNPJ
const OV_PHONE = process.env.P_CUSTOMER_PHONE || process.env.PAGARME_CUSTOMER_PHONE || ""; // e.g. +55 (11) 99999-9999
// Optional raw card overrides
const RAW_CARD_NUMBER = process.env.PAGARME_CARD_NUMBER || "";
const RAW_CARD_HOLDER = process.env.PAGARME_CARD_HOLDER || OV_NAME || "Cliente";
const RAW_CARD_EXP_MONTH = process.env.PAGARME_CARD_EXP_MONTH || "12";
const RAW_CARD_EXP_YEAR = process.env.PAGARME_CARD_EXP_YEAR || "2030";
const RAW_CARD_CVV = process.env.PAGARME_CARD_CVV || "123";

function authHeaders() {
  if (!API_KEY) throw new Error("PAGARME_API_KEY is required");
  if (AUTH_SCHEME === "bearer") {
    const h = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
    if (ACCOUNT_ID) h["X-PagarMe-Account-Id"] = ACCOUNT_ID;
    return h;
  }
  const token = Buffer.from(`${API_KEY}:`).toString("base64");
  const h = { Authorization: `Basic ${token}`, "Content-Type": "application/json" };
  if (ACCOUNT_ID) h["X-PagarMe-Account-Id"] = ACCOUNT_ID;
  return h;
}

function parsePhone(raw) {
  if (!raw) return undefined;
  const digits = String(raw).replace(/\D+/g, "");
  // Expect country(2) + area(2) + number(rest)
  if (digits.length < 8) return undefined;
  let country = "55";
  let area = "11";
  let number = digits;
  if (digits.length >= 12) {
    country = digits.slice(0, 2);
    area = digits.slice(2, 4);
    number = digits.slice(4);
  } else if (digits.length >= 10) {
    area = digits.slice(0, 2);
    number = digits.slice(2);
  }
  return { country_code: country, area_code: area, number };
}

async function pagarmeCreateOrder(payload) {
  const url = `${BASE_URL}/orders`;
  const res = await fetch(url, { method: "POST", headers: authHeaders(), body: JSON.stringify(payload) });
  const text = await res.text();
  let data = {};
  try { data = JSON.parse(text); } catch {}
  if (!res.ok) {
    const msgFromArray = Array.isArray(data?.errors)
      ? data.errors.map((e) => e?.message || e?.code || JSON.stringify(e)).join(" | ")
      : undefined;
    const msg = msgFromArray || data?.message || data?.error || text || `Pagarme error ${res.status}`;
    const err = new Error(`[Pagarme ${res.status}] ${msg}`);
    err.status = res.status; err.responseText = text; err.responseJson = data;
    throw err;
  }
  return data;
}

function mapPagarmeStatus(status) {
  const map = { paid: "SUCCEEDED", pending: "PROCESSING", processing: "PROCESSING", canceled: "CANCELED", failed: "FAILED", refunded: "REFUNDED" };
  return status ? map[status] || "PROCESSING" : "PROCESSING";
}

function calculateNextPeriod(current, unit, count) {
  const next = new Date(current);
  switch (unit) {
    case "DAY": next.setDate(next.getDate() + count); break;
    case "WEEK": next.setDate(next.getDate() + count * 7); break;
    case "MONTH": next.setMonth(next.getMonth() + count); break;
    case "YEAR": next.setFullYear(next.getFullYear() + count); break;
  }
  return next;
}

async function selectTargets() {
  if (TARGET_SUBSCRIPTION_ID) {
    const sub = await prisma.customerSubscription.findUnique({
      where: { id: TARGET_SUBSCRIPTION_ID },
      include: { customer: { include: { paymentMethods: { where: { provider: "PAGARME" }, orderBy: { isDefault: "desc" }, take: 1 } } } },
    });
    return sub ? [sub] : [];
  }
  const now = new Date();
  // Find due non-native subscriptions with a Pagarme payment method
  return prisma.customerSubscription.findMany({
    where: { isNative: false, canceledAt: null, currentPeriodEnd: { lte: now } },
    include: { customer: { include: { paymentMethods: { where: { provider: "PAGARME" }, orderBy: { isDefault: "desc" }, take: 1 } } } },
    orderBy: { currentPeriodEnd: "asc" },
    take: 20,
  });
}

async function processSubscription(subscription) {
  console.log("\n[subs] Processing:", subscription.id);
  const meta = (subscription.metadata && typeof subscription.metadata === "object") ? subscription.metadata : {};
  let pagarmeCustomerId = meta.pagarmeCustomerId;
  const pm = subscription.customer?.paymentMethods?.[0] || null;
  let pagarmeCardId = pm?.providerPaymentMethodId || meta.pagarmeCardId;

  // If missing, try to hydrate from fallback envs
  if (!pagarmeCustomerId && DEFAULT_CUSTOMER_ID) pagarmeCustomerId = DEFAULT_CUSTOMER_ID;
  if (!pagarmeCardId && DEFAULT_CARD_ID) pagarmeCardId = DEFAULT_CARD_ID;

  if (!pagarmeCustomerId || !pagarmeCardId) {
    console.log("⚠️ Missing pagarme ids:", { pagarmeCustomerId, pagarmeCardId });
    if (!DRY && (DEFAULT_CUSTOMER_ID || DEFAULT_CARD_ID)) {
      const newMeta = { ...(meta || {}) };
      if (DEFAULT_CUSTOMER_ID) newMeta.pagarmeCustomerId = DEFAULT_CUSTOMER_ID;
      if (DEFAULT_CARD_ID) newMeta.pagarmeCardId = DEFAULT_CARD_ID;
      await prisma.customerSubscription.update({ where: { id: subscription.id }, data: { metadata: newMeta } });
      console.log("✅ Injected fallback pagarme ids into subscription metadata");
      // Reflect in local vars after write
      pagarmeCustomerId = newMeta.pagarmeCustomerId;
      pagarmeCardId = newMeta.pagarmeCardId;
    }
  }

  // Re-check after potential injection, allowing raw card path
  const usingRawCard = !!RAW_CARD_NUMBER;
  const hasCardRef = usingRawCard || !!pagarmeCardId;
  const hasCustomerRefOrData = !!pagarmeCustomerId || !!OV_NAME || !!OV_EMAIL || !!OV_DOCUMENT;
  if (!hasCardRef || !hasCustomerRefOrData) {
    console.log("⚠️ Still missing required payment/customer data", { usingRawCard, pagarmeCardId, pagarmeCustomerId, OV_NAME, OV_EMAIL, OV_DOCUMENT });
    if (!DRY) {
      await prisma.customerSubscription.update({
        where: { id: subscription.id },
        data: { status: "PAST_DUE", metadata: { ...(meta || {}), lastRenewalError: "missing_pagarme_ids", lastRenewalAttempt: new Date().toISOString() } },
      });
    }
    return { skipped: true, reason: "missing_ids" };
  }

  // If only preparing (no charge), require explicit customerId & cardId and save to metadata, then exit
  if (PREPARE_ONLY) {
    if (!pagarmeCustomerId || !pagarmeCardId) {
      console.log("❌ PREPARE_ONLY requires PAGARME_CUSTOMER_ID and PAGARME_CARD_ID to persist in metadata");
      return { skipped: true, reason: "prepare_requires_ids" };
    }
    if (!DRY) {
      const newMeta = { ...(meta || {}), pagarmeCustomerId: pagarmeCustomerId, pagarmeCardId: pagarmeCardId };
      await prisma.customerSubscription.update({ where: { id: subscription.id }, data: { metadata: newMeta } });
      console.log("✅ Prepared subscription with Pagarme IDs only (no charge)", { subscriptionId: subscription.id });
    } else {
      console.log("[DRY] Would prepare subscription with Pagarme IDs only (no charge)", { subscriptionId: subscription.id, pagarmeCustomerId, pagarmeCardId });
    }
    return { prepared: true };
  }

  const intervalUnit = meta.intervalUnit || "MONTH";
  const intervalCount = Number(meta.intervalCount || 1);
  const nextPeriodStart = subscription.currentPeriodEnd;
  const nextPeriodEnd = calculateNextPeriod(new Date(nextPeriodStart), intervalUnit, intervalCount);

  const inferredDoc = (subscription.customer?.document || "").replace(/\D+/g, "");
  const document = (OV_DOCUMENT || inferredDoc) || undefined;
  const docType = document && document.length > 11 ? "company" : (document ? "individual" : undefined);
  const phoneRaw = OV_PHONE || subscription.customer?.telephone || "";
  const mobile_phone = parsePhone(phoneRaw);

  const customerPayload = {
    // Only send id if available; Core v5 accepts full customer object without id
    ...(pagarmeCustomerId ? { id: pagarmeCustomerId } : {}),
    name: OV_NAME || subscription.customer?.name || "Cliente",
    email: OV_EMAIL || subscription.customer?.email || undefined,
    document,
    type: docType,
    phones: mobile_phone ? { mobile_phone } : undefined,
  };

  const creditCard = RAW_CARD_NUMBER
    ? { card: { number: RAW_CARD_NUMBER, holder_name: RAW_CARD_HOLDER, exp_month: RAW_CARD_EXP_MONTH, exp_year: RAW_CARD_EXP_YEAR, cvv: RAW_CARD_CVV } }
    : { card_id: pagarmeCardId };

  const payload = {
    customer: customerPayload,
    items: [ { amount: subscription.priceCents, description: `Renovação ${subscription.productId || "subscription"}`, quantity: 1, code: subscription.productId || "subscription" } ],
    payments: [ { payment_method: "credit_card", credit_card: { ...creditCard, installments: 1, capture: true } } ],
    currency: "BRL",
    metadata: { type: "subscription_renewal", subscriptionId: subscription.id, billingCycle: "renewal", periodStart: new Date(nextPeriodStart).toISOString(), periodEnd: nextPeriodEnd.toISOString() },
  };

  console.log("[pagarme][request]", { url: `${BASE_URL}/orders`, payload });
  let order;
  try {
    order = await pagarmeCreateOrder(payload);
  } catch (e) {
    console.error("[pagarme][error]", {
      status: e?.status,
      message: e?.message,
      responseJson: e?.responseJson,
      responseText: e?.responseText,
    });
    throw e;
  }
  console.log("[pagarme][response]", { status: order?.status, id: order?.id });

  if (DRY) return { dry: true, order };

  const txId = `tx_pagarme_${order.id}`;
  await prisma.paymentTransaction.upsert({
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
      billingPeriodStart: new Date(nextPeriodStart),
      billingPeriodEnd: nextPeriodEnd,
      rawPayload: order,
    },
    update: {
      status: order.status || "processing",
      status_v2: mapPagarmeStatus(order.status),
      rawPayload: order,
    },
  });

  if (order.status === "paid") {
    await prisma.customerSubscription.update({
      where: { id: subscription.id },
      data: { status: "ACTIVE", currentPeriodStart: new Date(nextPeriodStart), currentPeriodEnd: nextPeriodEnd },
    });
  }

  console.log("✅ Done", { subscriptionId: subscription.id, orderId: order.id, paid: order.status === "paid" });
  return { success: true, orderId: order.id, paid: order.status === "paid" };
}

async function main() {
  try {
    if (!API_KEY) throw new Error("PAGARME_API_KEY is required");
    const targets = await selectTargets();
    if (!targets.length) {
      console.log("No matching subscriptions.");
      return;
    }

    for (const sub of targets) {
      try {
        await processSubscription(sub);
      } catch (e) {
        console.error("❌ Error processing", sub.id, e?.message || e);
      }
    }
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
