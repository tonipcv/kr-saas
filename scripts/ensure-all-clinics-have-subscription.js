const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function ensureAllClinicsHaveSubscription() {
  try {
    console.log('Buscando clínicas sem subscription...');
    
    // Buscar todas as clínicas ativas
    const clinics = await prisma.clinic.findMany({
      where: { isActive: true },
      include: {
        unified_subscriptions: true
      }
    });

    console.log(`Total de clínicas encontradas: ${clinics.length}`);

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

    // Filtrar clínicas sem subscription
    const clinicsWithoutSub = clinics.filter(c => c.unified_subscriptions.length === 0);
    console.log(`Clínicas sem subscription: ${clinicsWithoutSub.length}`);

    // Criar subscription para cada clínica
    for (const clinic of clinicsWithoutSub) {
      console.log(`\nProcessando clínica: ${clinic.name} (${clinic.id})`);
      
      const now = new Date();
      const trialDays = defaultPlan.trialDays ?? 30;
      
      try {
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

        console.log('Subscription criada com sucesso:', {
          id: subscription.id,
          status: subscription.status,
          trialEndDate: subscription.trial_end_date
        });
      } catch (error) {
        console.error('Erro ao criar subscription para clínica:', clinic.id, error);
      }
    }

    console.log('\nProcessamento concluído!');

  } catch (error) {
    console.error('Erro ao processar clínicas:', error);
  } finally {
    await prisma.$disconnect();
  }
}

ensureAllClinicsHaveSubscription();
