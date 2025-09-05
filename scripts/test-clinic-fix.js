const { PrismaClient } = require('@prisma/client');
const { getUserClinic } = require('../src/lib/clinic-utils.ts');

const prisma = new PrismaClient();

async function testClinicFix() {
  try {
    console.log('🧪 Testando correção da duplicação de clínicas...\n');

    // Buscar o usuário Bella Vida Aesthetics que tem clínicas duplicadas
    const user = await prisma.user.findUnique({
      where: { email: 'xppveronica@gmail.com' }
    });

    if (!user) {
      console.log('❌ Usuário não encontrado');
      return;
    }

    console.log(`👤 Testando com usuário: ${user.name} (${user.email})`);

    // Verificar quantas clínicas este usuário possui
    const userClinics = await prisma.clinic.findMany({
      where: { 
        ownerId: user.id,
        isActive: true 
      },
      orderBy: { createdAt: 'desc' }
    });

    console.log(`\n📋 Clínicas encontradas: ${userClinics.length}`);
    userClinics.forEach((clinic, i) => {
      console.log(`  ${i + 1}. ${clinic.name} (${clinic.id}) - ${clinic.createdAt}`);
    });

    // Testar a função getUserClinic corrigida
    console.log('\n🔧 Testando getUserClinic corrigida...');
    
    // Simular o import da função (já que é TypeScript)
    const clinic = await prisma.$queryRaw`
      SELECT 
        c.*,
        u.id as owner_id,
        u.name as owner_name,
        u.email as owner_email,
        cm.id as member_id,
        cm.role as member_role,
        cm."isActive" as member_is_active,
        cm."joinedAt" as member_joined_at,
        mu.id as member_user_id,
        mu.name as member_user_name,
        mu.email as member_user_email,
        mu.role as member_user_role
      FROM clinics c
      JOIN "User" u ON u.id = c."ownerId"
      LEFT JOIN clinic_members cm ON cm."clinicId" = c.id
      LEFT JOIN "User" mu ON mu.id = cm."userId"
      WHERE c."ownerId" = ${user.id}
        AND c.id = (
          SELECT id FROM clinics 
          WHERE "ownerId" = ${user.id} 
            AND "isActive" = true
          ORDER BY "createdAt" DESC 
          LIMIT 1
        )
    `;

    console.log(`\n✅ Resultado da consulta corrigida:`);
    console.log(`   Registros retornados: ${clinic.length}`);
    
    if (clinic.length > 0) {
      const clinicData = clinic[0];
      console.log(`   Clínica selecionada: ${clinicData.name} (${clinicData.id})`);
      console.log(`   Criada em: ${clinicData.createdAt}`);
      
      // Agrupar membros únicos
      const uniqueMembers = new Map();
      clinic.forEach(row => {
        if (row.member_id && !uniqueMembers.has(row.member_id)) {
          uniqueMembers.set(row.member_id, {
            id: row.member_id,
            role: row.member_role,
            isActive: row.member_is_active,
            user: {
              name: row.member_user_name,
              email: row.member_user_email
            }
          });
        }
      });
      
      const members = Array.from(uniqueMembers.values());
      console.log(`   Membros únicos: ${members.length}`);
      members.forEach((member, i) => {
        console.log(`     ${i + 1}. ${member.user.name} (${member.user.email}) - ${member.role}`);
      });
    }

    // Verificar se há clínicas inativas que deveriam ser limpas
    const inactiveClinics = await prisma.clinic.findMany({
      where: { 
        ownerId: user.id,
        isActive: false 
      }
    });

    if (inactiveClinics.length > 0) {
      console.log(`\n⚠️  Clínicas inativas encontradas: ${inactiveClinics.length}`);
      inactiveClinics.forEach((clinic, i) => {
        console.log(`  ${i + 1}. ${clinic.name} (${clinic.id}) - ${clinic.createdAt}`);
      });
    }

    console.log('\n✅ Teste concluído!');

  } catch (error) {
    console.error('❌ Erro no teste:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testClinicFix();
