const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    // Buscar todos os planos
    const plans = await prisma.$queryRaw`
      SELECT 
        id,
        name,
        tier,
        description,
        monthly_price as "monthlyPrice",
        base_doctors as "baseDoctors",
        base_patients as "basePatients",
        features,
        trial_days as "trialDays",
        require_card as "requireCard",
        is_active as "isActive",
        is_public as "isPublic",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM clinic_plans
      ORDER BY monthly_price ASC;
    `;

    console.log('Found plans:', JSON.stringify(plans, null, 2));
    console.log('\nTotal plans:', plans.length);
  } catch (error) {
    console.error('Error checking clinic plans:', error);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
