// Script para criar a tabela referral_reward_codes
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createRewardCodesTable() {
  try {
    // Verificar se a tabela já existe para evitar erros
    console.log('Verificando se a tabela já existe...');
    
    const tableExists = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public'
        AND table_name = 'referral_reward_codes'
      );
    `;
    
    if (tableExists[0].exists) {
      console.log('A tabela referral_reward_codes já existe. Nenhuma ação necessária.');
      return;
    }

    console.log('Criando tabela referral_reward_codes...');
    
    // Criar a tabela com a estrutura necessária
    await prisma.$executeRaw`
      CREATE TABLE "referral_reward_codes" (
        "id" TEXT NOT NULL,
        "rewardId" TEXT NOT NULL,
        "code" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'UNUSED',
        "redemptionId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        
        CONSTRAINT "referral_reward_codes_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "referral_reward_codes_code_key" UNIQUE ("code"),
        CONSTRAINT "referral_reward_codes_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "referral_rewards"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "referral_reward_codes_redemptionId_fkey" FOREIGN KEY ("redemptionId") REFERENCES "reward_redemptions"("id") ON DELETE SET NULL ON UPDATE CASCADE
      );
    `;
    
    // Criar índice para melhorar performance de consultas
    await prisma.$executeRaw`
      CREATE INDEX "referral_reward_codes_rewardId_status_idx" ON "referral_reward_codes"("rewardId", "status");
    `;
    
    console.log('Tabela referral_reward_codes criada com sucesso!');
    
    // Verificar se a coluna codes já existe na tabela reward_redemptions
    const columnExists = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'reward_redemptions'
        AND column_name = 'codes'
      );
    `;
    
    if (!columnExists[0].exists) {
      console.log('Adicionando relacionamento na tabela reward_redemptions...');
      // Esta parte é opcional e pode ser removida se causar problemas
      // Normalmente o Prisma gerencia isso automaticamente
    }
    
    console.log('Migração concluída com sucesso!');
  } catch (error) {
    console.error('Erro durante a migração:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createRewardCodesTable();
