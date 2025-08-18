const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔍 Buscando referências a stripe_connect_id no código...');

try {
  // Usar grep para encontrar todas as referências
  const result = execSync('grep -r "stripe_connect_id" --include="*.ts" --include="*.js" --include="*.tsx" --include="*.jsx" src/', 
    { encoding: 'utf8' });
  
  console.log('\nReferências encontradas:');
  console.log(result);
  
  // Analisar os resultados para identificar possíveis problemas
  const lines = result.split('\n').filter(line => line.trim());
  
  console.log('\n📊 Análise das referências:');
  
  // Verificar padrões problemáticos
  const problemPatterns = [
    { pattern: /select:.*stripe_connect_id/, message: 'Seleção explícita do campo' },
    { pattern: /include:.*stripe_connect_id/, message: 'Inclusão explícita do campo' },
    { pattern: /where:.*stripe_connect_id/, message: 'Condição usando o campo' }
  ];
  
  let potentialIssues = [];
  
  lines.forEach(line => {
    const filePath = line.split(':')[0];
    
    problemPatterns.forEach(({ pattern, message }) => {
      if (pattern.test(line)) {
        potentialIssues.push({ filePath, issue: message, line });
      }
    });
  });
  
  if (potentialIssues.length > 0) {
    console.log('\n⚠️ Possíveis problemas encontrados:');
    potentialIssues.forEach(({ filePath, issue, line }) => {
      console.log(`\nArquivo: ${filePath}`);
      console.log(`Problema: ${issue}`);
      console.log(`Linha: ${line.substring(line.indexOf(':') + 1)}`);
    });
    
    console.log('\n🔧 Sugestão de correção:');
    console.log('Verifique se os arquivos acima estão usando o campo stripe_connect_id corretamente.');
    console.log('Se o campo estiver sendo selecionado explicitamente em uma consulta Prisma,');
    console.log('certifique-se de que todas as instâncias do Prisma Client estão atualizadas.');
  } else {
    console.log('\n✅ Nenhum padrão problemático óbvio encontrado nas referências.');
  }
  
  // Verificar instâncias do PrismaClient
  console.log('\n🔍 Verificando instâncias do PrismaClient...');
  const prismaInstances = execSync('grep -r "new PrismaClient" --include="*.ts" --include="*.js" src/', 
    { encoding: 'utf8' });
  
  console.log('\nInstâncias do PrismaClient encontradas:');
  console.log(prismaInstances);
  
  if (prismaInstances.split('\n').filter(line => line.trim()).length > 1) {
    console.log('\n⚠️ Múltiplas instâncias do PrismaClient encontradas!');
    console.log('Isso pode causar problemas de cache. Considere usar um singleton para o PrismaClient.');
  }
  
} catch (error) {
  if (error.status === 1) {
    console.log('Nenhuma referência a stripe_connect_id encontrada no código.');
  } else {
    console.error('Erro ao buscar referências:', error.message);
  }
}

// Verificar o arquivo de autenticação NextAuth
console.log('\n🔐 Analisando implementação do NextAuth...');

const nextAuthPaths = [
  path.join(process.cwd(), 'src', 'app', 'api', 'auth', '[...nextauth]', 'route.ts'),
  path.join(process.cwd(), 'src', 'pages', 'api', 'auth', '[...nextauth].ts'),
  path.join(process.cwd(), 'src', 'pages', 'api', 'auth', '[...nextauth].js')
];

let nextAuthFile = null;
for (const filePath of nextAuthPaths) {
  if (fs.existsSync(filePath)) {
    nextAuthFile = filePath;
    break;
  }
}

if (nextAuthFile) {
  console.log(`Arquivo NextAuth encontrado: ${nextAuthFile}`);
  
  const content = fs.readFileSync(nextAuthFile, 'utf8');
  
  // Verificar como o usuário é buscado
  if (content.includes('findUnique') || content.includes('findFirst')) {
    console.log('⚠️ NextAuth está usando findUnique/findFirst para buscar usuários');
    console.log('Isso pode estar causando o problema se o campo stripe_connect_id estiver sendo selecionado implicitamente');
  }
  
  // Verificar se há um adapter personalizado
  if (content.includes('adapter:')) {
    console.log('⚠️ NextAuth está usando um adapter personalizado');
    console.log('Verifique se o adapter está configurado corretamente para o schema atual');
  }
}

console.log('\n✨ Análise completa!');
console.log('\nPróximos passos recomendados:');
console.log('1. Verifique se há múltiplas instâncias do PrismaClient no código');
console.log('2. Considere criar um singleton para o PrismaClient');
console.log('3. Verifique se o NextAuth está configurado corretamente');
console.log('4. Se o problema persistir, considere reiniciar completamente o servidor');
