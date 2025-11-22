// Validation script: FASE 1 checks for APPMAX subscriptions, payment methods, and merchant integration
// Usage: node local-scripts/validate_appmax_phase1.js

const { prisma } = require("../dist/lib/prisma.js");

async function main() {
  try {
    console.log("=== FASE 1: Validação de Dados (APPMAX) ===\n");

    // 1.1 Subscriptions overview (APPMAX)
    const subs = await prisma.$queryRawUnsafe(`
      SELECT 
        id,
        customer_id,
        merchant_id,
        "status",
        price_cents / 100.0 as valor_brl,
        current_period_start,
        current_period_end,
        (current_period_end < NOW()) as esta_vencida,
        AGE(NOW(), current_period_end)::text as vencido_ha,
        vault_payment_method_id,
        metadata
      FROM customer_subscriptions
      WHERE provider = 'APPMAX'
      ORDER BY current_period_end DESC
      LIMIT 20;
    `);
    console.log("-- (1.1) Subscriptions APPMAX --");
    console.log(JSON.stringify(subs, null, 2));
    console.log();

    // 1.2 Payment methods for the first APPMAX customer
    const pmRows = await prisma.$queryRawUnsafe(`
      SELECT 
        cpm.id,
        cpm.provider,
        cpm.provider_payment_method_id,
        cpm.brand,
        cpm.last4,
        cpm.is_default,
        cpm."status"
      FROM customer_payment_methods cpm
      WHERE cpm.customer_id = (
        SELECT customer_id 
        FROM customer_subscriptions 
        WHERE provider = 'APPMAX' 
        LIMIT 1
      )
      AND cpm.provider = 'APPMAX';
    `);
    console.log("-- (1.2) Payment Methods para o customer (APPMAX) --");
    console.log(JSON.stringify(pmRows, null, 2));
    console.log();

    // 1.3 Merchant integration (APPMAX)
    const integrations = await prisma.$queryRawUnsafe(`
      SELECT 
        mi.id,
        mi.provider,
        mi.is_active,
        mi.is_primary,
        (mi.credentials::text LIKE '%token%' OR mi.credentials::text LIKE '%api%') as tem_credenciais,
        mi.last_error,
        mi.last_error_at
      FROM merchant_integrations mi
      JOIN customer_subscriptions cs ON cs.merchant_id = mi.merchant_id
      WHERE cs.provider = 'APPMAX'
        AND mi.provider = 'APPMAX'
      LIMIT 1;
    `);
    console.log("-- (1.3) Merchant Integration APPMAX --");
    console.log(JSON.stringify(integrations, null, 2));
    console.log();

    console.log("=== FIM FASE 1 ===");
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
