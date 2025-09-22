const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Função para verificar a audiência de broadcast
async function debugBroadcastAudience() {
  try {
    console.log('🔍 Diagnosticando audiência de broadcast...\n');

    // Obter todas as clínicas ativas
    const clinics = await prisma.clinic.findMany({
      where: { isActive: true },
      select: { id: true, name: true, slug: true }
    });

    console.log(`📊 Total de clínicas ativas: ${clinics.length}`);

    for (const clinic of clinics) {
      console.log(`\n=== Clínica: ${clinic.name} (${clinic.id}) ===`);
      
      // 1. Verificar relacionamentos paciente-clínica
      try {
        const relationships = await prisma.doctorPatientRelationship.findMany({
          where: { clinicId: clinic.id },
          include: {
            patient: { select: { id: true, name: true, phone: true, email: true } }
          }
        });
        
        // Filtrar relacionamentos com pacientes válidos
        const validRelationships = relationships.filter(r => r.patient !== null);
        
        console.log(`👥 Relacionamentos com esta clínica: ${relationships.length}`);
        console.log(`👥 Relacionamentos com pacientes válidos: ${validRelationships.length}`);
        
        if (validRelationships.length > 0) {
          // 2. Verificar pacientes com telefone válido
          const patientsWithPhone = validRelationships.filter(r => {
            const phone = (r.patient?.phone || '').toString();
            const digits = phone.replace(/\\D+/g, '');
            return digits.length >= 10;
          });
          
          console.log(`📱 Pacientes com telefone válido: ${patientsWithPhone.length}`);
          
          // 3. Mostrar alguns exemplos
          console.log('\n📋 Exemplos de pacientes:');
          validRelationships.slice(0, 5).forEach((rel, i) => {
            const phone = (rel.patient.phone || '').toString();
            const digits = phone.replace(/\\D+/g, '');
            const isValid = digits.length >= 10;
            
            console.log(`--- Paciente ${i+1} ---`);
            console.log(`Nome: ${rel.patient.name}`);
            console.log(`Email: ${rel.patient.email}`);
            console.log(`Telefone: ${rel.patient.phone || 'Não informado'}`);
            console.log(`Telefone válido: ${isValid ? '✅ Sim' : '❌ Não'}`);
          });
        }
      } catch (error) {
        console.error(`❌ Erro ao buscar relacionamentos: ${error.message}`);
      }
      
      // 4. Verificar médicos associados à clínica
      const doctors = await prisma.user.findMany({
        where: {
          role: 'DOCTOR',
          OR: [
            { owned_clinics: { some: { id: clinic.id } } },
            { clinic_memberships: { some: { clinicId: clinic.id, isActive: true } } }
          ]
        },
        select: { id: true, name: true, email: true }
      });
      
      console.log(`\n👨‍⚕️ Médicos associados: ${doctors.length}`);
      doctors.forEach((doc, i) => {
        console.log(`- ${doc.name} (${doc.email})`);
      });
    }
    
    // 5. Verificar relacionamentos sem clínica
    const orphanRelationships = await prisma.doctorPatientRelationship.count({
      where: { clinicId: null }
    });
    
    console.log(`\n⚠️ Relacionamentos sem clínica: ${orphanRelationships}`);
    
    if (orphanRelationships > 0) {
      console.log('❗ Execute o script fix-patient-clinic-relationships.js para corrigir.');
    }
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugBroadcastAudience();
