import { prisma } from '@/lib/prisma';

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
  planName?: string;
  status?: string;
  planFeatures?: PlanFeatures;
  planId?: string;
  trialDays?: number | null;
}

export interface PlanFeatures {
  maxReferralsPerMonth?: number;
  allowPurchaseCredits?: boolean;
  maxRewards?: number;
  allowCampaigns?: boolean;
  price?: number;
}

// Resolve the clinic for a user (owner or active member)
async function findClinicForUser(userId: string): Promise<{ id: string } | null> {
  const owned = await prisma.clinic.findFirst({ where: { ownerId: userId }, select: { id: true } });
  if (owned) return owned;
  const membership = await prisma.clinicMember.findFirst({
    where: { userId, isActive: true },
    select: { clinicId: true }
  });
  if (membership) return { id: membership.clinicId };
  return null;
}

// Get current active or trial subscription and plan. Prefer CLINIC; fallback to DOCTOR.
async function getClinicSubscription(userId: string) {
  const clinic = await findClinicForUser(userId);

  if (clinic) {
    const clinicSub = await prisma.unified_subscriptions.findFirst({
      where: {
        type: 'CLINIC',
        subscriber_id: clinic.id,
        status: { in: ['ACTIVE', 'TRIAL'] }
      },
      include: { subscription_plans: true },
      orderBy: { created_at: 'desc' }
    });
    if (clinicSub) return { clinicId: clinic.id, sub: clinicSub };
  }

  // Fallback: DOCTOR-level subscription
  const doctorSub = await prisma.unified_subscriptions.findFirst({
    where: {
      type: 'DOCTOR',
      subscriber_id: userId,
      status: { in: ['ACTIVE', 'TRIAL'] }
    },
    include: { subscription_plans: true },
    orderBy: { created_at: 'desc' }
  });
  if (!doctorSub) return null;
  return { clinicId: clinic?.id ?? '', sub: doctorSub };
}

