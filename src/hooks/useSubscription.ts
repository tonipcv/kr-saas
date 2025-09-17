import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
// Local copy of the API response shape to avoid importing server code into client
interface SubscriptionLimits {
  maxPatients: number;
  maxProtocols: number;
  maxCourses: number;
  maxProducts: number;
  features: string[];
}

interface PlanFeatures {
  maxReferralsPerMonth?: number;
  allowPurchaseCredits?: boolean;
  maxRewards?: number;
  allowCampaigns?: boolean;
  price?: number;
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

export function useSubscription() {
  const { data: session } = useSession();
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSubscription() {
      if (!session?.user?.id) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await fetch('/api/subscription/current', { method: 'GET' });
        if (response.ok) {
          const data: SubscriptionStatus = await response.json();
          setSubscriptionStatus(data);
          setError(null);
        } else if (response.status === 404) {
          // Auto-provision may have failed; surface diagnostics message if present
          try {
            const diag = await response.json();
            setError(diag?.message || 'Subscription não encontrada');
          } catch {
            setError('Subscription não encontrada');
          }
          setSubscriptionStatus(null);
        } else {
          throw new Error('Erro ao carregar subscription');
        }
      } catch (err) {
        setError('Erro ao carregar subscription');
        console.error('Erro ao carregar subscription:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchSubscription();
  }, [session?.user?.id]);

  const checkLimit = async (
    type: 'patients' | 'protocols' | 'courses' | 'products',
    clinicId?: string
  ): Promise<{ allowed: boolean; message?: string; current?: number; limit?: number }> => {
    if (!session?.user?.id) {
      return { allowed: false, message: 'Usuário não autenticado' };
    }

    try {
      const url = new URL('/api/subscription/check-limit', window.location.origin);
      url.searchParams.set('type', type);
      if (clinicId) url.searchParams.set('clinicId', clinicId);
      const response = await fetch(url.toString(), {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error('Erro ao verificar limite');
      }

      return await response.json();
    } catch (error) {
      console.error('Erro ao verificar limite:', error);
      return { allowed: false, message: 'Erro ao verificar limite' };
    }
  };

  return {
    subscriptionStatus,
    loading,
    error,
    checkLimit,
    isActive: subscriptionStatus?.isActive || false,
    isTrial: subscriptionStatus?.isTrial || false,
    daysRemaining: subscriptionStatus?.daysRemaining || 0,
    limits: subscriptionStatus?.limits || {
      maxPatients: 0,
      maxProtocols: 0,
      maxCourses: 0,
      maxProducts: 0,
      features: []
    }
  };
}
 