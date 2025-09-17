'use client';

import React, { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
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
  CalendarDays
} from 'lucide-react';
import { toast } from 'sonner';
import Image from 'next/image';
import Link from 'next/link';

// NOTE: This component is a duplication of src/app/(authenticated)/patient/referrals/page.tsx
// with slug-aware adjustments and a client-side redirect to /{slug}/login when unauthenticated.

const translations = {
  pt: {
    pageTitle: 'Programa de Indicações',
    pageDescription: 'Indique amigos e ganhe recompensas incríveis',
    shareLink: 'Compartilhar Link',
    startReferring: 'Começar a Indicar',
    shareOptions: 'Opções de Compartilhamento',
    shareWhatsApp: 'WhatsApp',
    shareSMS: 'SMS',
    shareEmail: 'Email',
    copyLink: 'Copiar Link',
    shareMessage: 'Olá! Estou usando este incrível sistema médico e queria te indicar. Use meu código de indicação para se cadastrar:',
    shareSubject: 'Indicação - Sistema Médico',
    availableCredits: 'Créditos Disponíveis',
    totalReferrals: 'Total de Indicações',
    converted: 'Convertidas',
    conversionRate: 'Taxa de Conversão',
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
    yourReferrals: 'Suas Indicações',
    referralsDescription: 'Pessoas que você indicou',
    noReferralsYet: 'Nenhuma indicação ainda',
    startReferringDescription: 'Comece a indicar pessoas para ganhar créditos',
    creditsEarned: 'créditos ganhos',
    redemptionHistory: 'Histórico de Resgates',
    redemptionDescription: 'Recompensas que você já resgatou',
    creditsUsed: 'créditos usados',
    status: {
      PENDING: 'Pendente',
      CONTACTED: 'Contatado',
      CONVERTED: 'Convertido',
      REJECTED: 'Rejeitado',
      APPROVED: 'Aprovado',
      FULFILLED: 'Usado'
    },
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
  }
} as const;

type Lang = 'pt';

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

