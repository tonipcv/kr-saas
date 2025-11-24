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
    const orderPayload: any = {
      items: [
        {
          description: `Renovação ${subscription.productId || "subscription"}`,
          quantity: 1,
          price: (subscription.priceCents / 100).toFixed(2),
          sku: subscription.productId || "subscription",
        },
      ],
      metadata: {
        type: "subscription_renewal",
        subscriptionId: subscription.id,
        periodStart: nextPeriodStart.toISOString(),
        periodEnd: nextPeriodEnd.toISOString(),
      },
    };

    const metaCustomerId: string | undefined = meta.appmaxCustomerId;
    if (!metaCustomerId) {
      console.warn("⚠️  Missing appmaxCustomerId in metadata. Skipping Appmax renewal.");
      return { skipped: true, reason: "missing_appmax_customer_id" };
    }
    // Appmax requires a registered customer reference
    orderPayload.customer_id = metaCustomerId;

    const order = await client.ordersCreate(orderPayload);

    // Charge credit card immediately using saved token
    let paymentResp: any = null;
    try {
      paymentResp = await client.paymentsCreditCard({
        order_id: order?.id,
        amount: (subscription.priceCents / 100).toFixed(2),
        token: appmaxCardToken,
      });
    } catch (e: any) {
      console.error("❌ Appmax payment error", { message: e?.message, status: e?.status });
    }

    const status = paymentResp?.status || order?.status || "processing";

    // Build deterministic transaction id per subscription + billing period (YYYYMM)
    const periodKey = `${nextPeriodStart.getUTCFullYear()}${String(nextPeriodStart.getUTCMonth() + 1).padStart(2, "0")}`;
    const txId = `tx_appmax_${subscriptionId}_${periodKey}`;

    await prisma.paymentTransaction.upsert({
      where: { id: txId },
      create: {
        id: txId,
        provider: "appmax",
        provider_v2: "APPMAX" as any,
        providerOrderId: String(order?.id || ""),
        providerChargeId: String(paymentResp?.id || ""),
        merchantId: subscription.merchantId,
        customerId: subscription.customerId,
        customerSubscriptionId: subscription.id,
        productId: subscription.productId,
        amountCents: subscription.priceCents,
        currency: String(subscription.currency).toLowerCase(),
        status: status,
        status_v2: mapStatus(status),
        paymentMethodType: "subscription_renewal",
        billingPeriodStart: nextPeriodStart,
        billingPeriodEnd: nextPeriodEnd,
        rawPayload: { order, paymentResp } as any,
      },
      update: {
        providerOrderId: String(order?.id || ""),
        providerChargeId: String(paymentResp?.id || ""),
        status: status,
        status_v2: mapStatus(status),
        rawPayload: { order, paymentResp } as any,
      },
    });

    if (status === "paid" || status === "completed" || status === "approved") {
      await prisma.customerSubscription.update({
        where: { id: subscriptionId },
        data: {
          status: "ACTIVE",
          currentPeriodStart: nextPeriodStart,
          currentPeriodEnd: nextPeriodEnd,
        },
      });
    } else if (status === "failed" || status === "rejected") {
      await prisma.customerSubscription.update({
        where: { id: subscriptionId },
        data: {
          status: "PAST_DUE",
          metadata: {
            ...(subscription.metadata as any),
            lastRenewalError: `appmax_status_${status}`,
            lastRenewalAttempt: new Date().toISOString(),
          },
        },
      });
    }

    console.log(`✅ Renewal processed (Appmax)`, { subscriptionId, status });
    return { success: true, status };
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
