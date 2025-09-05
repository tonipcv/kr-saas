const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function validateSubscriptionSample() {
  try {
    console.log('🔍 Iniciando validação manual de amostra...\n');

    // Buscar todas as subscrições usando SQL raw
    const subscriptions = await prisma.$queryRaw`
      SELECT 
        cs.*,
        c.name as clinic_name,
        c.id as clinic_id,
        cp.name as plan_name,
        cp.tier as plan_tier,
        cp.base_doctors as plan_base_doctors,
        cp.base_patients as plan_base_patients,
        cp.features as plan_features,
        (
          SELECT COUNT(*)
          FROM clinic_members cm
          WHERE cm."clinicId" = c.id
            AND cm."isActive" = true
            AND cm.role = 'PROVIDER'
        ) as actual_doctors_count
      FROM clinic_subscriptions cs
      JOIN clinics c ON c.id = cs.clinic_id
      JOIN clinic_plans cp ON cp.id = cs.plan_id
      WHERE cs.status IN ('ACTIVE', 'TRIAL')
      ORDER BY cs.created_at DESC
    `;

    console.log(`📊 Total de subscrições ativas: ${subscriptions.length}\n`);

    // Validar cada subscrição
    for (const sub of subscriptions) {
      console.log(`\n🏥 Clínica: ${sub.clinic_name}`);
      console.log('-------------------');

      // Validar subscrição atual
      console.log('📝 Subscrição:');
      console.log(`- ID: ${sub.id}`);
      console.log(`- Status: ${sub.status}`);
      console.log(`- Plano: ${sub.plan_name} (${sub.plan_tier})`);
      console.log(`- Início: ${sub.start_date}`);
      console.log(`- Fim do período: ${sub.current_period_end}`);
      console.log(`- Trial até: ${sub.trial_ends_at || 'N/A'}`);

      // Validar limites vs. uso
      console.log('\n📊 Uso vs. Limites:');
      console.log(`- Médicos: ${sub.actual_doctors_count}/${sub.plan_base_doctors}`);
      console.log(`- Pacientes: ${sub.current_patients_count}/${sub.plan_base_patients}`);

      // Verificar possíveis problemas
      const issues = [];

      // 1. Verificar se tem owner
      const hasOwner = await prisma.$queryRaw`
        SELECT EXISTS (
          SELECT 1 
          FROM clinic_members 
          WHERE "clinicId" = ${sub.clinic_id}
            AND role = 'OWNER'
            AND "isActive" = true
        ) as has_owner
      `;
      
      if (!hasOwner[0].has_owner) {
        issues.push('❌ Clínica sem owner');
      }

      // 2. Verificar se número de médicos está dentro do limite
      if (sub.actual_doctors_count > sub.plan_base_doctors) {
        issues.push('❌ Número de médicos excede o limite do plano');
      }

      // 3. Verificar se número de pacientes está dentro do limite
      if (sub.current_patients_count > sub.plan_base_patients) {
        issues.push('❌ Número de pacientes excede o limite do plano');
      }

      // 4. Verificar status vs. datas
      const now = new Date();
      if (sub.status === 'TRIAL' && new Date(sub.trial_ends_at) < now) {
        issues.push('❌ Trial expirado mas status ainda é TRIAL');
      }

      // 5. Verificar consistência de datas
      if (new Date(sub.current_period_end) < new Date(sub.current_period_start)) {
        issues.push('❌ Data de fim do período é anterior à data de início');
      }

      // Exibir problemas encontrados
      if (issues.length > 0) {
        console.log('\n⚠️ Problemas encontrados:');
        issues.forEach(issue => console.log(issue));
      } else {
        console.log('\n✅ Nenhum problema encontrado');
      }

      console.log('\n' + '='.repeat(50) + '\n');
    }

    console.log('✅ Validação manual concluída!');

  } catch (error) {
    console.error('❌ Erro durante validação:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Executar validação
validateSubscriptionSample();