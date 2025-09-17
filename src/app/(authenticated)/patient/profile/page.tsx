'use client';

import { useSession, signOut } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useState, useCallback, useEffect } from "react";
import { 
  ArrowRightOnRectangleIcon, 
  CameraIcon,
  UserIcon,
  EnvelopeIcon,
  CalendarIcon,
  ClockIcon,
  ChartBarIcon,
  UsersIcon,
  DocumentTextIcon,
  StarIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline';
import { Loader2, Menu, User as LucideUser, Share2, LogOut } from 'lucide-react';
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

// Translations for internationalization
const translations = {
  pt: {
    profile: 'Perfil',
    managePersonalInfo: 'Gerencie suas informações pessoais',
    personalInfo: 'Informações Pessoais',
    name: 'Nome',
    email: 'Email',
    notInformed: 'Não informado',
    save: 'Salvar',
    cancel: 'Cancelar',
    editProfile: 'Editar Perfil',
    signOut: 'Sair',
    accountInfo: 'Informações da Conta',
    memberSince: 'Membro desde',
    lastAccess: 'Último acesso',
    statistics: 'Estatísticas',
    myProgress: 'Meu Progresso',
    patients: 'Pacientes',
    protocols: 'Protocolos',
    templates: 'Templates',
    completed: 'Concluídos',
    active: 'Ativos',
    roles: {
      doctor: 'Doctor',
      superAdmin: 'Super Admin',
      patient: 'Paciente',
      user: 'Usuário'
    },
    notAvailable: 'N/A'
  },
  en: {
    profile: 'Profile',
    managePersonalInfo: 'Manage your personal information',
    personalInfo: 'Personal Information',
    name: 'Name',
    email: 'Email',
    notInformed: 'Not informed',
    save: 'Save',
    cancel: 'Cancel',
    editProfile: 'Edit Profile',
    signOut: 'Sign Out',
    accountInfo: 'Account Information',
    memberSince: 'Member since',
    lastAccess: 'Last access',
    statistics: 'Statistics',
    myProgress: 'My Progress',
    patients: 'Patients',
    protocols: 'Protocols',
    templates: 'Templates',
    completed: 'Completed',
    active: 'Active',
    roles: {
      doctor: 'Doctor',
      superAdmin: 'Super Admin',
      patient: 'Patient',
      user: 'User'
    },
    notAvailable: 'N/A'
  }
};

interface UserStats {
  totalPatients?: number;
  totalProtocols?: number;
  totalTemplates?: number;
  completedProtocols?: number;
  activeProtocols?: number;
  joinedDate?: string;
  lastLogin?: string;
}

export default function ProfilePage({ isDarkTheme, brandColors, publicClinic, forcedSlug }: { isDarkTheme?: boolean; brandColors?: { bg?: string | null; fg?: string | null }; publicClinic?: { logo?: string | null; name?: string | null }; forcedSlug?: string } = {}) {
  const router = useRouter();
  const { data: session, update } = useSession();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [originalName, setOriginalName] = useState('');
  const [email, setEmail] = useState('');
  const [image, setImage] = useState('');
  const [imageKey, setImageKey] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [userRole, setUserRole] = useState<'DOCTOR' | 'PATIENT' | 'SUPER_ADMIN' | null>(null);
  const [userStats, setUserStats] = useState<UserStats>({});
  const [language, setLanguage] = useState<'pt' | 'en'>('pt');
  const [clinicSlug, setClinicSlug] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const toggleMenu = () => setMenuOpen((prev) => !prev);

  // Resolve effective clinic/page slug for links and logout
  const effectiveSlug = (() => {
    if (forcedSlug && typeof forcedSlug === 'string' && forcedSlug.trim()) return forcedSlug.trim();
    if (clinicSlug && clinicSlug.trim()) return clinicSlug.trim();
    if (typeof window !== 'undefined') {
      const seg = (window.location.pathname.split('/').filter(Boolean)[0] || '').trim();
      if (seg) return seg;
    }
    return '';
  })();

  // Detect browser language
  useEffect(() => {
    const browserLanguage = navigator.language || navigator.languages?.[0] || 'pt';
    const detectedLang = browserLanguage.toLowerCase().startsWith('en') ? 'en' : 'pt';
    setLanguage(detectedLang);
  }, []);

  const t = translations[language];

  // Load user data and stats
  useEffect(() => {
    const loadUserData = async () => {
      if (session?.user?.id) {
        try {
          setLoading(true);
          
          // Set basic data from session
          setName(session.user.name || '');
          setOriginalName(session.user.name || '');
          setEmail(session.user.email || '');
          // Add cache-busting to initial image load to ensure fresh image
          const initialImage = session.user.image;
          setImage(initialImage ? `${initialImage}?t=${Date.now()}` : '');
          setImageKey(prev => prev + 1); // Force initial render

          // Detect user role
          const roleResponse = await fetch('/api/auth/role');
          if (roleResponse.ok) {
            const roleData = await roleResponse.json();
            setUserRole(roleData.role);

            // Redirect doctors to their specific profile page
            if (roleData.role === 'DOCTOR' || roleData.role === 'SUPER_ADMIN') {
              router.push('/doctor/profile');
              return;
            }

            // Load stats based on role
            if (roleData.role === 'PATIENT') {
              const statsResponse = await fetch('/api/patient/stats');
              if (statsResponse.ok) {
                const stats = await statsResponse.json();
                setUserStats(stats);
              }

              // Get clinic slug for logout redirect (best effort; forcedSlug may already cover this)
              try {
                const clinicSlugResponse = await fetch('/api/patient/clinic-slug', { cache: 'no-store' });
                if (clinicSlugResponse.ok) {
                  const clinicData = await clinicSlugResponse.json();
                  if (clinicData?.clinicSlug) setClinicSlug(clinicData.clinicSlug);
                }
              } catch {}
            }
          } else {
            setUserRole('PATIENT');
          }
        } catch (error) {
          console.error('Error loading user data:', error);
          setUserRole('PATIENT');
        } finally {
          setLoading(false);
        }
      }
    };

    loadUserData();
  }, [session]);

  // Determine if should use light theme (doctors/admins) or dark theme (patients)
  const isLightTheme = userRole === 'DOCTOR' || userRole === 'SUPER_ADMIN';

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch('/api/upload-image', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Failed to upload image');

      const data = await response.json();
      
      // Immediately update the image state with cache-busting
      const imageUrlWithCacheBust = `${data.url}?t=${Date.now()}`;
      setImage(imageUrlWithCacheBust);
      setImageKey(prev => prev + 1); // Force re-render
      
      // Update session and save to database
      await handleSave(data.url); // Save original URL to database
      
      // Force refresh to update navigation and other components
      router.refresh();
      
      // Add a small delay to ensure all components are updated
      setTimeout(() => {
        setImageKey(prev => prev + 1);
      }, 100);
    } catch (error) {
      console.error('Upload error:', error);
      // Reset file input on error
      const fileInput = document.getElementById('image-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async (newImage?: string) => {
    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name, 
          image: newImage || image 
        }),
      });

      if (!response.ok) throw new Error('Failed to update profile');

      // Update session with fresh data
      await update({
        ...session,
        user: {
          ...session?.user,
          name,
          image: newImage || image,
        },
      });

      setIsEditing(false);
      
      // Force refresh of navigation component
      router.refresh();
    } catch (error) {
      console.error('Save error:', error);
      throw error; // Re-throw to handle in calling function
    }
  };

  const getRoleDisplay = () => {
    switch (userRole) {
      case 'DOCTOR':
        return { label: t.roles.doctor, color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: UserIcon };
      case 'SUPER_ADMIN':
        return { label: t.roles.superAdmin, color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', icon: ShieldCheckIcon };
      case 'PATIENT':
        return { label: t.roles.patient, color: 'bg-turquoise/20 text-turquoise border-turquoise/30', icon: UsersIcon };
      default:
        return { label: t.roles.user, color: 'bg-gray-500/20 text-gray-400 border-gray-500/30', icon: UserIcon };
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return t.notAvailable;
    const date = new Date(dateString);
    return language === 'en' 
      ? date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : date.toLocaleDateString('pt-BR', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const handleCancelEdit = () => {
    setName(originalName);
    setIsEditing(false);
  };

  const handleSaveProfile = async () => {
    try {
      setIsSaving(true);
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (!res.ok) {
        throw new Error('Failed to update profile');
      }
      setOriginalName(name);
      await update?.();
      setIsEditing(false);
    } catch (e) {
      console.error('Error saving profile', e);
    } finally {
      setIsSaving(false);
    }
  };

  // Loading state
  if (!session || loading) {
    return (
      <div className={`min-h-screen ${isDarkTheme ? 'text-gray-100' : 'text-gray-900'}`}>
        <div className="max-w-5xl mx-auto px-4 lg:px-6">
          <div className="space-y-4 lg:space-y-6 pt-8 lg:pt-10">
            {/* Single Personal Information Card - Skeleton */}
            <div className="grid grid-cols-1 gap-4 lg:gap-6">
              <div className={`${isDarkTheme ? 'bg-white/5 ring-1 ring-white/10' : 'bg-white ring-1 ring-gray-100'} rounded-2xl shadow-sm`}>
                <div className="p-4 lg:p-5">
                  {/* Title skeleton */}
                  <div className="text-center mb-4 lg:mb-6">
                    <div className={`h-6 lg:h-7 rounded w-48 mx-auto animate-pulse ${isDarkTheme ? 'bg-white/10' : 'bg-gray-100'}`}></div>
                  </div>
                  {/* Avatar skeleton */}
                  <div className="mb-2 flex justify-center">
                    <div className={`relative w-28 h-28 lg:w-32 lg:h-32 rounded-full overflow-hidden border-2 shadow-sm ${isDarkTheme ? 'bg-white/10 border-white/20' : 'bg-white'}`}>
                      <div className={`w-full h-full animate-pulse ${isDarkTheme ? 'bg-white/10' : 'bg-gray-100'}`}></div>
                    </div>
                  </div>
                  {/* Fields skeleton */}
                  <div className="p-0 lg:p-0 space-y-5 lg:space-y-7 flex flex-col items-center text-center">
                    <div className="space-y-2 w-full max-w-md mx-auto">
                      <div className={`h-4 rounded w-16 mx-auto animate-pulse ${isDarkTheme ? 'bg-white/10' : 'bg-gray-200'}`}></div>
                      <div className={`h-11 lg:h-12 rounded-full animate-pulse ${isDarkTheme ? 'bg-white/10' : 'bg-gray-100'}`}></div>
                    </div>
                    <div className="space-y-2 w-full max-w-md mx-auto">
                      <div className={`h-4 rounded w-14 mx-auto animate-pulse ${isDarkTheme ? 'bg-white/10' : 'bg-gray-200'}`}></div>
                      <div className={`h-11 lg:h-12 rounded-full animate-pulse ${isDarkTheme ? 'bg-white/10' : 'bg-gray-100'}`}></div>
                    </div>
                    {/* Actions skeleton */}
                    <div className="pt-2 lg:pt-3 space-y-3 w-full max-w-md mx-auto">
                      <div className={`h-11 lg:h-12 rounded-full animate-pulse ${isDarkTheme ? 'bg-white/10' : 'bg-gray-100'}`}></div>
                      <div className={`h-11 lg:h-12 rounded-full animate-pulse ${isDarkTheme ? 'bg-white/10' : 'bg-gray-100'}`}></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isDarkTheme ? 'text-gray-100' : 'text-gray-900'}`}>
        {/* Main content */}
        <div className="max-w-6xl mx-auto px-3 lg:px-6">
          <div className="space-y-4 lg:space-y-6 pt-14 lg:pt-10">
            {/* Clinic Logo Header (matches referrals) */}
            {publicClinic?.logo && (
              <div className="flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${publicClinic.logo}${publicClinic.logo.includes('?') ? '&' : '?'}v=${typeof window !== 'undefined' ? Date.now() : '1'}`}
                  alt={publicClinic?.name || 'Clinic'}
                  className="h-16 w-auto object-contain"
                />
              </div>
            )}

            {/* Single Personal Information Card */}
            <div className="grid grid-cols-1 gap-4 lg:gap-6">
              <Card className={`${isDarkTheme ? 'bg-transparent border-0 shadow-none text-gray-100' : 'bg-white border border-gray-200 rounded-xl shadow-sm'}`}>
                <CardHeader className="p-4 lg:p-5">
                  <CardTitle className={`text-base lg:text-lg font-semibold text-center ${isDarkTheme ? 'text-gray-100' : 'text-gray-900'}`}>
                    {t.personalInfo}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 lg:p-6 pt-0 space-y-5 lg:space-y-6 flex flex-col items-center">
                  {/* Avatar */}
                  <div className="mb-1">
                    <div className={`relative w-24 h-24 lg:w-28 lg:h-28 rounded-full overflow-hidden border ${isDarkTheme ? 'bg-white/10 border-white/15' : 'bg-white border-gray-200'}`}>
                      {image ? (
                        <Image
                          key={`profile-image-${imageKey}`}
                          src={image}
                          alt="Profile"
                          fill
                          className="object-cover"
                          unoptimized={true}
                          priority={true}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <UserIcon className={`h-7 w-7 lg:h-8 lg:w-8 ${isDarkTheme ? 'text-gray-400' : 'text-gray-400'}`} />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Name */}
                  <div className="space-y-2 w-full max-w-md mx-auto">
                    <label className={`text-sm lg:text-base font-medium flex items-center gap-2 ${isDarkTheme ? 'text-gray-200' : 'text-gray-800'}`}>
                      <UserIcon className="h-4 w-4" />
                      <span>{t.name}</span>
                    </label>
                    {isEditing ? (
                      <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className={`text-base font-medium px-4 py-3 lg:px-4 lg:py-3 rounded-lg border focus-visible:ring-0 focus-visible:outline-none ${isDarkTheme ? 'text-gray-100 bg-white/10 border-white/15' : 'text-gray-900 bg-white border-gray-200'}`}
                      />
                    ) : (
                      <p className={`text-base font-medium px-4 py-3 lg:px-4 lg:py-3 rounded-lg border ${isDarkTheme ? 'text-gray-100 bg-white/10 border-white/15' : 'text-gray-900 bg-gray-50 border-gray-100'}`}>
                        {name || t.notInformed}
                      </p>
                    )}
                  </div>

                  {/* Email */}
                  <div className="space-y-2 w-full max-w-md mx-auto">
                    <label className={`text-sm lg:text-base font-medium flex items-center gap-2 ${isDarkTheme ? 'text-gray-200' : 'text-gray-800'}`}>
                      <EnvelopeIcon className="h-4 w-4" />
                      <span>{t.email}</span>
                    </label>
                    <p className={`text-base font-medium px-4 py-3 lg:px-4 lg:py-3 rounded-lg border ${isDarkTheme ? 'text-gray-100 bg-white/10 border-white/15' : 'text-gray-900 bg-gray-50 border-gray-100'}`}>
                      {email || t.notInformed}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="pt-2 lg:pt-3 space-y-3 w-full max-w-md mx-auto">
                    {isEditing ? (
                      <>
                        <Button
                          className={`w-full rounded-lg h-11 lg:h-11 font-semibold text-base`}
                          style={{ background: 'var(--btn-bg)', color: 'var(--btn-fg)' } as React.CSSProperties}
                          onClick={handleSaveProfile}
                          disabled={isSaving}
                        >
                          {isSaving ? '...' : t.save}
                        </Button>
                        <Button
                          variant="ghost"
                          className={`w-full rounded-lg h-11 lg:h-11 font-medium text-base ${isDarkTheme ? 'text-gray-300 hover:bg-white/10 border border-white/15' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100 border border-gray-200'}`}
                          style={{ boxShadow: 'none' } as React.CSSProperties}
                          onClick={handleCancelEdit}
                          disabled={isSaving}
                        >
                          {t.cancel}
                        </Button>
                      </>
                    ) : (
                      <Button
                        className={`w-full rounded-lg h-11 lg:h-11 font-semibold text-base`}
                        style={{ background: 'var(--btn-bg)', color: 'var(--btn-fg)' } as React.CSSProperties}
                        onClick={() => setIsEditing(true)}
                      >
                        {t.editProfile}
                      </Button>
                    )}
                    <Button 
                      variant="ghost"
                      className={`w-full rounded-lg h-11 lg:h-11 font-medium text-base ${isDarkTheme ? 'text-gray-300 hover:bg-white/10 border border-white/15' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100 border border-gray-200'}`}
                      style={{ boxShadow: 'none' } as React.CSSProperties}
                      onClick={() => {
                        const slug = effectiveSlug;
                        if (slug) {
                          signOut({ callbackUrl: `/${slug}/login` });
                        } else {
                          signOut({ callbackUrl: '/auth/signin' });
                        }
                      }}
                    >
                      <ArrowRightOnRectangleIcon className="h-5 w-5 mr-2" style={{ color: 'var(--btn-bg)' }} />
                      {t.signOut}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
            {/* Brand strip removed (use wrapper footer) */}
          </div>
        </div>

        {/* Footer removed to match referrals (use only FAB/hamburger) */}

        {/* Floating Action Menu */}
        <div className="fixed bottom-6 right-6 z-50">
          <div className="relative">
            <button
              onClick={toggleMenu}
              className={`h-10 w-10 rounded-full text-white shadow-lg focus:outline-none focus:ring-2 flex items-center justify-center ${isDarkTheme ? 'bg-white/10 hover:bg-white/15 focus:ring-white/20' : 'bg-turquoise hover:bg-turquoise/90 focus:ring-turquoise/40'}`}
              aria-label="Toggle menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            {menuOpen && (
              <div className={`absolute bottom-14 right-0 rounded-lg shadow-xl w-56 p-2 ${isDarkTheme ? 'bg-[#111111] border border-white/10' : 'bg-white border border-gray-200'}`}>
                <Link href={effectiveSlug ? `/${effectiveSlug}/profile` : '/patient/profile'} className={`flex items-center px-3 py-2 text-sm rounded-md ${isDarkTheme ? 'text-gray-200 hover:bg-white/10' : 'text-gray-700 hover:bg-gray-50'}`}>
                  <LucideUser className={`mr-2 h-4 w-4 ${isDarkTheme ? 'text-gray-400' : 'text-gray-600'}`} />
                  Profile
                </Link>
                <Link href={effectiveSlug ? `/${effectiveSlug}/referrals` : '/patient/referrals'} className={`flex items-center px-3 py-2 text-sm rounded-md ${isDarkTheme ? 'text-gray-200 hover:bg-white/10' : 'text-gray-700 hover:bg-gray-50'}`}>
                  <Share2 className={`mr-2 h-4 w-4 ${isDarkTheme ? 'text-gray-400' : 'text-gray-600'}`} />
                  Referrals
                </Link>
                <button
                  onClick={() => signOut({ callbackUrl: effectiveSlug ? `/${effectiveSlug}/login` : '/' })}
                  className={`w-full flex items-center px-3 py-2 text-sm rounded-md ${isDarkTheme ? 'text-gray-200 hover:bg-white/10' : 'text-gray-700 hover:bg-gray-50'}`}
                >
                  <LogOut className={`mr-2 h-4 w-4 ${isDarkTheme ? 'text-gray-400' : 'text-gray-600'}`} />
                  Sign out
                </button>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}