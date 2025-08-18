// Script para executar SQL personalizado usando Prisma
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Obter a consulta SQL dos argumentos da linha de comando ou usar a consulta padrão
const args = process.argv.slice(2);
let sql = '';

if (args.length > 0) {
  // Se um argumento foi fornecido, use-o como consulta SQL
  sql = args[0];
} else {
  // Consulta SQL padrão - você pode modificar esta consulta conforme necessário
  sql = `
    -- Estatísticas de resgates de recompensas
    SELECT 
      r.id, 
      r.title, 
      r."costInCredits" as credits_required, 
      r."currentRedemptions" as total_redemptions,
      COUNT(CASE WHEN rr.status = 'PENDING' THEN 1 END) as pending_count,
      COUNT(CASE WHEN rr.status = 'APPROVED' THEN 1 END) as approved_count,
      COUNT(CASE WHEN rr.status = 'REJECTED' THEN 1 END) as rejected_count
    FROM 
      referral_rewards r
    LEFT JOIN 
      reward_redemptions rr ON r.id = rr."rewardId"
    GROUP BY 
      r.id, r.title, r."costInCredits", r."currentRedemptions"
    ORDER BY 
      r."createdAt" DESC;
  `;
}

// Função para determinar se a consulta é SELECT (retorna dados) ou não
function isSelectQuery(query) {
  return query.trim().toLowerCase().startsWith('select');
}

async function main() {
  try {
    console.log('Executando SQL:');
    console.log(sql);
    console.log('-------------------');

    if (isSelectQuery(sql)) {
      // Para consultas SELECT, use $queryRaw para obter resultados
      const results = await prisma.$queryRawUnsafe(sql);
      console.log('Resultados da consulta:');
      console.log(JSON.stringify(results, null, 2));
      console.log(`Total de registros: ${results.length}`);
    } else {
      // Para outras consultas (INSERT, UPDATE, DELETE), use $executeRaw
      const updateResult = await prisma.$executeRawUnsafe(sql);
      console.log(`Operação concluída. Registros afetados: ${updateResult}`);
    }
    
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
