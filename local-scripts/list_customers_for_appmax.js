// Lists local customers related to APPMAX subscriptions to help you find the correct Appmax customer
// Usage:
//   node local-scripts/list_customers_for_appmax.js
// Output includes customer id, name, email, document, phone and related APPMAX subscription ids

const { prisma } = require("../dist/lib/prisma.js");

async function main() {
  try {
    const subs = await prisma.customerSubscription.findMany({
      where: { provider: "APPMAX" },
      select: {
        id: true,
        customerId: true,
        merchantId: true,
        metadata: true,
        currentPeriodEnd: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    if (!subs.length) {
      console.log("No APPMAX subscriptions found.");
      return;
    }

    const customerIds = Array.from(new Set(subs.map((s) => s.customerId)));

    const customers = await prisma.customer.findMany({
      where: { id: { in: customerIds } },
      select: {
        id: true,
        name: true,
        email: true,
        document: true,
        phone: true,
        createdAt: true,
      },
    });

    const byId = new Map(customers.map((c) => [c.id, c]));

    const rows = subs.map((s) => {
      const c = byId.get(s.customerId) || {};
      const meta = (s.metadata && typeof s.metadata === "object") ? s.metadata : {};
      return {
        subId: s.id,
        customerId: s.customerId,
        name: c.name || null,
        email: c.email || null,
        document: c.document || null,
        phone: c.phone || null,
        appmaxCustomerId: meta.appmaxCustomerId || null,
        dueAt: s.currentPeriodEnd || null,
      };
    });

    console.table(rows);

    console.log("\nTip: Use the name/email/document above to search in the Appmax dashboard and copy the real customer_id.");
    console.log("Then set it with: APPMAX_DEFAULT_CUSTOMER_ID=<id> node local-scripts/appmax_link_and_charge.js");
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
