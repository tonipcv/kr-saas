const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function validateMigration() {
  console.log('🔍 Iniciando validação da migração...\n');
  
  const validation = {
    planos: {
      antigos: 0,
      novos: 0,
      status: 'pending',
      detalhes: []
    },
    subscriptions: {
      antigas: 0,
      novas: 0,
      status: 'pending',
      detalhes: []
    },
    integridade: {
      planosOrfaos: 0,
      subscriptionsSemPlano: 0,
      clinicasSemSubscription: 0,
      status: 'pending',
      detalhes: []
    }
  };

  try {
    // 1. Validar Planos
    console.log('📊 Validando planos...');
    
    const [{ count: oldPlansCount }] = await prisma.$queryRaw`
      SELECT COUNT(*)::int as count FROM subscription_plans
    `;
    
    const [{ count: newPlansCount }] = await prisma.$queryRaw`
      SELECT COUNT(*)::int as count FROM clinic_plans
    `;

    validation.planos.antigos = oldPlansCount;
    validation.planos.novos = newPlansCount;
    
    // Verificar mapeamento de planos
    const planosMapeados = await prisma.$queryRaw`
      SELECT 
        sp.id as old_id,
        sp.name as old_name,
        cp.id as new_id,
        cp.name as new_name,
        cp.tier
      FROM subscription_plans sp
      LEFT JOIN clinic_plans cp ON cp.name = sp.name
      WHERE sp."isActive" = true
    `;

    validation.planos.detalhes = planosMapeados;
    validation.planos.status = planosMapeados.length > 0 ? 'success' : 'error';

    // 2. Validar Subscriptions
    console.log('\n📊 Validando subscrições...');
    
    const [{ count: oldSubsCount }] = await prisma.$queryRaw`
      SELECT COUNT(*)::int as count 
      FROM unified_subscriptions 
      WHERE type = 'CLINIC'
    `;
    
    const [{ count: newSubsCount }] = await prisma.$queryRaw`
      SELECT COUNT(*)::int as count FROM clinic_subscriptions
    `;

    validation.subscriptions.antigas = oldSubsCount;
    validation.subscriptions.novas = newSubsCount;
    
    // Verificar mapeamento de subscrições
    const subscriptionsMapeadas = await prisma.$queryRaw`
      SELECT 
        us.id as old_id,
        us.subscriber_id as clinic_id,
        cs.id as new_id,
        cs.status,
        c.name as clinic_name
      FROM unified_subscriptions us
      JOIN clinics c ON c.id = us.subscriber_id
      LEFT JOIN clinic_subscriptions cs ON cs.clinic_id = us.subscriber_id
      WHERE us.type = 'CLINIC'
      ORDER BY c.name
    `;

    validation.subscriptions.detalhes = subscriptionsMapeadas;
    validation.subscriptions.status = 
      oldSubsCount > 0 && newSubsCount >= oldSubsCount ? 'success' : 'warning';

    // 3. Validar Integridade
    console.log('\n🔍 Validando integridade referencial...');
    
    // Planos órfãos (sem subscrições)
    const orphanPlans = await prisma.$queryRaw`
      SELECT cp.id, cp.name, cp.tier, cp.created_at
      FROM clinic_plans cp
      LEFT JOIN clinic_subscriptions cs ON cs.plan_id = cp.id
      WHERE cs.id IS NULL
    `;
    
    const orphanPlansCount = orphanPlans.length;
    validation.integridade.planosOrfaosDetalhes = orphanPlans;

    // Subscrições sem plano válido
    const [{ count: subsWithoutPlanCount }] = await prisma.$queryRaw`
      SELECT COUNT(*)::int as count
      FROM clinic_subscriptions cs
      LEFT JOIN clinic_plans cp ON cp.id = cs.plan_id
      WHERE cp.id IS NULL
    `;

    // Clínicas sem subscrição
    const [{ count: clinicsWithoutSubCount }] = await prisma.$queryRaw`
      SELECT COUNT(*)::int as count
      FROM clinics c
      LEFT JOIN clinic_subscriptions cs ON cs.clinic_id = c.id
      WHERE cs.id IS NULL AND c."isActive" = true
    `;

    validation.integridade.planosOrfaos = orphanPlansCount;
    validation.integridade.subscriptionsSemPlano = subsWithoutPlanCount;
    validation.integridade.clinicasSemSubscription = clinicsWithoutSubCount;
    validation.integridade.status = 
      subsWithoutPlanCount === 0 && clinicsWithoutSubCount === 0 ? 'success' : 'error';

    // Gerar relatório final
    console.log('\n📝 Relatório Final:');
    console.log('-------------------');
    console.log('Planos:');
    console.log('- Antigos: ' + validation.planos.antigos);
    console.log('- Novos: ' + validation.planos.novos);
    console.log('- Status: ' + validation.planos.status);
    
    console.log('\nSubscriptions:');
    console.log('- Antigas: ' + validation.subscriptions.antigas);
    console.log('- Novas: ' + validation.subscriptions.novas);
    console.log('- Status: ' + validation.subscriptions.status);
    
    console.log('\nIntegridade:');
    console.log('- Planos órfãos: ' + validation.integridade.planosOrfaos);
    console.log('- Subscriptions sem plano: ' + validation.integridade.subscriptionsSemPlano);
    console.log('- Clínicas sem subscription: ' + validation.integridade.clinicasSemSubscription);
    console.log('- Status: ' + validation.integridade.status);

    // Salvar relatório detalhado
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '');
    const fs = require('fs');
    fs.writeFileSync(
      'migration-validation-' + timestamp + '.json',
      JSON.stringify(validation, null, 2)
    );

    console.log('\n✅ Relatório detalhado salvo em migration-validation-' + timestamp + '.json');

    return validation;
  } catch (error) {
    console.error('❌ Erro durante validação:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Executar validação
if (require.main === module) {
  validateMigration()
    .catch(console.error);
}
