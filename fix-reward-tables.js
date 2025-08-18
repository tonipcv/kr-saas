// Script para corrigir as tabelas de recompensas
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixRewardTables() {
  try {
    console.log('Iniciando correções nas tabelas de recompensas...');
    
    // 1. Verificar e adicionar a coluna uniqueCode na tabela reward_redemptions
    console.log('Verificando coluna uniqueCode em reward_redemptions...');
    
    const uniqueCodeExists = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'reward_redemptions'
        AND column_name = 'uniquecode'
      );
    `;
    
    if (!uniqueCodeExists[0].exists) {
      console.log('Adicionando coluna uniqueCode à tabela reward_redemptions...');
      await prisma.$executeRaw`
        ALTER TABLE "reward_redemptions" ADD COLUMN IF NOT EXISTS "uniqueCode" TEXT;
      `;
      console.log('Coluna uniqueCode adicionada com sucesso!');
    } else {
      console.log('Coluna uniqueCode já existe em reward_redemptions.');
    }
    
    // 2. Verificar e criar a tabela referral_reward_codes se não existir
    console.log('Verificando tabela referral_reward_codes...');
    
    const tableExists = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public'
        AND table_name = 'referral_reward_codes'
      );
    `;
    
    if (!tableExists[0].exists) {
      console.log('Criando tabela referral_reward_codes...');
      
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
      
      await prisma.$executeRaw`
        CREATE INDEX "referral_reward_codes_rewardId_status_idx" ON "referral_reward_codes"("rewardId", "status");
      `;
      
      console.log('Tabela referral_reward_codes criada com sucesso!');
    } else {
      console.log('Tabela referral_reward_codes já existe.');
    }
    
    console.log('Correções concluídas com sucesso!');
    console.log('Por favor, execute "npx prisma generate" para atualizar o cliente Prisma.');
    
  } catch (error) {
    console.error('Erro durante as correções:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixRewardTables();
