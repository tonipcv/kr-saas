const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function debugClinicMembers() {
  try {
    console.log('🔍 Debugando membros da clínica...\n');

    // 1. Verificar dados brutos da consulta atual
    console.log('1. Dados brutos da consulta SQL:');
    const rawData = await prisma.$queryRaw`
      SELECT 
        c.id as clinic_id,
        c.name as clinic_name,
        c."ownerId" as owner_id,
        u.name as owner_name,
        u.email as owner_email,
        cm.id as member_id,
        cm.role as member_role,
        cm."isActive" as member_is_active,
        cm."joinedAt" as member_joined_at,
        cm."userId" as member_user_id,
        mu.name as member_user_name,
        mu.email as member_user_email,
        mu.role as member_user_role
      FROM clinics c
      JOIN "User" u ON u.id = c."ownerId"
      LEFT JOIN clinic_members cm ON cm."clinicId" = c.id
      LEFT JOIN "User" mu ON mu.id = cm."userId"
      WHERE c."isActive" = true
      ORDER BY c.id, cm.id
    `;

    console.log('Registros encontrados:', rawData.length);
    rawData.forEach((row, index) => {
      console.log(`\n--- Registro ${index + 1} ---`);
      console.log(`Clínica: ${row.clinic_name} (ID: ${row.clinic_id})`);
      console.log(`Owner: ${row.owner_name} (${row.owner_email})`);
      if (row.member_id) {
        console.log(`Membro: ${row.member_user_name} (${row.member_user_email})`);
        console.log(`Role: ${row.member_role}, Ativo: ${row.member_is_active}`);
      } else {
        console.log('Sem membros');
      }
    });

    // 2. Verificar duplicatas diretas na tabela clinic_members
    console.log('\n\n2. Verificando duplicatas na tabela clinic_members:');
    const duplicateMembers = await prisma.$queryRaw`
      SELECT 
        "clinicId",
        "userId",
        COUNT(*) as count
      FROM clinic_members 
      GROUP BY "clinicId", "userId"
      HAVING COUNT(*) > 1
    `;

    if (duplicateMembers.length > 0) {
      console.log('⚠️  DUPLICATAS ENCONTRADAS:');
      duplicateMembers.forEach(dup => {
        console.log(`Clínica ${dup.clinicId}, Usuário ${dup.userId}: ${dup.count} registros`);
      });
    } else {
      console.log('✅ Nenhuma duplicata encontrada na tabela clinic_members');
    }

    // 3. Verificar membros por clínica específica
    console.log('\n\n3. Membros por clínica (agrupados):');
    const membersByClinic = await prisma.$queryRaw`
      SELECT 
        c.id as clinic_id,
        c.name as clinic_name,
        COUNT(DISTINCT cm.id) as total_members,
        COUNT(DISTINCT CASE WHEN cm."isActive" = true THEN cm.id END) as active_members,
        STRING_AGG(DISTINCT mu.name || ' (' || mu.email || ')', ', ') as member_names
      FROM clinics c
      LEFT JOIN clinic_members cm ON cm."clinicId" = c.id
      LEFT JOIN "User" mu ON mu.id = cm."userId"
      WHERE c."isActive" = true
      GROUP BY c.id, c.name
      ORDER BY c.name
    `;

    membersByClinic.forEach(clinic => {
      console.log(`\n📋 ${clinic.clinic_name}:`);
      console.log(`   Total: ${clinic.total_members} | Ativos: ${clinic.active_members}`);
      console.log(`   Membros: ${clinic.member_names || 'Nenhum'}`);
    });

    // 4. Verificar se há registros órfãos ou inconsistentes
    console.log('\n\n4. Verificando inconsistências:');
    
    const orphanMembers = await prisma.$queryRaw`
      SELECT cm.*, u.name, u.email
      FROM clinic_members cm
      LEFT JOIN "User" u ON u.id = cm."userId"
      WHERE u.id IS NULL
    `;

    if (orphanMembers.length > 0) {
      console.log('⚠️  Membros órfãos (sem usuário):');
      orphanMembers.forEach(member => {
        console.log(`   ID: ${member.id}, ClinicId: ${member.clinicId}, UserId: ${member.userId}`);
      });
    } else {
      console.log('✅ Nenhum membro órfão encontrado');
    }

    const membersWithoutClinic = await prisma.$queryRaw`
      SELECT cm.*, c.name as clinic_name
      FROM clinic_members cm
      LEFT JOIN clinics c ON c.id = cm."clinicId"
      WHERE c.id IS NULL
    `;

    if (membersWithoutClinic.length > 0) {
      console.log('⚠️  Membros sem clínica:');
      membersWithoutClinic.forEach(member => {
        console.log(`   ID: ${member.id}, ClinicId: ${member.clinicId}, UserId: ${member.userId}`);
      });
    } else {
      console.log('✅ Todos os membros têm clínicas válidas');
    }

    // 5. Simular o processamento da função getUserClinic
    console.log('\n\n5. Simulando processamento da função getUserClinic:');
    
    // Pegar uma clínica específica para testar
    const testClinic = await prisma.clinic.findFirst({
      where: { isActive: true }
    });

    if (testClinic) {
      console.log(`\nTestando com clínica: ${testClinic.name} (${testClinic.id})`);
      
      const baseClinic = await prisma.$queryRaw`
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
        WHERE c.id = ${testClinic.id}
      `;

      console.log(`\nRegistros retornados: ${baseClinic.length}`);
      
      // Simular o processamento antigo (que causava duplicação)
      console.log('\n--- Processamento ANTIGO (com duplicação) ---');
      const oldMembers = baseClinic.map(row => ({
        id: row.member_id,
        role: row.member_role,
        isActive: row.member_is_active,
        user: {
          name: row.member_user_name,
          email: row.member_user_email
        }
      })).filter(m => m.id);
      
      console.log(`Membros (método antigo): ${oldMembers.length}`);
      oldMembers.forEach((member, index) => {
        console.log(`  ${index + 1}. ${member.user.name} (${member.user.email}) - ${member.role}`);
      });

      // Simular o processamento novo (sem duplicação)
      console.log('\n--- Processamento NOVO (sem duplicação) ---');
      const uniqueMembers = new Map();
      baseClinic.forEach(row => {
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
      
      const newMembers = Array.from(uniqueMembers.values());
      console.log(`Membros (método novo): ${newMembers.length}`);
      newMembers.forEach((member, index) => {
        console.log(`  ${index + 1}. ${member.user.name} (${member.user.email}) - ${member.role}`);
      });
    }

  } catch (error) {
    console.error('❌ Erro ao debugar membros:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugClinicMembers();
