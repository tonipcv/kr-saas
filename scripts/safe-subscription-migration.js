const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkCurrentState() {
  console.log('🔍 Verificando estado atual do banco...');
  
  try {
    // Verificar se as tabelas existem
    const subscriptionPlans = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'subscription_plans'
      );
    `;
    
    const unifiedSubscriptions = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'unified_subscriptions'
      );
    `;

    // Contar registros existentes usando SQL raw
    const [{ count: plansCount }] = await prisma.$queryRaw`
      SELECT COUNT(*)::int as count FROM subscription_plans
    `;
    const [{ count: subscriptionsCount }] = await prisma.$queryRaw`
      SELECT COUNT(*)::int as count FROM unified_subscriptions
    `;

    console.log(`📊 Estado atual:
      - Planos existentes: ${plansCount}
      - Subscrições existentes: ${subscriptionsCount}
    `);

    return {
      hasExistingTables: subscriptionPlans && unifiedSubscriptions,
      plansCount,
      subscriptionsCount
    };
  } catch (error) {
    console.error('❌ Erro ao verificar estado:', error);
    throw error;
  }
}

async function createBackupTables() {
  console.log('💾 Criando tabelas de backup...');
  
  try {
    // Criar backup com timestamp
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '');
    
    await prisma.$transaction([
      // Backup dos planos
      prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS subscription_plans_backup_${timestamp} AS 
        SELECT * FROM subscription_plans
      `,
      
      // Backup das subscrições
      prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS unified_subscriptions_backup_${timestamp} AS 
        SELECT * FROM unified_subscriptions
      `
    ]);

    console.log('✅ Backups criados com sucesso!');
    return timestamp;
  } catch (error) {
    console.error('❌ Erro ao criar backups:', error);
    throw error;
  }
}

async function applyNewStructure() {
  console.log('🔄 Aplicando nova estrutura...');
  
  // Limpar tabelas existentes se houver
  await prisma.$transaction([
    prisma.$executeRaw`DROP TABLE IF EXISTS clinic_add_on_subscriptions CASCADE`,
    prisma.$executeRaw`DROP TABLE IF EXISTS clinic_subscriptions CASCADE`,
    prisma.$executeRaw`DROP TABLE IF EXISTS clinic_add_ons CASCADE`,
    prisma.$executeRaw`DROP TABLE IF EXISTS clinic_plans CASCADE`,
    prisma.$executeRaw`DROP TYPE IF EXISTS subscription_status CASCADE`,
    prisma.$executeRaw`DROP TYPE IF EXISTS plan_tier CASCADE`,
    prisma.$executeRaw`DROP TYPE IF EXISTS add_on_type CASCADE`,
    prisma.$executeRaw`DROP TYPE IF EXISTS clinic_role CASCADE`
  ]);
  
  try {
    await prisma.$transaction([
      // Criar novos enums
      prisma.$executeRaw`
        DO $$ BEGIN
          CREATE TYPE subscription_status AS ENUM (
            'TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED'
          );
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `,
      
      // Não criar o tipo PlanTier pois já existe
      
      prisma.$executeRaw`
        DO $$ BEGIN
          CREATE TYPE add_on_type AS ENUM (
            'EXTRA_DOCTOR', 'EXTRA_PATIENTS', 'ADVANCED_REPORTS',
            'CUSTOM_BRANDING', 'WHITE_LABEL', 'API_ACCESS'
          );
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `,
      
      prisma.$executeRaw`
        DO $$ BEGIN
          CREATE TYPE clinic_role AS ENUM (
            'OWNER', 'MANAGER', 'PROVIDER', 'STAFF'
          );
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `,

      // Garantir que a tabela clinics tem a constraint de PK
      prisma.$executeRaw`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint 
            WHERE conname = 'clinics_pkey'
          ) THEN
            ALTER TABLE "clinics" ADD CONSTRAINT "clinics_pkey" PRIMARY KEY ("id");
          END IF;
        END $$;
      `,

      // Criar novas tabelas
      prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "clinic_plans" (
          "id" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "tier" "PlanTier" NOT NULL,
          "description" TEXT,
          "monthly_price" DECIMAL(10,2) NOT NULL,
          "base_doctors" INTEGER NOT NULL,
          "base_patients" INTEGER NOT NULL,
          "features" JSONB NOT NULL DEFAULT '{}',
          "trial_days" INTEGER NOT NULL DEFAULT 30,
          "require_card" BOOLEAN NOT NULL DEFAULT false,
          "is_active" BOOLEAN NOT NULL DEFAULT true,
          "is_public" BOOLEAN NOT NULL DEFAULT true,
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "clinic_plans_pkey" PRIMARY KEY ("id")
        )
      `,

      // Criar tabela de subscrições
      prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "clinic_subscriptions" (
          "id" TEXT NOT NULL,
          "clinic_id" TEXT NOT NULL,
          "plan_id" TEXT NOT NULL,
          "status" "subscription_status" NOT NULL DEFAULT 'TRIAL',
          "start_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "trial_ends_at" TIMESTAMP(3) NOT NULL,
          "current_period_start" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "current_period_end" TIMESTAMP(3) NOT NULL,
          "stripe_customer_id" TEXT,
          "stripe_subscription_id" TEXT,
          "canceled_at" TIMESTAMP(3),
          "cancel_reason" TEXT,
          "current_doctors_count" INTEGER NOT NULL DEFAULT 0,
          "current_patients_count" INTEGER NOT NULL DEFAULT 0,
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "clinic_subscriptions_pkey" PRIMARY KEY ("id"),
          CONSTRAINT "fk_clinic_subscriptions_clinic" 
            FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE,
          CONSTRAINT "fk_clinic_subscriptions_plan" 
            FOREIGN KEY ("plan_id") REFERENCES "clinic_plans"("id") ON DELETE RESTRICT
        )
      `
    ]);

    console.log('✅ Nova estrutura aplicada com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao aplicar nova estrutura:', error);
    throw error;
  }
}

