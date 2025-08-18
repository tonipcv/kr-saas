// Script para analisar e corrigir dados de créditos e resgates
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

// Função auxiliar para converter BigInt para Number em resultados JSON
function formatResult(result) {
  return JSON.stringify(result, (key, value) => 
    typeof value === 'bigint' ? Number(value) : value
  , 2);
}

async function main() {
  try {
    console.log('=== ANÁLISE DE CRÉDITOS E RESGATES ===');
    
    // 1. Verificar créditos marcados como usados sem resgates associados
    console.log('\n1. Créditos marcados como usados sem resgates associados:');
    const creditosSemResgates = await prisma.$queryRaw`
      SELECT 
        rc.id, 
        rc.amount, 
        rc."userId", 
        rc."usedForRewardId", 
        rc."usedAt"
      FROM 
        referral_credits rc
      LEFT JOIN 
        reward_redemptions rr ON rc."usedForRewardId" = rr.id
      WHERE 
        rc."isUsed" = true 
        AND rc."usedForRewardId" IS NOT NULL
        AND rr.id IS NULL;
    `;
    console.log(formatResult(creditosSemResgates));
    console.log(`Total: ${creditosSemResgates.length} créditos inconsistentes`);
    
    // 2. Verificar resgates aprovados sem créditos associados
    console.log('\n2. Resgates aprovados sem créditos associados:');
    const resgatesSemCreditos = await prisma.$queryRaw`
      SELECT 
        rr.id, 
        rr."userId", 
        rr.status, 
        rr."creditsUsed", 
        rr."fulfilledAt",
        rw.title as reward_title
      FROM 
        reward_redemptions rr
      LEFT JOIN
        referral_rewards rw ON rr."rewardId" = rw.id
      LEFT JOIN 
        referral_credits rc ON rc."usedForRewardId" = rr.id
      WHERE 
        rr.status = 'APPROVED' 
        AND rc.id IS NULL;
    `;
    console.log(formatResult(resgatesSemCreditos));
    console.log(`Total: ${resgatesSemCreditos.length} resgates sem créditos associados`);
    
    // 3. Verificar saldo de créditos por usuário
    console.log('\n3. Saldo de créditos por usuário:');
    const saldoCreditos = await prisma.$queryRaw`
      SELECT 
        u.id as user_id, 
        u.name, 
        u.email,
        SUM(CASE WHEN rc."isUsed" = false THEN rc.amount ELSE 0 END) as creditos_disponiveis,
        SUM(CASE WHEN rc."isUsed" = true THEN rc.amount ELSE 0 END) as creditos_usados,
        SUM(rc.amount) as total_creditos,
        COUNT(CASE WHEN rc."isUsed" = false THEN 1 END) as qtd_creditos_disponiveis
      FROM 
        "User" u
      LEFT JOIN 
        referral_credits rc ON u.id = rc."userId"
      GROUP BY 
        u.id, u.name, u.email
      HAVING 
        SUM(CASE WHEN rc."isUsed" = false THEN rc.amount ELSE 0 END) > 0
      ORDER BY 
        creditos_disponiveis DESC;
    `;
    console.log(formatResult(saldoCreditos));
    console.log(`Total: ${saldoCreditos.length} usuários com créditos disponíveis`);
    
    // 4. Estatísticas de resgates por status
    console.log('\n4. Estatísticas de resgates por status:');
    const estatisticasResgates = await prisma.$queryRaw`
      SELECT 
        status, 
        COUNT(*) as quantidade,
        SUM("creditsUsed") as total_creditos
      FROM 
        reward_redemptions
      GROUP BY 
        status;
    `;
    console.log(formatResult(estatisticasResgates));
    
    // 5. Verificar códigos de recompensa inconsistentes
    console.log('\n5. Códigos de recompensa inconsistentes:');
    const codigosInconsistentes = await prisma.$queryRaw`
      SELECT 
        rrc.id, 
        rrc.code, 
        rrc.status, 
        rrc."redemptionId",
        rr.status as redemption_status
      FROM 
        referral_reward_codes rrc
      LEFT JOIN 
        reward_redemptions rr ON rrc."redemptionId" = rr.id
      WHERE 
        (rrc.status = 'USED' AND (rr.id IS NULL OR rr.status != 'APPROVED'))
        OR (rrc.status = 'UNUSED' AND rr.status = 'APPROVED');
    `;
    console.log(formatResult(codigosInconsistentes));
    console.log(`Total: ${codigosInconsistentes.length} códigos inconsistentes`);
    
    // 6. Verificar resgates rejeitados e créditos estornados
    console.log('\n6. Resgates rejeitados e créditos estornados:');
    const resgatesRejeitados = await prisma.$queryRaw`
      SELECT 
        rr.id, 
        rr."userId", 
        rr.status, 
        rr."creditsUsed", 
        rr."rejectedAt",
        rr."rejectionReason",
        u.name as user_name,
        u.email as user_email,
        rw.title as reward_title
      FROM 
        reward_redemptions rr
      LEFT JOIN
        "User" u ON rr."userId" = u.id
      LEFT JOIN
        referral_rewards rw ON rr."rewardId" = rw.id
      WHERE 
        rr.status = 'REJECTED';
    `;
    console.log(formatResult(resgatesRejeitados));
    console.log(`Total: ${resgatesRejeitados.length} resgates rejeitados`);
    
    // Opção para corrigir inconsistências (descomentado para executar)
    /*
    if (creditosSemResgates.length > 0) {
      console.log('\nCorrigindo créditos sem resgates associados...');
      const correcaoCreditos = await prisma.$executeRaw`
        UPDATE referral_credits
        SET "isUsed" = false, "usedAt" = NULL, "usedForRewardId" = NULL
        WHERE "isUsed" = true 
          AND "usedForRewardId" IS NOT NULL
          AND "usedForRewardId" NOT IN (SELECT id FROM reward_redemptions);
      `;
      console.log(`Créditos corrigidos: ${correcaoCreditos}`);
    }
    
    if (codigosInconsistentes.length > 0) {
      console.log('\nCorrigindo códigos inconsistentes...');
      const correcaoCodigos = await prisma.$executeRaw`
        UPDATE referral_reward_codes
        SET status = 'UNUSED', "redemptionId" = NULL
        WHERE status = 'USED' 
          AND ("redemptionId" IS NULL 
               OR "redemptionId" NOT IN (SELECT id FROM reward_redemptions WHERE status = 'APPROVED'));
      `;
      console.log(`Códigos corrigidos: ${correcaoCodigos}`);
    }
    */
    
  } catch (error) {
    console.error('Erro ao executar análise:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => console.log('\nAnálise concluída com sucesso!'))
  .catch((e) => {
    console.error('Erro na execução do script:', e);
    process.exit(1);
  });
