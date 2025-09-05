const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function debugPatientClinicRelationship() {
  try {
    console.log('🔍 Debugando relação Paciente-Clínica...\n');

    // 1. Verificar quantos pacientes existem no total
    const totalPatients = await prisma.user.count({
      where: { role: 'PATIENT' }
    });
    console.log(`👥 Total de pacientes no sistema: ${totalPatients}`);

    // 2. Verificar quantos DoctorPatientRelationship existem
    const totalRelationships = await prisma.doctorPatientRelationship.count();
    console.log(`🔗 Total de relacionamentos médico-paciente: ${totalRelationships}`);

    // 3. Verificar quantos relacionamentos têm clinicId
    const relationshipsWithClinic = await prisma.doctorPatientRelationship.count({
      where: { clinicId: { not: null } }
    });
    console.log(`🏥 Relacionamentos com clínica definida: ${relationshipsWithClinic}`);

    // 4. Verificar quantos relacionamentos NÃO têm clinicId
    const relationshipsWithoutClinic = await prisma.doctorPatientRelationship.count({
      where: { clinicId: null }
    });
    console.log(`❌ Relacionamentos SEM clínica definida: ${relationshipsWithoutClinic}`);

    // 5. Mostrar alguns exemplos de relacionamentos
    console.log('\n📋 Exemplos de relacionamentos:');
    const sampleRelationships = await prisma.doctorPatientRelationship.findMany({
      take: 10,
      include: {
        patient: { select: { name: true, email: true } },
        doctor: { select: { name: true, email: true } },
        clinic: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    sampleRelationships.forEach((rel, i) => {
      console.log(`\n--- Relacionamento ${i + 1} ---`);
      console.log(`Paciente: ${rel.patient.name} (${rel.patient.email})`);
      console.log(`Médico: ${rel.doctor.name} (${rel.doctor.email})`);
      console.log(`Clínica: ${rel.clinic ? rel.clinic.name : '❌ SEM CLÍNICA'}`);
      console.log(`ClinicId: ${rel.clinicId || '❌ NULL'}`);
      console.log(`Ativo: ${rel.isActive}`);
    });

    // 6. Verificar se há médicos com clínicas
    console.log('\n\n🏥 Verificando clínicas dos médicos:');
    const doctorsWithClinics = await prisma.user.findMany({
      where: { role: 'DOCTOR' },
      include: {
        owned_clinics: true,
        clinic_memberships: {
          where: { isActive: true },
          include: { clinic: true }
        }
      },
      take: 5
    });

    doctorsWithClinics.forEach((doctor, i) => {
      console.log(`\n--- Médico ${i + 1} ---`);
      console.log(`Nome: ${doctor.name} (${doctor.email})`);
      console.log(`Clínicas próprias: ${doctor.owned_clinics.length}`);
      doctor.owned_clinics.forEach(clinic => {
        console.log(`  - ${clinic.name} (Owner)`);
      });
      console.log(`Membro de clínicas: ${doctor.clinic_memberships.length}`);
      doctor.clinic_memberships.forEach(membership => {
        console.log(`  - ${membership.clinic.name} (${membership.role})`);
      });
    });

    // 7. Verificar se os relacionamentos existentes estão vinculados às clínicas corretas
    console.log('\n\n🔧 Analisando problema...');
    
    const problemAnalysis = await prisma.$queryRaw`
      SELECT 
        d.name as doctor_name,
        d.email as doctor_email,
        c.name as clinic_name,
        c.id as clinic_id,
        COUNT(dpr.id) as total_relationships,
        COUNT(CASE WHEN dpr.clinic_id IS NOT NULL THEN 1 END) as with_clinic,
        COUNT(CASE WHEN dpr.clinic_id IS NULL THEN 1 END) as without_clinic
      FROM "User" d
      LEFT JOIN clinics c ON c."ownerId" = d.id
      LEFT JOIN doctor_patient_relationships dpr ON dpr.doctor_id = d.id
      WHERE d.role = 'DOCTOR'
      GROUP BY d.id, d.name, d.email, c.id, c.name
      ORDER BY total_relationships DESC
    `;

    console.log('\n📊 Análise por médico:');
    problemAnalysis.forEach((analysis, i) => {
      console.log(`\n--- Análise ${i + 1} ---`);
      console.log(`Médico: ${analysis.doctor_name} (${analysis.doctor_email})`);
      console.log(`Clínica: ${analysis.clinic_name || '❌ SEM CLÍNICA'}`);
      console.log(`Total relacionamentos: ${analysis.total_relationships}`);
      console.log(`Com clínica: ${analysis.with_clinic}`);
      console.log(`Sem clínica: ${analysis.without_clinic}`);
    });

    // 8. Conclusão
    console.log('\n\n🎯 DIAGNÓSTICO:');
    if (relationshipsWithoutClinic > 0) {
      console.log(`❌ PROBLEMA ENCONTRADO: ${relationshipsWithoutClinic} relacionamentos não têm clinicId`);
      console.log('💡 SOLUÇÃO: Precisamos atualizar os relacionamentos existentes para incluir o clinicId');
      console.log('📝 AÇÃO: Executar script para associar relacionamentos às clínicas dos médicos');
    } else {
      console.log('✅ Todos os relacionamentos têm clínica associada');
    }

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugPatientClinicRelationship();
