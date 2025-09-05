const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function ensureDefaultPlan() {
  try {
    console.log('Verificando plano padrão...');

    // Buscar plano padrão
    const defaultPlan = await prisma.subscriptionPlan.findFirst({
      where: { isDefault: true }
    });

    if (defaultPlan) {
      console.log('Plano padrão já existe:', defaultPlan);
      return;
    }

    // Criar plano padrão
    console.log('Criando plano padrão...');
    const plan = await prisma.subscriptionPlan.create({
      data: {
        name: 'Free',
        description: 'Plano gratuito padrão para novos médicos',
        price: 0,
        billingCycle: 'MONTHLY',
        maxDoctors: 1,
        features: 'Auto-created by ensure-default-plan script',
        isActive: true,
        maxPatients: 50,
        maxProtocols: 10,
        maxCourses: 5,
        maxProducts: 100,
        isDefault: true,
        trialDays: 30,
        referralsMonthlyLimit: 100,
        maxRewards: 10,
        allowCreditPerPurchase: true,
        allowCampaigns: false
      }
    });

    console.log('Plano padrão criado com sucesso:', plan);
  } catch (error) {
    console.error('Erro ao verificar/criar plano padrão:', error);
  } finally {
    await prisma.$disconnect();
  }
}

ensureDefaultPlan();
