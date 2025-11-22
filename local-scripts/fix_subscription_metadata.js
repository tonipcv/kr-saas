// Fix nested `{ set: ... }` structures inside subscription.metadata and write a clean JSON object
// Usage:
//   node local-scripts/fix_subscription_metadata.js <SUBSCRIPTION_ID>
// Example:
//   node local-scripts/fix_subscription_metadata.js 8c6f0c7e-0d2d-48d9-803b-b5a206ca7358

const { prisma } = require("../dist/lib/prisma.js");

function unwrapSet(obj) {
  let curr = obj;
  while (curr && typeof curr === "object" && curr.set && typeof curr.set === "object") {
    curr = curr.set;
  }
  return curr;
}

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error("Usage: node local-scripts/fix_subscription_metadata.js <SUBSCRIPTION_ID>");
    process.exit(1);
  }

  try {
    const sub = await prisma.customerSubscription.findUnique({ where: { id }, select: { id: true, metadata: true } });
    if (!sub) {
      console.error("Subscription not found:", id);
      process.exit(1);
    }

    const before = sub.metadata;
    const unwrapped = unwrapSet(before) || {};

    if (JSON.stringify(before) === JSON.stringify(unwrapped)) {
      console.log("Metadata already normalized. No changes.");
      console.log(JSON.stringify(unwrapped, null, 2));
      return;
    }

    await prisma.customerSubscription.update({ where: { id }, data: { metadata: { set: unwrapped } } });
    console.log("Metadata normalized and saved for:", id);
    console.log(JSON.stringify(unwrapped, null, 2));
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
