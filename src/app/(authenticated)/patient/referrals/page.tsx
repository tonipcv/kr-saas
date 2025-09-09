'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { 
  Loader2, 
  Share2,
  Copy,
  Check,
  Gift,
  Users,
  CheckCircle,
  Clock,
  Star,
  Lock,
  UserPlus,
  MessageCircle,
  Mail,
  Phone,
  User,
  MoreVertical,
  LogOut,
  CalendarDays,
  ShoppingBag,
  XCircle,
  CircleSlash
} from 'lucide-react';
import { toast } from 'sonner';
import Image from 'next/image';
import Link from 'next/link';

// Translation system
const translations = {
  pt: {
    // Page title and description
    pageTitle: 'Programa de Indicações',
    pageDescription: 'Indique amigos e ganhe recompensas incríveis',
    
    // Action buttons
    shareLink: 'Compartilhar Link',
    startReferring: 'Começar a Indicar',
    shareOptions: 'Opções de Compartilhamento',
    shareWhatsApp: 'WhatsApp',
    shareSMS: 'SMS',
    shareEmail: 'Email',
    copyLink: 'Copiar Link',
    
    // Share messages
    shareMessage: 'Olá! Estou usando este incrível sistema médico e queria te indicar. Use meu código de indicação para se cadastrar:',
    shareSubject: 'Indicação - Sistema Médico',
    
    // Stats
    availableCredits: 'Créditos Disponíveis',
    totalReferrals: 'Total de Indicações',
    converted: 'Convertidas',
    conversionRate: 'Taxa de Conversão',
    
    // Rewards section
    rewards: 'Recompensas',
    rewardsDescription: 'Use seus créditos para resgatar recompensas',
    credits: 'créditos',
    remaining: 'Restam',
    redemptions: 'resgates',
    redeem: 'Resgatar',
    redeeming: 'Resgatando...',
    insufficientCredits: 'Créditos insuficientes',
    soldOut: 'Esgotado',
    noRewardsAvailable: 'Nenhuma recompensa disponível',
    waitForRewards: 'Aguarde novas recompensas do seu médico',
    
    // Referrals section
    yourReferrals: 'Suas Indicações',
    referralsDescription: 'Pessoas que você indicou',
    noReferralsYet: 'Nenhuma indicação ainda',
    startReferringDescription: 'Comece a indicar pessoas para ganhar créditos',
    creditsEarned: 'créditos ganhos',
    
    // Redemption history
    redemptionHistory: 'Histórico de Resgates',
    redemptionDescription: 'Recompensas que você já resgatou',
    creditsUsed: 'créditos usados',
    
    // Status labels
    status: {
      PENDING: 'Pendente',
      CONTACTED: 'Contatado',
      CONVERTED: 'Convertido',
      REJECTED: 'Rejeitado',
      APPROVED: 'Aprovado',
      FULFILLED: 'Usado'
    },
    
    // Toast messages
    toastMessages: {
      linkCopied: 'Link copiado para a área de transferência!',
      codeCopied: 'Código copiado para a área de transferência!',
      rewardRedeemed: 'Recompensa resgatada com sucesso!',
      errorRedeeming: 'Erro ao resgatar recompensa',
      errorGeneratingLink: 'Não foi possível gerar o link de indicação',
      errorCopyingLink: 'Erro ao copiar link. Tente novamente.',
      errorCopyingCode: 'Erro ao copiar código. Tente novamente.',
      codeNotAvailable: 'Código de indicação não disponível',
      connectionError: 'Erro de conexão. Tente novamente.',
      copyManually: 'Erro ao copiar link. Tente copiar manualmente: '
    }
  },
  en: {
    // Page title and description
    pageTitle: 'Referral Program',
    pageDescription: 'Refer friends and earn amazing rewards',
    
    // Action buttons
    shareLink: 'Share Link',
    startReferring: 'Start Referring',
    shareOptions: 'Share Options',
    shareWhatsApp: 'WhatsApp',
    shareSMS: 'SMS',
    shareEmail: 'Email',
    copyLink: 'Copy Link',
    
    // Share messages
    shareMessage: 'Hello! I\'m using this amazing medical system and wanted to refer you. Use my membership number to sign up:',
    shareSubject: 'Referral - Medical System',
    
    // Stats
    availableCredits: 'Available Points',
    totalReferrals: 'Total Referrals',
    converted: 'Converted',
    conversionRate: 'Conversion Rate',
    
    // Rewards section
    rewards: 'Rewards',
    rewardsDescription: 'Use your points to redeem rewards',
    credits: 'points',
    remaining: 'Remaining',
    redemptions: 'redemptions',
    redeem: 'Redeem',
    redeeming: 'Redeeming...',
    insufficientCredits: 'Insufficient points',
    soldOut: 'Sold out',
    noRewardsAvailable: 'No rewards available',
    waitForRewards: 'Wait for new rewards from your doctor',
    
    // Referrals section
    yourReferrals: 'Your Referrals',
    referralsDescription: 'People you have referred',
    noReferralsYet: 'No referrals yet',
    startReferringDescription: 'Start referring people to earn points',
    creditsEarned: 'points earned',
    
    // Redemption history
    redemptionHistory: 'Redemption History',
    redemptionDescription: 'Rewards you have already redeemed',
    creditsUsed: 'points used',
    
    // Status labels
    status: {
      PENDING: 'Pending',
      CONTACTED: 'Contacted',
      CONVERTED: 'Converted',
      REJECTED: 'Rejected',
      APPROVED: 'Approved',
      FULFILLED: 'Used'
    },
    
    // Toast messages
    toastMessages: {
      linkCopied: 'Link copied to clipboard!',
      codeCopied: 'Code copied to clipboard!',
      rewardRedeemed: 'Reward redeemed successfully!',
      errorRedeeming: 'Error redeeming reward',
      errorGeneratingLink: 'Could not generate referral link',
      errorCopyingLink: 'Error copying link. Please try again.',
      errorCopyingCode: 'Error copying code. Please try again.',
      codeNotAvailable: 'Referral code not available',
      connectionError: 'Connection error. Please try again.',
      copyManually: 'Error copying link. Please copy manually: '
    }
  }
};

// Hook to detect browser language
const useLanguage = () => {
  const [language, setLanguage] = useState<'pt' | 'en'>('pt');
  
  useEffect(() => {
    // Detect browser language
    const browserLang = navigator.language.toLowerCase();
    if (browserLang.startsWith('en')) {
      setLanguage('en');
    } else {
      setLanguage('pt'); // Default to Portuguese
    }
  }, []);
  
  return language;
};

interface PatientStats {
  totalReferrals: number;
  convertedReferrals: number;
  totalCreditsEarned: number;
  totalCreditsUsed: number;
  currentBalance: number;
}

interface Credit {
  id: string;
  amount: number;
  type: string;
  description?: string;
  displayDescription?: string | null;
  status: string;
  createdAt: string;
  lead?: {
    name: string;
    email: string;
    status: string;
  };
}

interface Referral {
  id: string;
  name: string;
  email: string;
  status: string;
  createdAt: string;
  doctor: {
    id: string;
    name: string;
  };
  credits: Array<{
    id: string;
    amount: number;
    status: string;
  }>;
}

interface Reward {
  id: string;
  title: string;
  description: string;
  creditsRequired: number;
  maxRedemptions?: number;
  currentRedemptions: number;
  isActive: boolean;
  imageUrl?: string | null;
}

interface Redemption {
  id: string;
  creditsUsed: number;
  status: string;
  redeemedAt: string;
  uniqueCode?: string | null;
  reward: {
    title: string;
    description: string;
    creditsRequired: number;
    imageUrl?: string | null;
  };
}

