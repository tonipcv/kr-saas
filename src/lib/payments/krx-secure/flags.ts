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

const MASTER_FLAGS: KRXSecureFlags = {
  enabled: false,
  inspect: false,
  vault: false,
  networkTokens: false,
  cryptogram: false,
  '3ds': false,
  fallback: false,
};

export async function getKRXSecureFlags(merchantId: string): Promise<KRXSecureFlags> {
  const masterEnabled = process.env.KRX_SECURE_ENABLED === 'true';
  if (!masterEnabled) return { ...MASTER_FLAGS, enabled: false };
  const forceInspect = process.env.KRX_SECURE_FORCE_INSPECT === 'true';

  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: {
      clinic: {
        select: {
          subscriptions: {
            where: { status: 'ACTIVE' },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { plan: { select: { tier: true, features: true } } },
          },
        },
      },
    },
  });

  const subscription = merchant?.clinic?.subscriptions?.[0];
  const planTier = subscription?.plan?.tier as 'STARTER' | 'GROWTH' | 'ENTERPRISE' | undefined;
  const planFeatures = (subscription?.plan?.features || {}) as any;

  const isPro = planTier === 'ENTERPRISE';
  const isBasicOrAbove = planTier === 'GROWTH' || planTier === 'ENTERPRISE';
  const merchantOverrides = planFeatures?.krxSecure || {};

  const computed: KRXSecureFlags = {
    enabled: true,
    inspect: (isBasicOrAbove && (merchantOverrides.inspect !== false)) || forceInspect,
    vault: isPro && (merchantOverrides.vault !== false),
    networkTokens: isPro && (merchantOverrides.networkTokens !== false),
    cryptogram: isPro && (merchantOverrides.cryptogram !== false),
    '3ds': isPro && (merchantOverrides['3ds'] !== false),
    fallback: isPro && (merchantOverrides.fallback !== false),
  };
  return computed;
}

export async function hasKRXSecureFeature(
  merchantId: string,
  feature: keyof Omit<KRXSecureFlags, 'enabled'>
): Promise<boolean> {
  const flags = await getKRXSecureFlags(merchantId);
  return flags.enabled && flags[feature];
}
