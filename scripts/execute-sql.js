// Script para executar SQL diretamente usando Prisma
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    // Exemplo de SQL para executar
    // Você pode modificar esta consulta conforme necessário
    const sql = `
      SELECT 
        r.id, 
        r.title, 
        r.description, 
        r."costInCredits", 
        r."currentRedemptions",
        COUNT(CASE WHEN rr.status = 'PENDING' THEN 1 END) as pending_count,
        COUNT(CASE WHEN rr.status = 'APPROVED' THEN 1 END) as approved_count,
        COUNT(CASE WHEN rr.status = 'REJECTED' THEN 1 END) as rejected_count
      FROM 
        referral_rewards r
      LEFT JOIN 
        reward_redemptions rr ON r.id = rr."rewardId"
      GROUP BY 
        r.id, r.title, r.description, r."costInCredits", r."currentRedemptions"
      ORDER BY 
        r."createdAt" DESC;
    `;

    // Executar a consulta SQL
    const results = await prisma.$queryRaw`${sql}`;
    
    console.log('Resultados da consulta:');
    console.log(JSON.stringify(results, null, 2));
    
    // Exemplo de como executar uma instrução SQL direta (não retorna resultados)
    // Descomente para usar
    /*
    const updateSql = `
      UPDATE referral_rewards 
      SET "currentRedemptions" = (
        SELECT COUNT(*) FROM reward_redemptions 
        WHERE "rewardId" = referral_rewards.id AND status = 'APPROVED'
      )
    `;
    const updateResult = await prisma.$executeRaw`${updateSql}`;
    console.log(`Registros atualizados: ${updateResult}`);
    */
    
  } catch (error) {
    console.error('Erro ao executar SQL:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => console.log('SQL executado com sucesso!'))
  .catch((e) => {
    console.error('Erro na execução do script:', e);
    process.exit(1);
  });
