// Hard reset subscription.metadata to a clean JSON object (no nested { set: ... })
// Usage:
//   SUB_ID=<subscription_id> CUST_ID=<appmax_customer_id> node local-scripts/hardset_subscription_metadata.js
// Example:
//   SUB_ID=8c6f0c7e-0d2d-48d9-803b-b5a206ca7358 CUST_ID=33461 node local-scripts/hardset_subscription_metadata.js

const { prisma } = require("../dist/lib/prisma.js");

async function main() {
  const SUB_ID = process.env.SUB_ID;
  const CUST_ID = process.env.CUST_ID;
  if (!SUB_ID || !CUST_ID) {
    console.error("Provide SUB_ID and CUST_ID envs");
    process.exit(1);
  }
  try {
    // Read existing to preserve useful fields
    const current = await prisma.customerSubscription.findUnique({ where: { id: SUB_ID }, select: { metadata: true } });
    const base = (current?.metadata && typeof current.metadata === "object") ? current.metadata : {};

    // Build a clean object, carrying forward known useful keys if present
    const clean = {
      intervalUnit: base.intervalUnit || "MONTH",
      intervalCount: base.intervalCount || 1,
      appmaxCardToken: base.appmaxCardToken || undefined,
      email: base.email || base.buyerEmail || undefined,
      appmaxCustomerId: String(CUST_ID),
    };
    // Remove undefined keys
    Object.keys(clean).forEach((k) => clean[k] === undefined && delete clean[k]);

    await prisma.customerSubscription.update({ where: { id: SUB_ID }, data: { metadata: { set: clean } } });
    const updated = await prisma.customerSubscription.findUnique({ where: { id: SUB_ID }, select: { metadata: true } });
    console.log("Metadata hard-set to:");
    console.log(JSON.stringify(updated.metadata, null, 2));
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
