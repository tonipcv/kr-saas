import { prisma } from '@/lib/prisma';
import { SubscriptionStatus as PrismaSubscriptionStatus } from '@prisma/client';

export interface SubscriptionLimits {
  maxDoctors: number;
  maxPatients: number;
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
  clinicId?: string;
}

export interface PlanFeatures {
  maxReferralsPerMonth?: number;
  allowPurchaseCredits?: boolean;
  maxRewards?: number;
  allowCampaigns?: boolean;
  price?: number;
}

// Resolve all clinics associated to a user (personal, owned, memberships)
async function findClinicsForUser(userId: string): Promise<string[]> {
  const ids = new Set<string>();
  // Personal clinic (created by auto-provisioner)
  const personal = await prisma.clinic.findUnique({ where: { id: userId }, select: { id: true } });
  if (personal?.id) ids.add(personal.id);
  // Owned clinics
  const owned = await prisma.clinic.findMany({ where: { ownerId: userId }, select: { id: true } });
  owned.forEach(c => ids.add(c.id));
  // Active memberships
  const memberships = await prisma.clinicMember.findMany({ where: { userId, isActive: true }, select: { clinicId: true } });
  memberships.forEach(m => ids.add(m.clinicId));
  return Array.from(ids);
}

// Get current active or trial subscription and plan.
// Consider all associated clinics.
// Pick the best by: highest price, then status (ACTIVE > TRIAL), then newest created.
async function getClinicSubscription(userId: string) {
  const clinicIds = await findClinicsForUser(userId);
  if (clinicIds.length === 0) return null;

  const subscriptions = await prisma.clinicSubscription.findMany({
    where: {
      clinicId: { in: clinicIds },
      status: { in: ['ACTIVE', 'TRIAL'] }
    },
    include: {
      plan: true,
      clinic: {
        select: {
          id: true,
          name: true,
          isActive: true
        }
      }
    },
    orderBy: [
      { status: 'desc' }, // TRIAL < ACTIVE
      { createdAt: 'desc' }
    ]
  });

  if (subscriptions.length === 0) return null;

  // Sort by plan price (highest first), then status, then creation date
  subscriptions.sort((a, b) => {
    const pa = a.plan.price ?? 0;
    const pb = b.plan.price ?? 0;
    if (pb !== pa) return pb - pa; // higher price first
    const sa = a.status === 'ACTIVE' ? 2 : a.status === 'TRIAL' ? 1 : 0;
    const sb = b.status === 'ACTIVE' ? 2 : b.status === 'TRIAL' ? 1 : 0;
    if (sb !== sa) return sb - sa; // ACTIVE before TRIAL
    return b.createdAt.getTime() - a.createdAt.getTime(); // newest first
  });

  const best = subscriptions[0];
  return { clinicId: best.clinicId, sub: best };
}

export async function getClinicSubscriptionStatus(userId: string): Promise<SubscriptionStatus | null> {
  try {
    const data = await getClinicSubscription(userId);
    if (!data) return null;
    const { sub } = data;

    const now = new Date();
    const plan = sub.plan;
    const isTrial = sub.status === 'TRIAL';
    const isExpired = isTrial && sub.trialEndsAt ? now > sub.trialEndsAt : false;
    const isActive = sub.status === 'ACTIVE' || (isTrial && !isExpired);

    let daysRemaining = 0;
    const endRef = isTrial ? sub.trialEndsAt : sub.currentPeriodEnd;
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
      maxReferralsPerMonth: parsedFeatures.maxReferralsPerMonth,
      allowPurchaseCredits: parsedFeatures.allowPurchaseCredits,
      maxRewards: parsedFeatures.maxRewards,
      allowCampaigns: parsedFeatures.allowCampaigns,
      price: plan.price
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
      clinicId: data.clinicId,
      limits: {
        maxDoctors: plan.maxDoctors ?? 0,
        maxPatients: plan.maxPatients ?? 0,
        features: Array.isArray(parsedFeatures) ? parsedFeatures : []
      },
      planFeatures: Array.isArray(parsedFeatures) ? mergedFeatures : (mergedFeatures as PlanFeatures)
    };
  } catch (error) {
    console.error('Erro ao verificar subscription da clínica:', error);
    return null;
  }
}

// Count patients for a specific clinic (scoped to its members)
async function countClinicPatientsForClinic(clinicId: string): Promise<number> {
  const members = await prisma.clinicMember.findMany({ where: { clinicId, isActive: true }, select: { userId: true } });
  const ids = members.map(m => m.userId);
  if (ids.length === 0) return 0;
  return prisma.user.count({ where: { role: 'PATIENT', doctor_id: { in: ids } } });
}

// Public checks used by API
export async function canAddPatient(userId: string): Promise<{ allowed: boolean; message?: string }> {
  const status = await getClinicSubscriptionStatus(userId);
  if (!status) return { allowed: false, message: 'Subscription não encontrada' };
  if (!status.isActive) return { allowed: false, message: 'Subscription inativa ou expirada' };

  const clinicId = status.clinicId;
  if (!clinicId) return { allowed: false, message: 'Clínica não encontrada para a assinatura' };
  const current = await countClinicPatientsForClinic(clinicId);
  if (current >= status.limits.maxPatients) {
    return { allowed: false, message: `Limite de ${status.limits.maxPatients} pacientes atingido. Faça upgrade do seu plano.` };
  }
  return { allowed: true };
}

// New feature checks
async function getClinicMemberIds(userId: string): Promise<string[]> {
  const clinicIds = await findClinicsForUser(userId);
  if (clinicIds.length === 0) return [];
  const clinicId = clinicIds[0];
  const members = await prisma.clinicMember.findMany({ where: { clinicId, isActive: true }, select: { userId: true } });
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
      doctorId: { in: memberIds },
      createdAt: { gte: startOfMonth, lt: endOfMonth }
    }
  });

  if (count >= limit) {
    return { allowed: false, message: `Limite de ${limit} referrals/mês atingido. Faça upgrade do seu plano.` };
  }
  return { allowed: true };
}

export async function canCreateReward(userId: string): Promise<{ allowed: boolean; message?: string }> {
  // Rewards are now unlimited and not gated by subscription or clinic membership.
  // Keeping the signature for compatibility with existing callers.
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

// Keep metrics function (optional update to unified subscriptions later)
export async function updateSystemMetrics(): Promise<void> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const totalDoctors = await prisma.user.count({ where: { role: 'DOCTOR' } });
    const totalPatients = await prisma.user.count({ where: { role: 'PATIENT' } });
    const totalReferrals = await prisma.referralLead.count();
    const totalProtocols = await prisma.protocol.count();
    const totalCourses = await prisma.course.count();

    const activeSubscriptions = await prisma.clinicSubscription.count({ where: { status: 'ACTIVE' } });
    const trialSubscriptions = await prisma.clinicSubscription.count({ where: { status: 'TRIAL' } });

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