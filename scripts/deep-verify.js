const { PrismaClient } = require('@prisma/client');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔍 Iniciando verificação profunda do problema...');

// Função para verificar a conexão do banco de dados
async function checkDatabaseConnection() {
  console.log('\n📊 Verificando conexão com o banco de dados...');
  
  try {
    const prisma = new PrismaClient();
    
    // Testar conexão básica
    await prisma.$queryRaw`SELECT 1 as test`;
    console.log('✅ Conexão com o banco de dados estabelecida com sucesso');
    
    // Verificar informações do banco de dados
    const dbInfo = await prisma.$queryRaw`SELECT current_database(), current_schema()`;
    console.log('Informações do banco de dados:');
    console.log(dbInfo);
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Erro ao conectar ao banco de dados:', error);
  }
}

// Função para verificar a estrutura da tabela User
async function checkUserTable() {
  console.log('\n📋 Verificando estrutura da tabela User...');
  
  try {
    const { Pool } = require('pg');
    
    // Extrair a URL do banco de dados do schema.prisma
    const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma');
    const schemaContent = fs.readFileSync(schemaPath, 'utf8');
    const urlMatch = schemaContent.match(/url\s*=\s*"([^"]+)"/);
    
    if (!urlMatch) {
      console.error('❌ Não foi possível encontrar a URL do banco de dados no schema.prisma');
      return;
    }
    
    const databaseUrl = urlMatch[1];
    console.log(`Conectando ao banco de dados: ${databaseUrl}`);
    
    const pool = new Pool({ connectionString: databaseUrl });
    
    // Verificar se a tabela User existe
    const tableResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'User'
    `);
    
    if (tableResult.rows.length === 0) {
      console.log('❌ A tabela User não existe no banco de dados!');
      
      // Verificar se existe com outro nome (case sensitive)
      const allTablesResult = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);
      
      console.log('Tabelas disponíveis:');
      console.log(allTablesResult.rows.map(row => row.table_name).join(', '));
      
      return;
    }
    
    console.log('✅ Tabela User encontrada');
    
    // Verificar a estrutura da tabela User
    const columnsResult = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'User'
      ORDER BY ordinal_position
    `);
    
    console.log('\nEstrutura da tabela User:');
    columnsResult.rows.forEach(column => {
      console.log(`${column.column_name} (${column.data_type}, ${column.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
    });
    
    // Verificar especificamente a coluna stripe_connect_id
    const stripeColumnResult = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'User' AND column_name = 'stripe_connect_id'
    `);
    
    if (stripeColumnResult.rows.length === 0) {
      console.log('\n❌ A coluna stripe_connect_id NÃO existe na tabela User!');
      
      // Tentar adicionar a coluna
      console.log('Tentando adicionar a coluna stripe_connect_id...');
      await pool.query(`
        ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "stripe_connect_id" TEXT
      `);
      console.log('✅ Coluna adicionada com sucesso');
    } else {
      console.log('\n✅ A coluna stripe_connect_id EXISTE na tabela User');
    }
    
    await pool.end();
  } catch (error) {
    console.error('❌ Erro ao verificar tabela User:', error);
  }
}

// Função para verificar o schema do Prisma
function checkPrismaSchema() {
  console.log('\n📝 Verificando schema do Prisma...');
  
  try {
    const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma');
    const schemaContent = fs.readFileSync(schemaPath, 'utf8');
    
    // Verificar se o modelo User tem o campo stripe_connect_id
    const userModelMatch = schemaContent.match(/model\s+User\s+{[^}]+}/s);
    
    if (!userModelMatch) {
      console.log('❌ Modelo User não encontrado no schema do Prisma');
      return;
    }
    
    const userModel = userModelMatch[0];
    const hasStripeConnectId = userModel.includes('stripe_connect_id');
    
    if (hasStripeConnectId) {
      console.log('✅ O campo stripe_connect_id está definido no modelo User do Prisma');
    } else {
      console.log('❌ O campo stripe_connect_id NÃO está definido no modelo User do Prisma');
    }
  } catch (error) {
    console.error('❌ Erro ao verificar schema do Prisma:', error);
  }
}

// Função para tentar resolver o problema
async function attemptFix() {
  console.log('\n🔧 Tentando resolver o problema...');
  
  try {
    // 1. Introspect o banco de dados para atualizar o schema
    console.log('\n1. Introspectando o banco de dados para atualizar o schema...');
    try {
      execSync('npx prisma db pull', { stdio: 'inherit' });
      console.log('✅ Schema atualizado com base no banco de dados');
    } catch (error) {
      console.error('❌ Erro ao introspect o banco de dados:', error.message);
    }
    
    // 2. Regenerar o cliente Prisma
    console.log('\n2. Regenerando o cliente Prisma...');
    try {
      execSync('npx prisma generate', { stdio: 'inherit' });
      console.log('✅ Cliente Prisma regenerado');
    } catch (error) {
      console.error('❌ Erro ao regenerar o cliente Prisma:', error.message);
    }
    
    // 3. Verificar se o NextAuth está usando o adapter corretamente
    console.log('\n3. Verificando configuração do NextAuth...');
    const authPath = path.join(process.cwd(), 'src', 'lib', 'auth.ts');
    
    if (fs.existsSync(authPath)) {
      const authContent = fs.readFileSync(authPath, 'utf8');
      
      if (authContent.includes('PrismaAdapter') && authContent.includes('adapter:')) {
        console.log('✅ NextAuth está usando o PrismaAdapter');
      } else {
        console.log('❌ NextAuth não está usando o PrismaAdapter corretamente');
      }
    }
  } catch (error) {
    console.error('❌ Erro ao tentar resolver o problema:', error);
  }
}

// Executar as funções em sequência
async function main() {
  await checkDatabaseConnection();
  await checkUserTable();
  checkPrismaSchema();
  await attemptFix();
  
  console.log('\n✨ Verificação completa!');
  console.log('\nPróximos passos:');
  console.log('1. Reinicie completamente o servidor: npm run dev');
  console.log('2. Se o problema persistir, considere:');
  console.log('   - Verificar se há algum problema com o NextAuth adapter');
  console.log('   - Verificar se o banco de dados está correto no .env');
  console.log('   - Tentar uma migração completa: npx prisma migrate dev');
}

main();
