const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixSubscriptionIssues() {
  try {
    console.log('🔧 Iniciando correções...\n');

    // 1. Corrigir owners das clínicas
    console.log('1️⃣ Corrigindo owners das clínicas...');
    
    // Primeiro, vamos verificar os owners atuais
    const clinicsWithOwners = await prisma.$queryRaw`
      SELECT 
        c.id as clinic_id,
        c.name as clinic_name,
        c."ownerId" as owner_id,
        u.email as owner_email,
        COALESCE(cm.role, 'NO_MEMBER') as current_role
      FROM clinics c
      JOIN "User" u ON u.id = c."ownerId"
      LEFT JOIN clinic_members cm ON cm."clinicId" = c.id AND cm."userId" = c."ownerId"
    `;

    console.log('\nSituação atual dos owners:');
    for (const clinic of clinicsWithOwners) {
      console.log(`- ${clinic.clinic_name}: ${clinic.owner_email} (${clinic.current_role})`);
    }

    // Agora vamos criar ou atualizar os membros
    for (const clinic of clinicsWithOwners) {
      if (clinic.current_role === 'NO_MEMBER') {
        // Criar membro
        await prisma.clinicMember.create({
          data: {
            clinicId: clinic.clinic_id,
            userId: clinic.owner_id,
            role: 'OWNER',
            isActive: true
          }
        });
        console.log(`✅ Criado membro OWNER para ${clinic.clinic_name}`);
      } else if (clinic.current_role !== 'OWNER') {
        // Atualizar papel
        await prisma.clinicMember.updateMany({
          where: {
            clinicId: clinic.clinic_id,
            userId: clinic.owner_id
          },
          data: {
            role: 'OWNER'
          }
        });
        console.log(`✅ Atualizado papel para OWNER em ${clinic.clinic_name}`);
      }
    }
    console.log('✅ Owners corrigidos\n');

    // 2. Corrigir duplicação de subscrições
    console.log('2️⃣ Corrigindo duplicação de subscrições...');
    
    // Primeiro, vamos listar as duplicatas
    const subscriptionsByClinic = await prisma.$queryRaw`
      SELECT 
        c.name as clinic_name,
        cs.id as subscription_id,
        cs.status,
        cs.created_at,
        ROW_NUMBER() OVER (
          PARTITION BY cs.clinic_id 
          ORDER BY 
            CASE 
              WHEN cs.status = 'ACTIVE' THEN 1
              WHEN cs.status = 'TRIAL' THEN 2
              ELSE 3
            END,
            cs.created_at DESC
        ) as rn
      FROM clinic_subscriptions cs
      JOIN clinics c ON c.id = cs.clinic_id
      ORDER BY c.name, cs.created_at DESC
    `;

    const duplicates = subscriptionsByClinic.filter(s => s.rn > 1);
    
    if (duplicates.length > 0) {
      console.log('\nDuplicatas encontradas:');
      for (const dup of duplicates) {
        console.log(`- ${dup.clinic_name}: ${dup.subscription_id} (${dup.status})`);
      }

      const duplicateIds = duplicates.map(d => d.subscription_id);
      await prisma.clinicSubscription.deleteMany({
        where: {
          id: {
            in: duplicateIds
          }
        }
      });
      console.log(`✅ ${duplicates.length} duplicatas removidas`);
    } else {
      console.log('✅ Nenhuma duplicata encontrada');
    }
    console.log('');

    // 3. Corrigir papéis dos médicos
    console.log('3️⃣ Corrigindo papéis dos médicos...');
    
    // Primeiro, vamos listar os médicos
    const doctors = await prisma.$queryRaw`
      SELECT 
        cm."clinicId",
        c.name as clinic_name,
        u.email as doctor_email,
        cm.role as current_role
      FROM clinic_members cm
      JOIN clinics c ON c.id = cm."clinicId"
      JOIN "User" u ON u.id = cm."userId"
      WHERE u.role = 'DOCTOR'
        AND cm.role != 'OWNER'
        AND cm."isActive" = true
    `;

    console.log('\nMédicos encontrados:');
    for (const doc of doctors) {
      console.log(`- ${doc.clinic_name}: ${doc.doctor_email} (${doc.current_role} → PROVIDER)`);
    }

    // Atualizar papéis
    await prisma.$executeRaw`
      UPDATE clinic_members cm
      SET role = 'PROVIDER'::"ClinicRole"
      FROM "User" u
      WHERE cm."userId" = u.id
        AND u.role = 'DOCTOR'
        AND cm.role != 'OWNER'
        AND cm."isActive" = true
    `;
    console.log('✅ Papéis dos médicos corrigidos\n');

    // 4. Atualizar contadores
    console.log('4️⃣ Atualizando contadores...');
    
    // Primeiro, vamos calcular os números atuais
    const clinicCounts = await prisma.$queryRaw`
      WITH clinic_counts AS (
        SELECT 
          c.id as clinic_id,
          c.name as clinic_name,
          COUNT(DISTINCT CASE WHEN cm.role = 'PROVIDER' AND cm."isActive" = true THEN cm."userId" END) as doctor_count,
          COUNT(DISTINCT pp.id) as patient_count
        FROM clinics c
        LEFT JOIN clinic_members cm ON cm."clinicId" = c.id
        LEFT JOIN patient_profiles pp ON pp.doctor_id = c.id AND pp.is_active = true
        GROUP BY c.id, c.name
      )
      SELECT *
      FROM clinic_counts
      ORDER BY clinic_name
    `;

    console.log('\nContadores por clínica:');
    for (const clinic of clinicCounts) {
      console.log(`- ${clinic.clinic_name}: ${clinic.doctor_count} médicos, ${clinic.patient_count} pacientes`);
    }

    // Atualizar contadores
    await prisma.$executeRaw`
      WITH clinic_counts AS (
        SELECT 
          c.id as clinic_id,
          COUNT(DISTINCT CASE WHEN cm.role = 'PROVIDER' AND cm."isActive" = true THEN cm."userId" END) as doctor_count,
          COUNT(DISTINCT pp.id) as patient_count
        FROM clinics c
        LEFT JOIN clinic_members cm ON cm."clinicId" = c.id
        LEFT JOIN patient_profiles pp ON pp.doctor_id = c.id AND pp.is_active = true
        GROUP BY c.id
      )
      UPDATE clinic_subscriptions cs
      SET 
        current_doctors_count = cc.doctor_count,
        current_patients_count = cc.patient_count
      FROM clinic_counts cc
      WHERE cs.clinic_id = cc.clinic_id
    `;
    console.log('✅ Contadores atualizados\n');

    console.log('✅ Todas as correções foram aplicadas com sucesso!');

  } catch (error) {
    console.error('❌ Erro durante as correções:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Executar correções
fixSubscriptionIssues();