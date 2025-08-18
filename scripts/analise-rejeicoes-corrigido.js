// Script para analisar rejeições de recompensas
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
    console.log('=== ANÁLISE DE REJEIÇÕES DE RECOMPENSAS ===');
    
    // 1. Verificar resgates rejeitados
    console.log('\n1. Resgates rejeitados:');
    const resgatesRejeitados = await prisma.$queryRaw`
      SELECT 
        rr.id, 
        rr."userId", 
        rr.status, 
        rr."creditsUsed", 
        rr."fulfilledAt",
        rr.notes as rejection_reason,
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
        rr.status = 'REJECTED'
      ORDER BY
        rr."fulfilledAt" DESC;
    `;
    console.log(formatResult(resgatesRejeitados));
    console.log(`Total: ${resgatesRejeitados.length} resgates rejeitados`);
    
    // 2. Verificar créditos estornados após rejeição
    console.log('\n2. Créditos estornados após rejeição:');
    const creditosEstornados = await prisma.$queryRaw`
      SELECT 
        rc.id, 
        rc.amount, 
        rc."userId",
        rc."createdAt",
        rc."createdReason",
        u.name as user_name,
        u.email as user_email
      FROM 
        referral_credits rc
      LEFT JOIN
        "User" u ON rc."userId" = u.id
      WHERE 
        rc."createdReason" LIKE '%refund%'
        OR rc."createdReason" LIKE '%estorno%'
        OR rc."createdReason" LIKE '%reject%'
      ORDER BY
        rc."createdAt" DESC;
    `;
    console.log(formatResult(creditosEstornados));
    console.log(`Total: ${creditosEstornados.length} créditos estornados`);
    
    // 3. Verificar resgates pendentes
    console.log('\n3. Resgates pendentes:');
    const resgatesPendentes = await prisma.$queryRaw`
      SELECT 
        rr.id, 
        rr."userId", 
        rr.status, 
        rr."creditsUsed", 
        rr."redeemedAt",
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
        rr.status = 'PENDING'
      ORDER BY
        rr."redeemedAt" ASC;
    `;
    console.log(formatResult(resgatesPendentes));
    console.log(`Total: ${resgatesPendentes.length} resgates pendentes`);
    
    // 4. Verificar resgates por médico
    console.log('\n4. Resgates por médico:');
    const resgatesPorMedico = await prisma.$queryRaw`
      SELECT 
        d.id as doctor_id,
        d.name as doctor_name,
        d.email as doctor_email,
        COUNT(CASE WHEN rr.status = 'PENDING' THEN 1 END) as pending_count,
        COUNT(CASE WHEN rr.status = 'APPROVED' THEN 1 END) as approved_count,
        COUNT(CASE WHEN rr.status = 'REJECTED' THEN 1 END) as rejected_count,
        COUNT(*) as total_count
      FROM 
        "User" d
      JOIN
        "User" p ON p.doctor_id = d.id
      LEFT JOIN
        reward_redemptions rr ON rr."userId" = p.id
      WHERE 
        d.role = 'DOCTOR'
      GROUP BY
        d.id, d.name, d.email
      ORDER BY
        total_count DESC;
    `;
    console.log(formatResult(resgatesPorMedico));
    
    // 5. Verificar códigos de recompensa
    console.log('\n5. Tentativa de verificar códigos de recompensa:');
    try {
      const codigosRecompensa = await prisma.$queryRaw`
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
        ORDER BY
          rrc."createdAt" DESC;
      `;
      console.log(formatResult(codigosRecompensa));
      console.log(`Total: ${codigosRecompensa.length} códigos de recompensa`);
    } catch (error) {
      console.log('Erro ao buscar códigos de recompensa: tabela pode não existir ou ter outro nome');
      console.error(error.message);
    }
    
    // 6. Verificar estrutura da tabela reward_redemptions
    console.log('\n6. Estrutura da tabela reward_redemptions:');
    try {
      const estruturaTabela = await prisma.$queryRaw`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'reward_redemptions'
        ORDER BY ordinal_position;
      `;
      console.log(formatResult(estruturaTabela));
    } catch (error) {
      console.log('Erro ao buscar estrutura da tabela');
      console.error(error.message);
    }
    
    // Opção para simular uma rejeição (descomentado para executar)
    /*
    console.log('\nSimulando uma rejeição de resgate:');
    
    // 1. Identificar um resgate pendente para rejeitar
    const resgatePendente = await prisma.rewardRedemption.findFirst({
      where: { status: 'PENDING' },
      include: { 
        user: true,
        reward: true
      }
    });
    
    if (resgatePendente) {
      console.log(`Encontrado resgate pendente: ${resgatePendente.id}`);
      
      // 2. Iniciar transação para rejeitar o resgate
      const resultado = await prisma.$transaction(async (tx) => {
        // 2.1 Atualizar status para REJECTED
        const resgateRejeitado = await tx.rewardRedemption.update({
          where: { id: resgatePendente.id },
          data: {
            status: 'REJECTED',
            fulfilledAt: new Date(),
            notes: 'Teste de rejeição via script'
          }
        });
        
        // 2.2 Criar crédito de estorno
        const creditoEstorno = await tx.referralCredit.create({
          data: {
            userId: resgatePendente.userId,
            amount: resgatePendente.creditsUsed,
            isUsed: false,
            createdReason: `Refund from rejected reward: ${resgatePendente.reward.title}`
          }
        });
        
        return { resgateRejeitado, creditoEstorno };
      });
      
      console.log('Rejeição simulada com sucesso:');
      console.log(formatResult(resultado));
    } else {
      console.log('Nenhum resgate pendente encontrado para simular rejeição');
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
