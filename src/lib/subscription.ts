import { prisma } from '../../lib/prisma';



export interface SubscriptionLimits {
  maxPatients: number;
  maxProtocols: number;
  maxCourses: number;
  maxProducts: number;
  features: string[];
}

export interface SubscriptionStatus {
  isActive: boolean;
  isTrial: boolean;
  isExpired: boolean;
  daysRemaining: number;
  limits: SubscriptionLimits;
}

/**
 * Verifica o status da subscription de um médico
 */
export async function getDoctorSubscriptionStatus(doctorId: string): Promise<SubscriptionStatus | null> {
  try {
    const subscription = await prisma.doctorSubscription.findUnique({
      where: { doctorId },
      include: { plan: true }
    });

    if (!subscription) {
      return null;
    }

    const now = new Date();
    const isActive = subscription.status === 'ACTIVE';
    const isTrial = subscription.status === 'TRIAL';
    const isExpired = subscription.endDate ? now > subscription.endDate : false;
    
    let daysRemaining = 0;
    if (isTrial && subscription.trialEndDate) {
      daysRemaining = Math.max(0, Math.ceil((subscription.trialEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    } else if (subscription.endDate) {
      daysRemaining = Math.max(0, Math.ceil((subscription.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    }

    const features = subscription.plan.features ? JSON.parse(subscription.plan.features) : [];

    return {
      isActive: isActive || (isTrial && daysRemaining > 0),
      isTrial,
      isExpired,
      daysRemaining,
      limits: {
        maxPatients: subscription.plan.maxPatients ?? 0,
        maxProtocols: subscription.plan.maxProtocols ?? 0,
        maxCourses: subscription.plan.maxCourses ?? 0,
        maxProducts: subscription.plan.maxProducts ?? 0,
        features
      }
    };
  } catch (error) {
    console.error('Erro ao verificar subscription:', error);
    return null;
  }
}

/**
 * Verifica se um médico pode adicionar mais pacientes
 */
export async function canAddPatient(doctorId: string): Promise<{ allowed: boolean; message?: string }> {
  const status = await getDoctorSubscriptionStatus(doctorId);
  
  if (!status) {
    return { allowed: false, message: 'Subscription não encontrada' };
  }

  if (!status.isActive) {
    return { allowed: false, message: 'Subscription inativa ou expirada' };
  }

  const currentPatients = await prisma.user.count({
    where: { doctorId, role: 'PATIENT' }
  });

  if (currentPatients >= status.limits.maxPatients) {
    return { 
      allowed: false, 
      message: `Limite de ${status.limits.maxPatients} pacientes atingido. Faça upgrade do seu plano.` 
    };
  }

  return { allowed: true };
}

/**
 * Verifica se um médico pode criar mais protocolos
 */
export async function canCreateProtocol(doctorId: string): Promise<{ allowed: boolean; message?: string }> {
  const status = await getDoctorSubscriptionStatus(doctorId);
  
  if (!status) {
    return { allowed: false, message: 'Subscription não encontrada' };
  }

  if (!status.isActive) {
    return { allowed: false, message: 'Subscription inativa ou expirada' };
  }

  const currentProtocols = await prisma.protocol.count({
    where: { doctorId }
  });

  if (currentProtocols >= status.limits.maxProtocols) {
    return { 
      allowed: false, 
      message: `Limite de ${status.limits.maxProtocols} protocolos atingido. Faça upgrade do seu plano.` 
    };
  }

  return { allowed: true };
}

/**
 * Verifica se um médico pode criar mais cursos
 */
export async function canCreateCourse(doctorId: string): Promise<{ allowed: boolean; message?: string }> {
  const status = await getDoctorSubscriptionStatus(doctorId);
  
  if (!status) {
    return { allowed: false, message: 'Subscription não encontrada' };
  }

  if (!status.isActive) {
    return { allowed: false, message: 'Subscription inativa ou expirada' };
  }

  const currentCourses = await prisma.course.count({
    where: { doctorId }
  });

  if (currentCourses >= status.limits.maxCourses) {
    return { 
      allowed: false, 
      message: `Limite de ${status.limits.maxCourses} cursos atingido. Faça upgrade do seu plano.` 
    };
  }

  return { allowed: true };
}

/**
 * Verifica se um médico pode criar mais produtos
 */
export async function canCreateProduct(doctorId: string): Promise<{ allowed: boolean; message?: string }> {
  const status = await getDoctorSubscriptionStatus(doctorId);
  
  if (!status) {
    return { allowed: false, message: 'Subscription não encontrada' };
  }

  if (!status.isActive) {
    return { allowed: false, message: 'Subscription inativa ou expirada' };
  }

  const currentProducts = await prisma.products.count({
    where: { doctorId }
  });

  if (currentProducts >= status.limits.maxProducts) {
    return { 
      allowed: false, 
      message: `Limite de ${status.limits.maxProducts} produtos atingido. Faça upgrade do seu plano.` 
    };
  }

  return { allowed: true };
}

/**
 * Atualiza métricas do sistema
 */
export async function updateSystemMetrics(): Promise<void> {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const totalDoctors = await prisma.user.count({ where: { role: 'DOCTOR' } });
    const totalPatients = await prisma.user.count({ where: { role: 'PATIENT' } });
    const totalReferrals = await prisma.referralLead.count();
    const totalProtocols = await prisma.protocol.count();
    const totalCourses = await prisma.course.count();
    
    const activeSubscriptions = await prisma.doctorSubscription.count({
      where: { status: 'ACTIVE' }
    });
    
    const trialSubscriptions = await prisma.doctorSubscription.count({
      where: { status: 'TRIAL' }
    });

    await prisma.systemMetrics.upsert({
      where: { date: new Date(today) },
      update: {
        totalDoctors,
        totalPatients,
        totalReferrals,
        totalProtocols,
        totalCourses,
        activeSubscriptions,
        trialSubscriptions,
        updatedAt: new Date()
      },
      create: {
        date: new Date(today),
        totalDoctors,
        totalPatients,
        totalReferrals,
        totalProtocols,
        totalCourses,
        activeSubscriptions,
        trialSubscriptions
      }
    });
  } catch (error) {
    console.error('Erro ao atualizar métricas:', error);
  }
} 