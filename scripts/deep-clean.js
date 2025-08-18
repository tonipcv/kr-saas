const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🧹 Iniciando limpeza profunda do projeto...');

// Parar qualquer processo Next.js que possa estar rodando
try {
  console.log('Tentando parar processos Next.js...');
  execSync('pkill -f "node.*next"', { stdio: 'ignore' });
} catch (error) {
  // Ignorar erros aqui, pois pode não haver processos rodando
}

// Limpar cache do Next.js
const nextCacheDir = path.join(process.cwd(), '.next');
if (fs.existsSync(nextCacheDir)) {
  console.log('Limpando cache do Next.js...');
  execSync(`rm -rf "${nextCacheDir}"`);
  console.log('✅ Cache do Next.js removido');
}

// Limpar cache do Prisma
console.log('Limpando caches do Prisma...');
const prismaCacheDirs = [
  path.join(process.cwd(), 'node_modules', '.prisma'),
  path.join(require('os').homedir(), '.prisma'),
  path.join(require('os').homedir(), 'Library', 'Caches', 'Prisma')
];

prismaCacheDirs.forEach(dir => {
  if (fs.existsSync(dir)) {
    try {
      execSync(`rm -rf "${dir}"`);
      console.log(`✅ Removido: ${dir}`);
    } catch (error) {
      console.error(`❌ Erro ao remover ${dir}:`, error.message);
    }
  }
});

// Verificar e corrigir o banco de dados
console.log('\n🔍 Verificando e corrigindo o banco de dados...');
try {
  // Criar um arquivo SQL temporário
  const sqlFile = path.join(process.cwd(), 'temp-fix.sql');
  fs.writeFileSync(sqlFile, 'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "stripe_connect_id" TEXT;');
  
  // Executar o SQL diretamente usando psql
  console.log('Executando SQL para adicionar a coluna...');
  execSync(`PGPASSWORD=4582851d42f33edc95b0 psql -h dpbdp1.easypanel.host -p 140 -U postgres -d servidor -f ${sqlFile}`, 
    { stdio: 'inherit' });
  
  // Remover o arquivo temporário
  fs.unlinkSync(sqlFile);
  console.log('✅ SQL executado com sucesso');
} catch (error) {
  console.error('❌ Erro ao executar SQL:', error.message);
  console.log('Tentando método alternativo...');
  
  try {
    // Método alternativo usando node-postgres
    const { Client } = require('pg');
    const client = new Client({
      connectionString: 'postgres://postgres:4582851d42f33edc95b0@dpbdp1.easypanel.host:140/servidor?sslmode=disable'
    });
    
    (async () => {
      await client.connect();
      await client.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "stripe_connect_id" TEXT;');
      console.log('✅ Coluna adicionada com sucesso via node-postgres');
      await client.end();
    })();
  } catch (pgError) {
    console.error('❌ Erro no método alternativo:', pgError.message);
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

// Verificar o arquivo de autenticação NextAuth
console.log('\n🔍 Verificando configuração do NextAuth...');
const nextAuthFile = path.join(process.cwd(), 'src', 'app', 'api', 'auth', '[...nextauth]', 'route.ts');
if (fs.existsSync(nextAuthFile)) {
  console.log(`Arquivo NextAuth encontrado: ${nextAuthFile}`);
  console.log('Por favor, verifique manualmente se há problemas neste arquivo.');
} else {
  console.log('Arquivo NextAuth não encontrado no caminho padrão.');
}

console.log('\n✨ Limpeza completa! Agora execute:');
console.log('1. npm run build');
console.log('2. npm run dev');
