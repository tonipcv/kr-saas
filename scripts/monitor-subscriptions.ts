import { PrismaClient } from '@prisma/client';
import { SubscriptionStatus, PlanTier } from '@/types/subscription';

const prisma = new PrismaClient();

interface SubscriptionMetrics {
  timestamp: Date;
  activeSubscriptions: number;
  trialSubscriptions: number;
  pastDueSubscriptions: number;
  canceledSubscriptions: number;
  planDistribution: Record<PlanTier, number>;
  averageDoctorsPerClinic: number;
  averagePatientsPerClinic: number;
  conversionRate: number;
  churnRate: number;
}

async function collectMetrics(): Promise<SubscriptionMetrics> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30));

  // Contagens básicas
  const [
    activeCount,
    trialCount,
    pastDueCount,
    canceledCount
  ] = await Promise.all([
    prisma.clinicSubscription.count({
      where: { status: SubscriptionStatus.ACTIVE }
    }),
    prisma.clinicSubscription.count({
      where: { status: SubscriptionStatus.TRIAL }
    }),
    prisma.clinicSubscription.count({
      where: { status: SubscriptionStatus.PAST_DUE }
    }),
    prisma.clinicSubscription.count({
      where: { 
        status: SubscriptionStatus.CANCELED,
        canceledAt: { gte: thirtyDaysAgo }
      }
    })
  ]);

  // Distribuição por plano
  const planDistribution = await prisma.clinicSubscription.groupBy({
    by: ['planId'],
    _count: true,
    where: {
      status: {
        in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL]
      }
    }
  });

  // Médias de uso
  const clinics = await prisma.clinicSubscription.findMany({
    where: {
      status: {
        in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL]
      }
    },
    select: {
      currentDoctorsCount: true,
      currentPatientsCount: true
    }
  });

  const totalClinics = clinics.length;
  const totalDoctors = clinics.reduce((sum, c) => sum + c.currentDoctorsCount, 0);
  const totalPatients = clinics.reduce((sum, c) => sum + c.currentPatientsCount, 0);

  // Taxa de conversão (trial → paid)
  const completedTrials = await prisma.clinicSubscription.count({
    where: {
      status: {
        in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCELED]
      },
      createdAt: { gte: thirtyDaysAgo }
    }
  });

  const totalTrials = await prisma.clinicSubscription.count({
    where: {
      status: SubscriptionStatus.TRIAL,
      createdAt: { gte: thirtyDaysAgo }
    }
  });

  // Calcular métricas
  const metrics: SubscriptionMetrics = {
    timestamp: new Date(),
    activeSubscriptions: activeCount,
    trialSubscriptions: trialCount,
    pastDueSubscriptions: pastDueCount,
    canceledSubscriptions: canceledCount,
    planDistribution: planDistribution.reduce((acc, curr) => ({
      ...acc,
      [curr.planId]: curr._count
    }), {} as Record<PlanTier, number>),
    averageDoctorsPerClinic: totalClinics ? totalDoctors / totalClinics : 0,
    averagePatientsPerClinic: totalClinics ? totalPatients / totalClinics : 0,
    conversionRate: totalTrials ? (completedTrials / totalTrials) * 100 : 0,
    churnRate: activeCount ? (canceledCount / activeCount) * 100 : 0
  };

  return metrics;
}

async function checkAlerts(metrics: SubscriptionMetrics) {
  const alerts = [];

  // Alertas de conversão
  if (metrics.conversionRate < 10) {
    alerts.push({
      level: 'warning',
      message: 'Taxa de conversão abaixo de 10%',
      metric: 'conversionRate',
      value: metrics.conversionRate
    });
  }

  // Alertas de churn
  if (metrics.churnRate > 5) {
    alerts.push({
      level: 'warning',
      message: 'Taxa de churn acima de 5%',
      metric: 'churnRate',
      value: metrics.churnRate
    });
  }

  // Alertas de trial
  if (metrics.trialSubscriptions > metrics.activeSubscriptions * 0.5) {
    alerts.push({
      level: 'info',
      message: 'Alto número de trials em relação a subscrições ativas',
      metric: 'trialRatio',
      value: metrics.trialSubscriptions / metrics.activeSubscriptions
    });
  }

  // Alertas de past due
  if (metrics.pastDueSubscriptions > metrics.activeSubscriptions * 0.1) {
    alerts.push({
      level: 'error',
      message: 'Alto número de subscrições past due',
      metric: 'pastDueRatio',
      value: metrics.pastDueSubscriptions / metrics.activeSubscriptions
    });
  }

  return alerts;
}

async function saveMetrics(metrics: SubscriptionMetrics) {
  // Salvar métricas no banco ou enviar para sistema de monitoramento
  await prisma.subscriptionMetrics.create({
    data: {
      timestamp: metrics.timestamp,
      activeSubscriptions: metrics.activeSubscriptions,
      trialSubscriptions: metrics.trialSubscriptions,
      pastDueSubscriptions: metrics.pastDueSubscriptions,
      canceledSubscriptions: metrics.canceledSubscriptions,
      planDistribution: metrics.planDistribution,
      averageDoctorsPerClinic: metrics.averageDoctorsPerClinic,
      averagePatientsPerClinic: metrics.averagePatientsPerClinic,
      conversionRate: metrics.conversionRate,
      churnRate: metrics.churnRate
    }
  });
}

async function monitor() {
  try {
    console.log('🔍 Coletando métricas...');
    const metrics = await collectMetrics();
    
    console.log('📊 Verificando alertas...');
    const alerts = await checkAlerts(metrics);
    
    console.log('💾 Salvando métricas...');
    await saveMetrics(metrics);

    // Exibir resultados
    console.log('\n📈 Métricas:');
    console.log(JSON.stringify(metrics, null, 2));

    if (alerts.length > 0) {
      console.log('\n⚠️ Alertas:');
      console.log(JSON.stringify(alerts, null, 2));
    } else {
      console.log('\n✅ Nenhum alerta');
    }
  } catch (error) {
    console.error('❌ Erro ao monitorar subscrições:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Executar monitoramento
monitor();
