const { prisma } = require("../dist/lib/prisma.js");

async function main() {
  const subscriptionId = process.argv[2];
  if (!subscriptionId) {
    console.error("Usage: node local-scripts/check_appmax_renewal_prereqs.js <subscriptionId>");
    process.exit(1);
  }

  const sub = await prisma.customerSubscription.findUnique({
    where: { id: String(subscriptionId) },
    include: { customer: true },
  });

  if (!sub) {
    console.error("Subscription not found", { subscriptionId });
    process.exit(1);
  }

  const meta = (sub.metadata && typeof sub.metadata === "object") ? sub.metadata : {};
  const appmaxCustomerId = meta.appmaxCustomerId ? String(meta.appmaxCustomerId) : null;

  const paymentMethod = await prisma.customerPaymentMethod.findFirst({
    where: {
      customerId: sub.customerId,
      provider: 'APPMAX',
      status: 'ACTIVE',
    },
    orderBy: { isDefault: 'desc' },
  });

  const integ = await prisma.merchantIntegration.findUnique({
    where: { merchantId_provider: { merchantId: String(sub.merchantId), provider: 'APPMAX' } },
    select: { credentials: true, isActive: true },
  });

  const buyerDoc = (sub.customer?.document || '').toString().replace(/\D+/g, '').slice(0, 14);
  const hasValidDoc = buyerDoc.length === 11 || buyerDoc.length === 14;

  const result = {
    subscription: {
      id: sub.id,
      provider: sub.provider,
      merchantId: sub.merchantId,
      customerId: sub.customerId,
      currentPeriodEnd: sub.currentPeriodEnd,
    },
    appmax: {
      customer_id_in_metadata: appmaxCustomerId,
      merchant_integration: {
        active: !!integ?.isActive,
        has_api_key: !!(integ?.credentials && (integ.credentials).apiKey),
        testMode: (integ?.credentials && (integ.credentials).testMode) || false,
      },
      payment_method: paymentMethod ? {
        id: paymentMethod.id,
        token_preview: paymentMethod.providerPaymentMethodId ? String(paymentMethod.providerPaymentMethodId).slice(0, 6) + "..." : null,
        account_id: paymentMethod.accountId || null,
        brand: paymentMethod.brand || null,
        last4: paymentMethod.last4 || null,
        exp_month: paymentMethod.expMonth || null,
        exp_year: paymentMethod.expYear || null,
        is_default: paymentMethod.isDefault,
        status: paymentMethod.status,
        created_at: paymentMethod.createdAt,
        updated_at: paymentMethod.updatedAt,
        account_matches_merchant: paymentMethod.accountId ? String(paymentMethod.accountId) === String(sub.merchantId) : false,
      } : null,
      buyer_document: {
        present: buyerDoc.length > 0,
        valid: hasValidDoc,
        digits: buyerDoc,
      },
    },
    suspected_causes: [],
  };

  if (!paymentMethod) {
    result.suspected_causes.push("no_active_appmax_payment_method");
  } else {
    if (!paymentMethod.providerPaymentMethodId) result.suspected_causes.push("missing_token_in_payment_method");
    if (!paymentMethod.accountId) result.suspected_causes.push("payment_method_missing_account_id");
    if (paymentMethod.accountId && String(paymentMethod.accountId) !== String(sub.merchantId)) result.suspected_causes.push("payment_method_merchant_mismatch");
  }

  if (!appmaxCustomerId) result.suspected_causes.push("missing_appmax_customer_id_in_metadata");
  if (!hasValidDoc) result.suspected_causes.push("invalid_or_missing_customer_document");
  if (!integ || !integ.isActive) result.suspected_causes.push("appmax_integration_inactive");
  if (!integ || !(integ.credentials && integ.credentials.apiKey)) result.suspected_causes.push("appmax_api_key_missing");

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    try { await prisma.$disconnect(); } catch {}
  });
