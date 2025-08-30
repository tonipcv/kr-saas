// Script para verificar a existência da tabela pivot categories_on_products
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkPivotTable() {
  try {
    console.log('🔍 Verificando tabela pivot categories_on_products...');
    
    // Verificar se a tabela existe usando uma consulta SQL bruta
    const result = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public'
        AND table_name = 'categories_on_products'
      );
    `;
    
    const tableExists = result[0].exists;
    console.log(`✅ Tabela categories_on_products existe? ${tableExists ? 'SIM' : 'NÃO'}`);
    
    if (tableExists) {
      // Verificar a estrutura da tabela
      const columns = await prisma.$queryRaw`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'categories_on_products';
      `;
      
      console.log('📋 Colunas da tabela categories_on_products:');
      columns.forEach(col => {
        console.log(`- ${col.column_name}: ${col.data_type}`);
      });
      
      // Verificar se há dados na tabela
      const count = await prisma.$queryRaw`
        SELECT COUNT(*) FROM categories_on_products;
      `;
      
      console.log(`📊 Número de registros na tabela: ${count[0].count}`);
    } else {
      console.log('❌ A tabela categories_on_products não existe no banco de dados!');
      console.log('🔧 Você precisa executar a migração para criar a tabela.');
    }
  } catch (error) {
    console.error('❌ Erro ao verificar a tabela:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkPivotTable();
