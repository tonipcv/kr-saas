// Script para adicionar campo doctor_slug à tabela User
const { PrismaClient } = require('@prisma/client');
const { generateSlug } = require('../src/lib/slug-utils');

const prisma = new PrismaClient();

async function addDoctorSlugField() {
  try {
    // Verificar se a coluna já existe
    console.log('Verificando se a coluna doctor_slug já existe...');
    
    // Adicionar a coluna doctor_slug se não existir
    console.log('Adicionando coluna doctor_slug à tabela User...');
    await prisma.$executeRaw`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "doctor_slug" TEXT UNIQUE`;
    
    // Gerar slugs para médicos existentes
    console.log('Gerando slugs para médicos existentes...');
    const doctors = await prisma.user.findMany({
      where: {
        role: 'DOCTOR',
        doctor_slug: null
      },
      select: {
        id: true,
        name: true
      }
    });
    
    console.log(`Encontrados ${doctors.length} médicos sem slug.`);
    
    // Atualizar cada médico com um slug único
    for (const doctor of doctors) {
      const baseSlug = doctor.name 
        ? generateSlug(doctor.name)
        : `dr-${doctor.id.substring(0, 8)}`;
      
      let slug = baseSlug;
      let counter = 1;
      let slugExists = true;
      
      // Garantir que o slug seja único
      while (slugExists) {
        const existingUser = await prisma.user.findFirst({
          where: {
            doctor_slug: slug,
            NOT: {
              id: doctor.id
            }
          }
        });
        
        if (!existingUser) {
          slugExists = false;
        } else {
          slug = `${baseSlug}-${counter}`;
          counter++;
        }
      }
      
      // Atualizar o médico com o slug único
      await prisma.user.update({
        where: { id: doctor.id },
        data: { doctor_slug: slug }
      });
      
      console.log(`Médico ${doctor.id} (${doctor.name}) atualizado com slug: ${slug}`);
    }
    
    console.log('Migração concluída com sucesso!');
  } catch (error) {
    console.error('Erro durante a migração:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addDoctorSlugField();
