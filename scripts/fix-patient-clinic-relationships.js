const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function fixPatientClinicRelationships() {
  try {
    console.log('🔧 Corrigindo relacionamentos Paciente-Clínica...\n');

    // 1. Buscar todos os relacionamentos sem clínica
    const relationshipsWithoutClinic = await prisma.doctorPatientRelationship.findMany({
      where: { clinicId: null },
      include: {
        doctor: {
          include: {
            owned_clinics: { where: { isActive: true } },
            clinic_memberships: {
              where: { isActive: true },
              include: { clinic: true }
            }
          }
        },
        patient: { select: { name: true, email: true } }
      }
    });

    console.log(`📋 Relacionamentos sem clínica: ${relationshipsWithoutClinic.length}`);

    let fixedCount = 0;
    let errorCount = 0;

    for (const relationship of relationshipsWithoutClinic) {
      try {
        console.log(`\n--- Processando relacionamento ---`);
        console.log(`Paciente: ${relationship.patient.name} (${relationship.patient.email})`);
        console.log(`Médico: ${relationship.doctor.name} (${relationship.doctor.email})`);

        // Determinar qual clínica usar
        let clinicToUse = null;

        // Prioridade 1: Clínica própria (mais recente)
        if (relationship.doctor.owned_clinics.length > 0) {
          clinicToUse = relationship.doctor.owned_clinics
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
          console.log(`✅ Usando clínica própria: ${clinicToUse.name}`);
        }
        // Prioridade 2: Clínica onde é membro (mais recente)
        else if (relationship.doctor.clinic_memberships.length > 0) {
          clinicToUse = relationship.doctor.clinic_memberships
            .sort((a, b) => new Date(b.joinedAt) - new Date(a.joinedAt))[0].clinic;
          console.log(`✅ Usando clínica como membro: ${clinicToUse.name}`);
        }

        if (clinicToUse) {
          // Atualizar o relacionamento
          await prisma.doctorPatientRelationship.update({
            where: { id: relationship.id },
            data: { clinicId: clinicToUse.id }
          });

          console.log(`✅ Relacionamento atualizado com clínica: ${clinicToUse.name}`);
          fixedCount++;
        } else {
          console.log(`❌ Médico não possui clínica - pulando`);
          errorCount++;
        }

      } catch (error) {
        console.error(`❌ Erro ao processar relacionamento:`, error.message);
        errorCount++;
      }
    }

    console.log(`\n\n📊 RESULTADO:`);
    console.log(`✅ Relacionamentos corrigidos: ${fixedCount}`);
    console.log(`❌ Erros: ${errorCount}`);

    // 2. Verificar resultado
    console.log(`\n🔍 Verificando resultado...`);
    const totalAfter = await prisma.doctorPatientRelationship.count();
    const withClinicAfter = await prisma.doctorPatientRelationship.count({
      where: { clinicId: { not: null } }
    });
    const withoutClinicAfter = await prisma.doctorPatientRelationship.count({
      where: { clinicId: null }
    });

    console.log(`📊 ESTATÍSTICAS FINAIS:`);
    console.log(`Total relacionamentos: ${totalAfter}`);
    console.log(`Com clínica: ${withClinicAfter}`);
    console.log(`Sem clínica: ${withoutClinicAfter}`);

    if (withoutClinicAfter === 0) {
      console.log(`\n🎉 SUCESSO! Todos os relacionamentos agora têm clínica associada!`);
    } else {
      console.log(`\n⚠️  Ainda há ${withoutClinicAfter} relacionamentos sem clínica.`);
    }

    // 3. Mostrar alguns exemplos após correção
    console.log(`\n📋 Exemplos após correção:`);
    const sampleAfter = await prisma.doctorPatientRelationship.findMany({
      take: 5,
      include: {
        patient: { select: { name: true, email: true } },
        doctor: { select: { name: true, email: true } },
        clinic: { select: { name: true } }
      },
      where: { clinicId: { not: null } }
    });

    sampleAfter.forEach((rel, i) => {
      console.log(`\n--- Exemplo ${i + 1} ---`);
      console.log(`Paciente: ${rel.patient.name}`);
      console.log(`Médico: ${rel.doctor.name}`);
      console.log(`Clínica: ${rel.clinic?.name}`);
      console.log(`Status: ✅ Corrigido`);
    });

  } catch (error) {
    console.error('❌ Erro geral:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixPatientClinicRelationships();
