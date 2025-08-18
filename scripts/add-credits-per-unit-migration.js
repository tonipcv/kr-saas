// scripts/add-credits-per-unit-migration.js
// Executa uma migração SQL para adicionar creditsPerUnit à tabela products

const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  
  try {
    console.log('Conectado ao banco. Executando migração...');
    
    // Adicionar coluna - executando cada comando separadamente
    await prisma.$executeRawUnsafe('ALTER TABLE products ADD COLUMN IF NOT EXISTS "creditsPerUnit" NUMERIC(10,2) NOT NULL DEFAULT 0');
    console.log('Migração concluída com sucesso.');
    
    // Opcional: atualizar alguns produtos com valores de exemplo
    console.log('Atualizando produtos de exemplo com creditsPerUnit...');
    const productsUpdated = await prisma.$executeRaw`
      UPDATE products 
      SET "creditsPerUnit" = CASE 
        WHEN price >= 100 THEN 10
        WHEN price >= 50 THEN 5
        ELSE 1
      END
      WHERE "isActive" = true;
    `;
    
    console.log(`Produtos atualizados com valores de exemplo.`);
    
    // Verificar a estrutura da tabela
    const tableInfo = await prisma.$queryRaw`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'products' AND column_name = 'creditsPerUnit';
    `;
    
    console.log('Informações da coluna:');
    console.log(tableInfo);
    
    // Mostrar alguns produtos atualizados usando SQL raw query
    // já que o Prisma Client ainda não conhece o campo creditsPerUnit
    const sampleProducts = await prisma.$queryRaw`
      SELECT id, name, price, "creditsPerUnit"
      FROM products
      WHERE "isActive" = true
      LIMIT 5
    `;
    
    console.log('Exemplos de produtos atualizados:');
    console.log(sampleProducts);
    
  } catch (err) {
    console.error('Erro na migração:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