async function migrateData(backupTimestamp) {
  console.log('📦 Migrando dados...');
  
  try {
    // Contar registros antes
    const beforeCount = await prisma.$queryRaw`
      SELECT COUNT(*) FROM unified_subscriptions
    `;
    
    // Migrar dados
    await prisma.$transaction(async (tx) => {
      // Pegar planos existentes
      const existingPlans = await tx.$queryRaw`
        SELECT * FROM subscription_plans
      `;
      
      // Remover duplicatas e planos inválidos
      const uniquePlans = existingPlans.reduce((acc, plan) => {
        // Se já existe um plano com este ID, manter apenas o mais recente
        const existing = acc.get(plan.id);
        if (!existing || new Date(plan.updatedAt) > new Date(existing.updatedAt)) {
          acc.set(plan.id, plan);
        }
        return acc;
      }, new Map());

      console.log(`Encontrados ${existingPlans.length} planos, ${uniquePlans.size} únicos após deduplicação`);

      // Mapear para nova estrutura com validação
      for (const plan of uniquePlans.values()) {
        // Garantir valores padrão seguros
        const safeData = {
          id: plan.id || generateId(),
          name: plan.name || 'Plano Padrão',
          tier: determineTier(plan),
          price: plan.price || 0,
          maxDoctors: Math.max(1, plan.max_doctors || 1),
          maxPatients: Math.max(200, plan.max_patients || 200),
          features: mapFeatures(plan),
          isActive: typeof plan.is_active === 'boolean' ? plan.is_active : true
        };

        console.log('Inserindo plano:', safeData);

        await tx.$executeRaw`
          INSERT INTO clinic_plans (
            id, name, tier, description, monthly_price, base_doctors, base_patients,
            features, trial_days, require_card, is_active, is_public,
            created_at, updated_at
          ) VALUES (
            ${safeData.id},
            ${safeData.name},
            ${safeData.tier}::"PlanTier",
            'Plano migrado automaticamente',
            ${safeData.price}::decimal,
            ${safeData.maxDoctors},
            ${safeData.maxPatients},
            ${JSON.stringify(safeData.features)}::jsonb,
            30,
            false,
            ${safeData.isActive},
            true,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
          )
        `;
      }
      
      // Migrar subscrições (apenas as mais recentes por clínica)
      const existingSubs = await tx.$queryRaw`
        WITH RankedSubs AS (
          SELECT 
            us.*,
            c.id as clinic_id,
            ROW_NUMBER() OVER (PARTITION BY us.subscriber_id ORDER BY us.updated_at DESC) as rn
          FROM unified_subscriptions us
          JOIN clinics c ON us.subscriber_id = c.id
          WHERE us.type = 'CLINIC'
        )
        SELECT * FROM RankedSubs WHERE rn = 1
      `;
      
      for (const sub of existingSubs) {
        await tx.$executeRaw`
          INSERT INTO clinic_subscriptions (
            id, clinic_id, plan_id, status,
            start_date, trial_ends_at,
            current_period_start, current_period_end,
            created_at, updated_at
          ) VALUES (
            'cs_' || ${sub.id},
            ${sub.clinic_id},
            ${sub.plan_id},
            ${mapStatus(sub.status)}::subscription_status,
            ${sub.start_date},
            ${sub.trial_end_date || addDays(sub.start_date, 30)},
            ${sub.start_date},
            ${sub.end_date || addDays(sub.start_date, 30)},
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
          )
        `;
      }
    });

    // Verificar migração
    const [{ count: afterCount }] = await prisma.$queryRaw`
      SELECT COUNT(*)::int as count FROM clinic_subscriptions
    `;
    console.log(`✅ Migração concluída! (${beforeCount.count} -> ${afterCount} registros)`);
    
  } catch (error) {
    console.error('❌ Erro ao migrar dados:', error);
    await rollback(backupTimestamp);
    throw error;
  }
}

