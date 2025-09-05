const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createClinicSubscription(clinicId) {
  try {
    console.log('Verificando clínica...');
    
    // Buscar clínica
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId }
    });

    if (!clinic) {
      console.log('Clínica não encontrada');
      return;
    }

    console.log('Clínica encontrada:', {
      id: clinic.id,
      name: clinic.name
    });

    // Verificar se já tem subscription
    const existingSub = await prisma.unified_subscriptions.findFirst({
      where: { subscriber_id: clinic.id }
    });

    if (existingSub) {
      console.log('Clínica já possui subscription:', existingSub);
      return;
    }

    // Buscar plano padrão
    const defaultPlan = await prisma.subscriptionPlan.findFirst({
      where: { isDefault: true }
    });

    if (!defaultPlan) {
      console.log('Plano padrão não encontrado');
      return;
    }

    console.log('Plano padrão encontrado:', {
      id: defaultPlan.id,
      name: defaultPlan.name
    });

    // Criar subscription trial
    const now = new Date();
    const trialDays = defaultPlan.trialDays ?? 30;
    const subscription = await prisma.unified_subscriptions.create({
      data: {
        id: `${clinic.id}-trial`,
        type: 'CLINIC',
        subscriber_id: clinic.id,
        plan_id: defaultPlan.id,
        status: 'TRIAL',
        max_doctors: 3,
        trial_end_date: new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000),
        start_date: now,
        auto_renew: true
      }
    });

    console.log('Subscription criada com sucesso:', subscription);

  } catch (error) {
    console.error('Erro ao criar subscription:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Pegar o ID da clínica do argumento da linha de comando
const clinicId = process.argv[2];
if (!clinicId) {
  console.error('Por favor, forneça o ID da clínica como argumento');
  process.exit(1);
}

createClinicSubscription(clinicId);
