const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migrateClinicRoles() {
  try {
    console.log('🔄 Iniciando migração de roles...');

    // Primeiro, vamos fazer um backup dos dados atuais
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '');
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS clinic_members_backup_${timestamp} AS 
      SELECT * FROM clinic_members
    `;

    console.log('✅ Backup criado com sucesso');

    // Agora vamos atualizar os roles
    const updates = [
      // ADMIN -> MANAGER (gerentes com acesso administrativo)
      prisma.$executeRaw`
        UPDATE clinic_members 
        SET role = 'MANAGER'::"ClinicRole" 
        WHERE role::text = 'ADMIN'
      `,

      // DOCTOR -> PROVIDER (profissionais que prestam serviço)
      prisma.$executeRaw`
        UPDATE clinic_members 
        SET role = 'PROVIDER'::"ClinicRole" 
        WHERE role::text = 'DOCTOR'
      `,

      // VIEWER -> STAFF (equipe de apoio)
      prisma.$executeRaw`
        UPDATE clinic_members 
        SET role = 'STAFF'::"ClinicRole" 
        WHERE role::text = 'VIEWER'
      `
    ];

    // Executar todas as atualizações em uma transação
    await prisma.$transaction(updates);

    console.log('✅ Roles atualizados com sucesso');

    // Verificar resultados
    const results = await prisma.clinicMember.groupBy({
      by: ['role'],
      _count: {
        _all: true
      }
    });

    console.log('\n📊 Distribuição atual de roles:');
    results.forEach(result => {
      console.log(`${result.role}: ${result._count._all}`);
    });

    console.log('\n✅ Migração concluída com sucesso');
    console.log(`💾 Backup disponível em clinic_members_backup_${timestamp}`);

  } catch (error) {
    console.error('❌ Erro durante migração:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Executar migração
migrateClinicRoles();
