import { task } from "@trigger.dev/sdk/v3";
import { prisma } from "@/lib/prisma";
import { pagarmeCreateOrder } from "@/lib/payments/pagarme/sdk";

export const pagarmePrepaidRenewal = task({
  id: "pagarme-prepaid-renewal",
  retry: { maxAttempts: 5, minTimeoutInMs: 2000, maxTimeoutInMs: 60000, factor: 2 },
  queue: { concurrencyLimit: 10 },
  run: async (payload: { subscriptionId: string }) => {
    const { subscriptionId } = payload;
    console.log(`🔄 Processing Pagar.me prepaid renewal for subscription: ${subscriptionId}`);

    if (process.env.TRIGGER_ENABLE_PAGARME_PREPAID !== "true") {
      console.log("⚠️  Feature disabled: TRIGGER_ENABLE_PAGARME_PREPAID");
      return { skipped: true, reason: "feature_disabled" };
    }

    // Fetch subscription with fallback to default payment method
    const subscription = await prisma.customerSubscription.findUnique({
      where: { id: subscriptionId },
      include: {
        customer: {
          include: {
            paymentMethods: {
              where: { provider: "PAGARME" as any },
              orderBy: { isDefault: "desc" },
              take: 1,
            },
          },
        },
      },
    });

    if (!subscription) throw new Error(`Subscription ${subscriptionId} not found`);
    if (!subscription.currentPeriodEnd) return { skipped: true, reason: "missing_current_period" };

    // Only process due subscriptions
    if (subscription.currentPeriodEnd > new Date()) {
      return { skipped: true, reason: "not_due" };
    }

    if (!subscription.isNative) {
      // Determine payment method
      const paymentMethod = subscription.vaultPaymentMethodId
        ? await prisma.customerPaymentMethod.findUnique({ where: { id: subscription.vaultPaymentMethodId } })
        : subscription.customer.paymentMethods?.[0];

      if (!paymentMethod) {
        await prisma.customerSubscription.update({
          where: { id: subscriptionId },
          data: {
            status: "PAST_DUE",
            metadata: {
              ...(subscription.metadata as any),
              lastRenewalError: "no_payment_method",
              lastRenewalAttempt: new Date().toISOString(),
            },
          },
        });
        throw new Error("No payment method found");
      }

      // Compute next period
      const meta = (subscription.metadata as any) || {};
      const intervalUnit: string = meta.intervalUnit || "MONTH";
      const intervalCount: number = Number(meta.intervalCount || 1);
      const nextPeriodStart: Date = subscription.currentPeriodEnd;
      const nextPeriodEnd: Date = calculateNextPeriod(nextPeriodStart, intervalUnit, intervalCount);

      // Create order in Pagar.me
      const pagarmeCustomerId: string | undefined = meta.pagarmeCustomerId;
      const pagarmeCardId: string | undefined = paymentMethod.providerPaymentMethodId || meta.pagarmeCardId;
      if (!pagarmeCustomerId || !pagarmeCardId) throw new Error("Missing Pagar.me identifiers in metadata/payment method");

      const order = await pagarmeCreateOrder({
        customer: { id: pagarmeCustomerId },
        items: [
          {
            amount: subscription.priceCents,
            description: `Renovação ${subscription.productId || "subscription"}`,
            quantity: 1,
            code: subscription.productId || "subscription",
          },
        ],
        payments: [
          {
            payment_method: "credit_card",
            credit_card: { card_id: pagarmeCardId, statement_descriptor: "RENOVACAO" },
          },
        ],
        metadata: {
          type: "subscription_renewal",
          subscriptionId: subscription.id,
          billingCycle: "renewal",
          periodStart: nextPeriodStart.toISOString(),
          periodEnd: nextPeriodEnd.toISOString(),
        },
      });

      const txId = `tx_pagarme_${order.id}`;

      // Upsert payment transaction
      const transaction = await prisma.paymentTransaction.upsert({
        where: { id: txId },
        create: {
          id: txId,
          provider: "pagarme",
          provider_v2: "PAGARME" as any,
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
          rawPayload: order as any,
        },
        update: {
          status: order.status || "processing",
          status_v2: mapPagarmeStatus(order.status),
          rawPayload: order as any,
        },
      });

      // If paid immediately, activate subscription
      if (order.status === "paid") {
        await prisma.$transaction([
          prisma.customerSubscription.update({
            where: { id: subscriptionId },
            data: {
              status: "ACTIVE",
              currentPeriodStart: nextPeriodStart,
              currentPeriodEnd: nextPeriodEnd,
            },
          }),
          prisma.paymentTransaction.update({
            where: { id: txId },
            data: {
              status: "paid",
              status_v2: "SUCCEEDED" as any,
              paidAt: new Date(),
              capturedAt: new Date(),
            },
          }),
          prisma.event.create({
            data: {
              eventType: "subscription_billed" as any,
              clinicId: subscription.merchantId,
              customerId: subscription.customerId,
              actor: "system" as any,
              metadata: {
                subscriptionId: subscription.id,
                transactionId: transaction.id,
                amount: subscription.priceCents,
                provider: "PAGARME",
                type: "prepaid_renewal",
              },
            },
          }),
        ]);
      }

      console.log(`✅ Renewal processed (Pagar.me prepaid)`, {
        subscriptionId: subscription.id,
        transactionId: txId,
        paid: order.status === "paid",
      });

      return { success: true, transactionId: txId, paid: order.status === "paid" };
    }

    return { skipped: true, reason: "native_subscription" };
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

function mapPagarmeStatus(status?: string): any {
  const map: Record<string, any> = {
    paid: "SUCCEEDED",
    pending: "PROCESSING",
    processing: "PROCESSING",
    canceled: "CANCELED",
    failed: "FAILED",
    refunded: "REFUNDED",
  };
  return status ? map[status] || "PROCESSING" : "PROCESSING";
}