async function rollback(backupTimestamp) {
  console.log('⚠️ Iniciando rollback...');
  
  try {
    await prisma.$transaction([
      // Restaurar dados dos backups
      prisma.$executeRaw`
        INSERT INTO subscription_plans 
        SELECT * FROM subscription_plans_backup_${backupTimestamp}
      `,
      
      prisma.$executeRaw`
        INSERT INTO unified_subscriptions 
        SELECT * FROM unified_subscriptions_backup_${backupTimestamp}
      `
    ]);
    
    console.log('✅ Rollback concluído com sucesso!');
  } catch (error) {
    console.error('❌ Erro durante rollback:', error);
    console.error('⚠️ ATENÇÃO: Backups ainda disponíveis nas tabelas:');
    console.error(`- subscription_plans_backup_${backupTimestamp}`);
    console.error(`- unified_subscriptions_backup_${backupTimestamp}`);
    throw error;
  }
}

// Funções helpers
function generateId() {
  return 'cp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function determineTier(plan) {
  // Mapear nome do plano para tier
  const nameToTier = {
    'Free': 'STARTER',
    'Básico': 'STARTER',
    'Starter': 'STARTER',
    'Creator': 'GROWTH',
    'Enterprise': 'ENTERPRISE'
  };

  // Primeiro tentar pelo nome
  if (nameToTier[plan.name]) {
    return nameToTier[plan.name];
  }

  // Se não encontrar pelo nome, usar a lógica de limites
  if (plan.maxDoctors <= 2 || plan.price === 0) return 'STARTER';
  if (plan.maxDoctors <= 5 && plan.price < 1000) return 'GROWTH';
  return 'ENTERPRISE';
}

function mapFeatures(plan) {
  let features;
  
  // Tentar parsear se for string
  if (typeof plan.features === 'string') {
    try {
      features = JSON.parse(plan.features);
    } catch (e) {
      features = {};
    }
  } else {
    features = plan.features || {};
  }

  return {
    customBranding: features.customBranding || false,
    advancedReports: features.advancedReports || false,
    apiAccess: features.apiAccess || false,
    maxReferralsPerMonth: features.maxReferralsPerMonth || 0,
    allowPurchaseCredits: features.allowPurchaseCredits || false,
    maxRewards: features.maxRewards || 0,
    allowCampaigns: features.allowCampaigns || false,
    price: features.price || plan.price || 0
  };
}

function mapStatus(status) {
  const statusMap = {
    'TRIAL': 'TRIAL',
    'ACTIVE': 'ACTIVE',
    'CANCELED': 'CANCELED',
    'EXPIRED': 'EXPIRED',
    'PAST_DUE': 'PAST_DUE'
  };
  return statusMap[status] || 'ACTIVE';
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// Função principal
async function safeMigration() {
  console.log('🚀 Iniciando migração segura...');
  
  // Criar log detalhado
  const migrationLog = {
    startTime: new Date(),
    steps: [],
    errors: [],
    warnings: []
  };

  function logStep(step, details) {
    console.log(`[${new Date().toISOString()}] ${step}`);
    migrationLog.steps.push({ time: new Date(), step, details });
  }

  function logError(error, context) {
    console.error(`❌ [${new Date().toISOString()}] Erro:`, error.message);
    migrationLog.errors.push({ time: new Date(), error: error.message, context });
  }

  function logWarning(message, context) {
    console.warn(`⚠️ [${new Date().toISOString()}] Aviso:`, message);
    migrationLog.warnings.push({ time: new Date(), message, context });
  }
  
  let backupTimestamp;
  
  try {
    // 1. Verificar estado atual
    const state = await checkCurrentState();
    if (!state.hasExistingTables) {
      throw new Error('Tabelas necessárias não encontradas!');
    }
    
    // 2. Criar backups
    backupTimestamp = await createBackupTables();
    
    // 3. Aplicar nova estrutura
    await applyNewStructure();
    
    // 4. Migrar dados
    await migrateData(backupTimestamp);
    
    console.log('✨ Migração concluída com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro durante migração:', error);
    if (backupTimestamp) {
      console.log('🔄 Tentando rollback...');
      await rollback(backupTimestamp);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Executar apenas se chamado diretamente
if (require.main === module) {
  safeMigration();
}
