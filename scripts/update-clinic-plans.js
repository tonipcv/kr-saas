const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const newPlans = [
  {
    id: 'starter',
    name: 'Starter',
    tier: 'STARTER',
    description: 'Ideal para clínicas iniciando com até 2 médicos',
    monthlyPrice: 89.00,
    baseDoctors: 2,
    basePatients: 200,
    features: {
      customBranding: false,
      advancedReports: false,
      allowPurchaseCredits: true,
      maxReferralsPerMonth: 500,
      addOns: {
        extraDoctor: {
          price: 99,
          description: 'Médico adicional'
        },
        extraPatients: {
          price: 199,
          amount: 500,
          description: '500 pacientes adicionais'
        }
      }
    },
    trialDays: 14,
    requireCard: false,
    isActive: true,
    isPublic: true
  },
  {
    id: 'growth',
    name: 'Growth',
    tier: 'GROWTH',
    description: 'Para clínicas em crescimento com até 5 médicos',
    monthlyPrice: 199.00,
    baseDoctors: 5,
    basePatients: 1000,
    features: {
      customBranding: true,
      advancedReports: false,
      allowPurchaseCredits: true,
      maxReferralsPerMonth: 2000,
      addOns: {
        extraDoctor: {
          price: 99,
          description: 'Médico adicional'
        },
        extraPatients: {
          price: 199,
          amount: 500,
          description: '500 pacientes adicionais'
        },
        advancedReports: {
          price: 249,
          description: 'Relatórios avançados'
        }
      }
    },
    trialDays: 14,
    requireCard: false,
    isActive: true,
    isPublic: true
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tier: 'ENTERPRISE',
    description: 'Para grandes clínicas e centros médicos',
    monthlyPrice: 0.00, // Sob consulta
    baseDoctors: -1, // Ilimitado
    basePatients: -1, // Ilimitado
    features: {
      customBranding: true,
      advancedReports: true,
      allowPurchaseCredits: true,
      maxReferralsPerMonth: -1, // Ilimitado
      addOns: {
        customization: {
          description: 'Customizações específicas'
        },
        support: {
          description: 'Suporte prioritário'
        },
        api: {
          description: 'Acesso à API'
        }
      }
    },
    trialDays: 14,
    requireCard: false,
    isActive: true,
    isPublic: true
  }
];

async function main() {
  try {
    console.log('Updating clinic plans...');

    // Desativar todos os planos existentes
    const planIds = newPlans.map(p => p.id);
    await prisma.$queryRaw`
      UPDATE clinic_plans 
      SET is_active = false, 
          updated_at = NOW()
      WHERE id != ALL(${planIds})
      RETURNING id, name;
    `;
    console.log('Deactivated old plans');

    // Criar ou atualizar os novos planos
    for (const plan of newPlans) {
      await prisma.clinicPlan.upsert({
        where: { id: plan.id },
        update: {
          name: plan.name,
          tier: plan.tier,
          description: plan.description,
          monthlyPrice: plan.monthlyPrice,
          baseDoctors: plan.baseDoctors,
          basePatients: plan.basePatients,
          features: plan.features,
          trialDays: plan.trialDays,
          requireCard: plan.requireCard,
          isActive: plan.isActive,
          isPublic: plan.isPublic,
          updatedAt: new Date()
        },
        create: {
          ...plan,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });
      console.log(`Upserted plan: ${plan.name}`);
    }

    // Verificar os planos atualizados
    const updatedPlans = await prisma.$queryRaw`
      SELECT 
        id, name, tier, monthly_price as "monthlyPrice",
        base_doctors as "baseDoctors",
        base_patients as "basePatients",
        is_active as "isActive"
      FROM clinic_plans 
      ORDER BY monthly_price ASC;
    `;
    console.log('\nUpdated plans:', updatedPlans);

  } catch (error) {
    console.error('Error updating clinic plans:', error);
    throw error;
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
