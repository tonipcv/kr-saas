/* eslint-disable */
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CheckCircleIcon,
  UserCircleIcon,
  CheckIcon,
  CalendarDaysIcon,
  ChatBubbleLeftIcon,
  ClockIcon,
  UsersIcon,
  DocumentTextIcon,
  CogIcon,
  PresentationChartBarIcon,
  ShieldCheckIcon,
  BuildingOfficeIcon,
  GiftIcon,
  UserPlusIcon,
  UserIcon,
  CreditCardIcon,
  ChatBubbleLeftRightIcon,
  SparklesIcon,
  ExclamationTriangleIcon,
  BellIcon,
  TagIcon
} from '@heroicons/react/24/outline';
import { ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline';
import { Bot } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { useEffect, useState, createContext, useContext, useMemo, useRef } from 'react';
import { signOut } from 'next-auth/react';
import { SidebarClinicSelector } from '@/components/ui/sidebar-clinic-selector';
import { useClinic } from '@/contexts/clinic-context';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

interface DoctorInfo {
  id: string;
  name: string;
  image: string | null;
  email: string;
  clinicLogo: string | null;
  clinicName: string | null;
}

// Contexto para compartilhar o role do usuário
interface UserRoleContextType {
  userRole: 'DOCTOR' | 'PATIENT' | 'SUPER_ADMIN' | null;
  isLoadingRole: boolean;
}

export const UserRoleContext = createContext<UserRoleContextType>({
  userRole: null,
  isLoadingRole: true
});

// Provider do contexto de role
export function UserRoleProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const [userRole, setUserRole] = useState<'DOCTOR' | 'PATIENT' | 'SUPER_ADMIN' | null>(null);
  const [isLoadingRole, setIsLoadingRole] = useState(true);

  useEffect(() => {
    const detectUserRole = async () => {
      if (session?.user?.id) {
        try {
          setIsLoadingRole(true);
          console.log('UserRoleProvider: Fetching user role for:', session.user.email);
          const response = await fetch('/api/auth/role', {
            headers: {
              'Cache-Control': 'no-cache'
            }
          });
          if (response.ok) {
            const data = await response.json();
            console.log('UserRoleProvider: Role detected:', data.role, 'for user:', session.user.email);
            setUserRole(data.role);
          } else {
            console.error('Error detecting user role:', response.status);
            setUserRole(null);
          }
        } catch (error) {
          console.error('Error detecting user role:', error);
          setUserRole(null);
        } finally {
          setIsLoadingRole(false);
        }
      } else {
        setUserRole(null);
        setIsLoadingRole(false);
      }
    };

    detectUserRole();
  }, [session]);

  return (
    <UserRoleContext.Provider value={{ userRole, isLoadingRole }}>
      {children}
    </UserRoleContext.Provider>
  );
}

// Hook para usar o contexto de role
export function useUserRole() {
  return useContext(UserRoleContext);
}

