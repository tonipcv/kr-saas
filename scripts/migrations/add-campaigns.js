/**
 * Migração SQL para adicionar tabelas de campanha
 * 
 * Execução:
 * node scripts/migrations/add-campaigns.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando migração de campanhas...');
  
  try {
    // 1. Criar tabela campaigns
    console.log('Criando tabela campaigns...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "campaigns" (
        "id" TEXT NOT NULL,
        "doctor_id" TEXT NOT NULL,
        "campaign_slug" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "description" TEXT,
        "benefit_title" TEXT,
        "benefit_description" TEXT,
        "hero_image_url" TEXT,
        "form_config" JSONB,
        "status" TEXT NOT NULL DEFAULT 'DRAFT',
        "valid_from" TIMESTAMP(3),
        "valid_until" TIMESTAMP(3),
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        
        CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "campaigns_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    
    // Criar índices para campaigns
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "campaigns_doctor_id_campaign_slug_key" 
      ON "campaigns"("doctor_id", "campaign_slug")
    `);
    
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "campaigns_status_valid_until_idx" 
      ON "campaigns"("status", "valid_until")
    `);
    
    console.log('✅ Tabela campaigns criada');
    
    // 2. Adicionar campos à tabela referral_leads
    console.log('Adicionando campos à tabela referral_leads...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "referral_leads" 
      ADD COLUMN IF NOT EXISTS "campaign_id" TEXT
    `);
    
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "referral_leads" 
      ADD COLUMN IF NOT EXISTS "utm_source" TEXT
    `);
    
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "referral_leads" 
      ADD COLUMN IF NOT EXISTS "utm_medium" TEXT
    `);
    
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "referral_leads" 
      ADD COLUMN IF NOT EXISTS "utm_campaign" TEXT
    `);
    
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "referral_leads" 
      ADD COLUMN IF NOT EXISTS "referrer" TEXT
    `);
    
    // Adicionar foreign key (somente se não existir)
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint c
          JOIN pg_class t ON c.conrelid = t.oid
          WHERE c.conname = 'ReferralLead_campaign_id_fkey'
            AND t.relname = 'referral_leads'
        ) THEN
          ALTER TABLE "referral_leads"
          ADD CONSTRAINT "ReferralLead_campaign_id_fkey" 
          FOREIGN KEY ("campaign_id") 
          REFERENCES "campaigns"("id") 
          ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END$$;
    `);
    
    // Índice para campaign_id
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ReferralLead_campaign_id_idx" 
      ON "referral_leads"("campaign_id")
    `);
    
    console.log('✅ Campos adicionados à tabela referral_leads');
    
    // 3. Criar tabela de eventos de campanha para analytics
    console.log('Criando tabela campaign_events...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "campaign_events" (
        "id" TEXT NOT NULL,
        "campaign_id" TEXT NOT NULL,
        "event_type" TEXT NOT NULL,
        "user_id" TEXT,
        "ip_address" TEXT,
        "metadata" JSONB,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        
        CONSTRAINT "campaign_events_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "campaign_events_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    
    // Índices para campaign_events
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "campaign_events_campaign_id_event_type_idx" 
      ON "campaign_events"("campaign_id", "event_type")
    `);
    
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "campaign_events_created_at_idx" 
      ON "campaign_events"("created_at")
    `);
    
    console.log('✅ Tabela campaign_events criada');
    
    // 4. Adicionar feature flags por médico (para rollout gradual)
    console.log('Criando tabela doctor_feature_flags...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "doctor_feature_flags" (
        "id" TEXT NOT NULL,
        "doctor_id" TEXT NOT NULL,
        "feature_name" TEXT NOT NULL,
        "enabled" BOOLEAN NOT NULL DEFAULT false,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        
        CONSTRAINT "doctor_feature_flags_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "doctor_feature_flags_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    
    // Índice único para doctor_id + feature_name
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "doctor_feature_flags_doctor_id_feature_name_key" 
      ON "doctor_feature_flags"("doctor_id", "feature_name")
    `);
    
    console.log('✅ Tabela doctor_feature_flags criada');
    
    console.log('✅ Migração concluída com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro na migração:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
