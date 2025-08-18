const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 Buscando e corrigindo instâncias diretas do PrismaClient...');

// Encontrar todos os arquivos que criam uma nova instância do PrismaClient
try {
  const result = execSync(
    'grep -r "new PrismaClient" --include="*.ts" --include="*.js" --exclude="prisma.ts" src/',
    { encoding: 'utf8' }
  );
  
  const lines = result.split('\n').filter(line => line.trim());
  
  console.log(`\nEncontradas ${lines.length} instâncias diretas do PrismaClient:`);
  console.log(result);
  
  // Processar cada arquivo
  let filesFixed = 0;
  
  for (const line of lines) {
    const [filePath] = line.split(':');
    
    if (!filePath || !fs.existsSync(filePath)) continue;
    
    console.log(`\nCorrigindo arquivo: ${filePath}`);
    
    // Ler o conteúdo do arquivo
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Verificar se já importa de prisma.ts
    const alreadyImportsPrisma = /import.*prisma.*from.*['"]\.\.\/(\.\.\/)*lib\/prisma['"]/i.test(content);
    
    // Substituir a importação do PrismaClient e a criação da instância
    if (alreadyImportsPrisma) {
      // Se já importa prisma de lib/prisma, apenas remover a criação da instância
      content = content.replace(/const\s+prisma\s*=\s*new\s+PrismaClient\([^)]*\);?/g, '');
      console.log('  ✅ Removida criação de instância redundante');
    } else {
      // Substituir a importação do PrismaClient pela importação do singleton
      content = content.replace(
        /import\s*{\s*PrismaClient\s*}\s*from\s*['"]@prisma\/client['"]/g,
        `import { prisma } from '../lib/prisma'`
      );
      
      // Ajustar o caminho de importação com base na profundidade do arquivo
      const depth = filePath.split('/').length - 2; // -2 para compensar src/ e o arquivo
      const importPath = Array(depth).fill('..').join('/');
      content = content.replace(
        /import\s*{\s*prisma\s*}\s*from\s*['"]\.\.\/(lib\/prisma)['"]/g,
        `import { prisma } from '${importPath}/lib/prisma'`
      );
      
      // Remover a criação da instância
      content = content.replace(/const\s+prisma\s*=\s*new\s+PrismaClient\([^)]*\);?/g, '');
      console.log('  ✅ Substituída importação e removida criação de instância');
    }
    
    // Salvar o arquivo modificado
    fs.writeFileSync(filePath, content);
    filesFixed++;
  }
  
  console.log(`\n✅ Corrigidos ${filesFixed} arquivos com sucesso!`);
  
} catch (error) {
  if (error.status === 1) {
    console.log('✅ Nenhuma instância direta do PrismaClient encontrada além do singleton.');
  } else {
    console.error('❌ Erro ao buscar ou corrigir instâncias:', error.message);
  }
}

console.log('\n🔄 Regenerando o cliente Prisma...');
try {
  execSync('npx prisma generate', { stdio: 'inherit' });
  console.log('✅ Cliente Prisma regenerado com sucesso!');
} catch (error) {
  console.error('❌ Erro ao regenerar o cliente Prisma:', error.message);
}

console.log('\n✨ Processo concluído!');
console.log('\nPróximos passos:');
console.log('1. Reinicie completamente o servidor: npm run dev');
console.log('2. Teste a autenticação novamente');
