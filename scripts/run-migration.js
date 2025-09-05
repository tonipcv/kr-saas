const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runMigration() {
  try {
    // Criar tabela de backup
    console.log('Criando backup...');
    await prisma.$executeRaw`
      CREATE TABLE membership_levels_backup AS SELECT * FROM membership_levels;
    `;

    // Adicionar coluna clinic_id
    console.log('Adicionando coluna clinic_id...');
    await prisma.$executeRaw`
      ALTER TABLE membership_levels ADD COLUMN IF NOT EXISTS clinic_id text;
    `;

    // Adicionar foreign key
    console.log('Adicionando foreign key...');
    await prisma.$executeRaw`
      ALTER TABLE membership_levels 
      ADD CONSTRAINT fk_membership_levels_clinic 
      FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE CASCADE;
    `;

    // Criar índice
    console.log('Criando índice...');
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_membership_levels_clinic_id 
      ON membership_levels(clinic_id);
    `;

    // Remover constraint antiga
    console.log('Removendo constraint antiga...');
    await prisma.$executeRaw`
      ALTER TABLE membership_levels 
      DROP CONSTRAINT IF EXISTS membership_levels_slug_key;
    `;

    // Adicionar nova constraint
    console.log('Adicionando nova constraint...');
    await prisma.$executeRaw`
      ALTER TABLE membership_levels 
      ADD CONSTRAINT membership_levels_clinic_id_slug_key 
      UNIQUE NULLS NOT DISTINCT (clinic_id, slug);
    `;

    // Buscar clínicas ativas
    console.log('\nBuscando clínicas ativas...');
    const clinics = await prisma.clinic.findMany({
      where: { isActive: true },
      select: { id: true }
    });

    console.log(`Encontradas ${clinics.length} clínicas ativas`);

    // Para cada clínica, atualizar os níveis existentes
    for (const clinic of clinics) {
      console.log(`\nProcessando clínica ${clinic.id}`);
      
      // Atualizar níveis existentes para esta clínica
      await prisma.$executeRaw`
        UPDATE membership_levels 
        SET clinic_id = ${clinic.id}
        WHERE clinic_id IS NULL;
      `;
      
      console.log(`Níveis atualizados para clínica ${clinic.id}`);
    }

    console.log('\nMigração completa');
  } catch (error) {
    console.error('Erro durante a migração:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

runMigration().catch(console.error);