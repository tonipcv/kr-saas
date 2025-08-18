// Script para gerar slugs para todos os médicos que ainda não possuem
// Executa: node scripts/generate-doctor-slugs.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Importar funções de slug do projeto
const { generateDoctorSlug } = require('../src/lib/slug-utils');

async function generateSlugsForDoctors() {
  try {
    console.log('Iniciando geração de slugs para médicos...');

    // Buscar todos os médicos sem slug
    const doctors = await prisma.user.findMany({
      where: {
        role: 'DOCTOR',
        is_active: true,
        doctor_slug: null
      },
      select: {
        id: true,
        name: true
      }
    });

    console.log(`Encontrados ${doctors.length} médicos sem slug.`);

    // Array para armazenar resultados
    const results = {
      success: [],
      error: []
    };

    // Gerar e atualizar slugs
    for (const doctor of doctors) {
      try {
        // Gerar slug base
        let baseSlug = generateDoctorSlug(doctor.name, doctor.id);
        let finalSlug = baseSlug;
        let counter = 1;
        
        // Verificar se o slug já existe e gerar um único
        let slugExists = true;
        while (slugExists) {
          const existingDoctor = await prisma.user.findFirst({
            where: {
              doctor_slug: finalSlug,
              id: { not: doctor.id }
            }
          });
          
          if (!existingDoctor) {
            slugExists = false;
          } else {
            finalSlug = `${baseSlug}-${counter}`;
            counter++;
          }
        }
        
        // Atualizar o médico com o novo slug
        await prisma.user.update({
          where: { id: doctor.id },
          data: { doctor_slug: finalSlug }
        });
        
        console.log(`✅ Médico ${doctor.name} (${doctor.id}): slug gerado = ${finalSlug}`);
        results.success.push({ id: doctor.id, name: doctor.name, slug: finalSlug });
      } catch (error) {
        console.error(`❌ Erro ao gerar slug para médico ${doctor.name} (${doctor.id}):`, error);
        results.error.push({ id: doctor.id, name: doctor.name, error: error.message });
      }
    }

    // Exibir resumo
    console.log('\n===== RESUMO =====');
    console.log(`Total de médicos processados: ${doctors.length}`);
    console.log(`Slugs gerados com sucesso: ${results.success.length}`);
    console.log(`Erros: ${results.error.length}`);
    
    if (results.error.length > 0) {
      console.log('\nMédicos com erro:');
      results.error.forEach(err => {
        console.log(`- ${err.name} (${err.id}): ${err.error}`);
      });
    }

    console.log('\nSlugs gerados:');
    results.success.forEach(doc => {
      console.log(`- ${doc.name}: ${doc.slug}`);
    });

    console.log('\nProcesso concluído!');
  } catch (error) {
    console.error('Erro ao executar o script:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Executar o script
generateSlugsForDoctors();
