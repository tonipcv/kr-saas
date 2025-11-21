#!/usr/bin/env node
/**
 * Script de diagnóstico para verificar dados de um cliente específico
 * Uso: node scripts/check-customer.js <customer_id>
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const customerId = process.argv[2] || 'cmi7z5mrb000it9tiw07tv2tj';
  
  console.log(`🔍 Verificando cliente: ${customerId}\n`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 1. Verificar se o customer existe
  const customers = await prisma.$queryRawUnsafe(`
    SELECT id, name, email, phone, document, merchant_id, created_at, updated_at
    FROM customers
    WHERE id = $1
    LIMIT 1
  `, customerId);

  if (!customers || customers.length === 0) {
    console.log('❌ Cliente não encontrado no banco!\n');
    console.log('🔍 Buscando por email similar...\n');
    
    // Buscar por email que contenha "joao+test"
    const byEmail = await prisma.$queryRawUnsafe(`
      SELECT id, name, email, phone, merchant_id, created_at
      FROM customers
      WHERE email ILIKE '%joao%test%'
      ORDER BY created_at DESC
      LIMIT 5
    `);
    
    if (byEmail && byEmail.length > 0) {
      console.log(`✅ Encontrados ${byEmail.length} clientes com email similar:\n`);
      byEmail.forEach((c, idx) => {
        console.log(`${idx + 1}. ID: ${c.id}`);
        console.log(`   Email: ${c.email}`);
        console.log(`   Nome: ${c.name || '-'}`);
        console.log(`   Merchant: ${c.merchant_id || '-'}`);
        console.log(`   Criado: ${c.created_at}\n`);
      });
    } else {
      console.log('❌ Nenhum cliente encontrado com email similar\n');
    }
    return;
  }

  const customer = customers[0];
  console.log('📋 CUSTOMER:');
  console.log(`  ID: ${customer.id}`);
  console.log(`  Nome: ${customer.name || '-'}`);
  console.log(`  Email: ${customer.email || '-'}`);
  console.log(`  Phone: ${customer.phone || '-'}`);
  console.log(`  Document: ${customer.document || '-'}`);
  console.log(`  Merchant ID: ${customer.merchant_id || '-'}`);
  console.log(`  Criado: ${customer.created_at}`);
  console.log(`  Atualizado: ${customer.updated_at}\n`);

  // 2. Customer Providers
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔌 CUSTOMER PROVIDERS:\n');
  const providers = await prisma.$queryRawUnsafe(`
    SELECT provider, account_id, provider_customer_id, created_at
    FROM customer_providers
    WHERE customer_id = $1
    ORDER BY created_at DESC
  `, customerId);

  if (providers && providers.length > 0) {
    providers.forEach((p, idx) => {
      console.log(`${idx + 1}. Provider: ${p.provider}`);
      console.log(`   Account ID: ${p.account_id || '-'}`);
      console.log(`   Provider Customer ID: ${p.provider_customer_id || '-'}`);
      console.log(`   Criado: ${p.created_at}\n`);
    });
  } else {
    console.log('❌ Nenhum customer_provider encontrado!\n');
    console.log('💡 CAUSA: O checkout não está criando registros em customer_providers\n');
  }

  // 3. Payment Methods
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💳 PAYMENT METHODS:\n');
  const methods = await prisma.$queryRawUnsafe(`
    SELECT id, provider, account_id, brand, last4, exp_month, exp_year, status, is_default, created_at
    FROM customer_payment_methods
    WHERE customer_id = $1
    ORDER BY created_at DESC
  `, customerId);

  if (methods && methods.length > 0) {
    methods.forEach((m, idx) => {
      console.log(`${idx + 1}. Provider: ${m.provider}`);
      console.log(`   Brand: ${m.brand || '-'}`);
      console.log(`   Last4: ${m.last4 || '-'}`);
      console.log(`   Exp: ${m.exp_month || '-'}/${m.exp_year || '-'}`);
      console.log(`   Status: ${m.status || '-'}`);
      console.log(`   Default: ${m.is_default ? 'Sim' : 'Não'}`);
      console.log(`   Criado: ${m.created_at}\n`);
    });
  } else {
    console.log('❌ Nenhum payment method encontrado!\n');
    console.log('💡 CAUSA: O checkout não está salvando métodos de pagamento\n');
  }

  // 4. Subscriptions
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📅 SUBSCRIPTIONS:\n');
  const subscriptions = await prisma.$queryRawUnsafe(`
    SELECT id, provider, provider_subscription_id, status, price_cents, currency,
           start_at, current_period_start, current_period_end, created_at
    FROM customer_subscriptions
    WHERE customer_id = $1
    ORDER BY created_at DESC
  `, customerId);

  if (subscriptions && subscriptions.length > 0) {
    subscriptions.forEach((s, idx) => {
      console.log(`${idx + 1}. Provider: ${s.provider}`);
      console.log(`   Provider Sub ID: ${s.provider_subscription_id || '-'}`);
      console.log(`   Status: ${s.status}`);
      console.log(`   Preço: ${s.price_cents ? (s.price_cents/100).toFixed(2) : '-'} ${s.currency || ''}`);
      console.log(`   Período: ${s.current_period_start || '-'} até ${s.current_period_end || '-'}`);
      console.log(`   Criado: ${s.created_at}\n`);
    });
  } else {
    console.log('❌ Nenhuma subscription encontrada!\n');
  }

  // 5. Transactions
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💰 PAYMENT TRANSACTIONS:\n');
  const transactions = await prisma.$queryRawUnsafe(`
    SELECT id, provider, provider_order_id, provider_charge_id, status, status_v2,
           amount_cents, currency, payment_method_type, installments, created_at
    FROM payment_transactions
    WHERE customer_id = $1
    ORDER BY created_at DESC
    LIMIT 10
  `, customerId);

  if (transactions && transactions.length > 0) {
    transactions.forEach((t, idx) => {
      console.log(`${idx + 1}. Provider: ${t.provider}`);
      console.log(`   Order ID: ${t.provider_order_id || '-'}`);
      console.log(`   Charge ID: ${t.provider_charge_id || '-'}`);
      console.log(`   Status: ${t.status} / ${t.status_v2 || '-'}`);
      console.log(`   Valor: ${t.amount_cents ? (t.amount_cents/100).toFixed(2) : '-'} ${t.currency || ''}`);
      console.log(`   Método: ${t.payment_method_type || '-'}`);
      console.log(`   Parcelas: ${t.installments || 1}`);
      console.log(`   Criado: ${t.created_at}\n`);
    });
  } else {
    console.log('❌ Nenhuma transaction encontrada!\n');
    console.log('💡 CAUSA: O checkout não está criando registros em payment_transactions\n');
  }

  // 6. Diagnóstico geral
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 DIAGNÓSTICO:\n');
  
  const issues = [];
  if (!providers || providers.length === 0) {
    issues.push('❌ Faltam customer_providers - o checkout não está linkando o customer ao provider');
  }
  if (!methods || methods.length === 0) {
    issues.push('❌ Faltam payment methods - o checkout não está salvando os métodos de pagamento');
  }
  if (!transactions || transactions.length === 0) {
    issues.push('❌ Faltam transactions - o checkout não está criando registros de pagamento');
  }
  
  if (issues.length === 0) {
    console.log('✅ Todos os dados estão presentes!\n');
  } else {
    issues.forEach(issue => console.log(issue));
    console.log('\n💡 PRÓXIMOS PASSOS:');
    console.log('   1. Verificar o código do checkout (subscribe/route.ts)');
    console.log('   2. Verificar se está criando customer_providers após criar o customer no provider');
    console.log('   3. Verificar se está salvando payment methods');
    console.log('   4. Verificar se está criando payment_transactions\n');
  }
}

main()
  .then(() => {
    console.log('✅ Diagnóstico completo!');
    return prisma.$disconnect();
  })
  .catch((e) => {
    console.error('\n❌ Erro:', e);
    return prisma.$disconnect().then(() => process.exit(1));
  });
