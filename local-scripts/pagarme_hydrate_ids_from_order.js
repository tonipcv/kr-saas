// Hydrate subscription with Pagarme customerId & cardId from a Core v5 order
// Usage:
//   PAGARME_BASE_URL=https://api.pagar.me/core/v5 \
//   PAGARME_API_KEY=sk_... \
//   ORDER_ID=or_xxx \
//   SUBSCRIPTION_ID=cmid... \
//   node local-scripts/pagarme_hydrate_ids_from_order.js
// Optional:
//   DRY=true (print only)
//   PAGARME_AUTH_SCHEME=basic|bearer (default basic)
//   PAGARME_ACCOUNT_ID=acc_...

const { prisma } = require("../dist/lib/prisma.js");

const BASE_URL = process.env.PAGARME_BASE_URL || "https://api.pagar.me/core/v5";
const API_KEY = process.env.PAGARME_API_KEY || "";
const ORDER_ID = process.env.ORDER_ID || "";
const SUBSCRIPTION_ID = process.env.SUBSCRIPTION_ID || "";
const DRY = String(process.env.DRY || "").toLowerCase() === "true";
const AUTH_SCHEME = (process.env.PAGARME_AUTH_SCHEME || "basic").toLowerCase();
const ACCOUNT_ID = process.env.PAGARME_ACCOUNT_ID || "";

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

async function getOrder(orderId) {
  const res = await fetch(`${BASE_URL}/orders/${encodeURIComponent(orderId)}`, {
    method: "GET",
    headers: authHeaders(),
  });
  const text = await res.text();
  let data = {};
  try { data = JSON.parse(text); } catch {}
  if (!res.ok) {
    console.error("[hydrate][error]", { status: res.status, text });
    throw new Error(`Failed to get order ${orderId}`);
  }
  return data;
}

function extractIds(order) {
  const customerId = order?.customer?.id || order?.charges?.[0]?.customer?.id;
  const lastTr = order?.charges?.[0]?.last_transaction || order?.last_transaction;
  const cardId = lastTr?.card?.id || lastTr?.credit_card?.card?.id || lastTr?.credit_card?.card_id;
  return { customerId, cardId };
}

async function main() {
  if (!ORDER_ID) throw new Error("ORDER_ID is required");
  if (!SUBSCRIPTION_ID) throw new Error("SUBSCRIPTION_ID is required");

  const order = await getOrder(ORDER_ID);
  const { customerId, cardId } = extractIds(order);
  console.log("[hydrate][order]", { orderId: ORDER_ID, customerId, cardId });

  if (!customerId || !cardId) {
    console.error("Could not extract customerId/cardId from order. Aborting.");
    process.exit(1);
  }

  const sub = await prisma.customerSubscription.findUnique({ where: { id: SUBSCRIPTION_ID } });
  if (!sub) throw new Error("Subscription not found");
  const meta = (sub.metadata && typeof sub.metadata === "object") ? sub.metadata : {};
  const newMeta = { ...meta, pagarmeCustomerId: customerId, pagarmeCardId: cardId };

  console.log("[hydrate][write]", { subscriptionId: SUBSCRIPTION_ID, newMeta, DRY });
  if (!DRY) {
    await prisma.customerSubscription.update({ where: { id: SUBSCRIPTION_ID }, data: { metadata: newMeta } });
    console.log("✅ Persisted pagarmeCustomerId & pagarmeCardId into subscription metadata");
  } else {
    console.log("[DRY] Would persist IDs into subscription metadata");
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
