'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useClinic } from '@/contexts/clinic-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { 
  Users, 
  Building2, 
  CreditCard, 
  UserPlus, 
  Settings, 
  BarChart3,
  FileText,
  Trash2,
  Plus,
  CheckCircle,
  Mail,
  X,
  BuildingIcon,
  CameraIcon,
  Loader2,
  Copy
} from 'lucide-react';
import Link from 'next/link';

interface ClinicData {
  id: string;
  name: string;
  description: string | null;
  logo: string | null;
  slug: string | null;
  ownerId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  owner: {
    id: string;
    name: string | null;
    email: string | null;
  };
  members: {
    id: string;
    role: string;
    isActive: boolean;
    joinedAt: string;
    user: {
      id: string;
      name: string | null;
      email: string | null;
      role: string;
    };
  }[];
  subscription?: {
    id: string;
    status: string;
    maxDoctors: number;
    startDate: string;
    endDate: string | null;
    plan: {
      name: string;
      maxPatients: number;
      maxProtocols: number;
      maxCourses: number;
    };
  } | null;
}

interface ClinicStats {
  totalDoctors: number;
  totalProtocols: number;
  totalPatients: number;
  totalCourses: number;
}

export default function ClinicDashboard() {
  const { data: session } = useSession();
  const router = useRouter();
  const { currentClinic, refreshClinics } = useClinic();
  const [stats, setStats] = useState<ClinicStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('DOCTOR');
  const [addingMember, setAddingMember] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [editingClinicName, setEditingClinicName] = useState('');
  const [editingClinicDescription, setEditingClinicDescription] = useState('');
  const [editingClinicLogo, setEditingClinicLogo] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [editingSubdomain, setEditingSubdomain] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://yourapp.com');
  // Branding settings
  const [editingTheme, setEditingTheme] = useState<'LIGHT' | 'DARK'>('LIGHT');
  const [editingButtonColor, setEditingButtonColor] = useState<string>('');
  const [editingButtonTextColor, setEditingButtonTextColor] = useState<string>('');
  
  // Notification states
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [successTitle, setSuccessTitle] = useState('');
  const [showInviteDialog, setShowInviteDialog] = useState(false);

  useEffect(() => {
    if (!session?.user?.id) {
      router.push('/auth/signin');
      return;
    }

    fetchClinicData();
  }, [session, router, currentClinic]);

  useEffect(() => {
    // Set base URL from current location
    if (typeof window !== 'undefined') {
      setBaseUrl(window.location.origin);
    }
  }, []);

  // Initialize subdomain field ONLY when modal first opens, not on context changes
  useEffect(() => {
    if (!showSettingsModal || !currentClinic) return;
    // Only set if we don't already have a value (prevents overwriting during editing)
    if (!editingSubdomain) {
      const ctxSub = (currentClinic as any)?.subdomain as string | undefined;
      const next = (ctxSub && ctxSub.length > 0) ? ctxSub : (currentClinic.slug || '');
      console.log('[MODAL] Modal opened, initializing subdomain:', next);
      setEditingSubdomain(next);
    }
  }, [showSettingsModal]);

  const baseDomain = useMemo(() => {
    const envBase = process.env.NEXT_PUBLIC_APP_BASE_DOMAIN?.toLowerCase().trim();
    if (envBase) return envBase;
    if (typeof window === 'undefined') return '';
    const host = window.location.host.toLowerCase();
    const noPort = host.split(':')[0];
    const parts = noPort.split('.');
    if (parts.length <= 2) return noPort; // localhost or domain.tld
    if (noPort.endsWith('nip.io') && parts.length >= 3) {
      return parts.slice(-3).join('.');
    }
    return parts.slice(-2).join('.');
  }, []);

  const fetchClinicData = async () => {
    if (!currentClinic) return;
    
    try {
      setLoading(true);
      
      // Check if user can manage clinic settings
      // Owner OR roles MANAGER/ADMIN (ADMIN kept for legacy compatibility)
      const userIsAdmin = currentClinic.ownerId === session?.user?.id ||
        currentClinic.members.some((m: any) => m.user.id === session?.user?.id && (
          String(m.role).toUpperCase() === 'OWNER' ||
          String(m.role).toUpperCase() === 'MANAGER' ||
          String(m.role).toUpperCase() === 'ADMIN'
        ));
      setIsAdmin(userIsAdmin);

      // Initialize editing values
      setEditingClinicName(currentClinic.name);
      setEditingClinicDescription(currentClinic.description || '');
      setLogoPreview(currentClinic.logo || null);
      setEditingClinicLogo(false);
      // Subdomain initial value (prefer explicit subdomain, fallback to slug)
      setEditingSubdomain(((currentClinic as any)?.subdomain as string) || currentClinic.slug || '');
      // Branding initial values
      // @ts-expect-error theme fields may not exist yet in type
      setEditingTheme((currentClinic.theme as any) === 'DARK' ? 'DARK' : 'LIGHT');
      // @ts-expect-error branding fields may not exist yet in type
      setEditingButtonColor((currentClinic.buttonColor as any) || '');
      // @ts-expect-error branding fields may not exist yet in type
      setEditingButtonTextColor((currentClinic.buttonTextColor as any) || '');

      // Fetch statistics for current clinic
      const statsResponse = await fetch(`/api/clinic/stats?clinicId=${currentClinic.id}`);
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setStats(statsData.stats);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const addMember = async () => {
    if (!newMemberEmail.trim()) return;

    try {
      setAddingMember(true);
      
      const response = await fetch('/api/clinic/members', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: newMemberEmail,
          role: newMemberRole
        }),
      });

      if (response.ok) {
        setNewMemberEmail('');
        setNewMemberRole('DOCTOR');
        setShowInviteDialog(false); // Close invite dialog
        fetchClinicData(); // Reload data
        
        // Show beautiful success dialog
        setSuccessTitle('Convite Enviado!');
        setSuccessMessage(`O convite foi enviado com sucesso para ${newMemberEmail}. O médico receberá um email para se juntar à equipe.`);
        setShowSuccessDialog(true);
      } else {
        const error = await response.json();
        // Show error dialog
        setSuccessTitle('Erro ao Enviar Convite');
        setSuccessMessage(error.error || 'Erro ao adicionar membro à equipe');
        setShowSuccessDialog(true);
      }
    } catch (error) {
      console.error('Error adding member:', error);
      setSuccessTitle('Erro ao Enviar Convite');
      setSuccessMessage('Erro interno do servidor');
      setShowSuccessDialog(true);
    } finally {
      setAddingMember(false);
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be smaller than 5MB');
      return;
    }

    setLogoFile(file);
    
    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setLogoPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const uploadLogo = async (): Promise<string | null> => {
    if (!logoFile) return null;

    try {
      setUploadingLogo(true);
      const formData = new FormData();
      formData.append('image', logoFile);

      const response = await fetch('/api/upload-image', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Failed to upload logo');

      const data = await response.json();
      return data.url;
    } catch (error) {
      console.error('Logo upload error:', error);
      throw error;
    } finally {
      setUploadingLogo(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSavingSettings(true);
      
      let logoUrl = currentClinic?.logo;
      
      // Upload logo if a new file was selected
      if (logoFile) {
        logoUrl = await uploadLogo();
      }

      const response = await fetch('/api/clinic/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: editingClinicName,
          description: editingClinicDescription,
          logo: logoUrl,
          theme: editingTheme,
          buttonColor: editingButtonColor || undefined,
          buttonTextColor: editingButtonTextColor || undefined,
          subdomain: (editingSubdomain || '').trim() || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save settings');
      }

      const result = await response.json();
      console.log('[MODAL] PUT response clinic.subdomain:', result.clinic?.subdomain);

      // Update local state with the response data
      if (currentClinic && result.clinic) {
        // Note: The clinic context will handle updating the clinic data
        setEditingClinicName(result.clinic.name);
        setEditingClinicDescription(result.clinic.description || '');
        setLogoPreview(result.clinic.logo || null);
        // Sync subdomain from server to avoid perceived revert
        const serverSubdomain = ((result.clinic as any)?.subdomain as string) || result.clinic.slug || editingSubdomain;
        console.log('[MODAL] Setting editingSubdomain to:', serverSubdomain);
        setEditingSubdomain(serverSubdomain);
      }
      // DON'T refresh context immediately - it can overwrite our freshly saved value
      // The context will refresh naturally on next navigation or manual refresh
      console.log('[MODAL] Skipping immediate refresh to preserve saved subdomain value');
      
      // Reset logo editing state
      setEditingClinicLogo(false);
      setLogoFile(null);
      setLogoPreview(null);

      // Show success message
      setSuccessTitle('Settings Updated');
      setSuccessMessage('Clinic settings have been updated successfully.');
      setShowSuccessDialog(true);
      
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Failed to save settings. Please try again.');
    } finally {
      setSavingSettings(false);
    }
  };

  const copyClinicUrl = async () => {
    if (currentClinic?.slug) {
      const url = `${baseUrl}/login/${currentClinic.slug}`;
      try {
        await navigator.clipboard.writeText(url);
        setSuccessTitle('URL Copied!');
        setSuccessMessage('The clinic URL has been copied to your clipboard.');
        setShowSuccessDialog(true);
      } catch (error) {
        console.error('Failed to copy URL:', error);
      }
    }
  };

  const subdomainUrl = useMemo(() => {
    const sub = editingSubdomain || currentClinic?.slug;
    if (!sub || !baseDomain) return '';
    return `https://${sub}.${baseDomain}`;
  }, [editingSubdomain, currentClinic?.slug, baseDomain]);

  const copySubdomainUrl = async (path: string = '') => {
    if (!subdomainUrl) return;
    const full = `${subdomainUrl}${path}`;
    try {
      await navigator.clipboard.writeText(full);
      setSuccessTitle('URL Copied!');
      setSuccessMessage('The subdomain URL has been copied to your clipboard.');
      setShowSuccessDialog(true);
    } catch (e) {
      console.error('Failed to copy subdomain URL:', e);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <div className="lg:ml-64">
          <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24">
            
            {/* Header Skeleton */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 mb-8">
              <div className="space-y-3">
                <div className="h-8 bg-gray-200 rounded-lg w-48 animate-pulse"></div>
                <div className="h-5 bg-gray-100 rounded-lg w-64 animate-pulse"></div>
              </div>
              <div className="flex gap-3">
                <div className="h-10 bg-gray-200 rounded-xl w-24 animate-pulse"></div>
                <div className="h-10 bg-gray-100 rounded-xl w-32 animate-pulse"></div>
              </div>
            </div>

            {/* Stats Cards Skeleton */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-white border border-gray-200 shadow-lg rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="h-4 bg-gray-200 rounded w-16 animate-pulse"></div>
                    <div className="h-8 w-8 bg-gray-100 rounded-xl animate-pulse"></div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-7 bg-gray-200 rounded w-8 animate-pulse"></div>
                    <div className="h-3 bg-gray-100 rounded w-20 animate-pulse"></div>
                  </div>
                </div>
              ))}
            </div>

            {/* Main Content Skeleton */}
            <div className="grid lg:grid-cols-3 gap-4">
              {/* Team Section Skeleton - 2 columns */}
              <div className="lg:col-span-2 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <div className="h-6 bg-gray-200 rounded w-24 animate-pulse"></div>
                    <div className="h-4 bg-gray-100 rounded w-48 animate-pulse"></div>
                  </div>
                  <div className="h-10 bg-gray-200 rounded-xl w-24 animate-pulse"></div>
                </div>
                
                <div className="bg-white border border-gray-200 shadow-lg rounded-2xl">
                  <div className="divide-y divide-gray-100">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="p-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="h-12 w-12 bg-gray-200 rounded-xl animate-pulse"></div>
                            <div className="space-y-2">
                              <div className="h-4 bg-gray-200 rounded w-32 animate-pulse"></div>
                              <div className="h-3 bg-gray-100 rounded w-40 animate-pulse"></div>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="space-y-2">
                              <div className="h-6 bg-gray-100 rounded-xl w-16 animate-pulse"></div>
                              <div className="h-3 bg-gray-100 rounded w-12 animate-pulse"></div>
                            </div>
                            <div className="h-8 w-8 bg-gray-100 rounded-xl animate-pulse"></div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Sidebar Skeleton - 1 column */}
              <div className="space-y-4">
                {/* Subscription Card Skeleton */}
                <div className="bg-white border border-gray-200 shadow-lg rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="h-6 bg-gray-200 rounded w-24 animate-pulse"></div>
                    <div className="h-6 bg-gray-100 rounded-xl w-16 animate-pulse"></div>
                  </div>
                  <div className="space-y-6">
                    <div className="p-6 bg-gray-50 rounded-2xl">
                      <div className="h-6 bg-gray-200 rounded w-32 mx-auto animate-pulse"></div>
                      <div className="h-4 bg-gray-100 rounded w-40 mx-auto mt-2 animate-pulse"></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="p-4 bg-gray-50 rounded-xl text-center">
                          <div className="h-5 bg-gray-200 rounded w-8 mx-auto animate-pulse"></div>
                          <div className="h-3 bg-gray-100 rounded w-12 mx-auto mt-1 animate-pulse"></div>
                        </div>
                      ))}
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

  if (!currentClinic) {
    return (
      <div className="min-h-screen bg-white">
        <div className="lg:ml-64">
          <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24 flex items-center justify-center min-h-[calc(100vh-88px)]">
            <Card className="w-full max-w-md bg-white border-gray-200 shadow-lg rounded-2xl">
              <CardHeader className="text-center p-6">
                <CardTitle className="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">Clinic not found</CardTitle>
                <CardDescription className="text-gray-600 font-medium">
                  You are not associated with any clinic.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 pt-0">
                <Button onClick={() => router.push('/doctor/dashboard')} className="w-full bg-[#5154e7] hover:bg-[#4145d1] text-white rounded-xl h-12 font-semibold">
                  Back to Dashboard
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-white"
      style={currentClinic ? ({ ['--btn-bg' as any]: (currentClinic as any).buttonColor || '#111827', ['--btn-fg' as any]: (currentClinic as any).buttonTextColor || '#ffffff' } as any) : undefined}
    >
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24 bg-gray-50">
          
          {/* Header */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
            <div className="flex items-start gap-3">
              {/* Logo */}
              {(() => {
                const logoUrlWithCache = currentClinic.logo
                  ? `${currentClinic.logo}${currentClinic.logo.includes('?') ? '&' : '?'}v=${typeof window !== 'undefined' ? Date.now() : '1'}`
                  : null;
                return (
                  <div className="h-12 w-12 rounded-xl bg-gray-100 overflow-hidden flex items-center justify-center shrink-0">
                {logoUrlWithCache ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrlWithCache} alt={currentClinic.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs font-semibold text-gray-600">
                    {currentClinic.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2)}
                  </span>
                )}
              </div>
                );
              })()}
              <div className="space-y-1">
                <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">{currentClinic.name}</h1>
                <p className="text-sm text-gray-600">{currentClinic.description || 'No description available'}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {/* Location */}
                  {(currentClinic.city || currentClinic.state) && (
                    <span className="text-xs text-gray-500 font-medium">
                      {(currentClinic.city || '') + (currentClinic.city && currentClinic.state ? ', ' : '') + (currentClinic.state || '')}
                    </span>
                  )}
                  {/* Website */}
                  {currentClinic.website && (
                    <a
                      href={currentClinic.website.startsWith('http') ? currentClinic.website : `https://${currentClinic.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-[#5154e7] hover:underline"
                    >
                      {currentClinic.website.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                  {/* Public page quick link */}
                  {currentClinic.slug && (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-gray-500">Slug:</span>
                      <Link
                        href={`/${currentClinic.slug}`}
                        className="text-xs font-medium text-gray-700 hover:text-gray-900 underline decoration-dotted"
                      >
                        /{currentClinic.slug}
                      </Link>
                    </div>
                  )}
                  {baseDomain && (currentClinic.slug || (currentClinic as any)?.subdomain) && (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-gray-500">Subdomain:</span>
                      <a
                        href={`https://${((currentClinic as any)?.subdomain || currentClinic.slug)}.${baseDomain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-[#5154e7] hover:underline"
                      >
                        {((currentClinic as any)?.subdomain || currentClinic.slug)}.{baseDomain}
                      </a>
                      <button
                        type="button"
                        onClick={async () => {
                          const sub = ((currentClinic as any)?.subdomain || currentClinic.slug);
                          if (!sub || !baseDomain) return;
                          const url = `https://${sub}.${baseDomain}`;
                          try {
                            await navigator.clipboard.writeText(url);
                            setSuccessTitle('URL Copied!');
                            setSuccessMessage('The subdomain URL has been copied to your clipboard.');
                            setShowSuccessDialog(true);
                          } catch (e) {
                            console.error('Failed to copy subdomain URL:', e);
                          }
                        }}
                        className="text-[11px] px-2 py-1 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50"
                      >
                        Copy
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge 
                variant={currentClinic.subscription?.status === 'ACTIVE' ? 'default' : 'secondary'}
                className={currentClinic.subscription?.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700 border-emerald-200 font-semibold px-2 py-0.5 rounded-full text-[11px]' : 'font-semibold px-2 py-0.5 rounded-full text-[11px]'}
              >
                {currentClinic.subscription?.status || 'No Plan'}
              </Badge>
              {isAdmin && (
                <Button 
                  variant="outline"
                  size="sm"
                  className="border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:text-gray-900 rounded-full h-8 px-3 text-xs font-medium"
                  onClick={() => setShowSettingsModal(true)}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </Button>
              )}
            </div>
          </div>

          {/* Stats removed per request */}

          {/* Main Content Grid */}
          <div className="grid lg:grid-cols-3 gap-4">
            
            {/* Team Section - Takes 2 columns */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Team Header (compact like dashboard) */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Team</h2>
                  <p className="text-xs text-gray-600 mt-1 font-medium">
                    {currentClinic.members.length} {currentClinic.members.length === 1 ? 'member' : 'members'}
                  </p>
                </div>
                {isAdmin && (
                  <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="rounded-full h-8 px-3 text-xs font-medium shadow-sm" style={{ backgroundColor: 'var(--btn-bg)', color: 'var(--btn-fg)' }}>
                        <UserPlus className="h-4 w-4 mr-2" />
                        Invite
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-white border border-gray-200 rounded-2xl p-0">
                      <DialogHeader className="px-4 py-3">
                        <DialogTitle className="text-sm font-semibold text-gray-900">Invite Doctor</DialogTitle>
                        <DialogDescription className="text-[11px] text-gray-600">
                          Add an existing doctor to your team. The doctor must already be registered in the system.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-3 px-4 pb-4 pt-0">
                        <div>
                          <Label htmlFor="email" className="text-gray-700 font-medium">Doctor's Email</Label>
                          <Input
                            id="email"
                            type="email"
                            placeholder="doctor@example.com"
                            value={newMemberEmail}
                            onChange={(e) => setNewMemberEmail(e.target.value)}
                            className="border-gray-300 focus:border-[#5154e7] focus:ring-[#5154e7] bg-white text-gray-900 placeholder:text-gray-500 rounded-lg h-9 mt-2"
                          />
                        </div>
                        <div>
                          <Label htmlFor="role" className="text-gray-700 font-medium">Role</Label>
                          <select
                            id="role"
                            value={newMemberRole}
                            onChange={(e) => setNewMemberRole(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:border-[#5154e7] focus:outline-none focus:ring-1 focus:ring-[#5154e7] mt-2 h-9"
                          >
                            <option value="DOCTOR">Doctor</option>
                            <option value="ADMIN">Administrator</option>
                            <option value="VIEWER">Viewer</option>
                          </select>
                        </div>
                        <div className="flex gap-2 pt-3">
                          <Button 
                            onClick={addMember} 
                            disabled={addingMember || !newMemberEmail.trim()}
                            className="flex-1 rounded-full h-8 text-xs font-medium shadow-sm"
                            style={{ backgroundColor: 'var(--btn-bg)', color: 'var(--btn-fg)' }}
                          >
                            {addingMember ? 'Sending invite...' : 'Send Invite'}
                          </Button>
                          <Button 
                            variant="outline"
                            onClick={() => setShowInviteDialog(false)}
                            className="border-gray-300 text-gray-800 hover:bg-gray-50 bg-white rounded-full h-8 text-xs font-medium"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>

              {/* Team Members (compact list like dashboard) */}
              <Card className="bg-white border border-gray-200 shadow-sm rounded-2xl">
                <CardContent className="p-0">
                  <div className="divide-y divide-gray-200">
                    {currentClinic.members.map((member) => (
                      <div key={member.id} className="py-3 px-2 hover:bg-gray-50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 min-w-0">
                            {/* Avatar */}
                            <div className="h-8 w-8 rounded-lg bg-gray-100 flex items-center justify-center text-[11px] font-semibold text-gray-600">
                              {member.user.name ? member.user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2) : member.user.email?.[0].toUpperCase()}
                            </div>
                            {/* User Info */}
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {member.user.name || member.user.email?.split('@')[0]}
                              </p>
                              <p className="text-xs text-gray-500 truncate">{member.user.email}</p>
                            </div>
                          </div>
                          {/* Role and Actions */}
                          <div className="flex items-center gap-3 shrink-0">
                            <Badge
                              variant="outline"
                              className={
                                member.role === 'ADMIN'
                                  ? 'bg-gray-900 text-white border-gray-900 font-medium rounded-full px-2 py-0.5 text-[11px]'
                                  : member.role === 'DOCTOR'
                                  ? 'bg-emerald-100 text-emerald-700 border-emerald-200 font-medium rounded-full px-2 py-0.5 text-[11px]'
                                  : 'bg-gray-100 text-gray-700 border-gray-200 font-medium rounded-full px-2 py-0.5 text-[11px]'
                              }
                            >
                              {member.role === 'ADMIN' ? 'Admin' : member.role === 'DOCTOR' ? 'Doctor' : 'Viewer'}
                            </Badge>
                            {isAdmin && member.user.id !== currentClinic.ownerId && (
                              <Button variant="ghost" size="sm" className="h-8 px-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-full">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar - Takes 1 column */}
            <div className="space-y-6">
              
              {/* Subscription Card (compact titles and badges) */}
              <Card className="bg-white border border-gray-200 shadow-sm rounded-2xl">
                <CardHeader className="flex flex-row items-center justify-between px-4 py-3">
                  <CardTitle className="text-sm font-semibold text-gray-900">Current Plan</CardTitle>
                  <Badge 
                    variant={currentClinic.subscription?.status === 'ACTIVE' ? 'default' : 'secondary'}
                    className={currentClinic.subscription?.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700 border-emerald-200 font-medium rounded-full px-2 py-0.5 text-[11px]' : 'font-medium rounded-full px-2 py-0.5 text-[11px]'}
                  >
                    {currentClinic.subscription?.status || 'Inactive'}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-4 px-4 pb-4 pt-0">
                  {currentClinic.subscription ? (
                    <>
                      {/* Plan Name and Price */}
                      <div className="text-center py-4 bg-gray-50 rounded-xl border border-gray-200">
                        <h3 className="text-sm font-semibold text-gray-900">{currentClinic.subscription.plan.name}</h3>
                        <p className="text-xs text-gray-600 mt-1 font-medium">
                          Renews on {currentClinic.subscription.endDate 
                            ? new Date(currentClinic.subscription.endDate).toLocaleDateString('en-US', { 
                              day: '2-digit', 
                              month: 'long' 
                            })
                            : 'No expiration'
                          }
                        </p>
                      </div>

                      {/* Quick stats removed per request */}

                      {isAdmin && (
                        <Button className="w-full h-8 rounded-full text-xs font-medium shadow-sm" style={{ backgroundColor: 'var(--btn-bg)', color: 'var(--btn-fg)' }} asChild>
                          <Link href="/clinic/subscription">
                            <CreditCard className="h-4 w-4 mr-2" />
                            Manage Plan
                          </Link>
                        </Button>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-6">
                      <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                        <CreditCard className="h-6 w-6 text-gray-400" />
                      </div>
                      <p className="text-sm text-gray-600 mb-4 font-medium">No active plan</p>
                      {isAdmin && (
                        <Button className="h-8 rounded-full text-xs font-medium shadow-sm" style={{ backgroundColor: 'var(--btn-bg)', color: 'var(--btn-fg)' }} asChild>
                          <Link href="/clinic/subscription">
                            <Plus className="h-4 w-4 mr-2" />
                            Choose Plan
                          </Link>
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Quick Actions (compact outline buttons like dashboard) */}
              <Card className="bg-white border border-gray-200 shadow-sm rounded-2xl">
                <CardHeader className="flex flex-row items-center justify-between px-4 py-3">
                  <CardTitle className="text-sm font-semibold text-gray-900">Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 px-4 pb-4 pt-0">
                  <Button variant="outline" className="w-full justify-start border-gray-300 text-gray-800 hover:bg-gray-50 bg-white rounded-full h-8 text-xs font-medium" asChild>
                    <Link href="/doctor/dashboard">
                      <BarChart3 className="h-4 w-4 mr-2" />
                      View Dashboard
                    </Link>
                  </Button>
                  <Button variant="outline" className="w-full justify-start border-gray-300 text-gray-800 hover:bg-gray-50 bg-white rounded-full h-8 text-xs font-medium" asChild>
                    <Link href="/patient/protocols">
                      <CheckCircle className="h-4 w-4 mr-2" />
                      View Protocols
                    </Link>
                  </Button>
                  {isAdmin && (
                    <Button 
                      variant="outline" 
                      className="w-full justify-start border-gray-300 text-gray-800 hover:bg-gray-50 bg-white rounded-full h-8 text-xs font-medium"
                      onClick={() => setShowSettingsModal(true)}
                    >
                      <Settings className="h-4 w-4 mr-2" />
                      Settings
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Settings Modal */}
          <Dialog open={showSettingsModal} onOpenChange={setShowSettingsModal}>
            <DialogContent className="bg-white border border-gray-200 rounded-2xl p-0 max-h-[85vh] overflow-y-auto max-w-2xl w-full overscroll-contain">
              <DialogHeader className="px-4 py-3">
                <DialogTitle className="text-sm font-semibold text-gray-900">Clinic Settings</DialogTitle>
                <DialogDescription className="text-[11px] text-gray-600">
                  Manage your clinic information
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 px-4 pb-4 pt-0">
                <div>
                  <Label htmlFor="clinic-name-edit" className="text-gray-700 font-medium">Clinic Name</Label>
                  <Input 
                    id="clinic-name-edit" 
                    value={editingClinicName} 
                    onChange={(e) => setEditingClinicName(e.target.value)}
                    disabled={!isAdmin}
                    className="border-gray-300 focus:border-[#5154e7] focus:ring-[#5154e7] bg-white text-gray-900 placeholder:text-gray-500 rounded-lg h-9 mt-2"
                  />
                </div>
                <div>
                  <Label htmlFor="clinic-description-edit" className="text-gray-700 font-medium">Description</Label>
                  <Input 
                    id="clinic-description-edit" 
                    value={editingClinicDescription} 
                    onChange={(e) => setEditingClinicDescription(e.target.value)}
                    disabled={!isAdmin}
                    className="border-gray-300 focus:border-[#5154e7] focus:ring-[#5154e7] bg-white text-gray-900 placeholder:text-gray-500 rounded-lg h-9 mt-2"
                  />
                </div>
                <div>
                  <Label htmlFor="clinic-slug-display" className="text-gray-700 font-medium">Clinic URL</Label>
                  <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-600 font-medium flex-1">
                        {currentClinic?.slug ? (
                          <>
                            <span className="text-gray-500">{baseUrl}/login/</span>
                            <span className="font-semibold text-gray-900">{currentClinic.slug}</span>
                          </>
                        ) : (
                          <span className="text-gray-400">No URL configured</span>
                        )}
                      </p>
                      {currentClinic?.slug && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={copyClinicUrl}
                          className="ml-2 h-8 w-8 p-0 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-full"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1">
                      This is your clinic's unique login URL that patients can use to access their accounts.
                    </p>
                  </div>
                </div>
                <div>
                  <Label htmlFor="clinic-subdomain-edit" className="text-gray-700 font-medium">Subdomain</Label>
                  <div className="mt-2">
                    <Input
                      id="clinic-subdomain-edit"
                      value={editingSubdomain}
                      onChange={(e) => setEditingSubdomain(e.target.value.toLowerCase())}
                      disabled={!isAdmin}
                      placeholder="ex: minha-clinica"
                      className="border-gray-300 focus:border-[#5154e7] focus:ring-[#5154e7] bg-white text-gray-900 placeholder:text-gray-500 rounded-lg h-9"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">Somente letras minúsculas, números e hífen (3 a 63 caracteres).</p>
                    {subdomainUrl && (
                      <div className="flex items-center gap-2 mt-2">
                        <a href={subdomainUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-[#5154e7] hover:underline">
                          {subdomainUrl}
                        </a>
                        <Button variant="outline" size="sm" onClick={() => copySubdomainUrl('')} className="h-7 px-2 text-xs rounded-full border-gray-300 text-gray-800 hover:bg-gray-50">
                          Copy
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <Label htmlFor="clinic-logo-edit" className="text-gray-700 font-medium">Clinic Logo</Label>
                  <div className="mt-2 space-y-3">
                    {/* Current Logo or Preview */}
                    <div className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden bg-gray-50">
                      {logoPreview ? (
                        <img
                          src={logoPreview}
                          alt="Logo preview"
                          className="w-full h-full object-cover rounded-lg"
                        />
                      ) : currentClinic?.logo ? (
                        <img
                          src={currentClinic.logo}
                          alt="Current logo"
                          className="w-full h-full object-cover rounded-lg"
                        />
                      ) : (
                        <BuildingIcon className="w-8 h-8 text-gray-400" />
                      )}
                    </div>
                    <Input 
                      id="clinic-logo-edit"
                      type="file"
                      accept="image/*"
                      onChange={handleLogoChange}
                      disabled={!isAdmin || uploadingLogo}
                      className="border-gray-300 focus:border-[#5154e7] focus:ring-[#5154e7] bg-white text-gray-900 rounded-lg h-9"
                    />
                    <p className="text-[11px] text-gray-500">
                      Supported formats: JPG, PNG, GIF. Max size: 5MB.
                    </p>
                  </div>
                {/* Branding: Theme & Button Colors (minimalist vertical) */}
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label className="text-gray-700 font-medium">Theme</Label>
                    <select
                      value={editingTheme}
                      onChange={(e) => setEditingTheme(e.target.value as 'LIGHT' | 'DARK')}
                      disabled={!isAdmin}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 h-9"
                    >
                      <option value="LIGHT">Light</option>
                      <option value="DARK">Dark</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-700 font-medium">Button Color</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={editingButtonColor || '#111827'}
                        onChange={(e) => setEditingButtonColor(e.target.value)}
                        disabled={!isAdmin}
                        className="h-8 w-12 border border-gray-300 rounded"
                        aria-label="Button color"
                      />
                      <Input
                        value={editingButtonColor}
                        onChange={(e) => setEditingButtonColor(e.target.value)}
                        placeholder="#111827"
                        disabled={!isAdmin}
                        className="h-9 flex-1 border-gray-300 focus:border-gray-900 focus:ring-gray-900"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-700 font-medium">Button Text Color</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={editingButtonTextColor || '#ffffff'}
                        onChange={(e) => setEditingButtonTextColor(e.target.value)}
                        disabled={!isAdmin}
                        className="h-8 w-12 border border-gray-300 rounded"
                        aria-label="Button text color"
                      />
                      <Input
                        value={editingButtonTextColor}
                        onChange={(e) => setEditingButtonTextColor(e.target.value)}
                        placeholder="#ffffff"
                        disabled={!isAdmin}
                        className="h-9 flex-1 border-gray-300 focus:border-gray-900 focus:ring-gray-900"
                      />
                    </div>
                  </div>
                  {/* Small preview */}
                  <div>
                    <button
                      type="button"
                      className="px-3 py-2 text-xs font-medium rounded-lg border border-gray-300"
                      style={{ backgroundColor: editingButtonColor || '#111827', color: editingButtonTextColor || '#ffffff' }}
                      disabled
                    >
                      Button preview
                    </button>
                  </div>
                </div>
                </div>
                <div>
                  <Label className="text-gray-700 font-medium">Owner</Label>
                  <p className="text-sm font-semibold text-gray-900 mt-1">{currentClinic.owner.name} ({currentClinic.owner.email})</p>
                </div>
                <div>
                  <Label className="text-gray-700 font-medium">Created on</Label>
                  <p className="text-sm font-semibold text-gray-900 mt-1">{new Date(currentClinic.createdAt).toLocaleDateString('en-US')}</p>
                </div>
                {isAdmin && (
                  <div className="sticky bottom-0 left-0 right-0 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 border-t border-gray-200 -mx-4 px-4 py-3 rounded-b-2xl">
                    <div className="flex gap-2">
                      <Button 
                        onClick={saveSettings}
                        disabled={savingSettings || uploadingLogo}
                        className="flex-1 rounded-full h-9 text-xs font-medium shadow-sm"
                        style={{ backgroundColor: 'var(--btn-bg)', color: 'var(--btn-fg)' }}
                      >
                        {uploadingLogo ? 'Uploading Logo...' : savingSettings ? 'Saving...' : 'Save Changes'}
                      </Button>
                      <Button 
                        variant="outline"
                        onClick={() => setShowSettingsModal(false)}
                        className="border-gray-300 text-gray-800 hover:bg-gray-50 bg-white rounded-full h-9 text-xs font-medium"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* Beautiful Success/Error Dialog */}
          <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
            <DialogContent className="bg-white border border-gray-200 rounded-2xl max-w-md p-0">
              <div className="text-center p-4">
                {/* Close button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-3 top-3 h-8 w-8 p-0 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-full"
                  onClick={() => setShowSuccessDialog(false)}
                >
                  <X className="h-4 w-4" />
                </Button>

                {/* Icon */}
                <div className="w-12 h-12 mx-auto mb-3 bg-gradient-to-br from-emerald-100 to-emerald-50 rounded-xl flex items-center justify-center">
                  {successTitle.includes('Erro') ? (
                    <X className="h-6 w-6 text-red-600" />
                  ) : (
                    <CheckCircle className="h-6 w-6 text-emerald-600" />
                  )}
                </div>

                {/* Title */}
                <h3 className="text-sm font-semibold text-gray-900 mb-1">
                  {successTitle}
                </h3>

                {/* Message */}
                <p className="text-xs text-gray-600 mb-4 leading-relaxed">
                  {successMessage}
                </p>

                {/* Action Button */}
                <Button 
                  onClick={() => setShowSuccessDialog(false)}
                  className={`w-full h-8 rounded-full text-xs font-medium ${
                    successTitle.includes('Erro') 
                      ? 'bg-red-600 hover:bg-red-700 text-white' 
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  {successTitle.includes('Erro') ? 'Tentar Novamente' : 'Perfeito!'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
} 