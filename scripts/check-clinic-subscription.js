const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkClinicSubscription(doctorId) {
  try {
    console.log('Buscando clínica do médico...');
    
    // Buscar clínica do médico
    const clinic = await prisma.clinic.findFirst({
      where: { ownerId: doctorId },
      select: {
        id: true,
        name: true,
        unified_subscriptions: {
          include: {
            subscription_plans: true
          }
        }
      }
    });

    if (!clinic) {
      console.log('Nenhuma clínica encontrada para este médico');
      return;
    }

    console.log('Clínica encontrada:', {
      id: clinic.id,
      name: clinic.name
    });

    if (clinic.unified_subscriptions.length === 0) {
      console.log('Nenhuma subscription encontrada para esta clínica');
      return;
    }

    console.log('Subscriptions encontradas:');
    clinic.unified_subscriptions.forEach(sub => {
      console.log({
        id: sub.id,
        type: sub.type,
        status: sub.status,
        startDate: sub.start_date,
        endDate: sub.end_date,
        trialEndDate: sub.trial_end_date,
        plan: {
          id: sub.subscription_plans.id,
          name: sub.subscription_plans.name,
          isDefault: sub.subscription_plans.isDefault
        }
      });
    });

  } catch (error) {
    console.error('Erro ao verificar subscription da clínica:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Pegar o ID do médico do argumento da linha de comando
const doctorId = process.argv[2];
if (!doctorId) {
  console.error('Por favor, forneça o ID do médico como argumento');
  process.exit(1);
}

checkClinicSubscription(doctorId);
