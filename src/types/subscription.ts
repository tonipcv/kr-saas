// Enums
export enum SubscriptionStatus {
  TRIAL = 'TRIAL',
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  CANCELED = 'CANCELED',
  EXPIRED = 'EXPIRED'
}

export enum PlanTier {
  STARTER = 'STARTER',
  GROWTH = 'GROWTH',
  ENTERPRISE = 'ENTERPRISE'
}

export enum AddOnType {
  EXTRA_DOCTOR = 'EXTRA_DOCTOR',
  EXTRA_PATIENTS = 'EXTRA_PATIENTS',
  ADVANCED_REPORTS = 'ADVANCED_REPORTS',
  CUSTOM_BRANDING = 'CUSTOM_BRANDING',
  WHITE_LABEL = 'WHITE_LABEL',
  API_ACCESS = 'API_ACCESS'
}

// Interfaces
export interface ClinicPlan {
  id: string;
  name: string;
  description?: string;
  tier: PlanTier;
  maxDoctors: number;
  maxPatients: number;
  price: number;
  isActive: boolean;
  features: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ClinicAddOn {
  id: string;
  name: string;
  description?: string;
  type: AddOnType;
  price: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClinicSubscription {
  id: string;
  clinicId: string;
  planId: string;
  status: SubscriptionStatus;
  startDate: Date;
  endDate?: Date;
  canceledAt?: Date;
  currentDoctorsCount: number;
  currentPatientsCount: number;
  plan: ClinicPlan;
  addOns?: ClinicAddOnSubscription[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ClinicAddOnSubscription {
  id: string;
  clinicSubscriptionId: string;
  addOnId: string;
  status: SubscriptionStatus;
  startDate: Date;
  endDate?: Date;
  canceledAt?: Date;
  addOn: ClinicAddOn;
  createdAt: Date;
  updatedAt: Date;
}

// Response Types
export interface SubscriptionResponse {
  subscription: ClinicSubscription;
  usage: {
    doctors: {
      current: number;
      limit: number;
    };
    patients: {
      current: number;
      limit: number;
    };
  };
}

// Helper Functions
export function mapStatus(status: string): SubscriptionStatus {
  switch (status.toUpperCase()) {
    case 'TRIAL':
      return SubscriptionStatus.TRIAL;
    case 'ACTIVE':
      return SubscriptionStatus.ACTIVE;
    case 'PAST_DUE':
      return SubscriptionStatus.PAST_DUE;
    case 'CANCELED':
      return SubscriptionStatus.CANCELED;
    case 'EXPIRED':
      return SubscriptionStatus.EXPIRED;
    default:
      throw new Error(`Invalid subscription status: ${status}`);
  }
}

export function mapTier(tier: string): PlanTier {
  switch (tier.toUpperCase()) {
    case 'STARTER':
      return PlanTier.STARTER;
    case 'GROWTH':
      return PlanTier.GROWTH;
    case 'ENTERPRISE':
      return PlanTier.ENTERPRISE;
    default:
      throw new Error(`Invalid plan tier: ${tier}`);
  }
}

// Legacy to New Model Conversion
export function mapLegacyToNewSubscription(legacy: any): ClinicSubscription {
  return {
    id: legacy.id.startsWith('cs_') ? legacy.id : `cs_${legacy.id}`,
    clinicId: legacy.subscriber_id,
    planId: legacy.plan_id,
    status: mapStatus(legacy.status),
    startDate: legacy.start_date || legacy.created_at,
    endDate: legacy.end_date,
    canceledAt: legacy.canceled_at,
    currentDoctorsCount: legacy.current_doctors_count || 0,
    currentPatientsCount: legacy.current_patients_count || 0,
    plan: {
      id: legacy.subscription_plans.id,
      name: legacy.subscription_plans.name,
      description: legacy.subscription_plans.description,
      tier: mapTier(legacy.subscription_plans.tier || 'STARTER'),
      maxDoctors: legacy.subscription_plans.maxDoctors || 1,
      maxPatients: legacy.subscription_plans.maxPatients || 100,
      price: legacy.subscription_plans.price || 0,
      isActive: legacy.subscription_plans.isActive ?? true,
      features: legacy.subscription_plans.features || [],
      createdAt: legacy.subscription_plans.created_at,
      updatedAt: legacy.subscription_plans.updated_at
    },
    createdAt: legacy.created_at,
    updatedAt: legacy.updated_at
  };
}
