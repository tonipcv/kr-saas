const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function listDoctors() {
  try {
    console.log('Buscando médicos...');
    
    const doctors = await prisma.user.findMany({
      where: { role: 'DOCTOR' },
      select: {
        id: true,
        name: true,
        email: true,
        owned_clinics: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    if (doctors.length === 0) {
      console.log('Nenhum médico encontrado');
      return;
    }

    console.log('Médicos encontrados:');
    doctors.forEach(doctor => {
      console.log({
        id: doctor.id,
        name: doctor.name,
        email: doctor.email,
        clinics: doctor.owned_clinics.map(c => ({
          id: c.id,
          name: c.name
        }))
      });
    });

  } catch (error) {
    console.error('Erro ao listar médicos:', error);
  } finally {
    await prisma.$disconnect();
  }
}

listDoctors();
