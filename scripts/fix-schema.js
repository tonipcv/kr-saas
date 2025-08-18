const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔧 Corrigindo o schema do Prisma...');

// Caminho para o schema do Prisma
const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma');

// Fazer backup do schema atual
const backupPath = path.join(process.cwd(), 'prisma', 'schema.prisma.bak');
fs.copyFileSync(schemaPath, backupPath);
console.log(`✅ Backup do schema criado em ${backupPath}`);

// Ler o conteúdo do schema
let schemaContent = fs.readFileSync(schemaPath, 'utf8');

// Corrigir o problema de campo duplicado no modelo unified_subscriptions
console.log('Corrigindo campo duplicado no modelo unified_subscriptions...');

// Encontrar o modelo unified_subscriptions
const unifiedSubscriptionsRegex = /model\s+unified_subscriptions\s+{[^}]+}/gs;
const unifiedSubscriptionsMatch = schemaContent.match(unifiedSubscriptionsRegex);

if (unifiedSubscriptionsMatch) {
  const originalModel = unifiedSubscriptionsMatch[0];
  
  // Verificar se há campos clinic duplicados
  const clinicFieldRegex = /clinic\s+User\s+@relation/g;
  const clinicMatches = originalModel.match(clinicFieldRegex);
  
  if (clinicMatches && clinicMatches.length > 1) {
    console.log(`Encontrados ${clinicMatches.length} campos 'clinic' duplicados`);
    
    // Criar uma versão corrigida do modelo removendo um dos campos duplicados
    let correctedModel = originalModel;
    
    // Encontrar a segunda ocorrência do campo clinic e removê-la
    const firstOccurrence = correctedModel.indexOf('clinic');
    if (firstOccurrence !== -1) {
      const secondOccurrence = correctedModel.indexOf('clinic', firstOccurrence + 1);
      if (secondOccurrence !== -1) {
        // Encontrar o final da linha para remover
        const lineEnd = correctedModel.indexOf('\n', secondOccurrence);
        const lineStart = correctedModel.lastIndexOf('\n', secondOccurrence) + 1;
        
        if (lineEnd !== -1) {
          correctedModel = 
            correctedModel.substring(0, lineStart) + 
            correctedModel.substring(lineEnd + 1);
        }
      }
    }
    
    // Substituir o modelo original pelo corrigido
    schemaContent = schemaContent.replace(originalModel, correctedModel);
    
    // Salvar o schema corrigido
    fs.writeFileSync(schemaPath, schemaContent);
    console.log('✅ Schema corrigido com sucesso');
  } else {
    console.log('Nenhum campo duplicado encontrado no modelo unified_subscriptions');
  }
} else {
  console.log('❌ Modelo unified_subscriptions não encontrado no schema');
}

// Regenerar o cliente Prisma
console.log('\n🔄 Regenerando o cliente Prisma...');
try {
  execSync('npx prisma generate', { stdio: 'inherit' });
  console.log('✅ Cliente Prisma regenerado com sucesso');
} catch (error) {
  console.error('❌ Erro ao regenerar o cliente Prisma:', error.message);
  
  // Restaurar o backup em caso de erro
  console.log('Restaurando o backup do schema...');
  fs.copyFileSync(backupPath, schemaPath);
  console.log('✅ Backup restaurado');
}

console.log('\n✨ Processo concluído!');
console.log('\nPróximos passos:');
console.log('1. Reinicie completamente o servidor: npm run dev');
console.log('2. Teste a autenticação novamente');