// Hook para buscar informações do médico dos protocolos ativos
function useDoctorInfo(effectiveRole?: 'DOCTOR' | 'PATIENT' | 'SUPER_ADMIN' | null) {
  const [doctorInfo, setDoctorInfo] = useState<DoctorInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: session } = useSession();

  const fetchDoctorInfo = async (forceRefresh = false) => {
      if (!session?.user?.id) return;
      // Only patients should call this endpoint. Avoid 403 on doctor/admin pages.
      if (effectiveRole && effectiveRole !== 'PATIENT') {
        setDoctorInfo(null);
        setError(null);
        return;
      }

      try {
        setIsLoading(true);
      setError(null);
      
      // Use dedicated endpoint for patient-linked doctor
      const url = forceRefresh 
        ? `/api/v2/patients/referral?t=${Date.now()}` 
        : '/api/v2/patients/referral';
      
      const response = await fetch(url, {
        cache: 'no-store', // Prevent caching
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
        if (response.ok) {
          const payload = await response.json();
          const doc = payload?.data?.doctor || payload?.doctor || null;
          console.log('Doctor info fetched:', doc);
          setDoctorInfo(doc);
      } else {
        console.error('Failed to fetch doctor info:', response.status);
        setError(`Failed to fetch doctor info: ${response.status}`);
        }
      } catch (error) {
        console.error('Error fetching doctor info:', error);
      setError('Error fetching doctor info');
      } finally {
        setIsLoading(false);
      }
    };

  useEffect(() => {
    fetchDoctorInfo();
    // Re-run when role changes to start/stop fetching appropriately
  }, [session, effectiveRole]);

  // Return refresh function along with state
  return { 
    doctorInfo, 
    isLoading, 
    error, 
    refreshDoctorInfo: () => fetchDoctorInfo(true) 
  };
}

export default function Navigation() {
  const pathname = usePathname();
  // Detect current slug from path (exclude known roots)
  const currentSlug = (() => {
    if (!pathname) return null;
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length === 0) return null;
    const first = parts[0];
    const excluded = new Set(['auth', 'api', 'assets', 'public', '_next', 'doctor', 'admin', 'clinic', 'patient', 'business']);
    return excluded.has(first) ? null : first;
  })();
  const { data: session } = useSession();
  const { userRole, isLoadingRole } = useUserRole();
  const { currentClinic } = useClinic();
  const isFreePlan = currentClinic?.subscription?.plan?.name?.toLowerCase() === 'free';
  
  // Estado para controlar hidratação e evitar erros de SSR
  const [isHydrated, setIsHydrated] = useState(false);
  // Profile menu states and refs
  const [isSidebarMenuOpen, setIsSidebarMenuOpen] = useState(false);
  const [isMobileHeaderMenuOpen, setIsMobileHeaderMenuOpen] = useState(false);
  const [isPatientDesktopHeaderMenuOpen, setIsPatientDesktopHeaderMenuOpen] = useState(false);
  const sidebarMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileHeaderMenuRef = useRef<HTMLDivElement | null>(null);
  const patientDesktopHeaderMenuRef = useRef<HTMLDivElement | null>(null);
  
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Close menus on outside click
  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (isSidebarMenuOpen && sidebarMenuRef.current && !sidebarMenuRef.current.contains(t)) {
        setIsSidebarMenuOpen(false);
      }
      if (isMobileHeaderMenuOpen && mobileHeaderMenuRef.current && !mobileHeaderMenuRef.current.contains(t)) {
        setIsMobileHeaderMenuOpen(false);
      }
      if (isPatientDesktopHeaderMenuOpen && patientDesktopHeaderMenuRef.current && !patientDesktopHeaderMenuRef.current.contains(t)) {
        setIsPatientDesktopHeaderMenuOpen(false);
      }
    };
    document.addEventListener('click', onClickOutside);
    return () => document.removeEventListener('click', onClickOutside);
  }, [isSidebarMenuOpen, isMobileHeaderMenuOpen, isPatientDesktopHeaderMenuOpen]);

  const handleSignOut = () => {
    try {
      signOut();
    } catch (e) {
      console.error('Error on sign out', e);
    }
  };

  // Navegação para pacientes - memoizada para evitar re-renderizações
  const patientNavSections: NavSection[] = useMemo(() => {
    const slugPrefix = currentSlug ? `/${currentSlug}` : '';
    return [
      {
        title: "Planning",
        items: [
          {
            href: slugPrefix ? `${slugPrefix}/protocols` : '/patient/protocols',
            label: 'Protocols',
            icon: CheckCircleIcon,
            description: 'My medical protocols'
          },
          {
            href: slugPrefix ? `${slugPrefix}/appointments` : '/patient/appointments',
            label: 'Appointments',
            icon: CalendarDaysIcon,
            description: 'Schedule appointments'
          },
          {
            href: slugPrefix ? `${slugPrefix}/ai-chat` : '/patient/ai-chat',
            label: 'AI Assistant',
            icon: Bot,
            description: 'Chat with AI assistant'
          }
        ]
      },
      {
        title: "Referrals",
        items: [
          {
            href: slugPrefix ? `${slugPrefix}/referrals` : '/patient/referrals',
            label: 'My Referrals',
            icon: UserPlusIcon,
            description: 'My credits and rewards'
          }
        ]
      }
    ];
  }, [currentSlug]);

  // Navegação para médicos - memoizada para evitar re-renderizações
  const doctorNavSections: NavSection[] = useMemo(() => [
    {
      title: "",
      items: [
        {
          href: '/business/dashboard',
          label: 'Dashboard',
          icon: PresentationChartBarIcon,
          description: 'Overview'
        },
        {
          href: '/business/clients',
          label: 'Clients',
          icon: UsersIcon,
          description: 'Manage clients'
        },
        {
          href: '/business/clinic',
          label: 'Team',
          icon: BuildingOfficeIcon,
          description: 'Manage clinics and team'
        },
        {
          href: '/business/products',
          label: 'Products',
          icon: DocumentTextIcon,
          description: 'Manage products & services'
        },
        {
          href: '/business/payments',
          label: 'Payments',
          icon: CreditCardIcon,
          description: 'Record patient purchases'
        },
        {
          href: '/business/subscriptions',
          label: 'Subscriptions',
          icon: ShieldCheckIcon,
          description: 'Manage recurring subscriptions'
        },
        {
          href: '/business/referrals',
          label: 'Referrals',
          icon: UserPlusIcon,
          description: 'Manage received referrals'
        },
        {
          href: '/business/coupon-templates',
          label: 'Cupons',
          icon: TagIcon,
          description: 'Gerenciar modelos de cupons'
        },
        {
          href: '/business/rewards',
          label: 'Rewards',
          icon: GiftIcon,
          description: 'Configure rewards'
        },
        {
          href: '/business/integrations',
          label: 'Integrations',
          icon: CogIcon,
          description: 'Connect external tools'
        },
        {
          href: '/business/events',
          label: 'Events',
          icon: PresentationChartBarIcon,
          description: 'Metrics & timelines'
        },
        {
          href: '/business/broadcast',
          label: 'Broadcast',
          icon: ChatBubbleLeftRightIcon,
          description: 'Send WhatsApp and campaigns'
        },
        {
          href: '/business/automation',
          label: 'Automation',
          icon: SparklesIcon,
          description: 'Triggers & actions'
        },
      ]
    }
  ], []);

  // Navegação para Super Admin - memoizada para evitar re-renderizações
  const superAdminNavSections: NavSection[] = useMemo(() => [
    {
      title: "Administration",
      items: [
        {
          href: '/admin',
          label: 'Dashboard',
          icon: PresentationChartBarIcon,
          description: 'Administrative panel'
        },
        {
          href: '/admin/clinics',
          label: 'Clinics',
          icon: BuildingOfficeIcon,
          description: 'Manage all clinics'
        },
        {
          href: '/admin/doctors',
          label: 'Doctors',
          icon: UsersIcon,
          description: 'Manage doctors'
        },
        {
          href: '/admin/subscriptions',
          label: 'Subscriptions',
          icon: ShieldCheckIcon,
          description: 'Manage subscriptions'
        },
        {
          href: '/admin/plans',
          label: 'Plans',
          icon: CreditCardIcon,
          description: 'Manage subscription plans'
        },
        {
          href: '/clinic/subscription',
          label: 'Clinic Subscription',
          icon: ShieldCheckIcon,
          description: 'Manage active clinic plan'
        },
      ]
    }
  ], []);

  // Detectar se está em páginas específicas
  const isDoctorPage = pathname?.startsWith('/doctor') || pathname?.startsWith('/clinic') || pathname?.startsWith('/business');
  const isAdminPage = pathname?.startsWith('/admin');
  const isProtocolsPage = pathname === '/patient/protocols';
  const isChecklistPage = pathname?.includes('/patient/checklist/');
  const isSpecificCoursePage = pathname?.match(/^\/patient\/courses\/[^\/]+/) && pathname !== '/patient/courses';
  const isDoctorInfoPage = pathname === '/doctor-info';
  const isAIChatPage = pathname === '/patient/ai-chat';
  const isPatientReferralsPage = pathname === '/patient/referrals';
  const isPatientProfilePage = pathname?.startsWith('/patient/profile');
  // Slugged patient pages
  const isSlugPatientReferralsPage = currentSlug ? pathname === `/${currentSlug}/referrals` : false;
  const isSlugPatientProfilePage = currentSlug ? pathname?.startsWith(`/${currentSlug}/profile`) : false;
  
  // ESTRATÉGIA MELHORADA: Usar a URL como hint inicial para evitar flash
  // Se estamos em página de médico/admin, assumir esse role até a API confirmar
  // Se estamos em página de paciente ou não sabemos, assumir paciente
  const getEffectiveRole = () => {
    // Sempre tratar páginas /patient/* como contexto de paciente (evita menu de médico nessa área)
    if (pathname?.startsWith('/patient') || isDoctorInfoPage) return 'PATIENT';

    // Se já temos o role da API, usar ele
    if (userRole) return userRole;

    // Se ainda está carregando, usar hint da URL
    if (isLoadingRole) {
      if (isAdminPage) return 'SUPER_ADMIN';
      if (isDoctorPage) return 'DOCTOR';
      return 'PATIENT';
    }

    // Fallback para paciente se não conseguiu detectar
    return 'PATIENT';
  };
  
  const effectiveRole = getEffectiveRole();
  // Fetch patient-linked doctor info only for patients
  const { doctorInfo } = useDoctorInfo(effectiveRole);
  
  // Determinar tema baseado no role do usuário e na URL
  // /doctor-info sempre usa tema escuro (paciente), mesmo que o usuário seja médico
  const shouldUseLightTheme = !isDoctorInfoPage && ((isDoctorPage || isAdminPage) || (effectiveRole === 'DOCTOR' || effectiveRole === 'SUPER_ADMIN')) && !pathname?.startsWith('/patient');

  // Selecionar navegação baseada no role - memoizada
  const navSections = useMemo(() => {
    if (isDoctorInfoPage) return patientNavSections;
    if (effectiveRole === 'SUPER_ADMIN') return superAdminNavSections;
    if (effectiveRole === 'DOCTOR') return doctorNavSections;
    return patientNavSections;
  }, [effectiveRole, isDoctorInfoPage, patientNavSections, doctorNavSections, superAdminNavSections]);

  // Profile URL - memoizada
  const profileUrl = useMemo(() => {
    if (effectiveRole === 'DOCTOR' || effectiveRole === 'SUPER_ADMIN') return '/business/profile';
    // Patient
    return currentSlug ? `/${currentSlug}/profile` : '/patient/profile';
  }, [effectiveRole, currentSlug]);
  
  // Não renderizar até que esteja hidratado
  if (!isHydrated) {
    return null;
  }

  // Se não há sessão, não mostrar navegação
  if (!session?.user?.id) {
    return null;
  }

  // Lista de rotas protegidas onde a navegação deve aparecer
  const protectedRoutes = [
    '/patient/protocols',
    '/patient/courses',
    '/patient/checklist',
    '/patient/oneweek',
    '/patient/circles',
    '/patient/thoughts',
    '/patient/profile',
    '/patient',
    '/doctor-info',
    '/doctor',
    '/business',
    '/admin',
    '/clinic'
  ];

  // Só mostrar navegação em rotas protegidas
  const isProtectedRoute = protectedRoutes.some(route => pathname?.startsWith(route));
  if (!isProtectedRoute) {
    return null;
  }

  // Permitir renderizar a navegação mesmo se a API de role ainda não retornou (usamos hint da URL em getEffectiveRole)

  const getProfileUrl = () => {
    console.log('Navigation: Profile URL for role', effectiveRole, ':', profileUrl);
    return profileUrl;
  };

  const NavButton = ({ item, className }: { item: typeof navSections[0]['items'][0], className?: string }) => (
    <Button
      variant="ghost"
      className={cn(
        // Make doctor/admin (light theme) nav more compact
        shouldUseLightTheme
          ? "w-full h-8 flex items-center justify-start gap-2 px-3 rounded-md font-medium transition-colors"
          : "w-full h-9 flex items-center justify-start gap-2 px-3 rounded-md font-medium transition-colors",
        shouldUseLightTheme
          ? "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
          : "text-white/70 hover:bg-white/5 hover:text-white",
        pathname === item.href 
          ? shouldUseLightTheme
            ? "bg-gray-100 text-gray-900"
            : "bg-white/10 text-white"
          : "",
        className
      )}
    >
      <item.icon className={cn(
        // Slightly smaller icons on doctor/admin nav
        shouldUseLightTheme ? "h-4 w-4 flex-shrink-0" : "h-4.5 w-4.5 flex-shrink-0",
        shouldUseLightTheme ? "text-gray-500" : "text-white/70"
      )} />
      {/* Smaller label on doctor/admin nav */}
      <span className={cn(shouldUseLightTheme ? "text-xs truncate" : "text-sm truncate")}>{item.label}</span>
    </Button>
  );

  const UserAvatar = () => (
    session?.user?.image ? (
      <div className="relative w-full h-full rounded-full overflow-hidden">
        <Image
          src={session.user.image}
          alt="Profile"
          fill
          className="object-cover"
        />
      </div>
    ) : (
      <UserCircleIcon className={cn(
        "h-5 w-5",
        shouldUseLightTheme ? "text-gray-600" : "text-gray-300"
      )} />
    )
  );

  const DoctorAvatar = ({ doctor }: { doctor: DoctorInfo }) => (
    doctor.image ? (
      <div className="relative w-full h-full rounded-full overflow-hidden">
        <Image
          src={doctor.image}
          alt={`Dr. ${doctor.name}`}
          fill
          className="object-cover"
        />
      </div>
    ) : (
      <UserCircleIcon className="h-5 w-5 text-gray-300" />
    )
  );

  const ClinicLogo = ({ doctor }: { doctor: DoctorInfo }) => (
    doctor.clinicLogo ? (
      <div className="relative w-full h-full overflow-hidden">
        <Image
          src={doctor.clinicLogo}
          alt={doctor.clinicName || 'Clinic Logo'}
          fill
          className="object-contain"
        />
      </div>
    ) : doctor.image ? (
      <div className="relative w-full h-full rounded-full overflow-hidden">
        <Image
          src={doctor.image}
          alt={`Dr. ${doctor.name}`}
          fill
          className="object-cover"
        />
      </div>
    ) : (
      <UserCircleIcon className="h-5 w-5 text-gray-300" />
    )
  );

  return (
    <>
      {/* Desktop Navigation - For Doctors/Admins (light theme) or Doctor Info page (dark theme) */}
      {((effectiveRole === 'DOCTOR' || effectiveRole === 'SUPER_ADMIN') && !isDoctorInfoPage) && (
        <nav className={cn(
          "fixed left-0 top-0 bottom-0 w-64 border-r backdrop-blur hidden lg:block z-40",
          "border-gray-200 bg-white"
        )}>
          <div className="flex flex-col h-full">
            {/* Logo Section */}
            <div className="p-5 border-b border-gray-200">
              <Link href="/" className="flex items-center justify-start">
                <div className="relative w-6 h-6">
                  <Image
                    src="/logo.png"
                    alt="Logo"
                    fill
                    className="object-contain"
                  />
                </div>
              </Link>
            </div>

            {/* Clinic Selector */}
            <SidebarClinicSelector />

            {/* Navigation Sections */}
            <div className="flex-1 py-5 px-3 overflow-y-auto">
              <nav className="space-y-6">
                {navSections.map((section) => (
                  <div key={section.title || 'doctor-section'} className="space-y-2">
                    {section.title ? (
                      <h3 className="text-[10px] font-semibold uppercase tracking-wider px-3 text-gray-400">
                        {section.title}
                      </h3>
                    ) : null}
                    <div className="space-y-1">
                      {section.items.map((item) => (
                        <Link key={item.href} href={item.href} className="block">
                          <NavButton item={item} />
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </nav>
            </div>

            {/* User Profile Section */}
            <div className="p-3 border-t border-gray-200">
              <div className="relative flex items-center gap-2">
                <Link href={getProfileUrl()} className="flex-1">
                  <div className="flex items-center gap-2 p-1.5 rounded-md transition-colors hover:bg-gray-50">
                    <div className="w-7 h-7 flex items-center justify-center rounded-full border border-gray-200">
                      <UserAvatar />
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-[13px] font-medium text-gray-800 truncate">
                        {session?.user?.name || 'User'}
                      </p>
                    </div>
                  </div>
                </Link>
                <button
                  type="button"
                  aria-label="Sign out"
                  onClick={handleSignOut}
                  className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-50"
                >
                  <ArrowRightOnRectangleIcon className="h-4 w-4" />
                </button>
              </div>
              {isFreePlan && (
                <Link
                  href={currentClinic?.id ? `/clinic/subscription?clinicId=${encodeURIComponent(currentClinic.id)}#plans` : "/clinic/subscription#plans"}
                  className="mt-2 w-full inline-flex items-center justify-center text-xs font-medium text-white bg-gray-900 hover:bg-black rounded-md h-8"
                >
                  Upgrade
                </Link>
              )}
            </div>
          </div>
        </nav>
      )}

      {/* Mobile Navigation */}
      <div className="lg:hidden">
        {/* Mobile Header */}
        {!(isPatientReferralsPage || isPatientProfilePage || isSlugPatientReferralsPage || isSlugPatientProfilePage) && (
          <div className={cn(
            "fixed top-0 left-0 right-0 border-b backdrop-blur z-40",
            shouldUseLightTheme
              ? "border-gray-200 bg-white" // Doctor/Admin pages - clean white
              : "border-gray-800 bg-[#111111]/95 supports-[backdrop-filter]:bg-[#111111]/90" // Patient pages - dark theme
          )}>
            <div className="py-4 px-4 flex justify-between items-center">
              {(effectiveRole === 'PATIENT' || isDoctorInfoPage) ? (
                // Patient Header - Show only our logo
                <>
                  <div className="flex items-center gap-3">
                    <div className="relative w-5 h-5">
                      <Image
                        src="/logo.png"
                        alt="Logo"
                        fill
                        className="object-contain"
                      />
                    </div>
                  </div>
                  <div className="flex items-center">
                    <div ref={mobileHeaderMenuRef} className="relative">
                      <button
                        type="button"
                        aria-haspopup="menu"
                        aria-expanded={isMobileHeaderMenuOpen}
                        onClick={() => {
                          console.log('Mobile (patient) header avatar clicked');
                          setIsMobileHeaderMenuOpen((v) => !v)
                        }}
                        className="h-8 w-8 flex items-center justify-center rounded-full bg-gray-700 border border-gray-600"
                      >
                        <UserAvatar />
                      </button>
                      {isMobileHeaderMenuOpen && (
                        <div className="absolute right-0 mt-2 w-48 rounded-md border border-gray-800 bg-[#111111] text-gray-200 shadow-lg z-50">
                          <Link
                            href={getProfileUrl()}
                            className="block px-3 py-2 text-sm hover:bg-white/5"
                            onClick={() => setIsMobileHeaderMenuOpen(false)}
                          >
                            View Profile
                          </Link>
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-white/5"
                            onClick={handleSignOut}
                          >
                            Sign Out
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                // Doctor/Admin Header - Full header with logo and avatar
                <>
                  <Link href="/" className="flex items-center gap-2">
                    <div className="relative w-5 h-5">
                      <Image
                        src="/logo.png"
                        alt="Logo"
                        fill
                        className="object-contain"
                      />
                    </div>
                  </Link>
                  <div className="relative flex items-center gap-2">
                    {isFreePlan && (
                      <Link
                        href={currentClinic?.id ? `/clinic/subscription?clinicId=${encodeURIComponent(currentClinic.id)}#plans` : "/clinic/subscription#plans"}
                        className="px-2 h-7 inline-flex items-center justify-center text-[11px] font-medium text-white bg-gray-900 hover:bg-black rounded-md"
                      >
                        Upgrade
                      </Link>
                    )}
                    <Link href={getProfileUrl()}>
                      <div className={cn(
                        "h-8 w-8 flex items-center justify-center cursor-pointer rounded-full",
                        "bg-gray-100 hover:bg-gray-200"
                      )}>
                        <UserAvatar />
                      </div>
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Mobile Navigation Bar - Different styles for patients vs doctors/admins */}
        {(effectiveRole === 'PATIENT' || isDoctorInfoPage) && !isChecklistPage && !isSpecificCoursePage && !isAIChatPage && !isProtocolsPage && !isPatientReferralsPage && !isPatientProfilePage && !isSlugPatientReferralsPage && !isSlugPatientProfilePage ? (
          // Patient Bottom Navigation - App Style (Mobile Only)
          <nav className="fixed bottom-0 left-0 right-0 z-40">
            <div className="bg-[#111111]/95 backdrop-blur-xl border-t border-gray-800 shadow-2xl">
              <div className="px-4 py-2">
                <div className="flex items-center justify-around">
                  {patientNavSections.flatMap(section => section.items).map((item) => (
                    <Link key={item.href} href={item.href} className={cn(
                      "flex-1",
                      item.href === '/patient/ai-chat' ? "max-w-[70px]" : "max-w-[50px]"
                    )}>
                      <Button
                        variant="ghost"
                        className={cn(
                          "w-full flex items-center justify-center rounded-full transition-all duration-300",
                          item.href === '/patient/ai-chat' ? "h-12" : "h-10",
                          pathname === item.href 
                            ? "bg-gradient-to-t from-blue-500 to-blue-600 text-white shadow-lg scale-105" 
                            : "text-gray-400 hover:bg-gray-800 hover:text-white hover:scale-105"
                        )}
                      >
                        {item.href === '/patient/ai-chat' ? (
                          <div className="relative w-10 h-10">
                            <Image
                              src="/logo.png"
                              alt="Logo"
                              fill
                              className="object-contain"
                            />
                          </div>
                        ) : (
                          <item.icon className={cn(
                            "h-4 w-4 stroke-current transition-all duration-300",
                            pathname === item.href ? "drop-shadow-sm" : ""
                          )} />
                        )}
                      </Button>
                    </Link>
                  ))}
                  {/* Profile Button */}
                  <Link href={getProfileUrl()} className="flex-1 max-w-[50px]">
                    <Button
                      variant="ghost"
                      className={cn(
                        "w-full h-10 flex items-center justify-center rounded-full transition-all duration-300",
                        (pathname === '/patient/profile' || pathname === '/doctor/profile')
                          ? "bg-gradient-to-t from-blue-500 to-blue-600 text-white shadow-lg scale-105" 
                          : "text-gray-400 hover:bg-gray-800 hover:text-white hover:scale-105"
                      )}
                    >
                      <UserCircleIcon className={cn(
                        "h-4 w-4 stroke-current transition-all duration-300",
                        (pathname === '/patient/profile' || pathname === '/doctor/profile') ? "drop-shadow-sm" : ""
                      )} />
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </nav>
        ) : (effectiveRole !== 'PATIENT' && !isDoctorInfoPage) ? (
          // Doctor/Admin Navigation - Horizontal Style (Mobile Only)
          <nav className="fixed bottom-0 left-0 right-0 border-t backdrop-blur z-40 border-gray-200 bg-white">
            <div className="py-2 px-2">
              <div className="flex items-center justify-around">
                {doctorNavSections.flatMap(section => section.items).map((item) => {
                  const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
                  return (
                    <Link key={item.href} href={item.href} className="flex-1 max-w-[56px]">
                      <Button
                        variant="ghost"
                        className={cn(
                          "w-full h-10 flex items-center justify-center rounded-full transition-all duration-300",
                          isActive
                            ? "bg-gray-900 text-white shadow-lg scale-110"
                            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 hover:scale-105"
                        )}
                      >
                        <item.icon className={cn(
                          "h-4 w-4 stroke-current transition-all duration-300",
                          isActive ? "drop-shadow-sm" : ""
                        )} />
                      </Button>
                    </Link>
                  );
                })}
              </div>
            </div>
          </nav>
        ) : null}
      </div>

      {/* Desktop Navigation for Patients - Top Header + Bottom Navigation */}
      {(effectiveRole === 'PATIENT' || isDoctorInfoPage) && (
        <>
          {/* Desktop Top Header for Patients */}
          {!(isPatientReferralsPage || isPatientProfilePage || isSlugPatientReferralsPage || isSlugPatientProfilePage) && (
            <div className="fixed top-0 left-0 right-0 border-b backdrop-blur z-40 border-gray-800 bg-[#111111]/95 hidden lg:block">
              <div className="py-4 px-6 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="relative w-6 h-6">
                    <Image
                      src="/logo.png"
                      alt="Logo"
                      fill
                      className="object-contain"
                    />
                  </div>
                </div>
                <div className="flex items-center">
                  <div ref={patientDesktopHeaderMenuRef} className="relative">
                    <button
                      type="button"
                      aria-haspopup="menu"
                      aria-expanded={isPatientDesktopHeaderMenuOpen}
                      onClick={() => {
                        console.log('Desktop patient header avatar clicked');
                        setIsPatientDesktopHeaderMenuOpen((v) => !v)
                      }}
                      className="h-10 w-10 flex items-center justify-center rounded-full bg-gray-700 border border-gray-600 hover:bg-gray-600 transition-colors"
                    >
                      <UserAvatar />
                    </button>
                    {isPatientDesktopHeaderMenuOpen && (
                      <div className="absolute right-0 mt-2 w-48 rounded-md border border-gray-800 bg-[#111111] text-gray-200 shadow-lg z-50">
                        <Link
                          href={getProfileUrl()}
                          className="block px-3 py-2 text-sm hover:bg-white/5"
                          onClick={() => setIsPatientDesktopHeaderMenuOpen(false)}
                        >
                          View Profile
                        </Link>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-white/5"
                          onClick={handleSignOut}
                        >
                          Sign Out
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Desktop Bottom Navigation for Patients - Hidden on checklist pages */}
          {!isChecklistPage && !isProtocolsPage && !isPatientReferralsPage && !isPatientProfilePage && !isSlugPatientReferralsPage && !isSlugPatientProfilePage && (
            <nav className="fixed bottom-0 left-0 right-0 z-40 hidden lg:block">
              <div className="bg-[#111111]/95 backdrop-blur-xl border-t border-gray-800 shadow-2xl">
                <div className="px-8 py-4">
                  <div className="flex items-center justify-center gap-8 max-w-2xl mx-auto">
                    {patientNavSections.flatMap(section => section.items).map((item) => (
                      <Link key={item.href} href={item.href} className="flex-shrink-0">
                        <Button
                          variant="ghost"
                          className={cn(
                            "flex flex-col items-center justify-center gap-2 h-16 w-20 rounded-xl transition-all duration-300",
                            item.href === '/patient/ai-chat' ? "w-24" : "",
                            pathname === item.href 
                              ? "bg-gradient-to-t from-blue-500 to-blue-600 text-white shadow-lg scale-105" 
                              : "text-gray-400 hover:bg-gray-800 hover:text-white hover:scale-105"
                          )}
                        >
                          {item.href === '/patient/ai-chat' ? (
                            <div className="relative w-8 h-8">
                              <Image
                                src="/logo.png"
                                alt="Logo"
                                fill
                                className="object-contain"
                              />
                            </div>
                          ) : (
                            <item.icon className={cn(
                              "h-6 w-6 stroke-current transition-all duration-300",
                              pathname === item.href ? "drop-shadow-sm" : ""
                            )} />
                          )}
                          <span className="text-xs font-medium">{item.label}</span>
                        </Button>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </nav>
          )}
        </>
      )}
    </>
  );
}

// Page Wrapper Component for automatic padding adjustment
export function PageWrapper({ children, className }: { children: React.ReactNode; className?: string }) {
  const { data: session } = useSession();
  const { userRole, isLoadingRole } = useUserRole();
  const pathname = usePathname();

  // Detectar se está em páginas específicas
  const isDoctorPage = pathname?.startsWith('/doctor') || pathname?.startsWith('/clinic');
  const isAdminPage = pathname?.startsWith('/admin');
  const isDoctorInfoPage = pathname === '/doctor-info';
  const isPatientReferralsPage = pathname === '/patient/referrals';
  const isPatientProfilePage = pathname === '/patient/profile';

  // Usar fallback para paciente se ainda estiver carregando
  const effectiveRole = userRole || 'PATIENT';

  return (
    <div className={cn(
      "min-h-screen",
      // Only add sidebar margin for doctors/admins on desktop
      ((effectiveRole === 'DOCTOR' || effectiveRole === 'SUPER_ADMIN') && !isDoctorInfoPage) ? "lg:ml-64" : "",
      className
    )}>
      <div className={cn(
        "p-4 lg:pl-6 lg:pr-4",
        effectiveRole === 'PATIENT' || isDoctorInfoPage
          ? (
              (isPatientReferralsPage || isPatientProfilePage)
                ? "pt-[88px] pb-4 lg:pt-20 lg:pb-4" // No bottom nav on referrals/profile pages
                : "pt-[88px] pb-24 lg:pt-20 lg:pb-24" // Patients: mobile header + desktop header, bottom navigation
            )
          : "pt-[88px] pb-24 lg:pt-6 lg:pb-4" // Doctors/Admins: mobile header, no desktop header
      )}>
        {children}
      </div>
    </div>
  );
} 