import { prisma } from '@/lib/prisma';
import {
  ClinicSubscription,
  ClinicPlan,
  SubscriptionStatus,
  PlanTier,
  SubscriptionResponse
} from '@/types/subscription';

export class SubscriptionService {
  // Planos
  async getActivePlans(): Promise<ClinicPlan[]> {
    return prisma.clinicPlan.findMany({
      where: { isActive: true },
      orderBy: { price: 'asc' }
    });
  }

  async getPlanById(id: string): Promise<ClinicPlan | null> {
    return prisma.clinicPlan.findUnique({
      where: { id }
    });
  }

  // Subscrições
  async getClinicSubscription(clinicId: string): Promise<ClinicSubscription | null> {
    // Check if add-on tables exist to avoid triggering error logs
    const [{ exists }]: any = await prisma.$queryRaw`
      SELECT to_regclass('public.clinic_add_on_subscriptions') IS NOT NULL as exists
    `;

    if (exists) {
      return await prisma.$queryRaw`
        SELECT 
          cs.*,
          cp.*,
          ca.id as addon_id,
          ca.type as addon_type,
          ca.name as addon_name,
          ca.description as addon_description,
          ca.quantity as addon_quantity,
          ca.monthly_price as addon_price
        FROM clinic_subscriptions cs
        JOIN clinic_plans cp ON cp.id = cs.plan_id
        LEFT JOIN clinic_add_on_subscriptions cas ON cas.subscription_id = cs.id
        LEFT JOIN clinic_add_ons ca ON ca.id = cas.add_on_id
        WHERE cs.clinic_id = ${clinicId}
        AND cs.status::text IN ('ACTIVE', 'TRIAL')
        ORDER BY cs.created_at DESC
        LIMIT 1
      ` as any;
    } else {
      return await prisma.$queryRaw`
        SELECT 
          cs.*,
          cp.*
        FROM clinic_subscriptions cs
        JOIN clinic_plans cp ON cp.id = cs.plan_id
        WHERE cs.clinic_id = ${clinicId}
        AND cs.status::text IN ('ACTIVE', 'TRIAL')
        ORDER BY cs.created_at DESC
        LIMIT 1
      ` as any;
    }
  }

  async createTrialSubscription(
    clinicId: string,
    planId: string
  ): Promise<ClinicSubscription> {
    const plan = await this.getPlanById(planId);
    if (!plan) {
      throw new Error('Plan not found');
    }

    const trialDays = 14; // Configurável
    const now = new Date();
    const trialEnd = new Date(now.setDate(now.getDate() + trialDays));

    return prisma.$executeRaw`
      INSERT INTO clinic_subscriptions (
        id,
        clinic_id,
        plan_id,
        status,
        start_date,
        trial_ends_at,
        current_period_start,
        current_period_end,
        current_doctors_count,
        current_patients_count,
        created_at,
        updated_at
      ) VALUES (
        ${`cs_${clinicId}-trial`},
        ${clinicId},
        ${planId},
        'TRIAL',
        ${now},
        ${trialEnd},
        ${now},
        ${trialEnd},
        0,
        0,
        ${now},
        ${now}
      )
      RETURNING *
    `;
  }

  async updateSubscription(
    id: string,
    data: Partial<ClinicSubscription>
  ): Promise<ClinicSubscription> {
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (data.status) {
      updates.push(`status = $${paramIndex}::subscription_status`);
      values.push(data.status);
      paramIndex++;
    }

    if (data.currentPeriodEnd) {
      updates.push(`current_period_end = $${paramIndex}`);
      values.push(data.currentPeriodEnd);
      paramIndex++;
    }

    if (data.canceledAt) {
      updates.push(`canceled_at = $${paramIndex}`);
      values.push(data.canceledAt);
      paramIndex++;
    }

    if (data.currentDoctorsCount !== undefined) {
      updates.push(`current_doctors_count = $${paramIndex}`);
      values.push(data.currentDoctorsCount);
      paramIndex++;
    }

    if (data.currentPatientsCount !== undefined) {
      updates.push(`current_patients_count = $${paramIndex}`);
      values.push(data.currentPatientsCount);
      paramIndex++;
    }

    updates.push(`updated_at = $${paramIndex}`);
    values.push(new Date());

    const query = `
      UPDATE clinic_subscriptions
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex + 1}
      RETURNING *
    `;

    return prisma.$queryRaw(query, ...values, id);
  }

  async cancelSubscription(id: string): Promise<ClinicSubscription> {
    return this.updateSubscription(id, {
      status: SubscriptionStatus.CANCELED,
      canceledAt: new Date()
    });
  }

  // Uso e Limites
  async getSubscriptionUsage(clinicId: string): Promise<SubscriptionResponse | null> {
    const subscription = await this.getClinicSubscription(clinicId);
    if (!subscription) {
      return null;
    }

    // Resolve doctor (owner) for this clinic to count patients correctly
    const clinicOwner = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { ownerId: true }
    });

    const doctorId = clinicOwner?.ownerId || null;

    const [docRows, patRows]: any[] = await Promise.all([
      prisma.$queryRaw`
        SELECT COUNT(*)::int as count
        FROM clinic_members
        WHERE "clinicId" = ${clinicId}
        AND "isActive" = true
      `,
      doctorId
        ? prisma.$queryRaw`
            SELECT COUNT(*)::int as count
            FROM patient_profiles
            WHERE doctor_id = ${doctorId}
            AND is_active = true
          `
        : Promise.resolve([{ count: 0 } as any])
    ]);

    const doctorsCount = (docRows?.[0]?.count ?? 0) as number;
    const patientsCount = (patRows?.[0]?.count ?? 0) as number;

    return {
      subscription,
      usage: {
        doctors: {
          current: doctorsCount,
          limit: subscription.maxDoctors
        },
        patients: {
          current: patientsCount,
          limit: subscription.maxPatients
        }
      }
    };
  }

  // Validações
  async canAddDoctor(clinicId: string): Promise<boolean> {
    const usage = await this.getSubscriptionUsage(clinicId);
    if (!usage) return false;

    return usage.usage.doctors.current < usage.usage.doctors.limit;
  }

  async canAddPatient(clinicId: string): Promise<boolean> {
    const usage = await this.getSubscriptionUsage(clinicId);
    if (!usage) return false;

    return usage.usage.patients.current < usage.usage.patients.limit;
  }

  // Métricas
  async getSubscriptionMetrics() {
    const [activeCount, trialCount, pastDueCount] = await Promise.all([
      prisma.$queryRaw`
        SELECT COUNT(*)::int
        FROM clinic_subscriptions
        WHERE status::text = 'ACTIVE'
      `,
      prisma.$queryRaw`
        SELECT COUNT(*)::int
        FROM clinic_subscriptions
        WHERE status::text = 'TRIAL'
      `,
      prisma.$queryRaw`
        SELECT COUNT(*)::int
        FROM clinic_subscriptions
        WHERE status::text = 'PAST_DUE'
      `
    ]);

    const planDistribution = await prisma.$queryRaw`
      SELECT plan_id, COUNT(*)::int
      FROM clinic_subscriptions
      WHERE status::text IN ('ACTIVE', 'TRIAL')
      GROUP BY plan_id
    `;

    return {
      total: activeCount + trialCount + pastDueCount,
      active: activeCount,
      trial: trialCount,
      pastDue: pastDueCount,
      planDistribution
    };
  }
}