const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

console.log('🔍 Iniciando diagnóstico e correção segura...');

// Função para verificar a coluna no banco de dados
async function checkDatabaseColumn() {
  console.log('\n📊 Verificando banco de dados...');
  
  try {
    const prisma = new PrismaClient();
    
    // Verificar se podemos executar uma consulta raw
    const result = await prisma.$queryRaw`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'User' AND column_name = 'stripe_connect_id';
    `;
    
    console.log('Resultado da verificação da coluna:', result);
    
    if (result && result.length > 0) {
      console.log('✅ A coluna stripe_connect_id EXISTE no banco de dados!');
    } else {
      console.log('❌ A coluna stripe_connect_id NÃO EXISTE no banco de dados.');
      console.log('Tentando adicionar a coluna...');
      
      await prisma.$executeRaw`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "stripe_connect_id" TEXT;`;
      console.log('✅ Coluna adicionada com sucesso');
    }
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Erro ao verificar banco de dados:', error);
  }
}

// Função para verificar a configuração do NextAuth
function checkNextAuthConfig() {
  console.log('\n🔐 Verificando configuração do NextAuth...');
  
  // Possíveis locais do arquivo NextAuth
  const possiblePaths = [
    path.join(process.cwd(), 'src', 'app', 'api', 'auth', '[...nextauth]', 'route.ts'),
    path.join(process.cwd(), 'src', 'pages', 'api', 'auth', '[...nextauth].ts'),
    path.join(process.cwd(), 'src', 'pages', 'api', 'auth', '[...nextauth].js')
  ];
  
  let nextAuthFile = null;
  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      nextAuthFile = filePath;
      break;
    }
  }
  
  if (nextAuthFile) {
    console.log(`Arquivo NextAuth encontrado: ${nextAuthFile}`);
    console.log('Verificando conteúdo...');
    
    const content = fs.readFileSync(nextAuthFile, 'utf8');
    
    // Verificar se há referências a stripe_connect_id
    if (content.includes('stripe_connect_id')) {
      console.log('⚠️ O arquivo NextAuth contém referências a stripe_connect_id');
      console.log('Isso pode estar causando o problema se o campo não estiver sendo selecionado corretamente');
    } else {
      console.log('✅ Nenhuma referência direta a stripe_connect_id encontrada no NextAuth');
    }
    
    // Verificar se há seleção de campos específicos do usuário
    if (content.includes('select:') || content.includes('select: {')) {
      console.log('⚠️ O NextAuth está usando seleção específica de campos');
      console.log('Isso pode estar causando o problema se stripe_connect_id não estiver incluído');
    }
  } else {
    console.log('❌ Arquivo NextAuth não encontrado nos caminhos padrão');
  }
}

// Função para limpar o cache do Prisma e regenerar
function cleanPrismaCache() {
  console.log('\n🧹 Limpando cache do Prisma (sem afetar dados)...');
  
  // Limpar apenas o cache do Prisma em node_modules
  const prismaCacheDir = path.join(process.cwd(), 'node_modules', '.prisma');
  if (fs.existsSync(prismaCacheDir)) {
    try {
      execSync(`rm -rf "${prismaCacheDir}"`);
      console.log('✅ Cache do Prisma removido');
    } catch (error) {
      console.error('❌ Erro ao remover cache do Prisma:', error.message);
    }
  }
  
  // Regenerar o cliente Prisma
  console.log('\n🔄 Regenerando cliente Prisma...');
  try {
    execSync('npx prisma generate', { stdio: 'inherit' });
    console.log('✅ Cliente Prisma regenerado');
  } catch (error) {
    console.error('❌ Erro ao regenerar cliente Prisma:', error.message);
  }
}

// Executar as funções em sequência
async function main() {
  await checkDatabaseColumn();
  checkNextAuthConfig();
  cleanPrismaCache();
  
  console.log('\n✨ Diagnóstico completo!');
  console.log('\nPróximos passos:');
  console.log('1. Reinicie o servidor: npm run dev');
  console.log('2. Se o problema persistir, pode ser necessário verificar o código que acessa stripe_connect_id');
}

main();