export async function getClinicSubscriptionStatus(userId: string): Promise<SubscriptionStatus | null> {
  try {
    const data = await getClinicSubscription(userId);
    if (!data) return null;
    const { sub } = data;

    const now = new Date();
    const plan = sub.subscription_plans;
    const isTrial = sub.status === 'TRIAL';
    const isExpired = isTrial && sub.trial_end_date ? now > sub.trial_end_date : false;
    const isActive = sub.status === 'ACTIVE' || (isTrial && !isExpired);

    let daysRemaining = 0;
    const endRef = isTrial ? sub.trial_end_date : sub.end_date;
    if (endRef) {
      daysRemaining = Math.max(0, Math.ceil((endRef.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    }

    let parsedFeatures: any = {};
    try {
      parsedFeatures = plan.features ? JSON.parse(plan.features) : {};
    } catch {
      parsedFeatures = {};
    }

    // Merge plan columns with any legacy JSON features
    const mergedFeatures: PlanFeatures = {
      maxReferralsPerMonth: plan.referralsMonthlyLimit ?? parsedFeatures.maxReferralsPerMonth,
      allowPurchaseCredits: plan.allowCreditPerPurchase ?? parsedFeatures.allowPurchaseCredits,
      maxRewards: plan.maxRewards ?? parsedFeatures.maxRewards,
      allowCampaigns: plan.allowCampaigns ?? parsedFeatures.allowCampaigns,
      price: plan.price ?? parsedFeatures.price,
    };

    return {
      isActive,
      isTrial,
      isExpired,
      daysRemaining,
      planName: plan.name,
      status: sub.status,
      planId: plan.id,
      trialDays: plan.trialDays ?? null,
      limits: {
        maxPatients: plan.maxPatients ?? 0,
        maxProtocols: plan.maxProtocols ?? 0,
        maxCourses: plan.maxCourses ?? 0,
        maxProducts: plan.maxProducts ?? 0,
        features: Array.isArray(parsedFeatures) ? parsedFeatures : []
      },
      planFeatures: Array.isArray(parsedFeatures) ? mergedFeatures : (mergedFeatures as PlanFeatures)
    };
  } catch (error) {
    console.error('Erro ao verificar subscription da clínica:', error);
    return null;
  }
}

// Count helpers across clinic members
async function countClinicPatients(userId: string): Promise<number> {
  const clinic = await findClinicForUser(userId);
  if (!clinic) return 0;
  const members = await prisma.clinicMember.findMany({ where: { clinicId: clinic.id, isActive: true }, select: { userId: true } });
  const ids = members.map(m => m.userId);
  if (ids.length === 0) return 0;
  return prisma.user.count({ where: { role: 'PATIENT', doctor_id: { in: ids } } });
}

async function countClinicProtocols(userId: string): Promise<number> {
  const clinic = await findClinicForUser(userId);
  if (!clinic) return 0;
  const members = await prisma.clinicMember.findMany({ where: { clinicId: clinic.id, isActive: true }, select: { userId: true } });
  const ids = members.map(m => m.userId);
  if (ids.length === 0) return 0;
  return prisma.protocol.count({ where: { doctor_id: { in: ids } } });
}

async function countClinicCourses(userId: string): Promise<number> {
  const clinic = await findClinicForUser(userId);
  if (!clinic) return 0;
  const members = await prisma.clinicMember.findMany({ where: { clinicId: clinic.id, isActive: true }, select: { userId: true } });
  const ids = members.map(m => m.userId);
  if (ids.length === 0) return 0;
  return prisma.course.count({ where: { doctor_id: { in: ids } } });
}

async function countClinicProducts(userId: string): Promise<number> {
  const clinic = await findClinicForUser(userId);
  if (!clinic) return 0;
  const members = await prisma.clinicMember.findMany({ where: { clinicId: clinic.id, isActive: true }, select: { userId: true } });
  const ids = members.map(m => m.userId);
  if (ids.length === 0) return 0;
  return prisma.products.count({ where: { doctor_id: { in: ids } } });
}

// Public checks used by API
export async function canAddPatient(userId: string): Promise<{ allowed: boolean; message?: string }> {
  const status = await getClinicSubscriptionStatus(userId);
  if (!status) return { allowed: false, message: 'Subscription não encontrada' };
  if (!status.isActive) return { allowed: false, message: 'Subscription inativa ou expirada' };

  const current = await countClinicPatients(userId);
  if (current >= status.limits.maxPatients) {
    return { allowed: false, message: `Limite de ${status.limits.maxPatients} pacientes atingido. Faça upgrade do seu plano.` };
  }
  return { allowed: true };
}

// New feature checks
async function getClinicMemberIds(userId: string): Promise<string[]> {
  const clinic = await findClinicForUser(userId);
  if (!clinic) return [];
  const members = await prisma.clinicMember.findMany({ where: { clinicId: clinic.id, isActive: true }, select: { userId: true } });
  return members.map(m => m.userId);
}

export async function canCreateReferral(userId: string): Promise<{ allowed: boolean; message?: string }> {
  const status = await getClinicSubscriptionStatus(userId);
  if (!status) return { allowed: false, message: 'Subscription não encontrada' };
  if (!status.isActive) return { allowed: false, message: 'Subscription inativa ou expirada' };

  const limit = status.planFeatures?.maxReferralsPerMonth ?? 0;
  if (limit <= 0) return { allowed: false, message: 'Seu plano não permite criar referrals' };

  const memberIds = await getClinicMemberIds(userId);
  if (memberIds.length === 0) return { allowed: false, message: 'Sem membros na clínica' };

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const count = await prisma.referrals.count({
    where: {
      doctor_id: { in: memberIds },
      createdAt: { gte: startOfMonth, lt: endOfMonth }
    }
  });

  if (count >= limit) {
    return { allowed: false, message: `Limite de ${limit} referrals/mês atingido. Faça upgrade do seu plano.` };
  }
  return { allowed: true };
}

export async function canCreateReward(userId: string): Promise<{ allowed: boolean; message?: string }> {
  const status = await getClinicSubscriptionStatus(userId);
  if (!status) return { allowed: false, message: 'Subscription não encontrada' };
  if (!status.isActive) return { allowed: false, message: 'Subscription inativa ou expirada' };

  const limit = status.planFeatures?.maxRewards ?? 0;
  if (limit <= 0) return { allowed: false, message: 'Seu plano não permite criar rewards' };

  const memberIds = await getClinicMemberIds(userId);
  if (memberIds.length === 0) return { allowed: false, message: 'Sem membros na clínica' };

  const count = await prisma.referralReward.count({ where: { doctor_id: { in: memberIds } } });
  if (count >= limit) {
    return { allowed: false, message: `Limite de ${limit} rewards atingido. Faça upgrade do seu plano.` };
  }
  return { allowed: true };
}

export async function hasAccessPurchaseCredits(userId: string): Promise<{ allowed: boolean; message?: string }> {
  const status = await getClinicSubscriptionStatus(userId);
  if (!status) return { allowed: false, message: 'Subscription não encontrada' };
  if (!status.isActive) return { allowed: false, message: 'Subscription inativa ou expirada' };
  const allowed = !!status.planFeatures?.allowPurchaseCredits;
  return allowed ? { allowed } : { allowed, message: 'Seu plano não possui acesso a crédito por purchase' };
}

export async function hasAccessCampaigns(userId: string): Promise<{ allowed: boolean; message?: string }> {
  const status = await getClinicSubscriptionStatus(userId);
  if (!status) return { allowed: false, message: 'Subscription não encontrada' };
  if (!status.isActive) return { allowed: false, message: 'Subscription inativa ou expirada' };
  const allowed = !!status.planFeatures?.allowCampaigns;
  return allowed ? { allowed } : { allowed, message: 'Seu plano não possui acesso à página de campanhas' };
}

export async function canCreateProtocol(userId: string): Promise<{ allowed: boolean; message?: string }> {
  const status = await getClinicSubscriptionStatus(userId);
  if (!status) return { allowed: false, message: 'Subscription não encontrada' };
  if (!status.isActive) return { allowed: false, message: 'Subscription inativa ou expirada' };

  const current = await countClinicProtocols(userId);
  if (current >= status.limits.maxProtocols) {
    return { allowed: false, message: `Limite de ${status.limits.maxProtocols} protocolos atingido. Faça upgrade do seu plano.` };
  }
  return { allowed: true };
}

export async function canCreateCourse(userId: string): Promise<{ allowed: boolean; message?: string }> {
  const status = await getClinicSubscriptionStatus(userId);
  if (!status) return { allowed: false, message: 'Subscription não encontrada' };
  if (!status.isActive) return { allowed: false, message: 'Subscription inativa ou expirada' };

  const current = await countClinicCourses(userId);
  if (current >= status.limits.maxCourses) {
    return { allowed: false, message: `Limite de ${status.limits.maxCourses} cursos atingido. Faça upgrade do seu plano.` };
  }
  return { allowed: true };
}

export async function canCreateProduct(userId: string): Promise<{ allowed: boolean; message?: string }> {
  const status = await getClinicSubscriptionStatus(userId);
  if (!status) return { allowed: false, message: 'Subscription não encontrada' };
  if (!status.isActive) return { allowed: false, message: 'Subscription inativa ou expirada' };

  const current = await countClinicProducts(userId);
  if (current >= status.limits.maxProducts) {
    return { allowed: false, message: `Limite de ${status.limits.maxProducts} produtos atingido. Faça upgrade do seu plano.` };
  }
  return { allowed: true };
}

// Keep metrics function (optional update to unified subscriptions later)
export async function updateSystemMetrics(): Promise<void> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const totalDoctors = await prisma.user.count({ where: { role: 'DOCTOR' } });
    const totalPatients = await prisma.user.count({ where: { role: 'PATIENT' } });
    const totalReferrals = await prisma.referralLead.count();
    const totalProtocols = await prisma.protocol.count();
    const totalCourses = await prisma.course.count();

    const activeSubscriptions = await prisma.unified_subscriptions.count({ where: { status: 'ACTIVE', type: 'CLINIC' } });
    const trialSubscriptions = await prisma.unified_subscriptions.count({ where: { status: 'TRIAL', type: 'CLINIC' } });

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
 