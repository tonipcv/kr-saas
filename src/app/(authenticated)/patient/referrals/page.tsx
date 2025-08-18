'use client';

import React, { useState, useEffect } from 'react';
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
  Gift,
  Users,
  CheckCircle,
  Clock,
  Star,
  UserPlus,
  MessageCircle,
  Mail,
  Phone,
  User,
  Menu,
  Home,
  Settings,
  LogOut
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
    shareMessage: 'Hello! I\'m using this amazing medical system and wanted to refer you. Use my referral code to sign up:',
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
  };
}

export default function PatientReferralsPage() {
  const { data: session } = useSession();
  const language = useLanguage();
  const t = translations[language];
  
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
  const [referralCode, setReferralCode] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [doctorSlug, setDoctorSlug] = useState<string>('');
  const [doctorName, setDoctorName] = useState<string>('');
  const [doctorImage, setDoctorImage] = useState<string>('');
  // State for hamburger menu (must be before any early returns)
  const [menuOpen, setMenuOpen] = useState(false);
  // Friendly fallback name for design preview and empty states
  const displayDoctorName = doctorName || 'Dr. Especialista';
  // Points card display: use real balance if available, otherwise a pleasant placeholder
  const displayPoints = creditsBalance;

  // Toggle menu function
  const toggleMenu = () => {
    setMenuOpen(!menuOpen);
  };

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
      ok: language === 'pt' ? 'Uso confirmado. Recompensa concluída!' : 'Usage confirmed. Reward fulfilled!',
      already: language === 'pt' ? 'Este resgate já estava concluído.' : 'This redemption was already fulfilled.',
      expired: language === 'pt' ? 'Link expirado. Solicite uma nova confirmação ao médico.' : 'Link expired. Please request a new confirmation from your doctor.',
      not_found: language === 'pt' ? 'Resgate não encontrado.' : 'Redemption not found.',
      invalid_status: language === 'pt' ? 'Resgate não está em estado aprovável para uso.' : 'Redemption status is not valid for usage confirmation.',
      error: language === 'pt' ? 'Erro ao confirmar uso.' : 'Error confirming usage.'
    };
    const text = msgMap[status] || (language === 'pt' ? 'Operação concluída.' : 'Operation completed.');
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
    PENDING:   { label: t.status.PENDING,   color: 'bg-gray-100 text-gray-700 border-gray-300', icon: Clock },
    CONTACTED: { label: t.status.CONTACTED, color: 'bg-gray-100 text-gray-700 border-gray-300', icon: Users },
    CONVERTED: { label: t.status.CONVERTED, color: 'bg-gray-100 text-gray-700 border-gray-300', icon: CheckCircle },
    REJECTED:  { label: t.status.REJECTED,  color: 'bg-gray-100 text-gray-700 border-gray-300', icon: Clock },
    APPROVED:  { label: t.status.APPROVED,  color: 'bg-gray-100 text-gray-700 border-gray-300', icon: CheckCircle },
    FULFILLED: { label: t.status.FULFILLED, color: 'bg-gray-100 text-gray-700 border-gray-300', icon: CheckCircle }
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
        setReferralCode(data.referralCode || '');
        setDoctorId(data.doctorId || '');
        if (data.doctorName || (data.doctor && data.doctor.name)) {
          setDoctorName(data.doctorName || data.doctor.name);
        }
        // Capture doctor image if available
        if (data.doctorImage) {
          setDoctorImage(data.doctorImage);
        } else if (data.doctor?.image) {
          setDoctorImage(data.doctor.image);
        }
        // Try to capture slug from API response if available
        if (data.doctorSlug) {
          console.debug('[PatientReferrals] setting doctorSlug from /api/referrals/patient (flat)', data.doctorSlug);
          setDoctorSlug(data.doctorSlug);
        } else if (data.doctor?.doctor_slug) {
          console.debug('[PatientReferrals] setting doctorSlug from /api/referrals/patient (nested doctor.doctor_slug)', data.doctor?.doctor_slug);
          setDoctorSlug(data.doctor.doctor_slug);
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
    const confirmMsg = language === 'en' ? 'Cancel this pending redemption and release your points?' : 'Cancelar este resgate pendente e liberar seus pontos?';
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
        toast.success(data.message || (language === 'en' ? 'Redemption cancelled.' : 'Resgate cancelado.'));
        await loadDashboard();
      } else {
        toast.error(data.error || (language === 'en' ? 'Unable to cancel redemption.' : 'Não foi possível cancelar o resgate.'));
      }
    } catch (e) {
      console.error('[PatientReferrals] cancel error', e);
      toast.error(language === 'en' ? 'Connection error.' : 'Erro de conexão.');
    } finally {
      setCancellingId(null);
    }
  };

  const generateReferralLink = (style = 'default') => {
    const rawBase = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
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
  return language === 'en' 
    ? date.toLocaleDateString('en-US')
    : date.toLocaleDateString('pt-BR');
};

