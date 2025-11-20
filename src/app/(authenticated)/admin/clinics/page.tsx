'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { 
  Building2, 
  Users, 
  FileText, 
  BookOpen, 
  Crown, 
  Plus, 
  ArrowLeft,
  Loader2,
  Calendar,
  Mail,
  User,
  Trash2
} from 'lucide-react';
import Link from 'next/link';
import { 
  BuildingOfficeIcon,
  CheckCircleIcon, 
  ExclamationTriangleIcon, 
  ClockIcon, 
  PencilIcon,
  EyeIcon,
  MapPinIcon,
  EnvelopeIcon,
  PlusIcon,
  UsersIcon,
  ArrowLeftIcon
} from '@heroicons/react/24/outline';

interface ClinicSubscription {
  id: string;
  status: string;
  maxDoctors: number;
  startDate: string;
  endDate?: string;
  trialEndDate?: string;
  plan: {
    id: string;
    name: string;
    price: number | null;
    tier?: string | null;
  };
}

interface Clinic {
  id: string;
  name: string;
  description?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  website?: string;
  logo?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  owner: {
    id: string;
    name: string;
    email: string;
  };
  members: Array<{
    id: string;
    role: string;
    isActive: boolean;
    user: {
      id: string;
      name: string;
      email: string;
    };
  }>;
  subscription?: ClinicSubscription;
  merchant?: {
    recipientId: string | null;
    status?: string | null;
  } | null;
}

