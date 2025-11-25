const { prisma } = require("../dist/lib/prisma.js");

/**
 * Validates Pagar.me renewal prerequisites for a subscription
 * 
 * Usage:
 *   node local-scripts/check_pagarme_renewal_prereqs.js <subscriptionId>
 */
async function main() {
  const subscriptionId = process.argv[2];
  if (!subscriptionId) {
    console.error("Usage: node local-scripts/check_pagarme_renewal_prereqs.js <subscriptionId>");
    process.exit(1);
  }

  const sub = await prisma.customerSubscription.findUnique({
    where: { id: String(subscriptionId) },
    include: {
      customer: {
        include: {
          paymentMethods: {
            where: { provider: 'PAGARME', status: 'ACTIVE' },
            orderBy: { isDefault: 'desc' },
            take: 1,
          },
        },
      },
    },
  });

  if (!sub) {
    console.error("Subscription not found", { subscriptionId });
    process.exit(1);
  }

  const meta = (sub.metadata && typeof sub.metadata === 'object') ? sub.metadata : {};
  const paymentMethod = sub.customer?.paymentMethods?.[0] || null;

  const docDigits = (sub.customer?.document || '').replace(/\D+/g, '');
  const phoneDigits = (sub.customer?.telephone || '').replace(/\D+/g, '');

  const result = {
    subscription: {
      id: sub.id,
      provider: sub.provider,
      merchantId: sub.merchantId,
      customerId: sub.customerId,
      currentPeriodEnd: sub.currentPeriodEnd,
    },
    pagarme: {
      customer_id_in_metadata: meta.pagarmeCustomerId || null,
      card_id_in_metadata: meta.pagarmeCardId || null,
      order_id_in_metadata: meta.pagarmeOrderId || null,
      payment_method: paymentMethod ? {
        id: paymentMethod.id,
        card_id: paymentMethod.providerPaymentMethodId || null,
        status: paymentMethod.status,
        is_default: paymentMethod.isDefault,
        created_at: paymentMethod.createdAt,
      } : null,
      customer: {
        document: docDigits || null,
        document_valid: docDigits.length === 11 || docDigits.length === 14,
        telephone: phoneDigits || null,
        telephone_valid: phoneDigits.length >= 10,
      },
    },
    suspected_causes: [],
  };

  if (!meta.pagarmeCustomerId) result.suspected_causes.push("missing_pagarme_customer_id_in_metadata");
  if (!meta.pagarmeCardId && !paymentMethod?.providerPaymentMethodId) result.suspected_causes.push("missing_pagarme_card_id");
  if (!result.pagarme.customer.document_valid) result.suspected_causes.push("invalid_or_missing_customer_document");
  if (!result.pagarme.customer.telephone_valid) result.suspected_causes.push("invalid_or_missing_customer_telephone");

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
