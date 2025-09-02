'use client';

import { useSession, signOut } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  ShieldCheckIcon,
  PencilSquareIcon
} from '@heroicons/react/24/outline';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import Image from "next/image";
import Link from 'next/link';
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface UserStats {
  totalPatients?: number;
  totalProtocols?: number;
  totalTemplates?: number;
  completedProtocols?: number;
  activeProtocols?: number;
  joinedDate?: string;
  lastLogin?: string;
}

export default function DoctorProfilePage() {
  const router = useRouter();
  const { data: session, update } = useSession();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [image, setImage] = useState('');
  const [imageKey, setImageKey] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [userRole, setUserRole] = useState<'DOCTOR' | 'PATIENT' | 'SUPER_ADMIN' | null>(null);
  const [userStats, setUserStats] = useState<UserStats>({});
  const [googleReviewLink, setGoogleReviewLink] = useState('');
  const [doctorSlug, setDoctorSlug] = useState('');
  const [publicCoverImageUrl, setPublicCoverImageUrl] = useState('');
  const [publicPageTemplate, setPublicPageTemplate] = useState<'DEFAULT' | 'MINIMAL' | 'HERO_CENTER' | 'HERO_LEFT'>('DEFAULT');
  const [planName, setPlanName] = useState<string | null>(null);
  const [planStatus, setPlanStatus] = useState<string | null>(null);
  const [isPlansOpen, setIsPlansOpen] = useState(false);
  const [plansLoading, setPlansLoading] = useState(false);
  const [availablePlans, setAvailablePlans] = useState<any[]>([]);

  const slugify = (value: string) => {
    return (value || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  };

  // Open modal and fetch available plans (exclude Free)
  const openPlansModal = async () => {
    try {
      setIsPlansOpen(true);
      setPlansLoading(true);
      const res = await fetch('/api/plans', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const plans = Array.isArray(data?.plans) ? data.plans : [];
        const filtered = plans.filter((p: any) => p?.name?.toLowerCase() !== 'free');
        setAvailablePlans(filtered);
      } else {
        setAvailablePlans([]);
      }
    } catch (e) {
      console.error('Failed to load plans', e);
      setAvailablePlans([]);
    } finally {
      setPlansLoading(false);
    }
  };

  const handlePlanChange = (planId: string) => {
    alert(`Plan change to ${planId} will be implemented soon!`);
  };

  // Load user data and stats
  useEffect(() => {
    const loadUserData = async () => {
      if (session?.user?.id) {
        try {
          setLoading(true);
          
          // Load profile data from API
          const profileResponse = await fetch('/api/profile');
          if (profileResponse.ok) {
            const profileData = await profileResponse.json();
            setName(profileData.name || '');
            setEmail(profileData.email || '');
            setGoogleReviewLink(profileData.google_review_link || profileData.googleReviewLink || '');
            setPublicCoverImageUrl(profileData.public_cover_image_url || '');
            setPublicPageTemplate(profileData.public_page_template || 'DEFAULT');
            const incomingSlug = profileData.doctor_slug || '';
            if (incomingSlug) {
              setDoctorSlug(incomingSlug);
            } else if (profileData.name) {
              // Prefill suggestion from name (UI only)
              setDoctorSlug(slugify(profileData.name));
            } else {
              setDoctorSlug('');
            }
            // Add cache-busting to initial image load to ensure fresh image
            const initialImage = profileData.image;
            setImage(initialImage ? `${initialImage}?t=${Date.now()}` : '');
            setImageKey(prev => prev + 1); // Force initial render

            // Detect user role
            const roleResponse = await fetch('/api/auth/role');
            if (roleResponse.ok) {
              const roleData = await roleResponse.json();
              setUserRole(roleData.role);

              // Redirect if not a doctor
              if (roleData.role !== 'DOCTOR' && roleData.role !== 'SUPER_ADMIN') {
                router.push('/profile');
                return;
              }

              // Load doctor stats
              const statsResponse = await fetch('/api/doctor/stats');
              if (statsResponse.ok) {
                const stats = await statsResponse.json();
                setUserStats(stats);
              }

              // Load subscription plan for badge (clinic-based)
              try {
                const subResp = await fetch('/api/subscription/current', { cache: 'no-store' });
                if (subResp.ok) {
                  const subData = await subResp.json();
                  console.log('subscription/current:', subData);
                  if (subData?.planName) setPlanName(subData.planName);
                  if (subData?.status) setPlanStatus(subData.status);
                } else {
                  // Fallback to legacy clinic endpoint
                  const clinicResponse = await fetch('/api/clinic', { cache: 'no-store' });
                  if (clinicResponse.ok) {
                    const clinicData = await clinicResponse.json();
                    console.log('/api/clinic:', clinicData);
                    const sub = clinicData?.clinic?.subscription;
                    if (sub?.plan?.name) setPlanName(sub.plan.name);
                    if (sub?.status) setPlanStatus(sub.status);
                  } else {
                    console.error('Falha ao carregar plano: ', subResp.status, await subResp.text());
                    // Last resort: default Free badge for doctors
                    if (userRole === 'DOCTOR' || userRole === 'SUPER_ADMIN') {
                      setPlanName((prev) => prev ?? 'Free');
                      setPlanStatus((prev) => prev ?? 'ACTIVE');
                    }
                  }
                }
              } catch (err) {
                console.error('Erro ao buscar plano atual:', err);
                if (userRole === 'DOCTOR' || userRole === 'SUPER_ADMIN') {
                  setPlanName((prev) => prev ?? 'Free');
                  setPlanStatus((prev) => prev ?? 'ACTIVE');
                }
              }
            } else {
              router.push('/profile');
              return;
            }
          } else {
            // Fallback to session data
            setName(session.user.name || '');
            setEmail(session.user.email || '');
            const initialImage = session.user.image;
            setImage(initialImage ? `${initialImage}?t=${Date.now()}` : '');
            setImageKey(prev => prev + 1);
          }
        } catch (error) {
          console.error('Error loading user data:', error);
          router.push('/profile');
        } finally {
          setLoading(false);
        }
      }
    };

    loadUserData();
  }, [session, router]);

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
          image: newImage || image,
          google_review_link: googleReviewLink,
          doctor_slug: doctorSlug,
          public_cover_image_url: publicCoverImageUrl || null,
          public_page_template: publicPageTemplate,
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
        // Use gradient for Doctor tag to match branding
        return { label: 'Doctor', color: 'bg-gradient-to-r from-[#5893ec] to-[#9bcef7] text-white border-transparent', icon: UserIcon };
      case 'SUPER_ADMIN':
        return { label: 'Super Admin', color: 'bg-purple-100 text-purple-700 border-purple-200', icon: ShieldCheckIcon };
      default:
        return { label: 'Doctor', color: 'bg-gradient-to-r from-[#5893ec] to-[#9bcef7] text-white border-transparent', icon: UserIcon };
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('pt-BR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Loading state
  if (!session || loading) {
    return (
      <div className="min-h-screen bg-white">
        <div className="lg:ml-64">
          <div className="container mx-auto p-6 lg:p-8 pt-[88px] lg:pt-8 pb-24 lg:pb-8">
            <div className="space-y-6">
              {/* Top bar skeleton */}
              <div className="flex items-center justify-between">
                <div className="h-8 bg-gray-200 rounded w-32 animate-pulse"></div>
                <div className="h-8 bg-gray-200 rounded w-24 animate-pulse"></div>
              </div>

              {/* Tabs skeleton */}
              <div className="flex items-center gap-4 border-b border-gray-200 -mt-2 pb-2">
                <div className="h-4 bg-gray-200 rounded w-20 animate-pulse"></div>
                <div className="h-4 bg-gray-200 rounded w-36 animate-pulse"></div>
                <div className="h-4 bg-gray-200 rounded w-24 animate-pulse"></div>
                <div className="h-4 bg-gray-200 rounded w-28 animate-pulse"></div>
              </div>

              {/* Content Grid Skeleton */}
              <div className={`${isEditing ? 'max-w-5xl gap-6' : 'max-w-md gap-5'} mx-auto grid grid-cols-1`}>
                
                {/* Main Profile Card Skeleton */}
                <div className="lg:col-span-2">
                  <div className="bg-white border border-gray-100 shadow-none rounded-lg p-6">
                    <div className="h-6 bg-gray-200 rounded w-48 mb-6 animate-pulse"></div>
                    
                    {/* Profile Image Skeleton */}
                    <div className="flex flex-col items-center space-y-4 mb-6">
                      <div className="w-24 h-24 bg-gray-200 rounded-2xl animate-pulse"></div>
                      <div className="h-6 bg-gray-200 rounded w-20 animate-pulse"></div>
                    </div>

                    {/* Form Fields Skeleton */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                      <div className="space-y-2">
                        <div className="h-4 bg-gray-200 rounded w-16 animate-pulse"></div>
                        <div className="h-8 bg-gray-200 rounded-md animate-pulse"></div>
                      </div>
                      <div className="space-y-2">
                        <div className="h-4 bg-gray-200 rounded w-16 animate-pulse"></div>
                        <div className="h-8 bg-gray-200 rounded-md animate-pulse"></div>
                      </div>
                    </div>

                    {/* Sign Out minimal skeleton */}
                    <div className="space-y-3">
                      <div className="h-8 bg-gray-200 rounded-md w-full animate-pulse"></div>
                    </div>
                  </div>
                </div>
                {/* Sidebar removed in new design */}
              </div>

            </div>
          </div>
        </div>
      </div>
    );
  }

  const roleInfo = getRoleDisplay();
  const RoleIcon = roleInfo.icon;

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="lg:ml-64">
        <div className="container mx-auto p-6 lg:p-8 pt-[88px] lg:pt-8 pb-24 lg:pb-8">
          <div className="space-y-6">
            {/* Top bar + tabs */}
            <div className={`flex items-center justify-between ${isEditing ? 'sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-gray-200 py-2 -mx-6 px-6 lg:-mx-8 lg:px-8' : ''}`}>
              <h1 className="text-2xl font-semibold">Profile</h1>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => (isEditing ? handleSave() : setIsEditing(true))}
                  className={`rounded-md h-8 text-sm px-3 ${isEditing ? 'bg-transparent text-gray-800 hover:bg-gray-50' : 'bg-transparent text-gray-700 hover:bg-gray-50'}`}
                >
                  {isEditing ? 'Save Changes' : 'Edit Profile'}
                </Button>
                {isEditing && (
                  <Button
                    onClick={() => {
                      setIsEditing(false);
                      setName(session?.user?.name || '');
                      const loadOriginalData = async () => {
                        try {
                          const response = await fetch('/api/profile');
                          if (response.ok) {
                            const data = await response.json();
                            setGoogleReviewLink(data.google_review_link || data.googleReviewLink || '');
                            setPublicCoverImageUrl(data.public_cover_image_url || '');
                            setPublicPageTemplate(data.public_page_template || 'DEFAULT');
                            if (data.doctor_slug) {
                              setDoctorSlug(data.doctor_slug);
                            } else if (data.name) {
                              setDoctorSlug(slugify(data.name));
                            } else {
                              setDoctorSlug('');
                            }
                          }
                        } catch (error) {
                          console.error('Error loading original data:', error);
                        }
                      };
                      loadOriginalData();
                    }}
                    variant="outline"
                    className="bg-transparent text-gray-600 hover:bg-gray-50 rounded-md h-8 px-2.5 text-sm"
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4 border-b border-gray-200 -mt-2">
              <button className="py-2 text-sm border-b border-gray-900 text-gray-900">General</button>
              <button className="py-2 text-sm text-gray-500 hover:text-gray-700">Multi-factor authentication</button>
              <button className="py-2 text-sm text-gray-500 hover:text-gray-700">Custom fields</button>
              <button className="py-2 text-sm text-gray-500 hover:text-gray-700">Email settings</button>
              <button className="py-2 text-sm text-gray-500 hover:text-gray-700">Conversations</button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Profile Card */}
              <div className="lg:col-span-2">
                <Card className="bg-white border border-gray-100 shadow-none rounded-lg">
                  <CardHeader className="pb-1">
                    <CardTitle className="text-xl font-bold text-gray-900">
                      Personal Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    
                    {/* Profile Image */}
                    <div className="flex flex-col items-center space-y-4">
                      <div className="relative group">
                        <div className="w-24 h-24 rounded-2xl bg-gray-100 flex items-center justify-center overflow-hidden border-2 border-gray-200">
                          {image ? (
                            <Image
                              key={imageKey}
                              src={image}
                              alt="Profile"
                              width={96}
                              height={96}
                              className="w-full h-full object-cover"
                              unoptimized
                            />
                          ) : (
                            <UserIcon className="h-12 w-12 text-gray-400" />
                          )}
                        </div>
                        <label
                          htmlFor="image-upload"
                          className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        >
                          {isUploading ? (
                            <Loader2 className="h-6 w-6 text-white animate-spin" />
                          ) : (
                            <CameraIcon className="h-6 w-6 text-white" />
                          )}
                        </label>
                        <input
                          id="image-upload"
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="hidden"
                          disabled={isUploading}
                        />
                      </div>
                      {planName && (
                        <>
                          <Badge className={cn("text-sm font-medium border bg-blue-50 text-blue-700 border-blue-200")}> 
                            {planName}
                          </Badge>
                          <div className="flex items-center gap-3 mt-2">
                            <Button size="sm" className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white" onClick={openPlansModal}>
                              Upgrade
                            </Button>
                            <Link href="/clinic/subscription" className="text-sm text-blue-700 hover:underline">
                              Ver todos os planos
                            </Link>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Form Fields */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-900">Name</label>
                        <Input
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          disabled={!isEditing}
                          className="border-gray-300 focus:border-[#5154e7] focus:ring-[#5154e7] bg-white text-gray-900 rounded-md h-8"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-900">Email</label>
                        <Input
                          value={email}
                          disabled
                          className="border-gray-200 bg-gray-50 text-gray-500 rounded-md h-8"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-900">Public Slug</label>
                        <Input
                          value={doctorSlug}
                          onChange={(e) => setDoctorSlug(e.target.value)}
                          disabled={!isEditing}
                          placeholder="your-name"
                          className="border-gray-300 focus:border-[#5154e7] focus:ring-[#5154e7] bg-white text-gray-900 rounded-md h-8"
                        />
                        <p className="text-xs text-gray-500">
                          This defines your public referral URL: /{doctorSlug || 'your-slug'} (letters, numbers and hyphens only)
                        </p>
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-sm font-semibold text-gray-900">Google Review Link</label>
                        <Input
                          value={googleReviewLink}
                          onChange={(e) => setGoogleReviewLink(e.target.value)}
                          disabled={!isEditing}
                          placeholder="https://g.page/r/..."
                          className="border-gray-300 focus:border-[#5154e7] focus:ring-[#5154e7] bg-white text-gray-900 rounded-md h-8"
                        />
                        <p className="text-xs text-gray-500">
                          Link para avaliações do Google que será mostrado aos pacientes após reset de senha
                        </p>
                      </div>

                      {/* Public Cover Image URL */}
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-sm font-semibold text-gray-900">Public Cover Image URL</label>
                        <Input
                          value={publicCoverImageUrl}
                          onChange={(e) => setPublicCoverImageUrl(e.target.value)}
                          disabled={!isEditing}
                          placeholder="https://.../cover.jpg"
                          className="border-gray-300 focus:border-[#5154e7] focus:ring-[#5154e7] bg-white text-gray-900 rounded-md h-8"
                        />
                        {publicCoverImageUrl ? (
                          <div className="mt-2">
                            <div className="relative w-full max-w-xl h-32 rounded-md overflow-hidden border border-gray-200">
                              <Image src={publicCoverImageUrl} alt="Public cover" fill className="object-cover" unoptimized />
                            </div>
                            <p className="text-xs text-gray-500 mt-1">Preview of your public page cover.</p>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500">Optional. Appears on your public page header.</p>
                        )}
                      </div>

                      {/* Public Page Template */}
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-900">Public Page Template</label>
                        <select
                          value={publicPageTemplate}
                          onChange={(e) => setPublicPageTemplate(e.target.value as any)}
                          disabled={!isEditing}
                          className="h-8 rounded-md bg-white border border-gray-300 text-gray-900 px-2 text-sm"
                        >
                          <option value="DEFAULT">Default</option>
                          <option value="MINIMAL">Minimal</option>
                          <option value="HERO_CENTER">Hero Center</option>
                          <option value="HERO_LEFT">Hero Left</option>
                        </select>
                        <p className="text-xs text-gray-500">Choose how your public page looks.</p>
                      </div>
                    </div>

                    {/* Actions (kept minimal) */}
                    <div className="space-y-3">
                      <Button
                        onClick={() => signOut({ callbackUrl: 'https://app.cxlus.com/auth/signin' })}
                        variant="outline"
                        className="w-full bg-transparent text-gray-700 hover:bg-gray-50 rounded-md h-8 text-sm"
                      >
                        <ArrowRightOnRectangleIcon className="h-4 w-4 mr-2" />
                        Sign Out
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* CRM connection */}
                <Card className="mt-6 bg-white border border-gray-100 shadow-none rounded-lg">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold text-gray-900">CRM connection</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-gray-600 mb-2">Your team has not connected a CRM</div>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-md bg-gray-100 flex items-center justify-center text-gray-500 text-base">+</div>
                      <div className="w-7 h-7 rounded-md bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-600 text-[10px] font-medium">HS</div>
                      <div className="w-7 h-7 rounded-md bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-600 text-[10px] font-medium">PD</div>
                      <div className="w-7 h-7 rounded-md bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-600 text-[10px] font-medium">SF</div>
                    </div>
                  </CardContent>
                </Card>

                {/* Restrictions */}
                <Card className="mt-6 bg-white border border-gray-100 shadow-none rounded-lg">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold text-gray-900">Restrictions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1.5">
                      <label className="text-xs text-gray-600">Credit Limit</label>
                      <Input
                        value={''}
                        placeholder=""
                        onChange={() => {}}
                        className="h-8 rounded-md bg-white border-gray-200 text-gray-900"
                      />
                      <p className="text-xs text-gray-500">Leave this field blank if no limit is required</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
              {/* Sidebar removed */}
              <div className="hidden lg:block" />
            </div>
          </div>
        </div>
      </div>

      {/* Upgrade Plans Modal */}
      <Dialog open={isPlansOpen} onOpenChange={setIsPlansOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Choose a plan</DialogTitle>
            <DialogDescription>
              {planName ? (
                <span>
                  You're currently on plan: <span className="font-medium">{planName}</span>
                </span>
              ) : (
                <span>Select a plan that fits your clinic.</span>
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Plans Grid */}
          {plansLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[1,2].map(i => (
                <div key={i} className="rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="h-4 w-24 bg-gray-100 rounded animate-pulse mb-2" />
                  <div className="h-3 w-40 bg-gray-100 rounded animate-pulse mb-4" />
                  <div className="h-8 w-full bg-gray-100 rounded animate-pulse" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {availablePlans.map((plan: any) => {
                const isCurrent = planName && planName.toLowerCase() === plan.name?.toLowerCase();
                return (
                  <div key={plan.id} className={`rounded-2xl border border-gray-200 bg-white shadow-sm ${isCurrent ? 'ring-2 ring-blue-500' : ''}`}>
                    <div className="px-4 py-4 border-b border-gray-100 rounded-t-2xl">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-sm font-semibold text-gray-900">{plan.name}</div>
                          <p className="text-xs text-gray-600">{plan.description}</p>
                        </div>
                        {isCurrent && (
                          <Badge className="bg-blue-100 text-blue-700 border-blue-200">Current</Badge>
                        )}
                      </div>
                      <div className="mt-3">
                        {plan.contactOnly || plan.price === null ? (
                          <div>
                            <div className="text-xl font-bold text-gray-900">Flexible billing</div>
                            <div className="text-xs text-gray-600">Custom plans</div>
                          </div>
                        ) : (
                          <div className="flex items-end gap-2">
                            <div className="text-2xl font-bold text-gray-900">$ {plan.price}</div>
                            <div className="text-xs text-gray-600 mb-1">per month</div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="p-4">
                      <Button onClick={() => handlePlanChange(plan.id)} className="w-full bg-gradient-to-r from-[#5893ec] to-[#9bcef7] text-white hover:opacity-90">
                        {isCurrent ? 'Current plan' : 'Upgrade'}
                      </Button>
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center gap-2 text-sm text-gray-700">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          <span>{plan.maxPatients ?? '—'} clients</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-700">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          <span>{(plan.name?.toLowerCase?.() === 'starter') ? '500 referrals / month' : (plan.name?.toLowerCase?.() === 'creator') ? '2000 referrals / month' : 'Referrals / month as per plan'}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-700">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          <span>Credit by purchase access</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-700">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          <span>Up to 50 rewards</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <XCircle className="h-4 w-4 text-gray-400" />
                          <span>No access to Campaigns</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}