export default function ClinicsPage() {
  const { data: session } = useSession();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [payStatus, setPayStatus] = useState<Record<string, 'ready' | 'issue' | 'checking'>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const loadClinics = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('/api/admin/clinics');
        
        if (response.ok) {
          const data = await response.json();
          setClinics(data.clinics || []);
        }
      } catch (error) {
        console.error('Error loading clinics:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (session) {
      loadClinics();
    }
  }, [session]);

  // Fetch payment integration status per clinic
  useEffect(() => {
    const controller = new AbortController();
    const run = async () => {
      // Initialize all as 'checking' to avoid false "Integrated" flicker
      const initial: Record<string, 'ready' | 'issue' | 'checking'> = {};
      clinics.forEach(c => { initial[c.id] = 'checking'; });
      setPayStatus(initial);
      await Promise.all(
        clinics.map(async (c) => {
          try {
            const res = await fetch(`/api/payments/pagarme/config/status?clinic_id=${encodeURIComponent(c.id)}`, { cache: 'no-store', signal: controller.signal });
            const js = await res.json().catch(() => ({}));
            const ready = res.ok && js?.ready_for_production === true;
            setPayStatus((prev) => ({ ...prev, [c.id]: ready ? 'ready' : 'issue' }));
          } catch {
            setPayStatus((prev) => ({ ...prev, [c.id]: 'issue' }));
          }
        })
      );
    };
    if (clinics.length > 0) run();
    return () => controller.abort();
  }, [clinics]);

  // Statistics calculations
  const activeCount = clinics.filter(c => c.isActive).length;
  const inactiveCount = clinics.filter(c => !c.isActive).length;
  const withSubscriptionCount = clinics.filter(c => c.subscription).length;
  const trialCount = clinics.filter(c => c.subscription?.status === 'TRIAL').length;
  const totalMembers = clinics.reduce((sum, c) => sum + c.members.filter(m => m.isActive).length, 0);

  const getSubscriptionStatusColor = (status?: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-100 text-green-800';
      case 'TRIAL': return 'bg-blue-100 text-blue-800';
      case 'EXPIRED': return 'bg-red-100 text-red-800';
      case 'SUSPENDED': return 'bg-yellow-100 text-yellow-800';
      case 'CANCELLED': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getSubscriptionStatusText = (status?: string) => {
    switch (status) {
      case 'ACTIVE': return 'Active';
      case 'TRIAL': return 'Trial';
      case 'EXPIRED': return 'Expired';
      case 'SUSPENDED': return 'Suspended';
      case 'CANCELLED': return 'Cancelled';
      default: return 'No Subscription';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white">
        <div className="lg:ml-64">
          <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24">
            
            {/* Header Skeleton */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 mb-8">
              <div className="space-y-3">
                <div className="h-8 bg-gray-200 rounded-lg w-64 animate-pulse"></div>
                <div className="h-5 bg-gray-100 rounded-lg w-80 animate-pulse"></div>
              </div>
              <div className="flex gap-3">
                <div className="h-10 bg-gray-200 rounded-xl w-32 animate-pulse"></div>
                <div className="h-10 bg-gray-100 rounded-xl w-40 animate-pulse"></div>
              </div>
            </div>

            {/* Stats Cards Skeleton */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="bg-white border border-gray-200 shadow-lg rounded-2xl p-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-gray-100 rounded-xl animate-pulse">
                      <div className="h-6 w-6 bg-gray-200 rounded animate-pulse"></div>
                    </div>
                    <div className="space-y-2 flex-1">
                      <div className="h-4 bg-gray-200 rounded w-20 animate-pulse"></div>
                      <div className="h-7 bg-gray-100 rounded w-12 animate-pulse"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Clinics List Skeleton */}
            <div className="bg-white border border-gray-200 shadow-lg rounded-2xl">
              <div className="p-6 pb-4">
                <div className="h-6 bg-gray-200 rounded w-32 animate-pulse"></div>
              </div>
              <div className="p-6 pt-0 space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 bg-gray-200 rounded-xl animate-pulse"></div>
                        <div className="space-y-2">
                          <div className="h-4 bg-gray-200 rounded w-32 animate-pulse"></div>
                          <div className="h-3 bg-gray-100 rounded w-40 animate-pulse"></div>
                          <div className="h-3 bg-gray-100 rounded w-24 animate-pulse"></div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="space-y-2">
                          <div className="h-6 bg-gray-100 rounded-xl w-16 animate-pulse"></div>
                          <div className="h-3 bg-gray-100 rounded w-20 animate-pulse"></div>
                        </div>
                        <div className="flex gap-2">
                          <div className="h-8 bg-gray-100 rounded-xl w-20 animate-pulse"></div>
                          <div className="h-8 bg-gray-200 rounded-xl w-24 animate-pulse"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24 bg-gray-50">
          
          {/* Header */}
          <div className="flex flex-col gap-3 mb-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div>
                <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">
                  Manage Business
                </h1>
                <p className="text-gray-600 mt-0.5 text-sm">
                  View and manage all registered businesses
                </p>
              </div>
              <div className="flex gap-2">
                <Button 
                  asChild
                  className="bg-black hover:bg-gray-900 text-white font-semibold shadow-sm hover:opacity-95 transition-all duration-200"
                >
                  <Link href="/admin/clinics/new">
                    <PlusIcon className="h-4 w-4 mr-2" />
                    New Clinic
                  </Link>
                </Button>
                <Button 
                  asChild
                  className="bg-black hover:bg-gray-900 text-white font-semibold shadow-sm hover:opacity-95 transition-all duration-200"
                >
                  <Link href="/admin">
                    <ArrowLeftIcon className="h-4 w-4 mr-2" />
                    Back to Dashboard
                  </Link>
                </Button>
              </div>
            </div>
          </div>

          {/* Quick Statistics (icon-less) */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
            <Card className="bg-white border border-gray-200 shadow-sm rounded-xl">
              <CardContent className="p-6">
                <p className="text-sm text-gray-600 font-medium">Total</p>
                <p className="mt-1 text-2xl font-light text-gray-900">{clinics.length}</p>
              </CardContent>
            </Card>
            <Card className="bg-white border border-gray-200 shadow-sm rounded-xl">
              <CardContent className="p-6">
                <p className="text-sm text-gray-600 font-medium">Active</p>
                <p className="mt-1 text-2xl font-light text-gray-900">{activeCount}</p>
              </CardContent>
            </Card>
            <Card className="bg-white border border-gray-200 shadow-sm rounded-xl">
              <CardContent className="p-6">
                <p className="text-sm text-gray-600 font-medium">With Subscription</p>
                <p className="mt-1 text-2xl font-light text-gray-900">{withSubscriptionCount}</p>
              </CardContent>
            </Card>
            <Card className="bg-white border border-gray-200 shadow-sm rounded-xl">
              <CardContent className="p-6">
                <p className="text-sm text-gray-600 font-medium">Trial</p>
                <p className="mt-1 text-2xl font-light text-gray-900">{trialCount}</p>
              </CardContent>
            </Card>
            <Card className="bg-white border border-gray-200 shadow-sm rounded-xl">
              <CardContent className="p-6">
                <p className="text-sm text-gray-600 font-medium">Total Members</p>
                <p className="mt-1 text-2xl font-light text-gray-900">{totalMembers}</p>
              </CardContent>
            </Card>
          </div>

          {/* Clinics List - compact table style */}
          <Card className="bg-white border border-gray-200 shadow-sm rounded-2xl">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-gray-900">All Clinics</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {clinics.length === 0 ? (
                <div className="text-center py-12">
                  <BuildingOfficeIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 text-lg">No clinics found.</p>
                  <p className="text-gray-500 text-sm mt-2">Clinics will appear here once they are registered.</p>
                  <Button asChild className="mt-4 bg-black hover:bg-gray-900 text-white font-semibold">
                    <Link href="/admin/clinics/new">
                      <PlusIcon className="h-4 w-4 mr-2" />
                      Create First Clinic
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                  <table className="min-w-full">
                    <thead className="bg-gray-50/80">
                      <tr className="text-left text-xs text-gray-600">
                        <th className="py-3.5 pl-4 pr-3 font-medium sm:pl-6">Clinic</th>
                        <th className="px-3 py-3.5 font-medium">Owner</th>
                        <th className="px-3 py-3.5 font-medium">Members</th>
                        <th className="px-3 py-3.5 font-medium">Subscription</th>
                        <th className="px-3 py-3.5 font-medium">Plan</th>
                        <th className="px-3 py-3.5 font-medium">Tier</th>
                        <th className="px-3 py-3.5 font-medium">Trial Ends</th>
                        <th className="px-3 py-3.5 font-medium">Payments</th>
                        <th className="py-3.5 pl-3 pr-4 sm:pr-6 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {clinics.map((clinic) => (
                        <tr key={clinic.id} className="hover:bg-gray-50/60">
                          <td className="whitespace-nowrap py-3.5 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                            {clinic.name}
                            {!clinic.isActive && (
                              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-50 text-red-700 ring-1 ring-inset ring-red-200">Inactive</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3.5 text-sm text-gray-600">
                            {clinic.owner.name} ({clinic.owner.email})
                          </td>
                          <td className="whitespace-nowrap px-3 py-3.5 text-sm text-gray-900">
                            {clinic.members.filter(m => m.isActive).length}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3.5 text-sm">
                            <span className={`${getSubscriptionStatusColor(clinic.subscription?.status)} inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium`}> 
                              {getSubscriptionStatusText(clinic.subscription?.status)}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3.5 text-sm text-gray-900">
                            {clinic.subscription?.plan
                              ? `${clinic.subscription.plan.name}${typeof clinic.subscription.plan.price === 'number' ? ` ($${clinic.subscription.plan.price}/mo)` : ''}`
                              : '-'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3.5 text-sm text-gray-900">
                            {clinic.subscription?.plan?.tier ? String(clinic.subscription.plan.tier).toUpperCase() : '-'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3.5 text-sm text-gray-900">
                            {(() => {
                              const end = (clinic as any)?.subscription?.endDate;
                              if (!end) return '-';
                              try {
                                return new Date(end).toLocaleDateString();
                              } catch {
                                return '-';
                              }
                            })()}
                          </td>
                          {/* Payments integration status */}
                          <td className="whitespace-nowrap px-3 py-3.5 text-sm">
                            {payStatus[clinic.id] === 'ready' && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 ring-1 ring-inset ring-green-200">Integrated</span>
                            )}
                            {payStatus[clinic.id] === 'checking' && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-700 ring-1 ring-inset ring-gray-200">Checking…</span>
                            )}
                            {payStatus[clinic.id] === 'issue' && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-50 text-yellow-700 ring-1 ring-inset ring-yellow-200">Not integrated</span>
                            )}
                          </td>
                          <td className="relative whitespace-nowrap py-3.5 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                asChild
                                className="text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg h-8 w-8 p-0"
                                title="Edit"
                              >
                                <Link href={`/admin/clinics/${clinic.id}/edit`}>
                                  <PencilIcon className="h-4 w-4" />
                                </Link>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                asChild
                                className="text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg h-8 w-8 p-0"
                                title="View"
                              >
                                <Link href={`/admin/clinics/${clinic.id}`}>
                                  <EyeIcon className="h-4 w-4" />
                                </Link>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg h-8 w-8 p-0"
                                title="Delete"
                                disabled={deletingId === clinic.id}
                                onClick={async (e) => {
                                  e.preventDefault();
                                  const ok = typeof window !== 'undefined' ? window.confirm(`Delete ${clinic.name}? This action cannot be undone.`) : false;
                                  if (!ok) return;
                                  try {
                                    setDeletingId(clinic.id);
                                    const res = await fetch(`/api/admin/clinics/${clinic.id}`, { method: 'DELETE' });
                                    if (res.ok) {
                                      setClinics(prev => prev.filter(c => c.id !== clinic.id));
                                    } else {
                                      const js = await res.json().catch(() => ({} as any));
                                      if (typeof window !== 'undefined') alert(js?.error || 'Failed to delete clinic');
                                    }
                                  } catch (err) {
                                    if (typeof window !== 'undefined') alert('Failed to delete clinic');
                                  } finally {
                                    setDeletingId(null);
                                  }
                                }}
                              >
                                {deletingId === clinic.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                              {/* Integrate payments button */}
                              {payStatus[clinic.id] !== 'ready' && (
                                <Button
                                  size="sm"
                                  className="h-8 px-3 rounded-full bg-black text-white hover:bg-gray-900"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    try { localStorage.setItem('selectedClinicId', clinic.id); } catch {}
                                    const role = (session as any)?.user?.role;
                                    if (role === 'SUPER_ADMIN') {
                                      window.location.href = `/admin/integrations/payments/setup?clinicId=${encodeURIComponent(clinic.id)}`;
                                    } else {
                                      window.location.href = '/business/integrations/pagarme/setup';
                                    }
                                  }}
                                  title="Integrate payments"
                                >
                                  Integrate
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
} 