// While loading, show a neutral skeleton without real data
if (loading) {
  return (
    <div className="min-h-screen text-gray-900" style={{ backgroundColor: '#f7f8ff' }}>
      <div className="pt-12 pb-32 lg:pt-20 lg:pb-24">
        <div className="max-w-6xl mx-auto px-3 lg:px-6">
          <div className="flex flex-col items-center justify-center mb-6 lg:mb-8">
            <div className="w-20 h-20 lg:w-24 lg:h-24 rounded-full bg-gray-100 border-2 border-gray-200 shadow-lg mb-3 lg:mb-4 animate-pulse" />
            <div className="h-5 lg:h-6 bg-gray-100 rounded w-48 mb-2 animate-pulse" />
            <div className="h-3 lg:h-4 bg-gray-200 rounded w-64 animate-pulse" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
            <div className="rounded-xl border border-gray-200 bg-white p-4 lg:p-6">
              <div className="h-5 bg-gray-100 rounded w-40 mb-3 animate-pulse" />
              <div className="space-y-3">
                <div className="h-16 bg-gray-50 rounded border border-gray-200 animate-pulse" />
                <div className="h-16 bg-gray-50 rounded border border-gray-200 animate-pulse" />
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 lg:p-6">
              <div className="h-5 bg-gray-100 rounded w-40 mb-3 animate-pulse" />
              <div className="space-y-3">
                <div className="h-14 bg-gray-50 rounded border border-gray-200 animate-pulse" />
                <div className="h-14 bg-gray-50 rounded border border-gray-200 animate-pulse" />
                <div className="h-14 bg-gray-50 rounded border border-gray-200 animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// After loading, render full content
return (
  <div className="min-h-screen text-gray-900" style={{ backgroundColor: '#f7f8ff' }}>
      <div className="pt-12 pb-32 lg:pt-20 lg:pb-24">
        
        {/* Linktree-style User Profile Header */}
        <div className="max-w-6xl mx-auto px-3 lg:px-6 mb-5 lg:mb-6">
          <div className="flex flex-col items-center justify-center">
            <div className="relative w-20 h-20 lg:w-24 lg:h-24 mb-3 lg:mb-4">
              {doctorImage ? (
                <Image
                  src={doctorImage}
                  alt={displayDoctorName}
                  className="rounded-full border-2 border-turquoise shadow-lg object-cover"
                  fill
                />
              ) : session?.user?.image ? (
                <Image
                  src={session.user.image}
                  alt={session.user.name || 'User profile'}
                  className="rounded-full border-2 border-turquoise shadow-lg object-cover"
                  fill
                />
              ) : (
                <div className="w-full h-full rounded-full bg-gray-100 border-2 border-turquoise shadow-lg flex items-center justify-center">
                  <User className="h-10 w-10 lg:h-12 lg:w-12 text-gray-400" />
                </div>
              )}
            </div>
            <Badge className="mb-2 uppercase tracking-wide text-[10px] lg:text-xs bg-gray-100 text-gray-700 border border-gray-200" variant="outline">
              Rewards
            </Badge>
            <h2 className="text-xl lg:text-2xl font-medium text-gray-900 mb-3 lg:mb-4 text-center">
              {displayDoctorName}
            </h2>
            {/* Points Card */}
            <div
              className="w-full max-w-sm mx-auto rounded-2xl shadow-md p-4 lg:p-5 mb-4 lg:mb-5"
              style={{ background: 'linear-gradient(135deg, #5998ed 0%, #9bcaf7 100%)' }}
            >
              <div className="text-[11px] lg:text-xs text-white/80 tracking-widest font-medium">YOUR BALANCE</div>
              <div className="mt-1 text-3xl lg:text-5xl font-light text-white">
                {displayPoints}
                <span className="ml-2 text-base lg:text-xl text-white/85 align-[10%]">Points</span>
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
                
                {/* Section 1: Your Primary Tool (Magic Link) */}
                  <div className="mb-8 lg:mb-10">
                    <div
                      className="max-w-2xl mx-auto rounded-xl shadow-sm"
                      style={{ background: 'linear-gradient(180deg, #e5eaf5 0%, #f7f7fc 100%)' }}
                    >
                      <div className="p-4 lg:p-5 space-y-3 lg:space-y-4">
                        {/* Magic Link visible */}
                        <div className="text-left">
                          <p className="text-xs lg:text-sm text-gray-600 mb-2">Your personal referral link</p>
                          <div className="flex items-center gap-2 p-3 lg:p-3.5 bg-gray-50 rounded-lg border border-gray-200">
                            <code className="flex-1 text-[11px] lg:text-xs text-gray-800 font-mono break-all">
                              {generateReferralLink('default')}
                            </code>
                            <Button
                              onClick={copyReferralLink}
                              className="text-white font-medium h-8 lg:h-9 px-3 lg:px-4 hover:opacity-90"
                              style={{ background: 'linear-gradient(135deg, #5998ed 0%, #9bcaf7 100%)' }}
                            >
                              <Copy className="h-3.5 w-3.5 lg:h-4 lg:w-4 mr-1.5" />
                              Copy
                            </Button>
                          </div>
                        </div>
                        {/* Quick Share Buttons */}
                        <div className="flex items-center justify-center gap-2 lg:gap-3">
                          <Button onClick={shareViaWhatsApp} variant="outline" className="h-8 lg:h-9 px-3 border-gray-300 text-black hover:bg-gray-50">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" className="h-4 w-4 mr-1.5" aria-hidden>
                              <path fill="currentColor" d="M19.11 17.13c-.29-.14-1.68-.83-1.94-.92-.26-.1-.45-.14-.64.14-.19.29-.73.92-.9 1.11-.17.19-.33.22-.62.07-.29-.14-1.23-.45-2.34-1.44-.86-.77-1.44-1.72-1.61-2-.17-.29-.02-.45.12-.6.12-.12.29-.33.43-.5.14-.17.19-.29.29-.48.1-.19.05-.36-.02-.5-.07-.14-.64-1.55-.88-2.12-.23-.56-.47-.48-.64-.48h-.55c-.19 0-.5.07-.76.36-.26.29-1 1-.99 2.45.01 1.45 1.03 2.84 1.18 3.03.14.19 2.03 3.1 4.93 4.35.69.3 1.22.48 1.64.62.69.22 1.31.19 1.81.12.55-.08 1.68-.69 1.92-1.36.24-.67.24-1.24.17-1.36-.07-.12-.26-.19-.55-.33z"/>
                            </svg>
                            WhatsApp
                          </Button>
                          <Button onClick={shareViaEmail} variant="outline" className="h-8 lg:h-9 px-3 border-gray-300 text-gray-700 hover:bg-gray-50">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4 mr-1.5" aria-hidden>
                              <path fill="currentColor" d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 2v.01L12 13l8-6.99V6H4zm16 12V8l-8 7L4 8v10h16z"/>
                            </svg>
                            Email
                          </Button>
                          <Button onClick={shareViaNative} variant="outline" className="h-8 lg:h-9 px-3 border-gray-300 text-gray-700 hover:bg-gray-50">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4 mr-1.5" aria-hidden>
                              <path fill="currentColor" d="M12 3l4 4h-3v5h-2V7H8l4-4zm-6 8h2v7h8v-7h2v7a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-7z"/>
                            </svg>
                            Share
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>

                {/* Stats Cards removed per request */}
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-6xl mx-auto px-3 lg:px-6 space-y-6 lg:space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
            {/* Recompensas Disponíveis */}
            <div
              className="group rounded-xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden"
              style={{ background: 'linear-gradient(180deg, #e5eaf5 0%, #f7f7fc 100%)' }}
            >
              <div className="p-4 lg:p-6 border-b border-gray-200">
                <div className="flex items-center gap-2 lg:gap-3">
                  <div className="p-1.5 lg:p-2 bg-turquoise/20 rounded-lg">
                    <Gift className="h-4 w-4 lg:h-5 lg:w-5 text-turquoise" />
                  </div>
                  <div>
                    <h2 className="text-gray-900 text-base lg:text-xl font-light">{t.rewards}</h2>
                    <p className="text-gray-600 text-xs lg:text-sm">
                      {t.rewardsDescription}
                    </p>
                  </div>
                </div>
              </div>
              <div className="p-4 lg:p-6 space-y-3 lg:space-y-4">
                {availableRewards.map((reward) => (
                  <div key={reward.id} className="bg-white rounded-lg p-4 lg:p-5 border border-gray-200 hover:border-turquoise/30 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-gray-900 text-sm lg:text-base font-medium leading-6">{reward.title}</h3>
                        <p className="text-gray-600 text-xs lg:text-sm mt-1 line-clamp-2">{reward.description}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="inline-flex items-center gap-1.5 rounded-full border border-turquoise/30 bg-turquoise/10 px-2.5 py-1">
                          <Star className="h-3.5 w-3.5 text-turquoise" />
                          <span className="text-turquoise text-xs lg:text-sm font-semibold">{reward.creditsRequired}</span>
                          <span className="text-gray-600 text-[10px] lg:text-xs">{t.credits}</span>
                        </div>
                      </div>
                    </div>

                    {(typeof reward.maxRedemptions === 'number') && (
                      <div className="mt-3 lg:mt-4">
                        <div className="flex items-center justify-between text-[11px] lg:text-xs text-gray-500 mb-1">
                          <span>{t.remaining}</span>
                          <span>{Math.max(0, reward.maxRedemptions - reward.currentRedemptions)} {t.redemptions}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          {(() => {
                            const total = Math.max(1, reward.maxRedemptions);
                            const used = Math.min(reward.currentRedemptions, total);
                            const pct = Math.round((used / total) * 100);
                            return <div className="h-full bg-turquoise/50" style={{ width: `${pct}%` }} />;
                          })()}
                        </div>
                      </div>
                    )}

                    <div className="mt-4 pt-3 lg:pt-4 border-t border-gray-100">
                      <Button
                        onClick={() => openConfirmRedeem(reward)}
                        disabled={
                          creditsBalance < reward.creditsRequired ||
                          redeeming === reward.id ||
                          (reward.maxRedemptions ? reward.currentRedemptions >= reward.maxRedemptions : false)
                        }
                        className="w-full text-black font-semibold disabled:bg-gray-200 disabled:text-gray-500 text-xs lg:text-sm h-8 lg:h-9 shadow-sm
                                   bg-[#91f2ce] hover:bg-[#7eeec0] ring-1 ring-[#7eeec0]/70 transition transform hover:scale-[1.01] rounded-full"
                      >
                        {redeeming === reward.id ? (
                          <>
                            <Loader2 className="mr-1.5 lg:mr-2 h-3 w-3 lg:h-4 lg:w-4 animate-spin" />
                            {t.redeeming}
                          </>
                        ) : creditsBalance < reward.creditsRequired ? (
                          <span className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5" />
                            {t.insufficientCredits}
                          </span>
                        ) : (reward.maxRedemptions && reward.currentRedemptions >= reward.maxRedemptions) ? (
                          <span className="flex items-center gap-1.5">
                            <Gift className="h-3.5 w-3.5" />
                            {t.soldOut}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5">
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M12 2l1.9 4.1L18 8l-4.1 1.9L12 14l-1.9-4.1L6 8l4.1-1.9L12 2z" fill="#0f5132" fillOpacity="0.6"/>
                            </svg>
                            {t.redeem}
                          </span>
                        )}
                      </Button>
                    </div>
                  </div>
                ))}

                {availableRewards.length === 0 && (
                  <div className="text-center py-8 lg:py-12">
                    <div className="w-12 h-12 lg:w-16 lg:h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3 lg:mb-4">
                      <Gift className="h-5 w-5 lg:h-6 lg:w-6 text-gray-500" />
                    </div>
                    <div className="text-gray-500 text-sm lg:text-base mb-1 lg:mb-2">{t.noRewardsAvailable}</div>
                    <div className="text-gray-600 text-xs lg:text-sm">{t.waitForRewards}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Histórico de Indicações */}
            <div
              className="group rounded-xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden"
              style={{ background: 'linear-gradient(180deg, #e5eaf5 0%, #f7f7fc 100%)' }}
            >
              <div className="p-4 lg:p-6 border-b border-gray-200">
                <div className="flex items-center gap-2 lg:gap-3">
                  <div className="p-1.5 lg:p-2 bg-turquoise/20 rounded-lg">
                    <UserPlus className="h-4 w-4 lg:h-5 lg:w-5 text-turquoise" />
                  </div>
                  <div>
                    <h2 className="text-gray-900 text-base lg:text-xl font-light">{t.yourReferrals}</h2>
                    <p className="text-gray-600 text-xs lg:text-sm">
                      {t.referralsDescription}
                    </p>
                  </div>
                </div>
              </div>
              <div className="p-4 lg:p-6 space-y-3 lg:space-y-4">
                {referralsMade.map((referral) => {
                  const StatusIcon = statusConfig[referral.status as keyof typeof statusConfig]?.icon || Clock;
                  return (
                    <div key={referral.id} className="bg-white rounded-lg p-3 lg:p-4 border border-gray-200 hover:border-turquoise/30 transition-colors">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-900 text-sm lg:text-base">{referral.name}</h3>
                        </div>
                        {referral.status === 'CONVERTED' ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-black text-[11px] lg:text-xs font-semibold bg-[#91f2ce] border border-[#7eeec0]">
                            <Star className="h-3 w-3 lg:h-3.5 lg:w-3.5 text-black" />
                            +{referral.credits.reduce((sum, credit) => sum + credit.amount, 0)} {t.creditsEarned}
                          </div>
                        ) : (
                          <Badge className={`${statusConfig[referral.status as keyof typeof statusConfig]?.color || 'bg-gray-700 text-gray-300'} border text-xs flex items-center gap-1`}>
                            <StatusIcon className="h-3 w-3" />
                            {statusConfig[referral.status as keyof typeof statusConfig]?.label || referral.status}
                          </Badge>
                        )}
                      </div>
                       
                      <div className="flex justify-between items-center text-xs lg:text-sm text-gray-500 mb-2">
                        <span>
                          {referral.doctor.name.toLowerCase().startsWith('dr') 
                            ? referral.doctor.name 
                            : `Dr(a). ${referral.doctor.name}`
                          }
                        </span>
                        <span>{formatDate(referral.createdAt)}</span>
                      </div>

                      {referral.credits.length > 0 && referral.status !== 'CONVERTED' && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-white text-[11px] lg:text-xs font-semibold bg-[#91f2ce] shadow-sm">
                          <Star className="h-3 w-3 lg:h-3.5 lg:w-3.5 text-white" />
                          +{referral.credits.reduce((sum, credit) => sum + credit.amount, 0)} {t.creditsEarned}
                        </div>
                      )}
                    </div>
                  );
                })}

                {referralsMade.length === 0 && (
                  <div className="text-center py-8 lg:py-12">
                    <div className="w-12 h-12 lg:w-16 lg:h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3 lg:mb-4">
                      <UserPlus className="h-5 w-5 lg:h-6 lg:w-6 text-gray-500" />
                    </div>
                    <div className="text-gray-500 text-sm lg:text-base mb-1 lg:mb-2">No referrals yet</div>
                    <div className="text-gray-600 text-xs lg:text-sm mb-3 lg:mb-4">Start referring people to earn points</div>
                    {doctorId && (
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button className="bg-turquoise hover:bg-turquoise/90 text-black font-medium text-xs lg:text-sm h-7 lg:h-8 px-3 lg:px-4 shadow-md shadow-turquoise/25">
                            <Copy className="h-3 w-3 lg:h-4 lg:w-4 mr-1.5 lg:mr-2" />
                            Copy Referral Link
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-white border border-gray-200 text-gray-900">
                          <DialogHeader>
                            <DialogTitle className="text-gray-900">Copy Your Referral Link</DialogTitle>
                            <DialogDescription className="text-gray-600">
                              Share this link with friends to earn rewards when they sign up
                            </DialogDescription>
                          </DialogHeader>
                          <div className="py-4 space-y-4">
                            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                              <p className="text-sm text-gray-700 mb-3">
                                Your unique referral link:
                              </p>
                              <div className="flex items-center gap-2 p-3 bg-white rounded-lg border border-gray-200">
                                <code className="flex-1 text-xs text-turquoise font-mono break-all">
                                  {generateReferralLink('default')}
                                </code>
                              </div>
                            </div>
                            <Button
                              onClick={copyReferralLink}
                              className="w-full text-white font-medium flex items-center justify-center gap-2 h-10 hover:opacity-90"
                              style={{ background: 'linear-gradient(135deg, #5998ed 0%, #9bcaf7 100%)' }}
                            >
                              <Copy className="h-4 w-4" />
                              Copy Link to Clipboard
                            </Button>
                            <div className="text-center">
                              <p className="text-xs text-gray-600">
                                Share this link with friends and family to start earning referral points!
                              </p>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Histórico de Resgates */}
          {redemptionsHistory.length > 0 && (
            <div
              className="group rounded-xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden bg-white"
            >
              <div className="p-4 lg:p-6 border-b border-gray-200">
                <div className="flex items-center gap-2 lg:gap-3">
                  <div className="p-1.5 lg:p-2 bg-gray-100 rounded-lg">
                    <CheckCircle className="h-4 w-4 lg:h-5 lg:w-5 text-gray-500" />
                  </div>
                  <div>
                    <h2 className="text-gray-900 text-base lg:text-xl font-light">{t.redemptionHistory}</h2>
                    <p className="text-gray-600 text-xs lg:text-sm">
                      {t.redemptionDescription}
                    </p>
                  </div>
                </div>
              </div>
              <div className="p-4 lg:p-6 space-y-3 lg:space-y-4">
                {redemptionsHistory
                  .filter((r) => r.status !== 'CANCELLED')
                  .map((redemption) => {
                  const StatusIcon = statusConfig[redemption.status as keyof typeof statusConfig]?.icon || Clock;
                  return (
                    <div
                      key={redemption.id}
                      className={`bg-white rounded-lg p-3 lg:p-4 border border-gray-200 hover:border-gray-300 transition-colors ${redemption.status === 'FULFILLED' ? 'opacity-60 pointer-events-none' : ''}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-900 text-sm lg:text-base">{redemption.reward.title}</h3>
                          <p className="text-gray-600 text-xs lg:text-sm">{redemption.reward.description}</p>
                        </div>
                        <Badge className={`${statusConfig[redemption.status as keyof typeof statusConfig]?.color || 'bg-gray-700 text-gray-300'} border text-xs flex items-center gap-1`}>
                          <StatusIcon className="h-3 w-3" />
                          {statusConfig[redemption.status as keyof typeof statusConfig]?.label || redemption.status}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center text-xs lg:text-sm text-gray-500 mb-2">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-gray-700 text-[11px] lg:text-xs font-semibold bg-gray-100 border border-gray-300">
                          <Star className="h-3 w-3 lg:h-3.5 lg:w-3.5 text-gray-500" />
                          {redemption.creditsUsed} {t.creditsUsed}
                        </span>
                        <span>{formatDate(redemption.redeemedAt)}</span>
                      </div>
                      {redemption.status === 'APPROVED' && redemption.uniqueCode && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-[11px] lg:text-xs text-gray-600">{language === 'en' ? 'Code' : 'Código'}:</span>
                          <code className="px-2 py-1 rounded bg-gray-50 border border-gray-200 text-gray-700 text-[11px] lg:text-xs font-mono break-all">
                            {redemption.uniqueCode}
                          </code>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs border-gray-300 text-gray-700 hover:bg-gray-50"
                            onClick={() => copyUniqueCode(redemption.uniqueCode || '')}
                          >
                            <Copy className="h-3 w-3 mr-1" /> {language === 'en' ? 'Copy' : 'Copiar'}
                          </Button>
                        </div>
                      )}
                      {redemption.status === 'PENDING' && (
                        <div className="mt-3 flex justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-3 text-xs border-gray-300 text-red-600 hover:bg-red-50"
                            disabled={cancellingId === redemption.id}
                            onClick={() => handleCancelRedemption(redemption.id)}
                          >
                            {cancellingId === redemption.id ? (language === 'en' ? 'Cancelling…' : 'Cancelando…') : (language === 'en' ? 'Cancel' : 'Cancelar')}
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Minimal Footer */}
        <div className="mt-8 lg:mt-10">
          <div className="max-w-6xl mx-auto px-3 lg:px-6">
            <div className="flex items-center justify-center gap-2 text-gray-400 text-xs">
              <span>Powered by</span>
              <Image src="/logo.png" alt="Logo" width={40} height={10} className="opacity-70" />
            </div>
          </div>
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
              <DialogTitle className="text-gray-900">Confirm Redemption?</DialogTitle>
              <DialogDescription className="text-gray-600">
                {`You are about to use ${rewardToConfirm?.creditsRequired ?? ''} points to redeem ${rewardToConfirm?.title ?? ''}.`}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setConfirmOpen(false)}
                className="border-gray-300"
              >
                Cancel
              </Button>
              <Button
                onClick={confirmRedeem}
                disabled={!rewardToConfirm || (redeeming !== null && rewardToConfirm?.id === redeeming)}
                className="text-black font-semibold bg-[#91f2ce] hover:bg-[#7eeec0] ring-1 ring-[#7eeec0]/70"
              >
                {rewardToConfirm && redeeming === rewardToConfirm.id ? 'Redeeming...' : 'Confirm and Redeem'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Floating Action Menu */}
        <div className="fixed bottom-6 right-6 z-50">
          <div className="relative">
            <button
              onClick={toggleMenu}
              className="h-12 w-12 rounded-full bg-turquoise text-white shadow-lg hover:bg-turquoise/90 focus:outline-none focus:ring-2 focus:ring-turquoise/40 flex items-center justify-center"
              aria-label="Toggle menu"
            >
              <Menu className="h-6 w-6" />
            </button>
            {menuOpen && (
              <div className="absolute bottom-14 right-0 bg-white border border-gray-200 rounded-xl shadow-xl w-56 p-2">
                <Link href="/patient/profile" className="flex items-center px-3 py-2 text-sm text-gray-700 rounded-lg hover:bg-gray-50">
                  <User className="mr-2 h-4 w-4 text-gray-600" />
                  Profile
                </Link>
                <Link href="/patient" className="flex items-center px-3 py-2 text-sm text-gray-700 rounded-lg hover:bg-gray-50">
                  <Home className="mr-2 h-4 w-4 text-gray-600" />
                  Dashboard
                </Link>
                <Link href="/patient/settings" className="flex items-center px-3 py-2 text-sm text-gray-700 rounded-lg hover:bg-gray-50">
                  <Settings className="mr-2 h-4 w-4 text-gray-600" />
                  Settings
                </Link>
                <button
                  onClick={() => signOut({ callbackUrl: '/' })}
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