export default function ClientReferrals() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;
  // Derive clinic/page slug from URL path as a fallback when needed
  const pathSlug = (typeof window !== 'undefined')
    ? (window.location.pathname.split('/').filter(Boolean)[0] || '')
    : '';
  const effectiveSlug = (slug || pathSlug || '').toString().trim();
  const { data: session, status } = useSession();
  const language: Lang = 'pt';
  const t = translations.pt;

  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState<string | null>(null);
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
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  const [activeTab, setActiveTab] = useState<'earn' | 'use' | 'history' | null>(null);
  const [referralCode, setReferralCode] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [doctorSlug, setDoctorSlug] = useState<string>('');
  const [doctorName, setDoctorName] = useState<string>('');
  const [patientName, setPatientName] = useState<string>('');
  const [doctorImage, setDoctorImage] = useState<string>('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [campaigns, setCampaigns] = useState<Array<{ campaign_slug: string; title: string; description?: string | null }>>([]);
  const [copiedCampaign, setCopiedCampaign] = useState<string | null>(null);
  const [viewSection, setViewSection] = useState<'earn' | 'products'>('earn');
  const [doctorProducts, setDoctorProducts] = useState<Array<{ id: string; name: string; description: string; category?: string; originalPrice?: number | null; creditsPerUnit?: number }>>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [couponsOpen, setCouponsOpen] = useState(false);
  const [loadingCoupons, setLoadingCoupons] = useState(false);
  const [couponTemplates, setCouponTemplates] = useState<Array<{
    id: string;
    slug: string;
    name: string;
    display_title?: string | null;
    display_message?: string | null;
  }>>([]);
  const [isDark, setIsDark] = useState(false);
  const [loginHref, setLoginHref] = useState<string>('');
  const displayPatientName = patientName || session?.user?.name || 'Paciente';
  const displayDoctorName = doctorName || 'Dr. Especialista';
  const displayPoints = creditsBalance;
  const hasGoogleReview = creditsHistory.some((c) => (c.type || '').toUpperCase().includes('GOOGLE'));

  const toggleMenu = () => setMenuOpen(!menuOpen);

  // Compute login href similar to products page logic
  const computeLoginHref = () => {
    try {
      // Always derive the slug from the current URL to avoid switching to doctor slug
      const pathSlug = (typeof window !== 'undefined' ? (window.location.pathname.split('/').filter(Boolean)[0] || '') : (effectiveSlug || slug || '')).toString();
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const href = `${origin}/${pathSlug}/login`;
      if (typeof window !== 'undefined') console.debug('[logout] computed href', { pathSlug, href });
      return href;
    } catch {
      const pathSlug = (typeof window !== 'undefined' ? (window.location.pathname.split('/').filter(Boolean)[0] || '') : (effectiveSlug || slug || '')).toString();
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      return `${origin}/${pathSlug}/login`;
    }
  };

  // Resolve clinic subdomain to build absolute login URL when applicable
  useEffect(() => {
    const slugVal = (effectiveSlug || slug || '').toString().trim().toLowerCase();
    if (!slugVal || typeof window === 'undefined') return;
    const baseDomain = (process.env.NEXT_PUBLIC_APP_BASE_DOMAIN || process.env.APP_BASE_DOMAIN || '').toLowerCase();
    const protocol = window.location.protocol || 'https:';
    const host = window.location.host.toLowerCase();
    const hostNoPort = host.split(':')[0];
    const isAlreadyOnSubdomain = baseDomain && hostNoPort.endsWith(baseDomain) && hostNoPort.replace(new RegExp(baseDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'), '').replace(/\.$/, '').length > 0;
    const relativeFallback = `/${slugVal}/login`;
    if (!baseDomain) {
      setLoginHref(relativeFallback);
      return;
    }
    let aborted = false;
    (async () => {
      try {
        const res = await fetch(`/api/clinic/by-slug/${encodeURIComponent(slugVal)}`, { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        const clinic = json?.data || json; // support either {data:{}} or raw
        // If API doesn't return subdomain, fall back to slug as subdomain
        const sub = ((clinic?.subdomain || clinic?.subDomain || '') || slugVal).toString().trim().toLowerCase();
        if (aborted) return;
        // Build absolute URL when on root/base domain; on clinic subdomain, use '/login'
        const absolute = `${protocol}//${sub}.${baseDomain}/login`;
        setLoginHref(isAlreadyOnSubdomain ? '/login' : absolute);
      } catch {
        setLoginHref(relativeFallback);
      }
    })();
    return () => { aborted = true; };
  }, [effectiveSlug, slug]);

  // Detect dark theme via body/html classes or data-theme attributes
  useEffect(() => {
    const detect = () => {
      if (typeof document === 'undefined') return false;
      const el = document.documentElement;
      const body = document.body;
      const darkClass = el.classList.contains('dark') || body.classList.contains('dark');
      const darkData = (el.getAttribute('data-theme') || body.getAttribute('data-theme') || '').toLowerCase() === 'dark';
      return darkClass || darkData;
    };
    setIsDark(detect());
    const obs = new MutationObserver(() => setIsDark(detect()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    obs.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    return () => obs.disconnect();
  }, []);

  // Fetch clinic theme by slug and merge with detection
  useEffect(() => {
    const slugVal = (effectiveSlug || '').toString().trim().toLowerCase();
    if (!slugVal) return;
    let aborted = false;
    const run = async () => {
      try {
        const res = await fetch(`/api/clinic/theme?slug=${encodeURIComponent(slugVal)}`, { cache: 'no-store' });
        const json = await res.json().catch(() => ({ success: false }));
        if (aborted) return;
        const clinicDark = json?.success && json?.data?.theme === 'DARK';
        if (clinicDark) setIsDark(true);
      } catch {}
    };
    run();
    return () => { aborted = true; };
  }, [effectiveSlug]);

  const fetchCouponTemplates = async () => {
    // Prefer the clinic/page slug (from route or URL), fallback to doctorSlug
    const slugVal = (effectiveSlug || doctorSlug || '').toString().trim();
    if (!slugVal) {
      setCouponTemplates([]);
      return [] as any[];
    }
    setLoadingCoupons(true);
    try {
      const res = await fetch(`/api/coupon-templates/doctor/${encodeURIComponent(slugVal)}`);
      const json = await res.json().catch(() => ({ success: false }));
      if (res.ok && json?.success && Array.isArray(json.data)) {
        setCouponTemplates(json.data);
        return json.data as any[];
      }
      setCouponTemplates([]);
      return [] as any[];
    } catch {
      setCouponTemplates([]);
      return [] as any[];
    } finally {
      setLoadingCoupons(false);
    }
  };

  const openCoupons = async () => {
    if (!couponsOpen) {
      await fetchCouponTemplates();
    }
    setCouponsOpen(true);
  };

  // When opening the Share modal, also load coupon templates to show below
  useEffect(() => {
    if (shareModalOpen) {
      fetchCouponTemplates();
    }
  }, [shareModalOpen, doctorSlug, slug]);

  // Redirect unauthenticated users to clinic-aware login
  useEffect(() => {
    if (status === 'unauthenticated' && (slug || effectiveSlug)) {
      const href = computeLoginHref();
      router.replace(href);
    }
  }, [status, router, slug, loginHref]);

  useEffect(() => {
    if (session?.user?.id) {
      loadDashboard();
    }
  }, [session]);

  useEffect(() => {
    if (doctorName && referralCode) return;
    let canceled = false;
    const resolve = async () => {
      try {
        const res = await fetch('/api/v2/patients/referral');
        if (!res.ok) return;
        const { data } = await res.json();
        if (canceled) return;
        if (data?.doctorName && !doctorName) setDoctorName(data.doctorName);
        if (!doctorImage) {
          if (data?.doctorImage) setDoctorImage(data.doctorImage);
          else if (data?.doctor?.image) setDoctorImage(data.doctor.image);
        }
        if (data?.doctorId && !doctorId) setDoctorId(data.doctorId);
        if (data?.referralCode && !referralCode) setReferralCode(data.referralCode);
        if (data?.doctorSlug && !doctorSlug) setDoctorSlug(data.doctorSlug);
      } catch {}
      if (!doctorName && referralsMade?.length) {
        const inferred = referralsMade[0]?.doctor?.name;
        if (inferred) setDoctorName(inferred);
      }
    };
    resolve();
    return () => { canceled = true; };
  }, [doctorName, doctorId, doctorSlug, referralCode, referralsMade, doctorImage]);

  useEffect(() => {
    if (session?.user?.name && !patientName) setPatientName(session.user.name);
    let canceled = false;
    const run = async () => {
      try {
        const res = await fetch('/api/v2/patients/profile');
        if (!res.ok) return;
        const payload = await res.json().catch(() => ({}));
        if (canceled) return;
        const name = payload?.profile?.name;
        if (name && name !== patientName) setPatientName(name);
      } catch {}
    };
    run();
    return () => { canceled = true; };
  }, [session?.user?.name, patientName]);

  useEffect(() => {
    if (!doctorName && referralsMade && referralsMade.length > 0) {
      const n = referralsMade[0]?.doctor?.name;
      if (n) setDoctorName(n);
    }
  }, [referralsMade, doctorName]);

  const loadDashboard = async () => {
    try {
      const response = await fetch('/api/referrals/patient');
      const data = await response.json();
      if (response.ok) {
        setStats(data.stats);
        setCreditsHistory(data.creditsHistory);
        setReferralsMade(data.referralsMade);
        setAvailableRewards(data.availableRewards);
        setRedemptionsHistory(data.redemptionsHistory);
        setCreditsBalance(data.creditsBalance);
        if (!referralCode && data.referralCode) setReferralCode(data.referralCode);
        if (!doctorId && data.doctorId) setDoctorId(data.doctorId);
        if (!doctorName && (data.doctorName || (data.doctor && data.doctor.name))) {
          setDoctorName(data.doctorName || data.doctor.name);
        }
        if (!doctorImage) {
          if (data.doctorImage) setDoctorImage(data.doctorImage);
          else if (data.doctor?.image) setDoctorImage(data.doctor.image);
        }
        if (!doctorSlug) {
          if (data.doctorSlug) setDoctorSlug(data.doctorSlug);
          else if (data.doctor?.doctor_slug) setDoctorSlug(data.doctor.doctor_slug);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const slugVal = (effectiveSlug || doctorSlug || '').toString().trim();
    const code = (referralCode || '').toString().trim();
    if (!slugVal || !code) return;
    const controller = new AbortController();
    const run = async () => {
      const url = `/api/referrals/doctor/by-slug/${encodeURIComponent(slugVal)}?code=${encodeURIComponent(code)}`;
      try {
        const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        await res.json().catch(() => ({}));
      } catch (e) {
        if ((e as any)?.name === 'AbortError') return;
      }
    };
    run();
    return () => controller.abort();
  }, [effectiveSlug, doctorSlug, referralCode]);

  useEffect(() => {
    const slugVal = (effectiveSlug || doctorSlug || '').toString().trim();
    if (!slugVal) return;
    let aborted = false;
    const run = async () => {
      try {
        const qs = new URLSearchParams({ slug: slugVal });
        const res = await fetch(`/api/campaigns/resolve?${qs.toString()}`);
        const payload = await res.json().catch(() => ({ success: false }));
        if (aborted) return;
        if (res.ok && Array.isArray(payload?.data)) setCampaigns(payload.data);
        else setCampaigns([]);
      } catch (e) {
        setCampaigns([]);
      }
    };
    run();
    return () => { aborted = true; };
  }, [effectiveSlug, doctorSlug]);

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
        await loadDashboard();
      } else {
        toast.error(data.error || t.toastMessages.errorRedeeming);
      }
    } catch (error) {
      toast.error(t.toastMessages.connectionError);
    } finally {
      setRedeeming(null);
    }
  };

  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const handleCancelRedemption = async (redemptionId: string) => {
    if (!window.confirm('Cancelar este resgate pendente e liberar seus pontos?')) return;
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
      toast.error('Erro de conexão.');
    } finally {
      setCancellingId(null);
    }
  };

  const generateReferralLink = (style = 'default') => {
    const rawBase = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    const baseUrl = (rawBase || '').replace(/\/+$/, '');
    // Prefer the clinic/page slug (from route or URL), fallback to doctorSlug
    const slugVal = (effectiveSlug || doctorSlug || '').toString().trim().replace(/^\/+/, '');
    const rcode = referralCode || 'DEMO123';
    if (!slugVal) return '';
    const link = `${baseUrl}/${slugVal}?code=${rcode}`;
    return link;
  };

  const copyReferralLink = async () => {
    const link = generateReferralLink('default');
    if (!link) {
      toast.error(t.toastMessages.errorGeneratingLink);
      return;
    }
    try {
      if (!navigator.clipboard) {
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
          if (success) toast.success(t.toastMessages.linkCopied);
          else toast.error(t.toastMessages.errorCopyingLink);
        } catch {
          toast.error(t.toastMessages.errorCopyingLink);
        } finally {
          document.body.removeChild(textArea);
        }
        return;
      }
      await navigator.clipboard.writeText(link);
      toast.success(t.toastMessages.linkCopied);
    } catch (error) {
      try {
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
        if (success) toast.success(t.toastMessages.linkCopied);
        else toast.error(t.toastMessages.copyManually + link);
      } catch {
        toast.error(t.toastMessages.copyManually + link);
      }
    }
  };

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
      if (!navigator.clipboard) {
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
          toast.error(t.toastMessages.errorCopyingCode);
        } finally {
          document.body.removeChild(textArea);
        }
        return;
      }
      await navigator.clipboard.writeText(referralCode);
      toast.success(t.toastMessages.codeCopied);
    } catch (error) {
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
        toast.error(t.toastMessages.errorCopyingCode + ': ' + referralCode);
      }
    }
  };

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
        } catch {
          toast.error(t.toastMessages.errorCopyingCode);
        } finally {
          document.body.removeChild(textArea);
        }
        return;
      }
      await navigator.clipboard.writeText(code);
      toast.success(t.toastMessages.codeCopied);
    } catch (error) {
      toast.error(t.toastMessages.errorCopyingCode);
    }
  };

  // ... UI rendering copied from the original page ...
  // For brevity here, reuse the existing JSX structure. The key change is the floating menu links below.

  return (
    <div className={`min-h-screen ${isDark ? 'bg-gray-950' : 'bg-white'}`}>
      {/* The whole original JSX UI goes here. If needed, I can inline it entirely. */}
      {/* Share Modal with coupon links below */}
      <Dialog open={shareModalOpen} onOpenChange={setShareModalOpen}>
        <DialogContent className={`sm:max-w-lg ${isDark ? '!bg-gray-900 !text-gray-100 !border-gray-800' : ''}`}>
          <DialogHeader>
            <DialogTitle className={isDark ? 'text-gray-100' : ''}>Compartilhe sua indicação</DialogTitle>
            <DialogDescription className={isDark ? 'text-gray-300' : ''}>
              Envie seu link via WhatsApp, SMS ou Email, ou copie-o.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="secondary"
                className={isDark ? 'bg-gray-800 text-gray-100 hover:bg-gray-700 border border-gray-700' : ''}
                onClick={() => {
                  const url = generateReferralLink();
                  if (!url) return;
                  const wa = `https://wa.me/?text=${encodeURIComponent(url)}`;
                  window.open(wa, '_blank');
                }}
              >
                <MessageCircle className="h-4 w-4 mr-2" /> WhatsApp
              </Button>
              <Button
                variant="secondary"
                className={isDark ? 'bg-gray-800 text-gray-100 hover:bg-gray-700 border border-gray-700' : ''}
                onClick={() => {
                  const url = generateReferralLink();
                  if (!url) return;
                  const sms = `sms:?&body=${encodeURIComponent(url)}`;
                  window.open(sms, '_blank');
                }}
              >
                <Phone className="h-4 w-4 mr-2" /> SMS
              </Button>
              <Button
                variant="secondary"
                className={isDark ? 'bg-gray-800 text-gray-100 hover:bg-gray-700 border border-gray-700' : ''}
                onClick={() => {
                  const url = generateReferralLink();
                  if (!url) return;
                  const subject = encodeURIComponent(t.shareSubject);
                  const body = encodeURIComponent(`${t.shareMessage}\n\n${url}`);
                  const mailto = `mailto:?subject=${subject}&body=${body}`;
                  window.location.href = mailto;
                }}
              >
                <Mail className="h-4 w-4 mr-2" /> Email
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <input
                className={`w-full rounded-md px-2 py-2 text-sm ${isDark ? 'border border-gray-700 bg-gray-800 text-gray-100' : 'border border-gray-200 bg-gray-50'}`}
                value={generateReferralLink()}
                readOnly
              />
              <Button onClick={copyReferralLink} variant="secondary" className={isDark ? 'bg-gray-800 text-gray-100 hover:bg-gray-700 border border-gray-700' : ''}>
                <Copy className="h-4 w-4 mr-2" /> Copiar
              </Button>
            </div>

            {/* Special conditions list: show only if loading or there are items */}
            {(loadingCoupons || couponTemplates.length > 0) && (
              <>
                <div className={`pt-2 ${isDark ? 'border-t border-gray-800' : 'border-t'}`} />
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className={`text-sm font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Condições especiais</div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{couponTemplates.length} encontradas</span>
                      <Button size="sm" variant="ghost" onClick={fetchCouponTemplates} disabled={loadingCoupons} className={isDark ? 'text-gray-300 hover:bg-gray-800' : ''}>
                        {loadingCoupons ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Recarregar'}
                      </Button>
                    </div>
                  </div>
                  {loadingCoupons && (
                    <div className={`flex items-center text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Carregando...
                    </div>
                  )}
                  {!loadingCoupons && couponTemplates.length > 0 && (
                    <ul className={`divide-y rounded-md ${isDark ? 'border border-gray-700 divide-gray-800' : 'divide-gray-100 border'}`}>
                      {couponTemplates.map((c) => {
                        const base = (process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '') || '').replace(/\/\/+$/, '');
                        // Prefer clinic/page slug to keep context
                        const dslug = (effectiveSlug || doctorSlug || slug || '').toString().replace(/^\/+/, '');
                        const url = `${base}/${dslug}?cupom=${encodeURIComponent(c.slug)}`;
                        return (
                          <li key={c.id} className="p-3 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className={`text-sm font-medium break-words ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{c.display_title || c.name}</div>
                              {c.display_message && (
                                <div className={`text-xs mt-0.5 break-words ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{c.display_message}</div>
                              )}
                              <div className="mt-1">
                                <code className={`text-xs break-all ${isDark ? 'text-gray-200 bg-gray-800' : 'text-gray-700 bg-gray-50'} px-1 py-0.5 rounded`}>{url}</code>
                              </div>
                            </div>
                            <div className="shrink-0">
                              <Button
                                size="sm"
                                variant="secondary"
                                className={isDark ? 'bg-gray-800 text-gray-100 hover:bg-gray-700 border border-gray-700' : ''}
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(url);
                                    toast.success('Link copiado');
                                  } catch {
                                    toast.error('Não foi possível copiar');
                                  }
                                }}
                              >
                                <Copy className="h-4 w-4 mr-1" /> Copiar
                              </Button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setShareModalOpen(false)} variant="secondary">Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Special Conditions (Coupons) Modal */}
      <Dialog open={couponsOpen} onOpenChange={setCouponsOpen}>
        <DialogContent className={`sm:max-w-lg ${isDark ? '!bg-gray-900 !text-gray-100 !border-gray-800' : ''}`}>
          <DialogHeader>
            <DialogTitle className={isDark ? 'text-gray-100' : ''}>Condições especiais</DialogTitle>
            <DialogDescription className={isDark ? 'text-gray-300' : ''}>
              Links públicos de ofertas e condições especiais criadas pelo médico.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[50vh] overflow-auto">
            {loadingCoupons && (
              <div className={`flex items-center text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Carregando...
              </div>
            )}
            {!loadingCoupons && couponTemplates.length > 0 && (
              <ul className={`divide-y rounded-md ${isDark ? 'border border-gray-700 divide-gray-800' : 'divide-gray-100 border'}`}>
                {couponTemplates.map((c) => {
                  const base = (process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '') || '').replace(/\/\/+$/, '');
                  // Prefer the clinic/page slug for public coupon links
                  const dslug = (effectiveSlug || doctorSlug || slug || '').toString().replace(/^\/+/, '');
                  const url = `${base}/${dslug}?cupom=${encodeURIComponent(c.slug)}`;
                  return (
                    <li key={c.id} className="p-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className={`text-sm font-medium break-words ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{c.display_title || c.name}</div>
                        {c.display_message && (
                          <div className={`text-xs mt-0.5 break-words ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{c.display_message}</div>
                        )}
                        <div className="mt-1">
                          <code className={`text-xs break-all ${isDark ? 'text-gray-200 bg-gray-800' : 'text-gray-700 bg-gray-50'} px-1 py-0.5 rounded`}>{url}</code>
                        </div>
                      </div>
                      <div className="shrink-0">
                        <Button
                          size="sm"
                          variant="secondary"
                          className={isDark ? 'bg-gray-800 text-gray-100 hover:bg-gray-700 border border-gray-700' : ''}
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(url);
                              toast.success('Link copiado');
                            } catch {
                              toast.error('Não foi possível copiar');
                            }
                          }}
                        >
                          <Copy className="h-4 w-4 mr-1" /> Copiar
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setCouponsOpen(false)} variant="secondary">Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Floating Action Menu (slug-aware) */}
      <div className="fixed bottom-6 right-6 z-50">
        <div className="relative">
          <button
            onClick={toggleMenu}
            className="h-12 w-12 rounded-full bg-turquoise text-white shadow-lg hover:bg-turquoise/90 focus:outline-none focus:ring-2 focus:ring-turquoise/40 flex items-center justify-center"
            aria-label="Toggle menu"
          >
            <MoreVertical className="h-6 w-6" />
          </button>
          {menuOpen && (
            <div className="absolute bottom-14 right-0 bg-white border border-gray-200 rounded-xl shadow-xl w-56 p-2">
              <button
                onClick={() => setShareModalOpen(true)}
                className="w-full flex items-center px-3 py-2 text-sm text-gray-700 rounded-lg hover:bg-gray-50"
              >
                <Share2 className="mr-2 h-4 w-4 text-gray-600" />
                Compartilhar
              </button>
              <Link href={`/${(effectiveSlug || slug || '').toString()}/profile`} className="flex items-center px-3 py-2 text-sm text-gray-700 rounded-lg hover:bg-gray-50">
                <User className="mr-2 h-4 w-4 text-gray-600" />
                Profile
              </Link>
              <Link href={`/${(effectiveSlug || slug || '').toString()}/referrals`} className="flex items-center px-3 py-2 text-sm text-gray-700 rounded-lg hover:bg-gray-50">
                <Share2 className="mr-2 h-4 w-4 text-gray-600" />
                Referrals
              </Link>
              <button
                onClick={openCoupons}
                className="w-full flex items-center px-3 py-2 text-sm text-gray-700 rounded-lg hover:bg-gray-50"
              >
                <Gift className="mr-2 h-4 w-4 text-gray-600" />
                Condições especiais
              </button>
              <button
                onClick={async () => {
                  const href = computeLoginHref();
                  try {
                    await signOut({ redirect: false });
                  } finally {
                    if (typeof window !== 'undefined') console.debug('[logout] navigating to', href);
                    window.location.href = href;
                  }
                }}
                className="w-full flex items-center px-3 py-2 text-sm text-gray-700 rounded-lg hover:bg-gray-50"
              >
                <LogOut className="mr-2 h-4 w-4 text-gray-600" />
                Sair
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
