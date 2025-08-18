// Script para gerar slugs para todos os usuários do sistema
// Executa: node scripts/generate-all-user-slugs.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Função para gerar slug a partir de uma string
function generateSlug(text) {
  if (!text || text.trim() === '') {
    return '';
  }
  
  return text
    .toString()
    .normalize('NFD') // Normaliza caracteres acentuados
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-') // Substitui espaços por hífens
    .replace(/[^\w-]+/g, '') // Remove caracteres não alfanuméricos
    .replace(/--+/g, '-') // Substitui múltiplos hífens por um único
    .replace(/^-+/, '') // Remove hífens do início
    .replace(/-+$/, ''); // Remove hífens do final
}

// Função para gerar slug para médico
function generateDoctorSlug(name, id) {
  if (!name || name.trim() === '') {
    return `dr-${id.substring(0, 8)}`;
  }
  
  const baseSlug = generateSlug(name);
  return baseSlug ? `dr-${baseSlug}` : `dr-${id.substring(0, 8)}`;
}

// Função para gerar slug para paciente
function generatePatientSlug(name, id) {
  if (!name || name.trim() === '') {
    return `p-${id.substring(0, 8)}`;
  }
  
  const baseSlug = generateSlug(name);
  return baseSlug ? `p-${baseSlug}` : `p-${id.substring(0, 8)}`;
}

// Função para gerar slug para outros tipos de usuários
function generateGenericUserSlug(name, id, role) {
  if (!name || name.trim() === '') {
    return `user-${id.substring(0, 8)}`;
  }
  
  const baseSlug = generateSlug(name);
  const prefix = role.toLowerCase().substring(0, 3);
  return baseSlug ? `${prefix}-${baseSlug}` : `${prefix}-${id.substring(0, 8)}`;
}

async function generateSlugsForAllUsers() {
  try {
    console.log('Iniciando geração de slugs para todos os usuários...');

    // Buscar todos os usuários sem slug
    const users = await prisma.user.findMany({
      where: {
        is_active: true,
        doctor_slug: null
      },
      select: {
        id: true,
        name: true,
        role: true
      }
    });

    console.log(`Encontrados ${users.length} usuários sem slug.`);

    // Agrupar usuários por tipo
    const usersByRole = users.reduce((acc, user) => {
      const role = user.role || 'UNKNOWN';
      if (!acc[role]) acc[role] = [];
      acc[role].push(user);
      return acc;
    }, {});

    // Exibir contagem por tipo
    Object.keys(usersByRole).forEach(role => {
      console.log(`- ${role}: ${usersByRole[role].length} usuários`);
    });

    // Array para armazenar resultados
    const results = {
      success: [],
      error: []
    };

    // Processar todos os usuários
    for (const user of users) {
      try {
        // Gerar slug base de acordo com o tipo de usuário
        let baseSlug;
        if (user.role === 'DOCTOR') {
          baseSlug = generateDoctorSlug(user.name, user.id);
        } else if (user.role === 'PATIENT') {
          baseSlug = generatePatientSlug(user.name, user.id);
        } else {
          baseSlug = generateGenericUserSlug(user.name, user.id, user.role || 'USER');
        }
        
        let finalSlug = baseSlug;
        let counter = 1;
        
        // Verificar se o slug já existe e gerar um único
        let slugExists = true;
        while (slugExists) {
          const existingUser = await prisma.user.findFirst({
            where: {
              doctor_slug: finalSlug,
              id: { not: user.id }
            }
          });
          
          if (!existingUser) {
            slugExists = false;
          } else {
            finalSlug = `${baseSlug}-${counter}`;
            counter++;
          }
        }
        
        // Atualizar o usuário com o novo slug
        await prisma.user.update({
          where: { id: user.id },
          data: { doctor_slug: finalSlug }
        });
        
        console.log(`✅ ${user.role} ${user.name} (${user.id}): slug gerado = ${finalSlug}`);
        results.success.push({ id: user.id, name: user.name, role: user.role, slug: finalSlug });
      } catch (error) {
        console.error(`❌ Erro ao gerar slug para ${user.role} ${user.name} (${user.id}):`, error);
        results.error.push({ id: user.id, name: user.name, role: user.role, error: error.message });
      }
    }

    // Exibir resumo
    console.log('\n===== RESUMO =====');
    console.log(`Total de usuários processados: ${users.length}`);
    console.log(`Slugs gerados com sucesso: ${results.success.length}`);
    console.log(`Erros: ${results.error.length}`);
    
    if (results.error.length > 0) {
      console.log('\nUsuários com erro:');
      results.error.forEach(err => {
        console.log(`- ${err.role} ${err.name} (${err.id}): ${err.error}`);
      });
    }

    // Agrupar resultados de sucesso por tipo
    const successByRole = results.success.reduce((acc, user) => {
      const role = user.role || 'UNKNOWN';
      if (!acc[role]) acc[role] = [];
      acc[role].push(user);
      return acc;
    }, {});

    console.log('\nSlugs gerados por tipo:');
    Object.keys(successByRole).forEach(role => {
      console.log(`\n${role} (${successByRole[role].length}):`);
      successByRole[role].forEach(user => {
        console.log(`- ${user.name}: ${user.slug}`);
      });
    });

    console.log('\nProcesso concluído!');
  } catch (error) {
    console.error('Erro ao executar o script:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Executar o script
generateSlugsForAllUsers();
