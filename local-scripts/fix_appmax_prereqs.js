const { prisma } = require("../dist/lib/prisma.js");

/**
 * Fixes Appmax renewal prerequisites for a subscription:
 * - Updates the unified customer document (CPF/CNPJ digits only)
 * - Binds the default APPMAX saved card to the subscription's merchant (sets account_id)
 *
 * Usage:
 *   node local-scripts/fix_appmax_prereqs.js <subscriptionId> <CPF_OR_CNPJ_DIGITS>
 */
async function main() {
  const subscriptionId = process.argv[2];
  const newDoc = (process.argv[3] || "").toString().replace(/\D+/g, "");

  if (!subscriptionId || !newDoc) {
    console.error("Usage: node local-scripts/fix_appmax_prereqs.js <subscriptionId> <CPF_OR_CNPJ_DIGITS>");
    process.exit(1);
  }

  if (!(newDoc.length === 11 || newDoc.length === 14)) {
    console.error("Document must be 11 (CPF) or 14 (CNPJ) digits. Got:", newDoc.length);
    process.exit(1);
  }

  const sub = await prisma.customerSubscription.findUnique({
    where: { id: String(subscriptionId) },
    select: { id: true, customerId: true, merchantId: true },
  });
  if (!sub) throw new Error("Subscription not found: " + subscriptionId);

  // 1) Update customer.document
  const updatedCustomer = await prisma.customer.update({
    where: { id: sub.customerId },
    data: { document: newDoc },
    select: { id: true, document: true, name: true, email: true },
  });

  // 2) Update default APPMAX payment method's account_id to match subscription.merchantId
  const method = await prisma.customerPaymentMethod.findFirst({
    where: { customerId: sub.customerId, provider: 'APPMAX', status: 'ACTIVE' },
    orderBy: { isDefault: 'desc' },
  });

  let updatedMethod = null;
  if (method) {
    updatedMethod = await prisma.customerPaymentMethod.update({
      where: { id: method.id },
      data: { accountId: String(sub.merchantId) },
      select: {
        id: true,
        providerPaymentMethodId: true,
        accountId: true,
        brand: true,
        last4: true,
        expMonth: true,
        expYear: true,
        isDefault: true,
        status: true,
      },
    });
  }

  const result = {
    subscription: { id: sub.id, merchantId: sub.merchantId, customerId: sub.customerId },
    customer: updatedCustomer,
    payment_method_before: method ? {
      id: method.id,
      token_preview: method.providerPaymentMethodId ? String(method.providerPaymentMethodId).slice(0, 6) + '...' : null,
      account_id: method.accountId || null,
      brand: method.brand || null,
      last4: method.last4 || null,
      exp_month: method.expMonth || null,
      exp_year: method.expYear || null,
      is_default: method.isDefault,
      status: method.status,
    } : null,
    payment_method_after: updatedMethod || null,
  };

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { try { await prisma.$disconnect(); } catch {} });
