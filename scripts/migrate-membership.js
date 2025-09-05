const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migrateMembership() {
  try {
    console.log('Iniciando migração...');

    // 1. Buscar a primeira clínica ativa do médico
    console.log('Buscando clínica ativa...');
    const clinic = await prisma.clinic.findFirst({
      where: { isActive: true },
      select: { id: true }
    });

    if (!clinic) {
      throw new Error('Nenhuma clínica ativa encontrada');
    }

    console.log(`Clínica encontrada: ${clinic.id}`);

    // 2. Atualizar todos os níveis existentes para pertencerem a esta clínica
    console.log('Atualizando níveis...');
    await prisma.$executeRaw`
      UPDATE membership_levels 
      SET clinic_id = ${clinic.id} 
      WHERE clinic_id IS NULL;
    `;

    console.log('Migração concluída com sucesso!');
  } catch (error) {
    console.error('Erro durante a migração:', error);
  } finally {
    await prisma.$disconnect();
  }
}

migrateMembership();
