import { prisma } from '@/lib/prisma';



/**
 * Gera um código único para indicação
 */
export function generateReferralCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Gera código único para nova indicação
 */
export function generateUniqueReferralCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Gera link de indicação para médico (LEGACY - baseado em doctorId)
 *
 * @deprecated Não use mais. Padronize para slug: use `generateDoctorReferralLinkBySlug(doctorSlug)`
 * Ex: https://app.com/{doctor_slug}
 */
export function generateDoctorReferralLink(doctorId: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.warn('[referral-utils] generateDoctorReferralLink is deprecated. Use generateDoctorReferralLinkBySlug instead.');
  }
  return `${baseUrl}/referral/${doctorId}`;
}

/**
 * Gera link de indicação para médico baseado em slug (NOVO PADRÃO)
 * Ex: https://app.com/{doctor_slug}
 */
export function generateDoctorReferralLinkBySlug(doctorSlug: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${baseUrl}/${doctorSlug}`;
}

/**
 * Gera link de indicação personalizado para paciente (LEGACY - usa email na query)
 *
 * @deprecated Não use mais. Padronize para `/${doctor_slug}?code=ABC123` usando `generatePatientReferralLinkWithCode`.
 */
export function generatePatientReferralLink(doctorId: string, patientEmail: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.warn('[referral-utils] generatePatientReferralLink is deprecated. Use generatePatientReferralLinkWithCode instead.');
  }
  return `${baseUrl}/referral/${doctorId}?ref=${encodeURIComponent(patientEmail)}`;
}

/**
 * Gera link de indicação para paciente com código de indicação (NOVO PADRÃO)
 * Ex: https://app.com/{doctor_slug}?code=ABC123
 */
export function generatePatientReferralLinkWithCode(doctorSlug: string, code: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${baseUrl}/${doctorSlug}?code=${encodeURIComponent(code)}`;
}

/**
 * Calcula o saldo de créditos de um usuário
 */
export async function getUserCreditsBalance(userId: string): Promise<number> {
  const credits = await prisma.referralCredit.findMany({
    where: {
      userId,
      isUsed: false // Apenas créditos não utilizados
    }
  });

  const totalEarned = credits.reduce((sum, credit) => sum + Number(credit.amount), 0);

  return totalEarned;
}

/**
 * Verifica se um email já é paciente de um médico
 */
export async function isExistingPatient(email: string, doctorId: string): Promise<boolean> {
  const existingPatient = await prisma.user.findFirst({
    where: {
      email,
      doctor_id: doctorId,
      role: 'PATIENT'
    }
  });

  return !!existingPatient;
}

/**
 * Busca usuário por código de indicação
 */
export async function getUserByReferralCode(referralCode: string) {
  // Select only what we need explicitly to avoid accidental omissions in other layers
  return await prisma.user.findUnique({
    where: {
      referral_code: referralCode
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      doctor_id: true,
      referral_code: true,
    }
  });
}

/**
 * Gerar código de indicação para usuário se não tiver
 */
export async function ensureUserHasReferralCode(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referral_code: true }
  });

  if (user?.referral_code) {
    return user.referral_code;
  }

  // Gerar código único
  let referralCode;
  let isUnique = false;
  let attempts = 0;

  while (!isUnique && attempts < 10) {
    referralCode = generateReferralCode();
    
    const existing = await prisma.user.findUnique({
      where: { referral_code: referralCode }
    });
    
    if (!existing) {
      isUnique = true;
    }
    attempts++;
  }

  if (!isUnique) {
    throw new Error('Não foi possível gerar código único');
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { referral_code: referralCode }
  });

  return referralCode!;
}

/**
 * Constantes para status
 */
export const REFERRAL_STATUS = {
  PENDING: 'PENDING',
  CONTACTED: 'CONTACTED', 
  CONVERTED: 'CONVERTED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED'
} as const;

export const CREDIT_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  USED: 'USED',
  EXPIRED: 'EXPIRED'
} as const;

export const CREDIT_TYPE = {
  SUCCESSFUL_REFERRAL: 'SUCCESSFUL_REFERRAL',
  BONUS_CREDIT: 'BONUS_CREDIT',
  MANUAL_ADJUSTMENT: 'MANUAL_ADJUSTMENT'
} as const;

export const REDEMPTION_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  FULFILLED: 'FULFILLED',
  CANCELLED: 'CANCELLED'
} as const;