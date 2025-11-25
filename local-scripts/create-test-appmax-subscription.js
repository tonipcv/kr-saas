#!/usr/bin/env node
const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  try {
    const MERCHANT_ID = process.env.MERCHANT_ID || process.argv.find((a) => a.startsWith("--merchant="))?.split("=")[1] || "cmhzavwoh0001iaovlbkcd2cs";
    const APPMAX_CUSTOMER_ID = process.env.APPMAX_CUSTOMER_ID || process.argv.find((a) => a.startsWith("--appmaxCustomerId="))?.split("=")[1] || "ef0345d0-1abf-49ad-949b-f3dfeeea36d0";
    const CARD_TOKEN = process.env.CARD_TOKEN || process.argv.find((a) => a.startsWith("--cardToken="))?.split("=")[1] || "c7b42566b79e44c8a659a91d024e6f88";
    const CUSTOMER_EMAIL = process.env.CUSTOMER_EMAIL || process.argv.find((a) => a.startsWith("--email="))?.split("=")[1] || `test.appmax.${Date.now()}@example.com`;
    const PRICE_CENTS = parseInt(process.env.PRICE_CENTS || (process.argv.find((a) => a.startsWith("--priceCents="))?.split("=")[1] ?? "9900"), 10);

    if (!MERCHANT_ID) throw new Error("Missing MERCHANT_ID (env or --merchant=<id>)");
    if (!APPMAX_CUSTOMER_ID) throw new Error("Missing APPMAX_CUSTOMER_ID (env or --appmaxCustomerId=<id>)");
    if (!CARD_TOKEN) throw new Error("Missing CARD_TOKEN (env or --cardToken=<token>)");

    const now = new Date();
    const thirtyOneDaysMs = 31 * 24 * 60 * 60 * 1000;
    const periodEnd = new Date(now.getTime() - 60 * 1000); // 1 min atrás (DUE)
    const periodStart = new Date(periodEnd.getTime() - thirtyOneDaysMs);

    // Ensure customer
    let customer = await prisma.customer.findFirst({ where: { merchantId: MERCHANT_ID, email: CUSTOMER_EMAIL } });
    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          merchantId: MERCHANT_ID,
          email: CUSTOMER_EMAIL,
          name: "Appmax Test",
          metadata: {},
        },
      });
      console.log("[seed] Created customer:", customer.id);
    } else {
      console.log("[seed] Using existing customer:", customer.id);
    }

    // Ensure Appmax payment method (token)
    let pm = await prisma.customerPaymentMethod.findFirst({
      where: { customerId: customer.id, provider: "APPMAX", status: "ACTIVE" },
      orderBy: { isDefault: "desc" },
    });
    if (!pm) {
      pm = await prisma.customerPaymentMethod.create({
        data: {
          customerId: customer.id,
          provider: "APPMAX",
          brand: "visa",
          last4: "0000",
          expMonth: 12,
          expYear: new Date().getUTCFullYear() + 2,
          isDefault: true,
          status: "ACTIVE",
          providerPaymentMethodId: CARD_TOKEN,
        },
      });
      console.log("[seed] Created Appmax payment method:", pm.id);
    } else {
      // Ensure it has the token, set default
      if (!pm.providerPaymentMethodId) {
        pm = await prisma.customerPaymentMethod.update({
          where: { id: pm.id },
          data: { providerPaymentMethodId: CARD_TOKEN, isDefault: true },
        });
      }
      console.log("[seed] Using payment method:", pm.id);
    }

    // Create a due subscription for Appmax
    const sub = await prisma.customerSubscription.create({
      data: {
        customerId: customer.id,
        merchantId: MERCHANT_ID,
        productId: "subscription",
        offerId: null,
        provider: "APPMAX",
        accountId: null,
        isNative: false,
        customerProviderId: null,
        providerSubscriptionId: null,
        vaultPaymentMethodId: pm.id,
        status: "ACTIVE",
        startAt: new Date(periodStart),
        trialEndsAt: null,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd, // DUE
        cancelAt: null,
        canceledAt: null,
        priceCents: PRICE_CENTS,
        currency: "BRL",
        metadata: {
          appmaxCustomerId: APPMAX_CUSTOMER_ID,
          intervalUnit: "MONTH",
          intervalCount: 1,
        },
      },
    });

    console.log("\n✅ Test Appmax subscription created and DUE:");
    console.log("subscriptionId:", sub.id);
    console.log("customerId:", customer.id);
    console.log("merchantId:", MERCHANT_ID);
    console.log("paymentMethodId:", pm.id);
    console.log("priceCents:", PRICE_CENTS);
    console.log("currentPeriodEnd:", sub.currentPeriodEnd.toISOString());
    console.log("\nUse this payload in the Trigger.dev Test page:");
    console.log(JSON.stringify({ subscriptionId: sub.id }, null, 2));
  } catch (e) {
    console.error("[seed] Error:", e?.message || e);
    process.exitCode = 1;
  } finally {
    // eslint-disable-next-line no-unsafe-finally
    await new PrismaClient().$disconnect().catch(() => {});
  }
}

main();
