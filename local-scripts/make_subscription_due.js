// Mark a subscription as DUE by moving currentPeriodEnd to the past
// Usage:
//   SUBSCRIPTION_ID=<id> node local-scripts/make_subscription_due.js
// Optional:
//   DAYS_AGO=1 (defaults 1)
//   DRY=true (prints only)

const { prisma } = require("../dist/lib/prisma.js");

async function main() {
  const id = process.env.SUBSCRIPTION_ID;
  const daysAgo = Number(process.env.DAYS_AGO || 1);
  const dry = String(process.env.DRY || "").toLowerCase() === "true";

  if (!id) {
    console.error("SUBSCRIPTION_ID is required");
    process.exit(1);
  }

  const sub = await prisma.customerSubscription.findUnique({ where: { id } });
  if (!sub) {
    console.error("Subscription not found:", id);
    process.exit(1);
  }

  const now = new Date();
  const newEnd = new Date(now);
  newEnd.setDate(newEnd.getDate() - Math.max(0, daysAgo));

  const data = {
    status: "PAST_DUE",
    currentPeriodEnd: newEnd,
  };

  console.log("[make_due]", { id, currentPeriodEnd_from: sub.currentPeriodEnd, currentPeriodEnd_to: newEnd, status_to: data.status, dry });

  if (!dry) {
    await prisma.customerSubscription.update({ where: { id }, data });
    console.log("✅ Updated subscription to DUE", { id, currentPeriodEnd: newEnd.toISOString() });
  } else {
    console.log("[DRY] Would update subscription to DUE", { id, currentPeriodEnd: newEnd.toISOString() });
  }
}

main().finally(() => prisma.$disconnect());
