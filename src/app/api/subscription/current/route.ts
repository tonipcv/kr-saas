import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getClinicSubscriptionStatus } from '@/lib/subscription';
import { prisma } from '@/lib/prisma';
import { randomUUID } from 'crypto';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const status = await getClinicSubscriptionStatus(session.user.id);
    if (!status) {
      // Step-by-step diagnostics + auto-provision Free plan if missing
      const userId = session.user.id;
      // Always ensure a personal clinic exists with id=userId to satisfy both FKs (clinic and user)
      let clinicId = userId;
      try {
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } });
        if (user) {
          await prisma.clinic.upsert({
            where: { id: userId },
            update: {},
            create: {
              id: userId,
              ownerId: userId,
              name: user.name ? `Personal Clinic - ${user.name}` : 'Personal Clinic',
              isActive: true,
            },
          });
        }
      } catch (createClinicErr) {
        const errObj = createClinicErr instanceof Error ? { name: createClinicErr.name, message: createClinicErr.message, stack: createClinicErr.stack } : { value: String(createClinicErr) };
        console.error('Falha ao criar/garantir clínica pessoal para auto-provisionar:', errObj);
      }

      // Try to auto-provision default Free plan (CLINIC-level only to satisfy FK schema)
      try {
        if (clinicId) {
          const [userExists, clinicExists] = await Promise.all([
            prisma.user.findUnique({ where: { id: clinicId }, select: { id: true } }),
            prisma.clinic.findUnique({ where: { id: clinicId }, select: { id: true } }),
          ]);
          if (!userExists || !clinicExists) {
            console.warn('[AutoProvision] subscriber prerequisites missing', {
              subscriberId: clinicId,
              hasUser: !!userExists,
              hasClinic: !!clinicExists,
            });
            throw new Error('Subscriber prerequisites missing for FK constraints');
          }
          const freePlan = await prisma.subscriptionPlan.findFirst({ where: { isActive: true, isDefault: true }, orderBy: { price: 'asc' } });
          if (freePlan) {
            const now = new Date();
            const existing = await prisma.unified_subscriptions.findFirst({ where: { type: 'CLINIC', subscriber_id: clinicId } });
            if (existing) {
              await prisma.unified_subscriptions.update({
                where: { id: existing.id },
                data: {
                  plan_id: freePlan.id,
                  status: 'ACTIVE',
                  start_date: now,
                  trial_end_date: null,
                  end_date: null,
                  auto_renew: true,
                  updated_at: now,
                },
              });
            } else {
              await prisma.unified_subscriptions.create({
                data: {
                  id: randomUUID(),
                  type: 'CLINIC',
                  subscriber_id: clinicId,
                  plan_id: freePlan.id,
                  status: 'ACTIVE',
                  start_date: now,
                  trial_end_date: null,
                  end_date: null,
                  auto_renew: true,
                },
              });
            }
          }
        }
      } catch (e) {
        const errObj = e instanceof Error ? { name: e.name, message: e.message, stack: e.stack } : { value: String(e) };
        console.error('Falha ao auto-provisionar plano Free (nível clínica):', errObj);
      }

      // Re-check after attempting auto-provision
      const statusAfter = await getClinicSubscriptionStatus(userId);
      if (statusAfter) {
        return NextResponse.json({
          planId: statusAfter.planId,
          planName: statusAfter.planName,
          status: statusAfter.status,
          isActive: statusAfter.isActive,
          isTrial: statusAfter.isTrial,
          isExpired: statusAfter.isExpired,
          daysRemaining: statusAfter.daysRemaining,
          trialDays: statusAfter.trialDays ?? null,
          limits: statusAfter.limits,
          planFeatures: statusAfter.planFeatures,
          maxReferralsPerMonth: statusAfter.planFeatures?.maxReferralsPerMonth ?? null,
          maxRewards: statusAfter.planFeatures?.maxRewards ?? null,
          allowPurchaseCredits: statusAfter.planFeatures?.allowPurchaseCredits ?? false,
          allowCampaigns: statusAfter.planFeatures?.allowCampaigns ?? false,
          planPrice: statusAfter.planFeatures?.price ?? null,
        });
      }

      // If still not available, return diagnostics for client handling
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
