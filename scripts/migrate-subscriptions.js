const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Planos padrão para serem criados
const DEFAULT_PLANS = [
  {
    id: 'plan_starter',
    name: 'Starter',
    tier: 'STARTER',
    monthlyPrice: 499,
    baseDoctors: 2,
    basePatients: 200,
    features: {},
    isPublic: true
  },
  {
    id: 'plan_growth',
    name: 'Growth',
    tier: 'GROWTH',
    monthlyPrice: 999,
    baseDoctors: 5,
    basePatients: 1000,
    features: {
      customBranding: true
    },
    isPublic: true
  },
  {
    id: 'plan_enterprise',
    name: 'Enterprise',
    tier: 'ENTERPRISE',
    monthlyPrice: 0, // Sob consulta
    baseDoctors: 999999,
    basePatients: 999999,
    features: {
      customBranding: true,
      advancedReports: true,
      apiAccess: true,
      whiteLabel: true
    },
    isPublic: false
  }
];

// Add-ons padrão
const DEFAULT_ADDONS = [
  {
    type: 'EXTRA_DOCTOR',
    name: 'Profissional Adicional',
    description: 'Adicione mais um profissional à sua equipe',
    monthlyPrice: 99,
    quantity: 1
  },
  {
    type: 'EXTRA_PATIENTS',
    name: 'Pacote de Pacientes',
    description: 'Mais 500 pacientes ativos',
    monthlyPrice: 199,
    quantity: 500
  },
  {
    type: 'ADVANCED_REPORTS',
    name: 'Relatórios Avançados',
    description: 'Análises detalhadas e dashboards personalizados',
    monthlyPrice: 249,
    quantity: 1
  }
];

// Função para determinar plano apropriado baseado no uso atual
async function determineAppropriatePlan(subscription, clinic) {
  const currentDoctors = await prisma.clinicMember.count({
    where: { 
      clinicId: clinic.id,
      isActive: true,
      role: 'PROVIDER'
    }
  });

  const currentPatients = await prisma.patientProfile.count({
    where: { clinicId: clinic.id, isActive: true }
  });

  // Log para auditoria
  const migrationLog = {
    oldSubscriptionId: subscription.id,
    clinicId: clinic.id,
    currentDoctors,
    currentPatients,
    migrationCase: 'DIRECT_MATCH',
    details: {
      oldPlan: subscription.plan_id,
      currentUsage: { doctors: currentDoctors, patients: currentPatients }
    }
  };

  // Determinar plano baseado no uso
  if (currentDoctors <= 2 && currentPatients <= 200) {
    return { planId: 'plan_starter', migrationLog };
  } else if (currentDoctors <= 5 && currentPatients <= 1000) {
    return { planId: 'plan_growth', migrationLog };
  } else {
    migrationLog.migrationCase = 'MANUAL_REVIEW';
    migrationLog.details.reason = 'Usage exceeds standard plans';
    return { planId: 'plan_enterprise', migrationLog };
  }
}

// Função principal de migração
async function migrateSubscriptions() {
  console.log('Iniciando migração de subscrições...');
  
  try {
    // 1. Criar planos padrão
    console.log('Criando planos padrão...');
    for (const plan of DEFAULT_PLANS) {
      await prisma.clinicPlan.upsert({
        where: { id: plan.id },
        update: plan,
        create: plan
      });
    }

    // 2. Criar add-ons padrão
    console.log('Criando add-ons padrão...');
    for (const addon of DEFAULT_ADDONS) {
      await prisma.clinicAddOn.create({
        data: addon
      });
    }

    // 3. Migrar subscrições existentes
    console.log('Migrando subscrições existentes...');
    const existingSubscriptions = await prisma.unifiedSubscription.findMany({
      where: { type: 'CLINIC' },
      include: {
        clinic_relation: true
      }
    });

    for (const subscription of existingSubscriptions) {
      console.log(`Migrando subscrição ${subscription.id}...`);
      
      try {
        // Determinar plano apropriado
        const { planId, migrationLog } = await determineAppropriatePlan(
          subscription,
          subscription.clinic_relation
        );

        // Criar nova subscrição
        const newSubscription = await prisma.clinicSubscription.create({
          data: {
            clinicId: subscription.clinic_relation.id,
            planId: planId,
            status: subscription.status === 'TRIAL' ? 'TRIAL' : 'ACTIVE',
            startDate: subscription.start_date,
            trialEndsAt: subscription.trial_end_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            currentPeriodStart: subscription.start_date,
            currentPeriodEnd: subscription.end_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            stripeCustomerId: null, // Será atualizado posteriormente
            stripeSubscriptionId: null, // Será atualizado posteriormente
          }
        });

        // Criar log de migração
        await prisma.subscriptionMigrationLog.create({
          data: {
            oldSubscriptionId: subscription.id,
            clinicId: subscription.clinic_relation.id,
            migrationCase: migrationLog.migrationCase,
            details: migrationLog.details,
            needsReview: migrationLog.migrationCase === 'MANUAL_REVIEW'
          }
        });

        console.log(`Subscrição ${subscription.id} migrada com sucesso!`);
      } catch (error) {
        console.error(`Erro ao migrar subscrição ${subscription.id}:`, error);
        
        // Criar log de erro
        await prisma.subscriptionMigrationLog.create({
          data: {
            oldSubscriptionId: subscription.id,
            clinicId: subscription.clinic_relation.id,
            migrationCase: 'ERROR',
            details: {
              error: error.message,
              stack: error.stack
            },
            needsReview: true
          }
        });
      }
    }

    console.log('Migração concluída com sucesso!');
    
    // 4. Gerar relatório final
    const migrationStats = await prisma.subscriptionMigrationLog.groupBy({
      by: ['migrationCase'],
      _count: true
    });

    console.log('\nRelatório de Migração:');
    console.table(migrationStats);

    const needsReview = await prisma.subscriptionMigrationLog.count({
      where: { needsReview: true }
    });

    if (needsReview > 0) {
      console.log(`\n⚠️ ${needsReview} casos precisam de revisão manual!`);
    }

  } catch (error) {
    console.error('Erro fatal durante a migração:', error);
    throw error;
  }
}

// Função de rollback
async function rollbackMigration() {
  console.log('Iniciando rollback...');
  
  try {
    // Executar função de rollback do PostgreSQL
    await prisma.$executeRaw`SELECT rollback_subscription_migration()`;
    console.log('Rollback concluído com sucesso!');
  } catch (error) {
    console.error('Erro durante rollback:', error);
    throw error;
  }
}

// Executar migração com tratamento de erro
if (require.main === module) {
  migrateSubscriptions()
    .catch(async (error) => {
      console.error('Erro durante migração, iniciando rollback...', error);
      await rollbackMigration();
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
