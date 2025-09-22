const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Script específico para corrigir relacionamentos da clínica Bella Vitta
async function fixBellaVittaRelationships() {
  try {
    console.log('🔧 Corrigindo relacionamentos para Bella Vitta...\n');

    // Identificar a clínica correta
    const clinics = await prisma.clinic.findMany({
      where: {
        name: { contains: 'Bella', mode: 'insensitive' }
      }
    });
    
    console.log(`📊 Encontradas ${clinics.length} clínicas com nome "Bella":`);
    clinics.forEach((c, i) => {
      console.log(`${i+1}. ${c.name} (${c.id}) - slug: ${c.slug || 'N/A'}`);
    });
    
    // Usar a clínica com slug 'bella-vida' ou a primeira encontrada
    const targetClinic = clinics.find(c => c.slug === 'bella-vida') || clinics[0];
    
    if (!targetClinic) {
      console.log('❌ Nenhuma clínica Bella Vitta encontrada!');
      return;
    }
    
    console.log(`\n✅ Usando clínica alvo: ${targetClinic.name} (${targetClinic.id})`);
    
    // Encontrar o médico da clínica
    const doctor = await prisma.user.findFirst({
      where: {
        OR: [
          { owned_clinics: { some: { id: targetClinic.id } } },
          { clinic_memberships: { some: { clinicId: targetClinic.id, isActive: true } } }
        ],
        role: 'DOCTOR'
      }
    });
    
    if (!doctor) {
      console.log('❌ Nenhum médico encontrado para esta clínica!');
      return;
    }
    
    console.log(`👨‍⚕️ Médico encontrado: ${doctor.name} (${doctor.id})`);
    
    // Buscar todos os pacientes do médico através dos relacionamentos
    const relationships = await prisma.doctorPatientRelationship.findMany({
      where: {
        doctorId: doctor.id
      },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        }
      }
    });
    
    // Extrair pacientes únicos dos relacionamentos
    const patients = relationships
      .filter(rel => rel.patient !== null)
      .map(rel => rel.patient);
    
    console.log(`\n👥 Pacientes encontrados: ${patients.length}`);
    
    // Verificar relacionamentos existentes
    const existingRelationships = await prisma.doctorPatientRelationship.findMany({
      where: {
        doctorId: doctor.id,
        clinicId: targetClinic.id
      }
    });
    
    console.log(`🔗 Relacionamentos existentes com a clínica alvo: ${existingRelationships.length}`);
    
    // Criar ou atualizar relacionamentos
    let created = 0;
    let updated = 0;
    let skipped = 0;
    
    for (const patient of patients) {
      try {
        // Verificar se já existe relacionamento com esta clínica
        const existingRel = await prisma.doctorPatientRelationship.findFirst({
          where: {
            doctorId: doctor.id,
            patientId: patient.id,
            clinicId: targetClinic.id
          }
        });
        
        if (existingRel) {
          console.log(`⏩ Relacionamento já existe para ${patient.name}`);
          skipped++;
          continue;
        }
        
        // Verificar se existe relacionamento sem clínica
        const orphanRel = await prisma.doctorPatientRelationship.findFirst({
          where: {
            doctorId: doctor.id,
            patientId: patient.id,
            clinicId: null
          }
        });
        
        if (orphanRel) {
          // Atualizar relacionamento existente
          await prisma.doctorPatientRelationship.update({
            where: { id: orphanRel.id },
            data: { clinicId: targetClinic.id }
          });
          console.log(`🔄 Atualizado relacionamento para ${patient.name}`);
          updated++;
        } else {
          // Criar novo relacionamento
          await prisma.doctorPatientRelationship.create({
            data: {
              doctorId: doctor.id,
              patientId: patient.id,
              clinicId: targetClinic.id,
              isActive: true
            }
          });
          console.log(`➕ Criado novo relacionamento para ${patient.name}`);
          created++;
        }
      } catch (error) {
        console.error(`❌ Erro ao processar paciente ${patient.name}: ${error.message}`);
      }
    }
    
    console.log(`\n📊 RESULTADO:`);
    console.log(`✅ Relacionamentos criados: ${created}`);
    console.log(`🔄 Relacionamentos atualizados: ${updated}`);
    console.log(`⏩ Relacionamentos ignorados: ${skipped}`);
    
    // Verificar resultado final
    const finalRelationships = await prisma.doctorPatientRelationship.count({
      where: {
        doctorId: doctor.id,
        clinicId: targetClinic.id
      }
    });
    
    console.log(`\n🎯 Total de relacionamentos com a clínica alvo: ${finalRelationships}`);
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixBellaVittaRelationships();
