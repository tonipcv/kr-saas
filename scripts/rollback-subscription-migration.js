const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function rollbackSubscriptionMigration() {
  try {
    console.log('🔄 Iniciando rollback da migração de subscrições...\n');

    // 1. Backup dos dados atuais
    console.log('1️⃣ Fazendo backup dos dados atuais...');
    
    const clinicSubscriptions = await prisma.clinicSubscription.findMany({
      include: {
        clinic: true,
        plan: true
      }
    });

    const backupPath = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const fs = require('fs');
    fs.writeFileSync(backupPath, JSON.stringify({
      clinicSubscriptions,
      timestamp: new Date().toISOString()
    }, null, 2));
    console.log(`✅ Backup salvo em ${backupPath}\n`);

    // 2. Converter subscrições de volta para o modelo antigo
    console.log('2️⃣ Convertendo subscrições para o modelo antigo...');
    
    const conversions = await Promise.all(clinicSubscriptions.map(async (sub) => {
      // Criar plano antigo se necessário
      let oldPlan = await prisma.subscriptionPlan.findFirst({
        where: {
          name: sub.plan.name,
          maxDoctors: sub.plan.maxDoctors,
          maxPatients: sub.plan.maxPatients
        }
      });

      if (!oldPlan) {
        oldPlan = await prisma.subscriptionPlan.create({
          data: {
            name: sub.plan.name,
            description: `Migrated from clinic_plan ${sub.plan.id}`,
            price: sub.plan.price,
            maxDoctors: sub.plan.maxDoctors,
            maxPatients: sub.plan.maxPatients,
            maxProtocols: 0,
            maxCourses: 0,
            maxProducts: 0,
            trialDays: sub.plan.trialDays,
            isActive: true,
            isDefault: sub.plan.isDefault,
            features: sub.plan.features
          }
        });
      }

      // Criar unified_subscription
      return prisma.unified_subscriptions.create({
        data: {
          id: `us_${sub.id}`,
          type: 'CLINIC',
          subscriber_id: sub.clinicId,
          plan_id: oldPlan.id,
          status: sub.status,
          start_date: sub.startDate,
          end_date: sub.currentPeriodEnd,
          trial_end_date: sub.trialEndsAt,
          max_doctors: sub.plan.maxDoctors,
          max_patients: sub.plan.maxPatients,
          stripe_customer_id: sub.stripeCustomerId,
          stripe_subscription_id: sub.stripeSubscriptionId,
          auto_renew: true,
          created_at: sub.createdAt,
          updated_at: sub.updatedAt
        }
      });
    }));

    console.log(`✅ ${conversions.length} subscrições convertidas\n`);

    // 3. Atualizar roles dos membros
    console.log('3️⃣ Atualizando roles dos membros...');
    
    await prisma.$executeRaw`
      UPDATE clinic_members
      SET role = CASE
        WHEN role = 'OWNER' THEN 'ADMIN'
        WHEN role = 'PROVIDER' THEN 'DOCTOR'
        WHEN role = 'STAFF' THEN 'VIEWER'
        ELSE role
      END
    `;
    console.log('✅ Roles dos membros atualizados\n');

    // 4. Remover novas tabelas
    console.log('4️⃣ Removendo novas tabelas...');
    
    await prisma.$transaction([
      prisma.clinicSubscription.deleteMany({}),
      prisma.clinicPlan.deleteMany({})
    ]);
    console.log('✅ Tabelas removidas\n');

    // 5. Verificar consistência
    console.log('5️⃣ Verificando consistência dos dados...');
    
    const [
      totalUnifiedSubs,
      totalClinicMembers,
      totalClinics
    ] = await Promise.all([
      prisma.unified_subscriptions.count({ where: { type: 'CLINIC' } }),
      prisma.clinicMember.count(),
      prisma.clinic.count()
    ]);

    console.log('\nEstatísticas após rollback:');
    console.log(`- Subscrições unificadas: ${totalUnifiedSubs}`);
    console.log(`- Membros de clínicas: ${totalClinicMembers}`);
    console.log(`- Total de clínicas: ${totalClinics}`);

    if (totalUnifiedSubs === clinicSubscriptions.length) {
      console.log('\n✅ Rollback concluído com sucesso!');
    } else {
      console.log('\n⚠️ Aviso: Número de subscrições após rollback não corresponde ao original');
      console.log('Original:', clinicSubscriptions.length);
      console.log('Atual:', totalUnifiedSubs);
    }

  } catch (error) {
    console.error('\n❌ Erro durante rollback:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Executar rollback
if (process.env.NODE_ENV === 'production') {
  console.error('❌ Este script não deve ser executado em produção diretamente!');
  console.log('Para executar em produção:');
  console.log('1. Faça backup do banco de dados');
  console.log('2. Execute em um ambiente de staging primeiro');
  console.log('3. Defina a variável FORCE_ROLLBACK=true');
  process.exit(1);
} else if (process.env.FORCE_ROLLBACK === 'true') {
  rollbackSubscriptionMigration();
} else {
  console.log('⚠️ Para executar o rollback, defina a variável FORCE_ROLLBACK=true');
  process.exit(1);
}