export default function PatientReferralsPage({ publicClinic, forceClinicHeader, isDarkTheme, brandColors }: { publicClinic?: { logo?: string | null; name?: string | null }; forceClinicHeader?: boolean; isDarkTheme?: boolean; brandColors?: { bg?: string | null; fg?: string | null } } = {}) {
  const { data: session } = useSession();
  // Force Portuguese on this page regardless of browser language
  const language: 'pt' | 'en' = 'pt';
  const t = translations.pt;
  
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState<string | null>(null);
  // Confirmation modal state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rewardToConfirm, setRewardToConfirm] = useState<Reward | null>(null);
  const [stats, setStats] = useState<PatientStats>({
    totalReferrals: 0,
    convertedReferrals: 0,
    totalCreditsEarned: 0,
    totalCreditsUsed: 0,
    currentBalance: 0
  });
  const [creditsHistory, setCreditsHistory] = useState<Credit[]>([]);
  const [referralsMade, setReferralsMade] = useState<Referral[]>([]);
  const [availableRewards, setAvailableRewards] = useState<Reward[]>([]);
  const [redemptionsHistory, setRedemptionsHistory] = useState<Redemption[]>([]);
  const [creditsBalance, setCreditsBalance] = useState(0);
  // Controls flip animation for membership card
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  // Tabs for lower content
  const [activeTab, setActiveTab] = useState<'earn' | 'use' | 'history' | null>(null);
  // Sub-tab for referrals status
  const [referralsTab, setReferralsTab] = useState<'ALL' | 'CONVERTED' | 'PENDING' | 'REJECTED'>('CONVERTED');
  // Extrato filters
  const [periodFilter, setPeriodFilter] = useState<'7d' | '30d' | 'all'>('30d');
  const [typeFilter, setTypeFilter] = useState<'all' | 'in' | 'out'>('all');
  const [visibleTxCount, setVisibleTxCount] = useState<number>(10);
  const [referralCode, setReferralCode] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [doctorSlug, setDoctorSlug] = useState<string>('');
  const [doctorName, setDoctorName] = useState<string>('');
  const [patientName, setPatientName] = useState<string>('');
  const [doctorImage, setDoctorImage] = useState<string>('');
  // State for hamburger menu (must be before any early returns)
  const [menuOpen, setMenuOpen] = useState(false);
  // Published campaigns for this doctor (for Earn points section)
  const [campaigns, setCampaigns] = useState<Array<{ campaign_slug: string; title: string; description?: string | null }>>([]);
  // UI state: which campaign link was copied recently
  const [copiedCampaign, setCopiedCampaign] = useState<string | null>(null);
  // Local toggle for top content: Earn Points vs Products
  const [viewSection, setViewSection] = useState<'earn' | 'products'>('earn');
  // Share referral modal and coupons state
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [couponsLoading, setCouponsLoading] = useState(false);
  const [couponsError, setCouponsError] = useState<string | null>(null);
  const [coupons, setCoupons] = useState<Array<{
    id: string;
    slug: string;
    name: string;
    display_title?: string | null;
    display_message?: string | null;
  }>>([]);
  // Products derived from doctor's prescriptions as patient-safe source
  const [doctorProducts, setDoctorProducts] = useState<Array<{ id: string; name: string; description: string; category?: string; originalPrice?: number | null; creditsPerUnit?: number }>>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  // Modals for Earn actions
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  // Friendly fallback names for design preview and empty states
  const displayPatientName = patientName || session?.user?.name || 'Paciente';
  const displayDoctorName = doctorName || 'Dr. Especialista';
  // Points card display: use real balance if available, otherwise a pleasant placeholder
  const displayPoints = creditsBalance;
  const hasGoogleReview = creditsHistory.some((c) => (c.type || '').toUpperCase().includes('GOOGLE'));

  // Toggle menu function
  const toggleMenu = () => {
    setMenuOpen(!menuOpen);
  };

  // Coupons fetching for Share modal
  const loadCoupons = async () => {
    const slug = (doctorSlug || '').trim();
    if (!slug) return;
    setCouponsLoading(true);
    setCouponsError(null);
    try {
      const res = await fetch(`/api/coupon-templates/doctor/${encodeURIComponent(slug)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Erro ao carregar cupons');
      const items = Array.isArray(json?.data) ? json.data : [];
      setCoupons(items);
    } catch (e: any) {
      console.error('[PatientReferrals] coupons load error', e);
      setCouponsError(e?.message || 'Erro ao carregar cupons');
    } finally {
      setCouponsLoading(false);
    }
  };

  useEffect(() => {
    if (shareModalOpen) {
      loadCoupons();
    }
  }, [shareModalOpen, doctorSlug]);

  // Handle confirmation of reward usage via email link
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const status = url.searchParams.get('confirm_usage');
    if (!status) return;
    // Clear the param from URL without reloading
    url.searchParams.delete('confirm_usage');
    window.history.replaceState({}, '', url.toString());
    const msgMap: Record<string, string> = {
      ok: 'Uso confirmado. Recompensa concluída!',
      already: 'Este resgate já estava concluído.',
      expired: 'Link expirado. Solicite uma nova confirmação ao médico.',
      not_found: 'Resgate não encontrado.',
      invalid_status: 'Resgate não está em estado aprovável para uso.',
      error: 'Erro ao confirmar uso.'
    };
    const text = msgMap[status] || 'Operação concluída.';
    toast(text);
    // Optionally refresh dashboard data to reflect new status
    loadDashboard();
  }, [language]);

  // Open confirmation modal for a reward
  const openConfirmRedeem = (reward: Reward) => {
    setRewardToConfirm(reward);
    setConfirmOpen(true);
  };

  // Confirm and execute redeem
  const confirmRedeem = () => {
    if (rewardToConfirm) {
      handleRedeemReward(rewardToConfirm.id);
    }
    setConfirmOpen(false);
    setRewardToConfirm(null);
  };

  // Status configuration with translations
  const statusConfig = {
    PENDING:   { label: t.status.PENDING,   color: 'bg-amber-50 text-amber-800 border-amber-200', icon: Clock },
    CONTACTED: { label: t.status.CONTACTED, color: 'bg-amber-50 text-amber-800 border-amber-200', icon: Users },
    CONVERTED: { label: t.status.CONVERTED, color: 'bg-green-50 text-green-700 border-green-200', icon: CheckCircle },
    REJECTED:  { label: t.status.REJECTED,  color: 'bg-red-50 text-red-700 border-red-200', icon: XCircle },
    APPROVED:  { label: t.status.APPROVED,  color: 'bg-green-50 text-green-700 border-green-200', icon: CheckCircle },
    FULFILLED: { label: t.status.FULFILLED, color: 'bg-green-50 text-green-700 border-green-200', icon: CheckCircle }
  };

  // Carregar dados do dashboard quando o componente montar
  useEffect(() => {
    if (session?.user?.id) {
      console.debug('[PatientReferrals] session detected', {
        userId: session.user.id,
        userEmail: session.user.email,
      });
      loadDashboard();
    }
  }, [session]);

  // Resolve doctor and referral via dedicated web-safe endpoint
  useEffect(() => {
    if (doctorName && referralCode) return; // already resolved
    let canceled = false;
    const resolve = async () => {
      try {
        const res = await fetch('/api/v2/patients/referral');
        if (!res.ok) {
          console.warn('[PatientReferrals] /api/v2/patients/referral not ok', res.status);
          return;
        }
        const { data } = await res.json();
        if (canceled) return;
        console.debug('[PatientReferrals] /api/v2/patients/referral data', data);
        if (data?.doctorName && !doctorName) setDoctorName(data.doctorName);
        if (!doctorImage) {
          if (data?.doctorImage) setDoctorImage(data.doctorImage);
          else if (data?.doctor?.image) setDoctorImage(data.doctor.image);
        }
        if (data?.doctorId && !doctorId) {
          console.debug('[PatientReferrals] setting doctorId from /v2', data.doctorId);
          setDoctorId(data.doctorId);
        }
        if (data?.referralCode && !referralCode) {
          console.debug('[PatientReferrals] setting referralCode from /v2', data.referralCode);
          setReferralCode(data.referralCode);
        }
        if (data?.doctorSlug && !doctorSlug) {
          console.debug('[PatientReferrals] setting doctorSlug from /v2', data.doctorSlug);
          setDoctorSlug(data.doctorSlug);
        } else if (!data?.doctorSlug) {
          console.warn('[PatientReferrals] /v2 returned no doctorSlug (will try fallback from /api/referrals/patient)', data);
        }
      } catch {}

      // Final fallback: infer from referralsMade list if available
      if (!doctorName && referralsMade?.length) {
        const inferred = referralsMade[0]?.doctor?.name;
        if (inferred) setDoctorName(inferred);
      }
    };
    resolve();
    return () => { canceled = true; };
  }, [doctorName, doctorId, doctorSlug, referralCode, referralsMade]);

  // Resolve patient profile name from session (preferred) or fallback API
  useEffect(() => {
    // Seed with session value to avoid blank, but we'll still fetch profile
    if (session?.user?.name && !patientName) {
      setPatientName(session.user.name);
    }
    let canceled = false;
    const run = async () => {
      try {
        const res = await fetch('/api/v2/patients/profile');
        if (!res.ok) return;
        const payload = await res.json().catch(() => ({}));
        if (canceled) return;
        const name = payload?.profile?.name;
        // Prefer API profile name over session (covers dual-role users with doctor name in session)
        if (name && name !== patientName) setPatientName(name);
      } catch {}
    };
    run();
    return () => { canceled = true; };
  }, [session?.user?.name, patientName]);

  // Final fallback: try to infer doctor name from referrals list once loaded
  useEffect(() => {
    if (!doctorName && referralsMade && referralsMade.length > 0) {
      const n = referralsMade[0]?.doctor?.name;
      if (n) setDoctorName(n);
    }
  }, [referralsMade, doctorName]);

  // Carregar dados do dashboard
  const loadDashboard = async () => {
    try {
      const response = await fetch('/api/referrals/patient');
      const data = await response.json();

      if (response.ok) {
        console.debug('[PatientReferrals] /api/referrals/patient OK', data);
        setStats(data.stats);
        setCreditsHistory(data.creditsHistory);
        setReferralsMade(data.referralsMade);
        setAvailableRewards(data.availableRewards);
        setRedemptionsHistory(data.redemptionsHistory);
        setCreditsBalance(data.creditsBalance);
        // Do not override identifiers already resolved via /api/v2/patients/referral
        if (!referralCode && data.referralCode) {
          setReferralCode(data.referralCode);
        }
        if (!doctorId && data.doctorId) {
          setDoctorId(data.doctorId);
        }
        if (!doctorName && (data.doctorName || (data.doctor && data.doctor.name))) {
          setDoctorName(data.doctorName || data.doctor.name);
        }
        // Capture doctor image if available
        if (!doctorImage) {
          if (data.doctorImage) {
            setDoctorImage(data.doctorImage);
          } else if (data.doctor?.image) {
            setDoctorImage(data.doctor.image);
          }
        }
        // Try to capture slug from API response if available
        if (!doctorSlug) {
          if (data.doctorSlug) {
            console.debug('[PatientReferrals] setting doctorSlug from /api/referrals/patient (flat)', data.doctorSlug);
            setDoctorSlug(data.doctorSlug);
          } else if (data.doctor?.doctor_slug) {
            console.debug('[PatientReferrals] setting doctorSlug from /api/referrals/patient (nested doctor.doctor_slug)', data.doctor?.doctor_slug);
            setDoctorSlug(data.doctor.doctor_slug);
          } else {
            console.warn('[PatientReferrals] /api/referrals/patient did not provide doctorSlug');
          }
        } else {
          console.warn('[PatientReferrals] /api/referrals/patient did not provide doctorSlug');
        }
        
        // Debug logging
        console.log('Dashboard data loaded:', {
          doctorId: data.doctorId,
          doctorSlug: data.doctorSlug || data.doctor?.doctor_slug,
          referralCode: data.referralCode,
          hasReferrals: data.referralsMade?.length > 0
        });
      } else {
        if (response.status === 403) {
          console.error('Access denied to referrals');
        } else {
          console.error('Erro ao carregar dashboard:', data.error);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  // Log state changes affecting link generation
  useEffect(() => {
    console.debug('[PatientReferrals] state update', {
      doctorSlug,
      doctorId,
      referralCode,
      doctorName,
    });
    if (!doctorSlug || !referralCode) {
      const reasons: string[] = [];
      if (!doctorSlug) reasons.push('doctorSlug is missing');
      if (!referralCode) reasons.push('referralCode is missing');
      console.warn('[PatientReferrals] Slug link not ready:', reasons.join(' | '));
    } else {
      console.info('[PatientReferrals] Slug link ready');
    }
  }, [doctorSlug, doctorId, referralCode, doctorName]);

  // Validate the pair (doctorSlug, referralCode) against the resolver API when available
  useEffect(() => {
    const slug = (doctorSlug || '').trim();
    const code = (referralCode || '').trim();
    if (!slug || !code) return;

    const controller = new AbortController();
    const run = async () => {
      const url = `/api/referrals/resolve?doctor_slug=${encodeURIComponent(slug)}&code=${encodeURIComponent(code)}`;
      console.debug('[PatientReferrals] Resolving referral via API:', url);
      try {
        const res = await fetch(url, { signal: controller.signal });
        const payload = await res.json().catch(() => ({}));
        if (res.ok) {
          console.info('[PatientReferrals] Resolve OK', payload);
        } else {
          console.warn('[PatientReferrals] Resolve NOT OK', { status: res.status, payload });
        }
      } catch (e) {
        if ((e as any)?.name === 'AbortError') return;
        console.error('[PatientReferrals] Resolve error', e);
      }
    };
    run();
    return () => controller.abort();
  }, [doctorSlug, referralCode]);

  // Fetch published campaigns for the doctor's public page (patient-visible)
  useEffect(() => {
    const slug = (doctorSlug || '').trim();
    if (!slug) return;
    let aborted = false;
    const run = async () => {
      try {
        const res = await fetch(`/api/campaigns/doctor/${encodeURIComponent(slug)}`);
        const payload = await res.json().catch(() => ({ success: false }));
        if (aborted) return;
        if (res.ok && Array.isArray(payload?.data)) {
          setCampaigns(payload.data);
        } else {
          setCampaigns([]);
        }
      } catch (e) {
        console.warn('[PatientReferrals] campaigns fetch error', e);
        setCampaigns([]);
      }
    };
    run();
    return () => {
      aborted = true;
    };
  }, [doctorSlug]);

  // When user opens Products tab, fetch products from public patient-safe endpoint
  useEffect(() => {
    if (viewSection !== 'products') return;
    const did = (doctorId || '').trim();
    if (!did) return;
    let aborted = false;
    const run = async () => {
      setLoadingProducts(true);
      try {
        const res = await fetch(`/api/v2/patients/doctors/${encodeURIComponent(did)}/products`);
        const json = await res.json().catch(() => ({ success: false }));
        if (aborted) return;
        if (res.ok && json?.success && Array.isArray(json.data)) {
          const list = (json.data as any[]).map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description || '',
            category: p.category || '',
            originalPrice: p.price ?? null,
            creditsPerUnit: p.creditsPerUnit ?? 0,
          }));
          setDoctorProducts(list);
        } else {
          setDoctorProducts([]);
        }
      } catch (e) {
        console.warn('[PatientReferrals] products fetch error', e);
        setDoctorProducts([]);
      } finally {
        if (!aborted) setLoadingProducts(false);
      }
    };
    run();
    return () => { aborted = true; };
  }, [viewSection, doctorId]);

  const handleRedeemReward = async (rewardId: string) => {
    setRedeeming(rewardId);
    try {
      const response = await fetch('/api/referrals/patient', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rewardId })
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(data.message || t.toastMessages.rewardRedeemed);
        await loadDashboard(); // Recarregar dados
      } else {
        toast.error(data.error || t.toastMessages.errorRedeeming);
      }
    } catch (error) {
      console.error('Erro ao resgatar recompensa:', error);
      toast.error(t.toastMessages.connectionError);
    } finally {
      setRedeeming(null);
    }
  };

  // Cancel a PENDING redemption
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const handleCancelRedemption = async (redemptionId: string) => {
    const confirmMsg = 'Cancelar este resgate pendente e liberar seus pontos?';
    if (!window.confirm(confirmMsg)) return;
    setCancellingId(redemptionId);
    try {
      const res = await fetch('/api/referrals/redemptions/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ redemptionId })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(data.message || 'Resgate cancelado.');
        await loadDashboard();
      } else {
        toast.error(data.error || 'Não foi possível cancelar o resgate.');
      }
    } catch (e) {
      console.error('[PatientReferrals] cancel error', e);
      toast.error('Erro de conexão.');
    } finally {
      setCancellingId(null);
    }
  };

  const generateReferralLink = (style = 'default') => {
    const rawBase = window.location.origin;
    const baseUrl = (rawBase || '').replace(/\/+$/, '');
    const slug = (doctorSlug || '').trim().replace(/^\/+/, '');
    const did = doctorId || 'demo-doctor';
    const rcode = referralCode || 'DEMO123';
    // Preferred format: /[doctor_slug]?code=
    const usingSlug = Boolean(slug);
    if (!slug) {
      console.warn('[PatientReferrals] Missing doctorSlug. Cannot generate referral link without slug.');
      return '';
    }
    const link = `${baseUrl}/${slug}?code=${rcode}`;
    console.log('Generated referral link:', { link, usingSlug, slug, doctorId: did, referralCode: rcode, baseUrl });
    return link;
  };

  const copyReferralLink = async () => {
    const link = generateReferralLink('default');
    console.log('Attempting to copy link:', link);
    
    if (!link) {
      toast.error(t.toastMessages.errorGeneratingLink);
      return;
    }

    try {
      // Verificar se o navegador suporta clipboard API
      if (!navigator.clipboard) {
        console.log('Using fallback method (no clipboard API)');
        // Fallback para navegadores mais antigos
        const textArea = document.createElement('textarea');
        textArea.value = link;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
          const success = document.execCommand('copy');
          console.log('Fallback copy result:', success);
          if (success) {
            toast.success(t.toastMessages.linkCopied);
          } else {
            toast.error(t.toastMessages.errorCopyingLink);
          }
        } catch (err) {
          console.error('Fallback copy failed:', err);
          toast.error(t.toastMessages.errorCopyingLink);
        } finally {
          document.body.removeChild(textArea);
        }
        return;
      }

      // Verificar permissões do clipboard
      try {
        const permission = await navigator.permissions.query({ name: 'clipboard-write' as PermissionName });
        console.log('Clipboard permission:', permission.state);
      } catch (permError) {
        console.log('Could not check clipboard permissions:', permError);
      }

      // Usar clipboard API moderna
      console.log('Using modern clipboard API');
        await navigator.clipboard.writeText(link);
        toast.success(t.toastMessages.linkCopied);
      console.log('Link copied successfully');
      } catch (error) {
      console.error('Error copying link:', error);
      
      // Tentar fallback se clipboard API falhar
      try {
        console.log('Trying fallback after clipboard API failed');
        const textArea = document.createElement('textarea');
        textArea.value = link;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        const success = document.execCommand('copy');
        document.body.removeChild(textArea);
        
        if (success) {
          toast.success(t.toastMessages.linkCopied);
        } else {
          toast.error(t.toastMessages.copyManually + link);
        }
      } catch (fallbackError) {
        console.error('Fallback copy also failed:', fallbackError);
        toast.error(t.toastMessages.copyManually + link);
      }
    }
  };

  // Copy a campaign link and show inline copied state (no toasts)
  const copyCampaignLink = async (id: string, url: string) => {
    if (!url) return;
    try {
      if (!navigator.clipboard) {
        const textArea = document.createElement('textarea');
        textArea.value = url;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
        } finally {
          document.body.removeChild(textArea);
        }
      } else {
        await navigator.clipboard.writeText(url);
      }
      setCopiedCampaign(id);
      window.setTimeout(() => setCopiedCampaign((curr) => (curr === id ? null : curr)), 2000);
    } catch (e) {
      console.error('Copy failed', e);
    }
  };

  const copyReferralCode = async () => {
    if (!referralCode) {
      toast.error(t.toastMessages.codeNotAvailable);
      return;
    }

    try {
      // Verificar se o navegador suporta clipboard API
      if (!navigator.clipboard) {
        // Fallback para navegadores mais antigos
        const textArea = document.createElement('textarea');
        textArea.value = referralCode;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
          document.execCommand('copy');
          toast.success(t.toastMessages.codeCopied);
        } catch (err) {
          console.error('Fallback copy failed:', err);
          toast.error(t.toastMessages.errorCopyingCode);
        } finally {
          document.body.removeChild(textArea);
        }
        return;
      }

        await navigator.clipboard.writeText(referralCode);
      toast.success(t.toastMessages.codeCopied);
    } catch (error) {
      console.error('Error copying code:', error);
      
      // Tentar fallback se clipboard API falhar
      try {
        const textArea = document.createElement('textarea');
        textArea.value = referralCode;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        document.execCommand('copy');
        document.body.removeChild(textArea);
        toast.success(t.toastMessages.codeCopied);
      } catch (fallbackError) {
        console.error('Fallback copy also failed:', fallbackError);
        toast.error(t.toastMessages.errorCopyingCode + ': ' + referralCode);
      }
    }
  };

  // Copy an assigned reward code from redemption history
  const copyUniqueCode = async (code: string) => {
    if (!code) {
      toast.error(t.toastMessages.codeNotAvailable);
      return;
    }
    try {
      if (!navigator.clipboard) {
        const textArea = document.createElement('textarea');
        textArea.value = code;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
          toast.success(t.toastMessages.codeCopied);
        } catch (err) {
          console.error('Fallback copy failed:', err);
          toast.error(t.toastMessages.errorCopyingCode);
        } finally {
          document.body.removeChild(textArea);
        }
        return;
      }
      await navigator.clipboard.writeText(code);
      toast.success(t.toastMessages.codeCopied);
    } catch (error) {
      console.error('Error copying code:', error);
      toast.error(t.toastMessages.errorCopyingCode);
    }
  };

  // Funções de compartilhamento
  const shareViaWhatsApp = () => {
    const link = generateReferralLink('default');
    if (!link) {
      toast.error(t.toastMessages.errorGeneratingLink);
      return;
    }
    
    const message = `${t.shareMessage}\n\n${link}`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const shareViaSMS = () => {
    const link = generateReferralLink('default');
    if (!link) {
      toast.error(t.toastMessages.errorGeneratingLink);
      return;
    }
    
    const message = `${t.shareMessage}\n\n${link}`;
    const smsUrl = `sms:?body=${encodeURIComponent(message)}`;
    window.open(smsUrl, '_blank');
  };

  const shareViaEmail = () => {
    const link = generateReferralLink('default');
    if (!link) {
      toast.error(t.toastMessages.errorGeneratingLink);
      return;
    }
    
    const subject = t.shareSubject;
    const body = `${t.shareMessage}\n\n${link}`;
    const emailUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(emailUrl, '_blank');
  };

  // Native share (Web Share API) with clipboard fallback
  const shareViaNative = async () => {
    const link = generateReferralLink('default');
    if (!link) {
      toast.error(t.toastMessages.errorGeneratingLink);
      return;
    }

    const shareData = {
      title: 'Referral',
      text: t.shareMessage,
      url: link,
    };

    try {
      if (typeof navigator !== 'undefined' && (navigator as any).share) {
        await (navigator as any).share(shareData);
      } else {
        await navigator.clipboard.writeText(`${t.shareMessage}\n\n${link}`);
        toast.success(t.toastMessages.linkCopied);
      }
    } catch (err) {
      // If user cancels share or an error occurs, fallback to clipboard
      try {
        await navigator.clipboard.writeText(`${t.shareMessage}\n\n${link}`);
        toast.success(t.toastMessages.linkCopied);
      } catch (_) {
        toast.error(t.toastMessages.errorCopyingLink);
      }
    }
  };

 

// Format date based on language
const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('pt-BR');
};

// Label for credit type
const formatCreditType = (type?: string) => {
  const t = (type || '').toUpperCase();
  if (t.includes('PURCHASE')) return 'Compra';
  if (t.includes('REFERRAL')) return 'Indicação';
  if (t.includes('GOOGLE')) return 'Avaliação Google';
  return type || 'Outro';
};

// Icon for credit type
const creditTypeIcon = (type?: string) => {
  const t = (type || '').toUpperCase();
  if (t.includes('PURCHASE')) return ShoppingBag;
  if (t.includes('REFERRAL')) return Users;
  return Star;
};

// Helpers for extrato
const isWithinDays = (iso: string, days: number) => {
  if (days <= 0) return true;
  const d = new Date(iso).getTime();
  const now = Date.now();
  const diff = now - d;
  return diff <= days * 24 * 60 * 60 * 1000;
};


// Extract minimal text for purchase descriptions: "<qty>x <product name>"
const minimalPurchaseText = (description?: string): string | null => {
  if (!description) return null;
  // Expected: "Créditos por compra: <qty>x <name>"
  const idx = description.indexOf(':');
  const tail = idx >= 0 ? description.slice(idx + 1).trim() : description.trim();
  // Now try to match "<qty>x <rest>" and clean possible parentheses like "(qtd 1)"
  const m = tail.match(/^(\d+)x\s+(.+)$/i);
  if (m) {
    const qty = m[1];
    let name = m[2];
    // Remove common trailing decorations like "(qtd 1)"
    name = name.replace(/\(\s*qtd\s*\d+\s*\)$/i, '').trim();
    return `${qty}x ${name}`;
  }
  // Fallback: remove leading label words and parentheses if present
  return tail.replace(/^compra:?\s*/i, '').replace(/\(\s*qtd\s*\d+\s*\)$/i, '').trim() || null;
};

// Derived data for UI
const referralStatusPriority: Record<string, number> = { CONVERTED: 1, CONTACTED: 2, PENDING: 3, APPROVED: 4, FULFILLED: 5, REJECTED: 6 };

const filteredSortedReferrals = useMemo(() => {
  const list = Array.isArray(referralsMade) ? [...referralsMade] : [];
  const filtered = referralsTab === 'ALL' ? list : list.filter(r => {
    if (referralsTab === 'PENDING') return r.status === 'PENDING' || r.status === 'CONTACTED';
    return r.status === referralsTab;
  });
  return filtered.sort((a, b) => {
    const pa = referralStatusPriority[a.status] ?? 99;
    const pb = referralStatusPriority[b.status] ?? 99;
    if (pa !== pb) return pa - pb;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}, [referralsMade, referralsTab]);

type TxItem = { id: string; amount: number; description: string; date: string; kind: 'in' | 'out'; icon?: any };

const mergedExtrato = useMemo(() => {
  const gains: TxItem[] = (creditsHistory || []).map((c) => ({
    id: `in_${c.id}`,
    amount: c.amount,
    description: c.displayDescription
      ? c.displayDescription
      : c.type?.toUpperCase().includes('PURCHASE') && minimalPurchaseText(c.description)
        ? (minimalPurchaseText(c.description) as string)
        : `${formatCreditType(c.type)}${c.lead?.name ? ` • ${c.lead.name}` : ''}`,
    date: c.createdAt,
    kind: 'in',
    icon: creditTypeIcon(c.type)
  }));
  const spends: TxItem[] = (redemptionsHistory || []).map((r) => ({
    id: `out_${r.id}`,
    amount: -Math.abs(r.creditsUsed || 0),
    description: r.reward?.title ? `Resgate: ${r.reward.title}` : 'Resgate de recompensa',
    date: r.redeemedAt,
    kind: 'out',
    icon: Gift
  }));

  let all = [...gains, ...spends];

  // Period filter
  const days = periodFilter === '7d' ? 7 : periodFilter === '30d' ? 30 : 0;
  if (days > 0) all = all.filter(tx => isWithinDays(tx.date, days));

  // Type filter
  if (typeFilter !== 'all') all = all.filter(tx => tx.kind === typeFilter);

  // Sort desc by date
  all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return all;
}, [creditsHistory, redemptionsHistory, periodFilter, typeFilter]);

const extratoSummary = useMemo(() => {
  const days = periodFilter === '7d' ? 7 : periodFilter === '30d' ? 30 : 0;
  const within = (d: string) => (days > 0 ? isWithinDays(d, days) : true);
  const earned = (creditsHistory || []).filter(c => within(c.createdAt)).reduce((s, c) => s + (c.amount || 0), 0);
  const spent = (redemptionsHistory || []).filter(r => within(r.redeemedAt)).reduce((s, r) => s + (r.creditsUsed || 0), 0);
  return { earned, spent };
}, [creditsHistory, redemptionsHistory, periodFilter]);

// While loading, show a neutral skeleton without real data
if (loading) {
  return (
    <div className={`min-h-screen ${isDarkTheme ? 'text-gray-100' : 'text-gray-900'}`}>
      <div className="pt-12 pb-32 lg:pt-20 lg:pb-24">
        <div className="max-w-6xl mx-auto px-3 lg:px-6">
          <div className="flex flex-col items-center justify-center mb-6 lg:mb-8">
            <div className="w-20 h-20 lg:w-24 lg:h-24 rounded-full bg-gray-100 border-2 border-gray-200 shadow-lg mb-3 lg:mb-4 animate-pulse" />
            <div className="h-5 lg:h-6 bg-gray-100 rounded w-48 mb-2 animate-pulse" />
            <div className="h-3 lg:h-4 bg-gray-200 rounded w-64 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}

// After loading, render full content
return (
  <div className={`min-h-screen ${isDarkTheme ? 'text-gray-100' : 'text-gray-900'}`}>
      <div className="pt-12 pb-32 lg:pt-20 lg:pb-24">
        
        {/* Linktree-style Header */}
        <div className="max-w-6xl mx-auto px-3 lg:px-6 mb-5 lg:mb-6">
          <div className="flex flex-col items-center justify-center">
            {forceClinicHeader ? (
              <div className="relative w-36 h-36 lg:w-40 lg:h-40 mb-3 lg:mb-4">
                {publicClinic?.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`${publicClinic.logo}${publicClinic.logo.includes('?') ? '&' : '?'}v=${typeof window !== 'undefined' ? Date.now() : '1'}`}
                    alt={publicClinic?.name || 'Clinic'}
                    className="object-contain rounded-2xl w-full h-full"
                  />
                ) : (
                  <div className="w-full h-full rounded-2xl bg-gray-200/20 border border-gray-500/30" />
                )}
              </div>
            ) : (
              <>
                <div className="relative w-20 h-20 lg:w-24 lg:h-24 mb-3 lg:mb-4">
                  {doctorImage ? (
                    <Image
                      src={doctorImage}
                      alt={displayDoctorName}
                      className="rounded-full border-2 border-purple-300 shadow-lg object-cover"
                      fill
                    />
                  ) : session?.user?.image ? (
                    <Image
                      src={session.user.image}
                      alt={session.user.name || 'User profile'}
                      className="rounded-full border-2 border-purple-300 shadow-lg object-cover"
                      fill
                    />
                  ) : (
                    <div className="w-full h-full rounded-full bg-gray-100 border-2 border-purple-300 shadow-lg flex items-center justify-center">
                      <User className="h-10 w-10 lg:h-12 lg:w-12 text-gray-400" />
                    </div>
                  )}
                </div>
                <Badge className={`mb-2 uppercase tracking-wide text-[10px] lg:text-xs border ${isDarkTheme ? 'bg-white/10 text-gray-200 border-white/20' : 'bg-gray-100 text-gray-700 border-gray-200'}`} variant="outline">
                  Recompensas
                </Badge>
                <h2 className="text-xl lg:text-2xl font-semibold text-gray-900 text-center mb-3 lg:mb-5">
                  {displayDoctorName}
                </h2>
              </>
            )}
            {/* Membership-style Points Card with Flip to reveal Code */}
            <div className="w-full max-w-md lg:max-w-xl mx-auto mb-5 lg:mb-6" style={{ perspective: '1000px' }}>
              <div
                role="button"
                aria-label="Mostrar número de membro"
                onClick={() => setIsCardFlipped((v) => !v)}
                className="relative rounded-2xl shadow-xl overflow-hidden border border-white/10 cursor-pointer select-none h-[200px] lg:h-[300px]"
              >
                {/* 3D container */}
                <div
                  className="absolute inset-0 transition-transform duration-500 ease-out"
                  style={{ transformStyle: 'preserve-3d', transform: isCardFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
                >
                  {/* Front Face */}
                  <div
                    className="absolute inset-0"
                    style={{ backfaceVisibility: 'hidden', background: isDarkTheme ? 'linear-gradient(135deg, #3a3a3a 0%, #a1a1a1 100%)' : 'linear-gradient(135deg, #180e33 0%, #4f3aa9 100%)' }}
                  >
                    {/* Decorative background */}
                    <div className="absolute inset-0 opacity-10">
                      <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
                      <div className="absolute -bottom-12 -left-8 w-48 h-48 rounded-full bg-white/5 blur-2xl" />
                    </div>

                    <div className="relative h-full p-6 lg:p-8 flex flex-col">
                      <div className="flex items-center justify-between">
                        <div className="text-[10px] lg:text-sm uppercase tracking-[0.2em] text-white/80">Membership</div>
                        <div className="flex items-center gap-2 text-white/80">
                          <div className="h-6 w-9 rounded bg-white/20 backdrop-blur-sm" />
                          <div className="h-6 w-6 rounded-full bg-white/20 backdrop-blur-sm" />
                        </div>
                      </div>

                      <div className="mt-3 lg:mt-4">
                        <div className="text-white/80 text-[12px] lg:text-base">Your Balance</div>
                        <div className="mt-1 text-4xl lg:text-6xl font-light text-white">
                          {displayPoints}
                          <span className="ml-2 text-lg lg:text-2xl text-white/85 align-[10%]">points</span>
                        </div>
                      </div>

                      <div className="mt-auto flex items-center justify-between text-white">
                        <div className="min-w-0">
                          <div className="text-[12px] lg:text-base text-white/70">Member</div>
                          <div className="text-base lg:text-xl font-medium truncate max-w-[320px]">
                            {session?.user?.name || 'Paciente'}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[12px] lg:text-base text-white/70">Membership Number</div>
                          {/* Hidden on front: masked */}
                          <div className="text-base lg:text-xl tracking-widest">
                            • • • •
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Back Face */}
                  <div
                    className="absolute inset-0"
                    style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', background: isDarkTheme ? 'linear-gradient(135deg, #3a3a3a 0%, #a1a1a1 100%)' : 'linear-gradient(135deg, #180e33 0%, #4f3aa9 100%)' }}
                  >
                    <div className="absolute inset-0 opacity-5">
                      <div className="absolute -top-8 -right-6 w-36 h-36 rounded-full bg-white/10 blur-2xl" />
                    </div>
                    <div className="relative h-full p-6 lg:p-8 flex flex-col text-white">
                      <div className="flex items-center justify-end">
                        <div className="text-[11px] lg:text-xs text-white/70">Tap to hide</div>
                      </div>

                      <div className="mt-4 lg:mt-8 text-center">
                        <div className="text-xs lg:text-base text-white/70">Membership Number</div>
                        <div className="mt-2 text-3xl lg:text-4xl font-mono tracking-[0.35em]">
                          {referralCode || '— — — —'}
                        </div>
                      </div>

                      <div className="mt-auto flex items-center justify-center">
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-white/15 hover:bg-white/25 transition-colors text-white"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard?.writeText(referralCode || '');
                          }}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                            <path d="M16 1H4c-1.1 0-2 .9-2 2v12h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
                          </svg>
                          Copy number
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Hero Section Compacto */}
        <div className="relative overflow-hidden">
          <div className="relative py-4 lg:py-6">
            <div className="max-w-6xl mx-auto px-3 lg:px-6">
              <div className="text-center max-w-3xl mx-auto">
                {/* Title/Description removed per request to avoid duplication */}
                
                {/* Tabs Switcher */}
                <div className="max-w-3xl mx-auto">
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => setActiveTab('earn')}
                      className={`px-4 py-2 text-sm rounded-full border shadow-sm transition ${activeTab==='earn'
                        ? 'border-transparent'
                        : (isDarkTheme ? 'text-gray-200 border-white/15 bg-white/5 hover:bg-white/10' : 'text-gray-700 border-gray-200 hover:bg-gray-50 bg-white')}`}
                      style={activeTab==='earn' ? ({ background: 'var(--btn-bg)', color: 'var(--btn-fg)' } as React.CSSProperties) : undefined}
                    >
                      Ganhar pontos
                    </button>
                    <button
                      onClick={() => setActiveTab('use')}
                      className={`px-4 py-2 text-sm rounded-full border shadow-sm transition ${activeTab==='use'
                        ? 'border-transparent'
                        : (isDarkTheme ? 'text-gray-200 border-white/15 bg-white/5 hover:bg-white/10' : 'text-gray-700 border-gray-200 hover:bg-gray-50 bg-white')}`}
                      style={activeTab==='use' ? ({ background: 'var(--btn-bg)', color: 'var(--btn-fg)' } as React.CSSProperties) : undefined}
                    >
                      Usar pontos
                    </button>
                    <button
                      onClick={() => setActiveTab('history')}
                      className={`px-4 py-2 text-sm rounded-full border shadow-sm transition ${activeTab==='history'
                        ? 'border-transparent'
                        : (isDarkTheme ? 'text-gray-200 border-white/15 bg-white/5 hover:bg-white/10' : 'text-gray-700 border-gray-200 hover:bg-gray-50 bg-white')}`}
                      style={activeTab==='history' ? ({ background: 'var(--btn-bg)', color: 'var(--btn-fg)' } as React.CSSProperties) : undefined}
                    >
                      Histórico
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabbed Content */}
        <div className="max-w-6xl mx-auto px-3 lg:px-6 space-y-6 lg:space-y-8">
          {activeTab === 'earn' && (
            <>
              {/* Need more points? quick actions */}
              <div className={`max-w-3xl mx-auto rounded-2xl border shadow-sm ${isDarkTheme ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'}`}>
                <div className="p-4 lg:p-6">
                  <h3 className={`text-base lg:text-lg font-semibold mb-3 lg:mb-4 ${isDarkTheme ? 'text-gray-100' : 'text-gray-900'}`}>Precisa de mais pontos?</h3>
                  <div className="space-y-2">
                    {/* Agendar serviço (navegação direta) */}
                    <Link
                      href={doctorSlug ? `/${doctorSlug}/products` : '#'}
                      className={`w-full flex items-center justify-between rounded-xl px-4 py-3 shadow-sm transition ${isDarkTheme ? 'border border-white/15 bg-white/10 hover:bg-white/15 text-gray-100' : 'bg-[var(--btn-bg)] text-[var(--btn-fg)]'} ${doctorSlug ? '' : 'pointer-events-none opacity-60'}`}
                      style={!isDarkTheme ? ({ background: 'var(--btn-bg)', color: 'var(--btn-fg)' } as React.CSSProperties) : undefined}
                    >
                      <span className="flex items-center gap-3">
                        <CalendarDays className="h-5 w-5" />
                        <span className="text-sm lg:text-base font-medium">Agendar serviço</span>
                      </span>
                      <span className={`inline-flex items-center rounded-full text-xs font-semibold px-3 py-1 border ${isDarkTheme ? 'bg-white text-gray-900 border-white/90' : 'bg-white/95 text-gray-800 border-white/60'}`}>
                        +100 pontos
                      </span>
                    </Link>
                    {/* Refer a friend */}
                    <button
                      type="button"
                      onClick={() => setShareModalOpen(true)}
                      className={`w-full flex items-center justify-between rounded-xl px-4 py-3 shadow-sm transition ${isDarkTheme ? 'bg-gray-800 text-gray-200 hover:bg-gray-700' : 'bg-[var(--btn-bg)] text-[var(--btn-fg)]'}`}
                      style={!isDarkTheme ? ({ background: 'var(--btn-bg)', color: 'var(--btn-fg)' } as React.CSSProperties) : undefined}
                    >
                      <span className="flex items-center gap-3">
                        <Users className="h-5 w-5" />
                        <span className="text-sm lg:text-base font-medium">Indicar um amigo</span>
                      </span>
                      <span className="inline-flex items-center rounded-full text-xs font-semibold px-3 py-1 bg-white/95 text-gray-800 border border-white/60">
                        +100 pontos
                      </span>
                    </button>

                    {/* Review on Google */}
                    <button
                      type="button"
                      onClick={() => setReviewModalOpen(true)}
                      className={`w-full flex items-center justify-between rounded-xl px-4 py-3 shadow-sm transition ${isDarkTheme ? 'border border-white/15 bg-white/10 hover:bg-white/15 text-gray-100' : 'bg-[var(--btn-bg)] text-[var(--btn-fg)]'}`}
                      style={!isDarkTheme ? ({ background: 'var(--btn-bg)', color: 'var(--btn-fg)' } as React.CSSProperties) : undefined}
                    >
                      <span className="flex items-center gap-3">
                        <Image src="/google.png" alt="Google" width={20} height={20} />
                        <span className="text-sm lg:text-base font-medium">Avaliar no Google</span>
                      </span>
                      <span className={`inline-flex items-center rounded-full text-xs font-semibold px-3 py-1 border ${hasGoogleReview
                        ? (isDarkTheme ? 'bg-green-500 text-white border-green-400' : 'bg-green-100 text-green-800 border-green-200')
                        : (isDarkTheme ? 'bg-white text-gray-900 border-white/90' : 'bg-white/95 text-gray-800 border-white/60')}`}
                      >
                        {hasGoogleReview ? 'Concluído ✓' : 'Como fazer'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Your Referrals list (ways to earn feedback) */}
              <div className={`group rounded-xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden ${isDarkTheme ? 'bg-white/5' : ''}`}
                   style={isDarkTheme ? undefined : ({ background: 'linear-gradient(180deg, #e5eaf5 0%, #f7f7fc 100%)' } as React.CSSProperties)}>
                <div className={`p-4 lg:p-6 ${isDarkTheme ? 'border-b border-white/10' : 'border-b border-gray-200'}`}>
                  <div className="flex items-center">
                    <div>
                      <h2 className={`${isDarkTheme ? 'text-gray-100' : 'text-gray-900'} text-base lg:text-lg font-semibold`}>Suas indicações</h2>
                      <p className={`${isDarkTheme ? 'text-gray-400' : 'text-gray-600'} text-xs lg:text-sm`}>Acompanhe quem você indicou e créditos ganhos</p>
                    </div>
                  </div>
                </div>
                <div className="px-4 pt-3 lg:px-6 lg:pt-4">
                  <div className="flex flex-wrap gap-2 mb-3">
                    {[
                      {k:'CONVERTED', label:'Convertidas'},
                      {k:'PENDING', label:'Pendentes'},
                      {k:'REJECTED', label:'Recusadas'},
                      {k:'ALL', label:'Todas'},
                    ].map(tab => (
                      <button
                        key={tab.k}
                        onClick={() => setReferralsTab(tab.k as any)}
                        className={`px-3 py-1.5 rounded-full text-xs border shadow-sm ${referralsTab===tab.k ? 'border-transparent' : (isDarkTheme ? 'text-gray-200 border-white/15 bg-white/5 hover:bg-white/10' : 'text-gray-700 border-gray-200 bg-white hover:bg-gray-50')}`}
                        style={referralsTab===tab.k ? ({ background: 'var(--btn-bg)', color: 'var(--btn-fg)' } as React.CSSProperties) : undefined}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="p-4 lg:p-6 space-y-3 lg:space-y-4">
                  {filteredSortedReferrals.map((referral) => {
                    const StatusIcon = statusConfig[referral.status as keyof typeof statusConfig]?.icon || Clock;
                    return (
                      <div key={referral.id} className={`${isDarkTheme ? 'bg-white/5 border-white/10 hover:border-white/20' : 'bg-white border-gray-200 hover:border-gray-300'} rounded-lg p-3.5 lg:p-4 border transition-colors`}>
                        <div className="grid grid-cols-12 gap-3 items-center">
                          <div className="col-span-7 min-w-0">
                            <div className={`font-medium ${isDarkTheme ? 'text-gray-100' : 'text-gray-900'} text-sm lg:text-base truncate`}>{referral.name}</div>
                            <div className={`mt-0.5 flex items-center gap-2 text-[11px] lg:text-xs ${isDarkTheme ? 'text-gray-400' : 'text-gray-500'} truncate`}>
                              <span className="truncate">{referral.doctor.name}</span>
                              <span className="text-gray-400">•</span>
                              <span>{formatDate(referral.createdAt)}</span>
                            </div>
                          </div>
                          <div className="col-span-3 flex justify-start lg:justify-center">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] lg:text-xs font-medium border ${statusConfig[referral.status as keyof typeof statusConfig]?.color}`}>
                              <StatusIcon className="h-3 w-3" />
                              {statusConfig[referral.status as keyof typeof statusConfig]?.label || referral.status}
                            </span>
                          </div>
                          <div className="col-span-2 text-right">
                            {referral.credits.length > 0 ? (
                              <div className={`inline-flex items-center gap-1 text-xs lg:text-sm font-semibold ${isDarkTheme ? 'text-green-400' : 'text-green-700'}`}>
                                +{referral.credits.reduce((sum, credit) => sum + credit.amount, 0)}
                              </div>
                            ) : (
                              <div className={`text-[11px] lg:text-xs ${isDarkTheme ? 'text-gray-500' : 'text-gray-400'}`}>—</div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {filteredSortedReferrals.length === 0 && (
                    <div className="text-center py-8 lg:py-12">
                      <div className={`w-12 h-12 lg:w-16 lg:h-16 rounded-full flex items-center justify-center mx-auto mb-3 lg:mb-4 ${isDarkTheme ? 'bg-white/10' : 'bg-gray-100'}`}>
                        <UserPlus className={`h-5 w-5 lg:h-6 lg:w-6 ${isDarkTheme ? 'text-gray-300' : 'text-gray-500'}`} />
                      </div>
                      <div className={`${isDarkTheme ? 'text-gray-400' : 'text-gray-500'} text-sm lg:text-base mb-1 lg:mb-2`}>Nenhuma indicação ainda</div>
                      <div className={`${isDarkTheme ? 'text-gray-400' : 'text-gray-600'} text-xs lg:text-sm`}>Comece a indicar pessoas para ganhar créditos</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Credits Earned History (all sources) */}
              <div
                className={`group rounded-xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden ${isDarkTheme ? 'bg-[#111111] border border-white/10' : ''}`}
                style={isDarkTheme ? undefined : ({ background: 'linear-gradient(180deg, #e5eaf5 0%, #f7f7fc 100%)' } as React.CSSProperties)}
              >
                <div className={`p-4 lg:p-6 ${isDarkTheme ? 'border-b border-white/10' : 'border-b border-gray-200'}`}>
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <h2 className={`${isDarkTheme ? 'text-gray-100' : 'text-gray-900'} text-base lg:text-lg font-semibold`}>Histórico de Créditos</h2>
                      <p className={`${isDarkTheme ? 'text-gray-400' : 'text-gray-600'} text-xs lg:text-sm`}>Extrato com ganhos e resgates</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`flex items-center gap-1 rounded-full p-1 ${isDarkTheme ? 'bg-white/5 border border-white/10' : 'bg-white border border-gray-200'}`}>
                        {['7d','30d','all'].map((p) => (
                          <button
                            key={p}
                            onClick={() => { setVisibleTxCount(10); setPeriodFilter(p as any); }}
                            className={`px-3 py-1.5 text-xs rounded-full ${periodFilter===p ? '' : (isDarkTheme ? 'text-gray-200' : 'text-gray-700')} `}
                            style={periodFilter===p ? ({ background: 'var(--btn-bg)', color: 'var(--btn-fg)' } as React.CSSProperties) : {}}
                          >
                            {p === '7d' ? '7d' : p === '30d' ? '30d' : 'Tudo'}
                          </button>
                        ))}
                      </div>
                      <div className={`flex items-center gap-1 rounded-full p-1 ${isDarkTheme ? 'bg-white/5 border border-white/10' : 'bg-white border border-gray-200'}`}>
                        {[
                          {k:'all', label:'Todos'},
                          {k:'in', label:'Ganhos'},
                          {k:'out', label:'Resgates'}
                        ].map((t) => (
                          <button
                            key={t.k}
                            onClick={() => { setVisibleTxCount(10); setTypeFilter(t.k as any); }}
                            className={`px-3 py-1.5 text-xs rounded-full ${typeFilter===t.k ? '' : (isDarkTheme ? 'text-gray-200' : 'text-gray-700')}`}
                            style={typeFilter===t.k ? ({ background: 'var(--btn-bg)', color: 'var(--btn-fg)' } as React.CSSProperties) : {}}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className={`mt-3 rounded-xl p-3 flex items-center justify-between ${isDarkTheme ? 'bg-white/5 border border-white/10' : 'bg-white border border-gray-200'}`}>
                    <div className={`text-xs lg:text-sm ${isDarkTheme ? 'text-gray-300' : 'text-gray-700'}`}>
                      Você ganhou <span className={`font-semibold ${isDarkTheme ? 'text-green-400' : 'text-green-700'}`}>{extratoSummary.earned}</span> e resgatou <span className={`font-semibold ${isDarkTheme ? 'text-red-400' : 'text-red-700'}`}>{extratoSummary.spent}</span> {periodFilter==='all' ? 'no período selecionado' : 'no período'}
                    </div>
                    <div className={`text-xs ${isDarkTheme ? 'text-gray-400' : 'text-gray-500'}`}>Saldo atual: <span className={`font-medium ${isDarkTheme ? 'text-gray-200' : 'text-gray-700'}`}>{creditsBalance}</span></div>
                  </div>
                </div>
                <div className="p-4 lg:p-6 space-y-2 lg:space-y-3">
                  {mergedExtrato.length > 0 ? (
                    mergedExtrato.slice(0, visibleTxCount).map((tx) => {
                      const Icon = tx.icon || Star;
                      const isOut = tx.amount < 0;
                      return (
                        <div key={tx.id} className={`${isDarkTheme ? 'bg-white/5 border-white/10 hover:border-white/20' : 'bg-white border-gray-200 hover:border-gray-300'} rounded-lg p-3.5 border transition-colors`}>
                          <div className="grid grid-cols-12 gap-3 items-start">
                            <div className="col-span-1 flex justify-center pt-0.5">
                              <span className={`inline-flex items-center justify-center h-7 w-7 rounded-full ${isDarkTheme ? 'bg-white/10 border border-white/15 text-gray-200' : 'bg-gray-50 border border-gray-200 text-gray-700'}`}>
                                <Icon className="h-4 w-4" />
                              </span>
                            </div>
                            <div className="col-span-7 min-w-0">
                              <div className={`text-xs lg:text-sm ${isDarkTheme ? 'text-gray-400' : 'text-gray-500'}`}>{formatDate(tx.date)}</div>
                              <div className={`text-sm lg:text-base ${isDarkTheme ? 'text-gray-100' : 'text-gray-900'} truncate`}>{tx.description}</div>
                            </div>
                            <div className="col-span-4 text-right">
                              <div className={`text-sm lg:text-base font-semibold ${isOut ? (isDarkTheme ? 'text-red-400' : 'text-red-700') : (isDarkTheme ? 'text-green-400' : 'text-green-700')}`}>{isOut ? '-' : '+'}{Math.abs(tx.amount)}</div>
                              <div className={`text-[11px] lg:text-xs ${isDarkTheme ? 'text-gray-400' : 'text-gray-500'}`}>Crédito</div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-8 lg:py-12">
                      <div className="w-12 h-12 lg:w-16 lg:h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3 lg:mb-4">
                        <Star className="h-5 w-5 lg:h-6 lg:w-6 text-gray-500" />
                      </div>
                      <div className="text-gray-500 text-sm lg:text-base mb-1 lg:mb-2">Sem movimentações</div>
                      <div className="text-gray-600 text-xs lg:text-sm">Ganhe pontos indicando amigos ou realizando compras</div>
                    </div>
                  )}
                  {mergedExtrato.length > visibleTxCount && (
                    <div className="pt-1">
                      <button
                        onClick={() => setVisibleTxCount(c => c + 10)}
                        className="w-full text-sm py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
                      >
                        Carregar mais
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {activeTab === 'use' && (
            <>
            {/* Rewards */}
            <div
              className={`group rounded-xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden ${isDarkTheme ? 'bg-[#111111] border border-white/10' : ''}`}
              style={isDarkTheme ? undefined : ({ background: 'linear-gradient(180deg, #e5eaf5 0%, #f7f7fc 100%)' } as React.CSSProperties)}
            >
              <div className={`p-4 lg:p-6 ${isDarkTheme ? 'border-b border-white/10' : 'border-b border-gray-200'}`}>
                <div className="flex items-center">
                  <div>
                    <h2 className={`${isDarkTheme ? 'text-gray-100' : 'text-gray-900'} text-base lg:text-lg font-semibold`}>Recompensas</h2>
                    <p className={`${isDarkTheme ? 'text-gray-400' : 'text-gray-600'} text-xs lg:text-sm`}>Use seus créditos para resgatar recompensas</p>
                  </div>
                </div>
              </div>
              <div className="p-4 lg:p-6 grid grid-cols-2 gap-3 lg:gap-4">
                {availableRewards.map((reward) => {
                  const soldOut = reward.maxRedemptions ? reward.currentRedemptions >= reward.maxRedemptions : false;
                  const locked = creditsBalance < reward.creditsRequired || soldOut;
                  return (
                    <div
                      key={reward.id}
                      className={
                        `relative rounded-xl overflow-hidden border transition-all ` +
                        (isDarkTheme
                          ? `${locked ? 'border-white/15' : 'border-white/10 hover:border-white/20'} bg-[#171717] text-gray-100`
                          : `${locked ? 'border-gray-200' : 'border-gray-200 hover:border-gray-300'} bg-white shadow-sm`) + ' ' +
                        (locked ? ' opacity-80 cursor-not-allowed' : ' cursor-pointer')
                      }
                      onClick={() => {
                        if (!locked) openConfirmRedeem(reward);
                      }}
                    >
                      {/* Image */}
                      <div className={`relative w-full h-28 lg:h-28 ${isDarkTheme ? 'bg-white/10' : 'bg-gray-100'}`}>
                        {reward.imageUrl ? (
                          <img
                            src={reward.imageUrl}
                            alt={reward.title}
                            className="w-full h-full object-cover lg:object-contain lg:p-1"
                          />
                        ) : (
                          <div className={`w-full h-full flex items-center justify-center text-xs ${isDarkTheme ? 'text-gray-400' : 'text-gray-400'}`}>Sem imagem</div>
                        )}
                        {/* Points chip */}
                        <div className="absolute top-2 left-2">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] lg:text-xs font-medium shadow border ${isDarkTheme ? 'bg-white text-gray-900 border-white/90' : 'bg-white/90 backdrop-blur text-gray-800 border-white/60'}`}>
                            {locked ? <Lock className="h-3.5 w-3.5" /> : <Star className={`h-3.5 w-3.5 ${isDarkTheme ? 'text-yellow-400' : 'text-yellow-500'}`} />}
                            {reward.creditsRequired} {reward.creditsRequired === 1 ? 'crédito' : 'créditos'}
                          </span>
                        </div>
                      </div>

                      {/* Body */}
                      <div className="px-3 pt-2 pb-3">
                        <h3 className={`${isDarkTheme ? 'text-gray-100' : 'text-gray-900'} text-sm font-medium leading-5 line-clamp-2 min-h-[2.5rem]`}>{reward.title}</h3>
                        {/* Status */}
                        <div className={`mt-2 text-[11px] ${isDarkTheme ? (locked ? 'text-gray-500' : 'text-gray-300') : 'text-gray-500'}`}>
                          {locked ? 'Bloqueado' : 'Disponível'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            </>
          )}

          {activeTab === 'history' && (
            <>
              {/* Redemption History */}
              <div
                className={`group rounded-xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden ${isDarkTheme ? 'bg-[#111111] border border-white/10' : ''}`}
                style={isDarkTheme ? undefined : ({ background: 'linear-gradient(180deg, #e5eaf5 0%, #f7f7fc 100%)' } as React.CSSProperties)}
              >
                <div className={`p-4 lg:p-6 ${isDarkTheme ? 'border-b border-white/10' : 'border-b border-gray-200'}`}>
                  <div className="flex items-center">
                    <div>
                      <h2 className={`${isDarkTheme ? 'text-gray-100' : 'text-gray-900'} text-base lg:text-lg font-semibold`}>{t.redemptionHistory}</h2>
                      <p className={`${isDarkTheme ? 'text-gray-400' : 'text-gray-600'} text-xs lg:text-sm`}>{t.redemptionDescription}</p>
                    </div>
                  </div>
                </div>
                <div className="p-4 lg:p-6 space-y-3 lg:space-y-4">
                  {redemptionsHistory.map((redemption) => {
                    const StatusIcon = statusConfig[redemption.status as keyof typeof statusConfig]?.icon || Clock;
                    return (
                      <div key={redemption.id} className={`${isDarkTheme ? 'bg-[#171717] text-gray-100 border-white/10 hover:border-white/20' : 'bg-white border-gray-200 hover:border-gray-300'} rounded-lg p-4 lg:p-5 border transition-colors`}>
                        <div className="flex justify-between items-start">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            {redemption.reward.imageUrl ? (
                              <img
                                src={redemption.reward.imageUrl}
                                alt={redemption.reward.title}
                                className={`w-12 h-12 lg:w-14 lg:h-14 rounded-md object-cover border ${isDarkTheme ? 'border-white/15' : 'border-gray-200'}`}
                              />
                            ) : null}
                            <div className="min-w-0">
                              <h3 className={`font-medium text-sm lg:text-base truncate ${isDarkTheme ? 'text-gray-100' : 'text-gray-900'}`}>{redemption.reward.title}</h3>
                              {redemption.reward.description && (
                                <p className={`${isDarkTheme ? 'text-gray-400' : 'text-gray-600'} text-xs lg:text-sm mt-1 line-clamp-2`}>{redemption.reward.description}</p>
                              )}
                            </div>
                          </div>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] lg:text-xs font-medium border ${isDarkTheme ? 'bg-white/10 text-gray-200 border-white/15' : 'bg-gray-50 text-gray-700 border-gray-200'}`}>
                            <StatusIcon className="h-3 w-3" />
                            {statusConfig[redemption.status as keyof typeof statusConfig]?.label || redemption.status}
                          </span>
                        </div>
                        <div className={`mt-1.5 flex items-center justify-between text-[11px] lg:text-xs ${isDarkTheme ? 'text-gray-400' : 'text-gray-500'}`}>
                          <span>
                            {redemption.creditsUsed} {redemption.creditsUsed === 1 ? 'crédito usado' : 'créditos usados'}
                          </span>
                          <span className="text-gray-400">•</span>
                          <span>{formatDate(redemption.redeemedAt)}</span>
                        </div>
                        {redemption.status === 'APPROVED' && redemption.uniqueCode && (
                          <div className="mt-2 flex items-center gap-2">
                            <span className={`text-[11px] lg:text-xs ${isDarkTheme ? 'text-gray-300' : 'text-gray-600'}`}>Código:</span>
                            <code className={`px-2 py-1 rounded text-[11px] lg:text-xs font-mono break-all ${isDarkTheme ? 'bg-white/10 border border-white/15 text-gray-100' : 'bg-gray-50 border border-gray-200 text-gray-700'}`}>
                              {redemption.uniqueCode}
                            </code>
                            <Button
                              size="sm"
                              variant="outline"
                              className={`h-7 px-2 text-xs ${isDarkTheme ? 'bg-transparent border-white/20 text-gray-200 hover:bg-white/10' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                              onClick={() => copyUniqueCode(redemption.uniqueCode || '')}
                            >
                              <Copy className="h-3 w-3 mr-1" /> Copiar
                            </Button>
                          </div>
                        )}
                        {redemption.status === 'PENDING' && (
                          <div className="mt-3 flex justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              className={`h-7 px-3 text-xs ${isDarkTheme ? 'border-white/20 text-red-400 hover:bg-red-900/20' : 'border-gray-300 text-red-600 hover:bg-red-50'}`}
                              disabled={cancellingId === redemption.id}
                              onClick={() => handleCancelRedemption(redemption.id)}
                            >
                              {cancellingId === redemption.id ? 'Cancelando…' : 'Cancelar'}
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {redemptionsHistory.length === 0 && (
                    <div className="text-center py-8 lg:py-12">
                      <div className={`w-12 h-12 lg:w-16 lg:h-16 rounded-full flex items-center justify-center mx-auto mb-3 lg:mb-4 ${isDarkTheme ? 'bg-white/10' : 'bg-gray-100'}`}>
                        <Gift className={`h-5 w-5 lg:h-6 lg:w-6 ${isDarkTheme ? 'text-gray-300' : 'text-gray-500'}`} />
                      </div>
                      <div className={`${isDarkTheme ? 'text-gray-400' : 'text-gray-500'} text-sm lg:text-base mb-1 lg:mb-2`}>Nenhum resgate ainda</div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        

        {/* Confirm Redeem Modal */}
        <Dialog
          open={confirmOpen}
          onOpenChange={(open) => {
            setConfirmOpen(open);
            if (!open) setRewardToConfirm(null);
          }}
        >
          <DialogContent className="bg-white border border-gray-200 text-gray-900">
            <DialogHeader>
              <DialogTitle className="text-gray-900">Confirmar resgate?</DialogTitle>
              <DialogDescription className="text-gray-600">
                {`Você está prestes a usar ${rewardToConfirm?.creditsRequired ?? ''} créditos para resgatar ${rewardToConfirm?.title ?? ''}.`}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setConfirmOpen(false)}
                className="border-gray-300"
              >
                Cancelar
              </Button>
              <Button
                onClick={confirmRedeem}
                disabled={!rewardToConfirm || (redeeming !== null && rewardToConfirm?.id === redeeming)}
                className="text-white font-semibold bg-purple-600 hover:bg-purple-700 ring-1 ring-purple-700/40"
              >
                {rewardToConfirm && redeeming === rewardToConfirm.id ? 'Resgatando...' : 'Confirmar e Resgatar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        

        {/* Share Referral Modal */}
        <Dialog open={shareModalOpen} onOpenChange={setShareModalOpen}>
          <DialogContent className="bg-white border border-gray-200 text-gray-900">
            <DialogHeader>
              <DialogTitle className="text-gray-900">Compartilhe sua indicação</DialogTitle>
              <DialogDescription className="text-gray-600">
                Envie seu link via WhatsApp, SMS ou Email, ou copie-o.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" className="h-10" onClick={shareViaWhatsApp}>
                  <MessageCircle className="h-4 w-4 mr-1" /> WhatsApp
                </Button>
                <Button variant="outline" className="h-10" onClick={shareViaSMS}>
                  <Phone className="h-4 w-4 mr-1" /> SMS
                </Button>
                <Button variant="outline" className="h-10" onClick={shareViaEmail}>
                  <Mail className="h-4 w-4 mr-1" /> Email
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs lg:text-sm font-mono bg-gray-50 border border-gray-200 rounded px-2 py-2 overflow-x-auto">
                  {generateReferralLink('default') || 'Link não pronto'}
                </code>
                <Button variant="secondary" className="h-10" onClick={copyReferralLink}>
                  <Copy className="h-4 w-4 mr-1" /> Copiar
                </Button>
              </div>

              {/* Condições especiais (Coupons) */}
              <div className="mt-2 border-t pt-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">Condições especiais</span>
                    <Badge variant="secondary" className="text-[10px]">{coupons?.length || 0} encontradas</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={loadCoupons} disabled={couponsLoading || !doctorSlug}>
                      {couponsLoading ? (<><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Recarregando…</>) : 'Recarregar'}
                    </Button>
                  </div>
                </div>

                {couponsLoading && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando cupons…
                  </div>
                )}

                {!couponsLoading && couponsError && (
                  <div className="text-sm text-red-600">{couponsError}</div>
                )}

                {!couponsLoading && !couponsError && (coupons?.length ?? 0) === 0 && (
                  <div className="text-sm text-gray-600">Nenhum cupom ativo encontrado.</div>
                )}

                {!couponsLoading && !couponsError && (coupons?.length ?? 0) > 0 && (
                  <div className="space-y-2 max-h-48 overflow-auto pr-1">
                    {coupons.map((c) => {
                      const origin = typeof window !== 'undefined' ? window.location.origin : '';
                      const slug = (doctorSlug || '').trim();
                      const url = slug ? `${origin}/${slug}?cupom=${encodeURIComponent(c.slug)}` : '';
                      return (
                        <div key={c.id} className="flex items-start gap-2 p-2 rounded border border-gray-200 bg-gray-50">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">{c.display_title || c.name}</div>
                            {c.display_message && (
                              <div className="text-xs text-gray-600 line-clamp-2">{c.display_message}</div>
                            )}
                            <div className="mt-1">
                              <code className="text-[11px] font-mono bg-white border border-gray-200 rounded px-1.5 py-1 break-all inline-block max-w-full">
                                {url}
                              </code>
                            </div>
                          </div>
                          <div className="shrink-0">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2 text-xs border-gray-300"
                              onClick={() => navigator.clipboard?.writeText(url).then(() => toast.success('Link copiado!')).catch(() => toast.error('Erro ao copiar'))}
                            >
                              <Copy className="h-3.5 w-3.5 mr-1" /> Copiar
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" className="border-gray-300" onClick={() => setShareModalOpen(false)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Google Review Tutorial Modal */}
        <Dialog open={reviewModalOpen} onOpenChange={setReviewModalOpen}>
          <DialogContent className="bg-white border border-gray-200 text-gray-900 max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Image src="/google.png" alt="Google" width={20} height={20} />
                Como deixar uma avaliação no Google
              </DialogTitle>
              <DialogDescription className="text-gray-600">
                Siga os passos para deixar sua avaliação e ganhar pontos.
              </DialogDescription>
            </DialogHeader>
            <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-800">
              <li>Abra o Google Maps e pesquise pela clínica do seu médico.</li>
              <li>Toque na clínica, role até Avaliações e toque em “Escrever uma avaliação”.</li>
              <li>Avalie, escreva seu feedback e envie.</li>
              <li>Envie um print para a clínica, se solicitado.</li>
            </ol>
            <div className="mt-3 text-xs text-gray-500">
              Dica: se você tiver o link direto de avaliação da clínica, use-o para acesso mais rápido.
            </div>
            <DialogFooter>
              <Button variant="outline" className="border-gray-300" onClick={() => setReviewModalOpen(false)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Floating Action Menu */}
        <div className="fixed bottom-6 right-6 z-50">
          <div className="relative">
            <button
              onClick={toggleMenu}
              className="h-12 w-12 rounded-full bg-white text-gray-700 shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-purple-200 border border-gray-200 flex items-center justify-center transition-shadow"
              aria-label="Toggle menu"
            >
              <div className="relative h-10 w-10">
                {session?.user?.image ? (
                  <Image
                    src={session.user.image}
                    alt={session.user.name || 'User profile'}
                    className="rounded-full object-cover border-2 border-gray-200"
                    fill
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full flex items-center justify-center">
                    <MoreVertical className="h-5 w-5 text-gray-600" />
                  </div>
                )}
              </div>
            </button>
            {menuOpen && (
              <div className="absolute bottom-14 right-0 bg-white border border-gray-200 rounded-xl shadow-xl w-56 p-2">
                <Link href={doctorSlug ? `/${doctorSlug}/profile` : '/patient/profile'} className="flex items-center px-3 py-2 text-sm text-gray-700 rounded-lg hover:bg-gray-50">
                  <User className="mr-2 h-4 w-4 text-gray-600" />
                  Profile
                </Link>
                <button
                  onClick={() => signOut({ callbackUrl: doctorSlug ? `/${doctorSlug}/login` : '/login' })}
                  className="w-full flex items-center px-3 py-2 text-sm text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  <LogOut className="mr-2 h-4 w-4 text-gray-600" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
    </div>
  </div>
);
}