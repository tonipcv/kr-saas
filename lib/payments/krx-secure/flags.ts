// KRX Secure Feature Flags (todos OFF por padrão)

import { prisma } from '@/lib/prisma';

export type KRXSecureFlags = {
  enabled: boolean;
  inspect: boolean;
  vault: boolean;
  networkTokens: boolean;
  cryptogram: boolean;
  '3ds': boolean;
  fallback: boolean;
};

// Master flags (OFF por padrão - zero impacto)
const MASTER_FLAGS: KRXSecureFlags = {
  enabled: false,
  inspect: false,
  vault: false,
  networkTokens: false,
  cryptogram: false,
  '3ds': false,
  fallback: false,
};

/**
 * Resolve feature flags para um merchant
 * - Master switch via env
 * - Per-merchant override via Merchant.config JSON
 * - Plan enforcement (vault/tokens/fallback apenas GROWTH/ENTERPRISE)
 */
export async function getKRXSecureFlags(merchantId: string): Promise<KRXSecureFlags> {
  // Master switch
  const masterEnabled = process.env.KRX_SECURE_ENABLED === 'true';
  
  if (!masterEnabled) {
    return { ...MASTER_FLAGS, enabled: false };
  }
  
  // Load merchant config
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: {
      clinic: {
        select: {
          subscriptions: {
            where: { status: 'ACTIVE' },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              plan: {
                select: { tier: true, features: true },
              },
            },
          },
        },
      },
    },
  });
  
  const subscription = merchant?.clinic?.subscriptions?.[0];
  const planTier = subscription?.plan?.tier; // STARTER | GROWTH | ENTERPRISE
  const planFeatures = (subscription?.plan?.features || {}) as any;
  
  // Map plan tier to KRX Secure availability
  // STARTER = FREE (no KRX Secure)
  // GROWTH = BASIC (inspect only)
  // ENTERPRISE = PRO (full KRX Secure)
  const isPro = planTier === 'ENTERPRISE';
  const isBasicOrAbove = planTier === 'GROWTH' || planTier === 'ENTERPRISE';
  
  // Check per-merchant overrides in plan features JSON
  const merchantOverrides = planFeatures?.krxSecure || {};
  
  return {
    enabled: true,
    inspect: isBasicOrAbove && (merchantOverrides.inspect !== false),
    vault: isPro && (merchantOverrides.vault !== false),
    networkTokens: isPro && (merchantOverrides.networkTokens !== false),
    cryptogram: isPro && (merchantOverrides.cryptogram !== false),
    '3ds': isPro && (merchantOverrides['3ds'] !== false),
    fallback: isPro && (merchantOverrides.fallback !== false),
  };
}

/**
 * Check if a specific feature is available
 */
export async function hasKRXSecureFeature(
  merchantId: string,
  feature: keyof Omit<KRXSecureFlags, 'enabled'>
): Promise<boolean> {
  const flags = await getKRXSecureFlags(merchantId);
  return flags.enabled && flags[feature];
}
