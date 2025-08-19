import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getClinicSubscriptionStatus } from '@/lib/subscription';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const status = await getClinicSubscriptionStatus(session.user.id);
    if (!status) {
      // Step-by-step diagnostics
      const userId = session.user.id;
      const ownedClinic = await prisma.clinic.findFirst({ where: { ownerId: userId }, select: { id: true, name: true } });
      const membership = await prisma.clinicMember.findFirst({ where: { userId, isActive: true }, select: { clinicId: true } });
      const clinicId = ownedClinic?.id ?? membership?.clinicId ?? null;

      const latestClinicSub = clinicId
        ? await prisma.unified_subscriptions.findFirst({
            where: { type: 'CLINIC', subscriber_id: clinicId },
            include: { subscription_plans: { select: { id: true, name: true } } },
            orderBy: { created_at: 'desc' },
          })
        : null;

      const latestDoctorSub = await prisma.unified_subscriptions.findFirst({
        where: { type: 'DOCTOR', subscriber_id: userId },
        include: { subscription_plans: { select: { id: true, name: true } } },
        orderBy: { created_at: 'desc' },
      });

      const reasons: string[] = [];
      if (!clinicId) reasons.push('Usuário não possui clínica própria nem participação ativa em clínica.');

      const hasActiveClinic = !!(latestClinicSub && ['ACTIVE', 'TRIAL'].includes(latestClinicSub.status));
      const hasActiveDoctor = !!(latestDoctorSub && ['ACTIVE', 'TRIAL'].includes(latestDoctorSub.status));
      if (!hasActiveClinic && !hasActiveDoctor) {
        reasons.push('Nenhuma assinatura ativa ou em trial foi encontrada (nível clínica nem nível doutor).');
      }
      if (latestClinicSub && !hasActiveClinic) {
        reasons.push(`Última assinatura de clínica está '${latestClinicSub.status}'.`);
      }
      if (latestDoctorSub && !hasActiveDoctor) {
        reasons.push(`Última assinatura de doutor está '${latestDoctorSub.status}'.`);
      }

      // Provide a compact snapshot of active plans to help clients decide next steps
      const activePlans = await prisma.subscriptionPlan.findMany({
        where: { isActive: true },
        orderBy: { price: 'asc' },
        select: {
          id: true,
          name: true,
          price: true,
          trialDays: true,
          maxPatients: true,
          maxProducts: true,
          isDefault: true,
        },
      });

      const diagnostics = {
        error: 'Subscription não encontrada',
        code: 'SUBSCRIPTION_NOT_FOUND',
        message: 'Nenhuma assinatura ativa ou em trial foi encontrada para este usuário/clínica.',
        reasons,
        context: {
          clinic: ownedClinic ?? (membership ? { id: membership.clinicId } : null),
          latestClinicSubscription: latestClinicSub
            ? {
                id: latestClinicSub.id,
                status: latestClinicSub.status,
                start_date: latestClinicSub.start_date,
                end_date: latestClinicSub.end_date,
                trial_end_date: latestClinicSub.trial_end_date,
                plan: latestClinicSub.subscription_plans,
              }
            : null,
          latestDoctorSubscription: latestDoctorSub
            ? {
                id: latestDoctorSub.id,
                status: latestDoctorSub.status,
                start_date: latestDoctorSub.start_date,
                end_date: latestDoctorSub.end_date,
                trial_end_date: latestDoctorSub.trial_end_date,
                plan: latestDoctorSub.subscription_plans,
              }
            : null,
        },
        plans: activePlans,
      } as const;

      // Print detailed reason in server console for debugging
      console.warn('[SUBSCRIPTION CURRENT 404]', JSON.stringify(diagnostics, null, 2));

      return NextResponse.json(diagnostics, { status: 404 });
    }

    return NextResponse.json({
      planId: status.planId,
      planName: status.planName,
      status: status.status,
      isActive: status.isActive,
      isTrial: status.isTrial,
      isExpired: status.isExpired,
      daysRemaining: status.daysRemaining,
      trialDays: status.trialDays ?? null,
      limits: status.limits,
      planFeatures: status.planFeatures,
      // Flattened capability flags for convenience
      maxReferralsPerMonth: status.planFeatures?.maxReferralsPerMonth ?? null,
      maxRewards: status.planFeatures?.maxRewards ?? null,
      allowPurchaseCredits: status.planFeatures?.allowPurchaseCredits ?? false,
      allowCampaigns: status.planFeatures?.allowCampaigns ?? false,
      planPrice: status.planFeatures?.price ?? null,
    });
  } catch (error) {
    console.error('Erro ao obter subscription atual:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
