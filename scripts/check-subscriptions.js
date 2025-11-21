#!/usr/bin/env node
/**
 * Script de diagnóstico para verificar dados de assinaturas
 * Uso: node scripts/check-subscriptions.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Verificando últimas assinaturas...\n');

  // Buscar últimas 5 assinaturas
  const subs = await prisma.$queryRawUnsafe(`
    SELECT 
      id,
      provider,
      provider_subscription_id,
      status,
      start_at,
      current_period_start,
      current_period_end,
      price_cents,
      currency,
      metadata,
      created_at,
      updated_at
    FROM customer_subscriptions
    ORDER BY created_at DESC
    LIMIT 5
  `);

  if (!subs || subs.length === 0) {
    console.log('❌ Nenhuma assinatura encontrada no banco');
    return;
  }

  console.log(`✅ Encontradas ${subs.length} assinaturas:\n`);

  subs.forEach((sub, idx) => {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📋 Assinatura ${idx + 1}:`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`ID: ${sub.id}`);
    console.log(`Provider: ${sub.provider}`);
    console.log(`Provider Sub ID: ${sub.provider_subscription_id}`);
    console.log(`Status: ${sub.status}`);
    console.log(`\n📅 DATAS:`);
    console.log(`  start_at: ${sub.start_at || '❌ NULL'}`);
    console.log(`  current_period_start: ${sub.current_period_start || '❌ NULL'}`);
    console.log(`  current_period_end: ${sub.current_period_end || '❌ NULL'}`);
    console.log(`  created_at: ${sub.created_at}`);
    console.log(`  updated_at: ${sub.updated_at}`);
    
    console.log(`\n💰 PREÇO:`);
    console.log(`  price_cents: ${sub.price_cents || '❌ NULL'}`);
    console.log(`  currency: ${sub.currency || '❌ NULL'}`);
    
    console.log(`\n📦 METADATA:`);
    if (sub.metadata) {
      const meta = typeof sub.metadata === 'string' ? JSON.parse(sub.metadata) : sub.metadata;
      console.log(`  interval: ${meta.interval || '❌ MISSING'}`);
      console.log(`  intervalCount: ${meta.intervalCount || '❌ MISSING'}`);
      console.log(`  buyerName: ${meta.buyerName || '-'}`);
      console.log(`  buyerEmail: ${meta.buyerEmail || '-'}`);
      console.log(`  productId: ${meta.productId || '-'}`);
      console.log(`  offerId: ${meta.offerId || '-'}`);
    } else {
      console.log(`  ❌ metadata é NULL`);
    }
    
    console.log(`\n🔍 DIAGNÓSTICO:`);
    const issues = [];
    if (!sub.current_period_start) issues.push('❌ current_period_start está NULL');
    if (!sub.current_period_end) issues.push('❌ current_period_end está NULL (Expires não vai aparecer)');
    if (!sub.metadata) {
      issues.push('❌ metadata está NULL');
    } else {
      const meta = typeof sub.metadata === 'string' ? JSON.parse(sub.metadata) : sub.metadata;
      if (!meta.interval) issues.push('❌ metadata.interval está faltando (Charged Every não vai aparecer)');
      if (!meta.intervalCount) issues.push('❌ metadata.intervalCount está faltando');
    }
    
    if (issues.length === 0) {
      console.log(`  ✅ Todos os campos necessários estão preenchidos!`);
    } else {
      issues.forEach(issue => console.log(`  ${issue}`));
    }
    console.log('');
  });

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  // Verificar colunas da tabela
  console.log('🔧 Verificando estrutura da tabela customer_subscriptions...\n');
  const columns = await prisma.$queryRawUnsafe(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'customer_subscriptions'
    AND column_name IN ('current_period_start', 'current_period_end', 'metadata', 'start_at')
    ORDER BY ordinal_position
  `);
  
  console.log('Colunas relevantes:');
  columns.forEach(col => {
    console.log(`  ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
  });
}

main()
  .then(() => {
    console.log('\n✅ Diagnóstico completo!');
    return prisma.$disconnect();
  })
  .catch((e) => {
    console.error('\n❌ Erro:', e);
    return prisma.$disconnect().then(() => process.exit(1));
  });
