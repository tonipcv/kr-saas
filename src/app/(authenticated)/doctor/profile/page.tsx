'use client';

import { useSession, signOut } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useClinic } from "@/contexts/clinic-context";
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
  const { currentClinic, refreshClinics } = useClinic();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [image, setImage] = useState('');
  const [imageKey, setImageKey] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [userRole, setUserRole] = useState<'DOCTOR' | 'PATIENT' | 'SUPER_ADMIN' | null>(null);
  const [userStats, setUserStats] = useState<UserStats>({});
  const [googleReviewLink, setGoogleReviewLink] = useState('');
  const [doctorSlug, setDoctorSlug] = useState('');
  const [publicCoverImageUrl, setPublicCoverImageUrl] = useState('');
  const [publicPageTemplate, setPublicPageTemplate] = useState<'DEFAULT' | 'MINIMAL' | 'HERO_CENTER' | 'HERO_LEFT'>('DEFAULT');
  const [clinics, setClinics] = useState<any[]>([]);
  const [clinicsLoading, setClinicsLoading] = useState(false);
  const [clinicName, setClinicName] = useState<string>('');
  const [clinicSlug, setClinicSlug] = useState<string>('');
  const [savingClinic, setSavingClinic] = useState<boolean>(false);

  const slugify = (value: string) => {
    return (value || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  };

  // Load clinics
  const loadClinics = useCallback(async () => {
    try {
      setClinicsLoading(true);
      const res = await fetch('/api/clinics');
      if (res.ok) {
        const data = await res.json();
        setClinics(data.clinics || []);
      }
    } catch (error) {
      console.error('Error loading clinics:', error);
    } finally {
      setClinicsLoading(false);
    }
  }, []);

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
            setPhone(profileData.phone || '');
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

              // Load clinics
              await loadClinics();
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
  }, [session, router, loadClinics]);

  useEffect(() => {
    if (currentClinic) {
      setClinicName(currentClinic.name || '');
      setClinicSlug((currentClinic.slug as any) || '');
    }
  }, [currentClinic?.id]);

  const handleSaveClinic = async () => {
    if (!clinicName.trim()) return;
    try {
      setSavingClinic(true);
      const params = new URLSearchParams();
      if (currentClinic?.id) params.set('clinicId', currentClinic.id);
      const res = await fetch(`/api/clinic/settings?${params.toString()}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: clinicName.trim(), slug: clinicSlug.trim() })
      });
      if (!res.ok) return;
      await refreshClinics();
    } finally {
      setSavingClinic(false);
    }
  };

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
          phone,
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

  // Removed role badge display

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

  // Role badge removed

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
                            setPhone(data.phone || '');
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
                      {/* Role badge removed */}
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
                        <label className="text-sm font-semibold text-gray-900">WhatsApp</label>
                        <Input
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          disabled={!isEditing}
                          placeholder="Ex: +5511999999999"
                          className="border-gray-300 focus:border-[#5154e7] focus:ring-[#5154e7] bg-white text-gray-900 rounded-md h-8"
                        />
                        <p className="text-xs text-gray-500">Formato E.164 (inclua o código do país), ex: +5511999999999</p>
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
              </div>
              <div className="mt-6 lg:col-span-2">
                <Card className="bg-white border border-gray-100 shadow-none rounded-lg">
                  <CardHeader className="pb-1">
                    <CardTitle className="text-xl font-bold text-gray-900">Business Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-900">Clinic Name</label>
                        <Input value={clinicName} onChange={(e) => setClinicName(e.target.value)} disabled={!isEditing} className="border-gray-300 bg-white text-gray-900 rounded-md h-8" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-900">Clinic Slug</label>
                        <Input value={clinicSlug} onChange={(e) => setClinicSlug(e.target.value)} disabled={!isEditing} className="border-gray-300 bg-white text-gray-900 rounded-md h-8" placeholder="ex.: minha-clinica" />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button onClick={handleSaveClinic} disabled={!isEditing || savingClinic || !clinicName.trim()} className="h-8">
                        {savingClinic ? 'Saving...' : 'Save'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
              <div className="hidden lg:block" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}