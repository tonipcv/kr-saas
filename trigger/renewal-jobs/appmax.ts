import { task } from "@trigger.dev/sdk/v3";
import { prisma } from "@/lib/prisma";
import { buildAppmaxClientForMerchant } from "@/lib/payments/appmax/sdk";

export const appmaxRenewal = task({
  id: "appmax-renewal",
  retry: { maxAttempts: 5, minTimeoutInMs: 2000, maxTimeoutInMs: 60000, factor: 2 },
  queue: { concurrencyLimit: 10 },
  run: async (payload: { subscriptionId: string }) => {
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
      include: { customer: true },
    });

    if (!subscription) throw new Error(`Subscription ${subscriptionId} not found`);
    if (!subscription.currentPeriodEnd) return { skipped: true, reason: "missing_current_period" };

    // Only process due
    if (subscription.currentPeriodEnd > new Date()) return { skipped: true, reason: "not_due" };

    // Normalize metadata (flatten nested `{ set: ... }`), preferring outer keys over inner keys
    const normalizeMeta = (m: any): any => {
      if (!m || typeof m !== "object") return {};
      let node: any = m;
      let extras: Record<string, any> = {};
      // Walk down through `set` layers, accumulating sibling keys (excluding `set`)
      while (node && typeof node === "object" && node.set && typeof node.set === "object") {
        const { set, ...rest } = node;
        // Outer keys should win, so collect them and continue downward
        extras = { ...rest, ...extras };
        node = set;
      }
      // Merge final leaf with accumulated outer keys (outer overrides inner)
      const leaf = (node && typeof node === "object") ? node : {};
      return { ...leaf, ...extras };
    };

    // Compute next period
    const meta = normalizeMeta((subscription.metadata as any) || {});
    const intervalUnit: string = meta.intervalUnit || "MONTH";
    const intervalCount: number = Number(meta.intervalCount || 1);
    const nextPeriodStart: Date = subscription.currentPeriodEnd;
    const nextPeriodEnd: Date = calculateNextPeriod(nextPeriodStart, intervalUnit, intervalCount);

    // Build Appmax client from merchant integration
    const client = await buildAppmaxClientForMerchant(subscription.merchantId);

    // Buscar método de pagamento salvo em customer_payment_methods
    const paymentMethod = await prisma.customerPaymentMethod.findFirst({
      where: {
        customerId: subscription.customerId,
        provider: 'APPMAX' as any,
        status: 'ACTIVE' as any
      },
      orderBy: { isDefault: 'desc' }
    });

    if (!paymentMethod?.providerPaymentMethodId) {
      console.warn("⚠️  No saved Appmax card found for customer");
      return { skipped: true, reason: "no_payment_method" };
    }

    const appmaxCardToken = paymentMethod.providerPaymentMethodId;

    // Create order in Appmax ensuring required identifiers are present
    const metaCustomerId: string | undefined = meta.appmaxCustomerId;
    if (!metaCustomerId) {
      console.warn("⚠️  Missing appmaxCustomerId in metadata. Skipping Appmax renewal.");
      return { skipped: true, reason: "missing_appmax_customer_id" };
    }

    // CRITICAL: Use the SAME payload format as checkout (which works)
    // Appmax API expects: total, products (not items), shipping (number, not object), freight_type
    const totalReais = Number((subscription.priceCents / 100).toFixed(2));
    const shippingReais = 0; // No shipping for digital subscription renewals

    const orderPayload: any = {
      total: totalReais, // AppMax expects REAIS (Decimal 10,2)
      products: [
        {
          sku: String(subscription.productId || subscription.id || "subscription"),
          name: `Renovação ${subscription.productId || "subscription"}`,
          qty: 1,
          price: totalReais, // Price in REAIS
        },
      ],
      shipping: shippingReais, // Number (not object)
      discount: 0,
      customer_id: Number(metaCustomerId), // Appmax expects numeric customer_id
      freight_type: "PAC", // Required string
      digital_product: 1, // Subscription is digital
    };

    console.log("[appmax][order][payload]", orderPayload);

    let order: any = null;
    try {
      order = await client.ordersCreate(orderPayload);
    } catch (e: any) {
      console.error("❌ Appmax order creation failed", {
        message: e?.message,
        status: e?.status,
        response: e?.response,
      });
      throw e;
    }

    // Extract orderId from Appmax response (data.id)
    const orderId: number | null = Number(order?.data?.id ?? order?.id ?? order?.order_id ?? NaN) || null;

    // Charge credit card immediately using saved token (mirror checkout route payload shape)
    let paymentResp: any = null;
    const buyerDoc = String((subscription.customer as any)?.document || '')
      .toString()
      .replace(/\D+/g, '')
      .slice(0, 14);
    const buyerName = String((subscription.customer as any)?.name || 'Cliente');
    const payPayload: any = {
      cart: { order_id: orderId },
      customer: { customer_id: Number(metaCustomerId) },
      payment: {
        CreditCard: {
          token: appmaxCardToken,
          installments: 1,
          soft_descriptor: 'KRXLABS',
          document_number: buyerDoc,
          name: buyerName,
        },
      },
    };
    try {
      paymentResp = await client.paymentsCreditCardNoRetry(payPayload);
    } catch (e: any) {
      if (Number(e?.status) === 504) {
        try {
          console.warn('[appmax][retry] 504 on payment, retrying once after backoff');
          await new Promise((r) => setTimeout(r, 2000));
          paymentResp = await client.paymentsCreditCardNoRetry(payPayload);
        } catch (e2: any) {
          console.error('❌ Appmax payment error after 504 retry', { message: e2?.message, status: e2?.status });
        }
      } else {
        console.error('❌ Appmax payment error', { message: e?.message, status: e?.status });
      }
    }

    // Map status to string, never store numeric HTTP codes
    const mappedStatus = (() => {
      const s = String(paymentResp?.status || paymentResp?.data?.status || '').toLowerCase();
      const txt = String(paymentResp?.text || paymentResp?.data?.text || '').toLowerCase();
      if (s.includes('aprov')) return 'paid';
      if (s.includes('autor')) return 'authorized';
      if (s.includes('pend')) return 'pending';
      if (txt.includes('captur') || (txt.includes('autoriz') && txt.includes('sucesso'))) return 'paid';
      return 'processing';
    })();

    // Build deterministic transaction id per subscription + billing period (YYYYMM)
    const periodKey = `${nextPeriodStart.getUTCFullYear()}${String(nextPeriodStart.getUTCMonth() + 1).padStart(2, "0")}`;
    const txId = `tx_appmax_${subscriptionId}_${periodKey}`;

    // Build create/update payloads, avoiding empty strings on provider ids
    const providerOrderIdStr = orderId ? String(orderId) : null;
    const providerChargeIdStr = paymentResp?.id ? String(paymentResp.id) : null;

    // If another transaction already recorded this providerChargeId, reuse that record to avoid unique constraint
    let txIdToUse = txId;
    if (providerChargeIdStr) {
      const existing = await prisma.paymentTransaction.findFirst({
        where: { provider: "appmax" as any, providerChargeId: providerChargeIdStr },
        select: { id: true },
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
        provider_v2: "APPMAX" as any,
        providerOrderId: providerOrderIdStr as any,
        ...(providerChargeIdStr ? { providerChargeId: providerChargeIdStr as any } : {}),
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
        rawPayload: { order, paymentResp } as any,
      },
      update: {
        providerOrderId: providerOrderIdStr as any,
        ...(providerChargeIdStr ? { providerChargeId: providerChargeIdStr as any } : {}),
        status: mappedStatus,
        status_v2: mapStatus(mappedStatus),
        rawPayload: { order, paymentResp } as any,
      },
    });

    if (mappedStatus === "paid" || mappedStatus === "completed" || mappedStatus === "approved") {
      await prisma.customerSubscription.update({
        where: { id: subscriptionId },
        data: {
          status: "ACTIVE",
          currentPeriodStart: nextPeriodStart,
          currentPeriodEnd: nextPeriodEnd,
        },
      });
    } else if (mappedStatus === "failed" || mappedStatus === "rejected") {
      await prisma.customerSubscription.update({
        where: { id: subscriptionId },
        data: {
          status: "PAST_DUE",
          metadata: {
            ...(subscription.metadata as any),
            lastRenewalError: `appmax_status_${mappedStatus}`,
            lastRenewalAttempt: new Date().toISOString(),
          },
        },
      });
    }

    console.log(`✅ Renewal processed (Appmax)`, { subscriptionId, status: mappedStatus });
    return { success: true, status: mappedStatus };
  },
});

function calculateNextPeriod(current: Date, unit: string, count: number): Date {
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

function mapStatus(status?: string): any {
  const map: Record<string, any> = {
    paid: "SUCCEEDED",
    approved: "SUCCEEDED",
    completed: "SUCCEEDED",
    processing: "PROCESSING",
    pending: "PROCESSING",
    failed: "FAILED",
    rejected: "FAILED",
    canceled: "CANCELED",
    refunded: "REFUNDED",
  };
  return status ? map[status] || "PROCESSING" : "PROCESSING";
}
