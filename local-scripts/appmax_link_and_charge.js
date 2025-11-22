// Link Appmax customer_id into due subscriptions and (optionally) print trigger instructions
// Usage:
//   APPMAX_DEFAULT_CUSTOMER_ID=<id> node local-scripts/appmax_link_and_charge.js
// Env:
//   APPMAX_DEFAULT_CUSTOMER_ID (required): fallback customer_id to set when missing
//   DRY=true (optional): only list; do not write

const { prisma } = require("../dist/lib/prisma.js");

async function main() {
  const fallbackCustomerId = process.env.APPMAX_DEFAULT_CUSTOMER_ID;
  const dry = String(process.env.DRY || "").toLowerCase() === "true";

  if (!fallbackCustomerId) {
    console.error("APPMAX_DEFAULT_CUSTOMER_ID is required. Export it and run again.");
    process.exit(1);
  }

  try {
    const now = new Date();
    // Find due Appmax subscriptions
    const due = await prisma.customerSubscription.findMany({
      where: {
        provider: "APPMAX",
        canceledAt: null,
        currentPeriodEnd: { lte: now },
      },
      select: { id: true, metadata: true, priceCents: true, currentPeriodEnd: true },
      orderBy: { currentPeriodEnd: "asc" },
      take: 50,
    });

    if (!due.length) {
      console.log("No due APPMAX subscriptions found.");
      return;
    }

    console.log(`Found ${due.length} due APPMAX subscriptions`);

    const updates = [];
    for (const sub of due) {
      const meta = (sub.metadata && typeof sub.metadata === "object") ? sub.metadata : {};
      const hasId = !!meta.appmaxCustomerId;
      if (!hasId) {
        meta.appmaxCustomerId = fallbackCustomerId;
        updates.push({ id: sub.id, metadata: meta });
      }
    }

    if (!updates.length) {
      console.log("All due subs already have appmaxCustomerId set. Nothing to update.");
    } else if (dry) {
      console.log("[DRY] Would update the following subscriptions with appmaxCustomerId:");
      updates.forEach(u => console.log(` - ${u.id}`));
    } else {
      for (const u of updates) {
        await prisma.customerSubscription.update({ where: { id: u.id }, data: { metadata: { set: u.metadata } } });
        console.log("Updated appmaxCustomerId for", u.id);
      }
    }

    console.log("\nNext step: Trigger the renewal for each subscription (via Trigger.dev UI):");
    due.forEach((sub, i) => {
      console.log(` ${i + 1}. { "subscriptionId": "${sub.id}" }`);
    });
    console.log("If you want automatic triggering from a script, share your preference and TRIGGER_API_KEY usage; I'll add it.");
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
