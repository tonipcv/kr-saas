'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  UsersIcon, 
  CheckIcon,
  CalendarIcon, 
  EnvelopeIcon, 
  UserIcon, 
  ExclamationTriangleIcon,
  StarIcon,
  EyeIcon,
  PlusIcon,
  ArrowLeftIcon,
  TrashIcon
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { toast } from 'sonner';

interface DoctorSubscription {
  id?: string;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
  trialEndDate?: string | null;
  plan?: {
    id?: string;
    name: string;
    price?: number;
    maxPatients: number;
    maxProtocols: number;
    maxCourses: number;
    maxProducts: number;
    trialDays?: number;
  } | null;
}

interface Doctor {
  id: string;
  name: string;
  email: string;
  subscription?: DoctorSubscription;
  patientCount: number;
}

export default function DoctorsPage() {
  const { data: session } = useSession();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subscriptionType, setSubscriptionType] = useState<'TRIAL' | 'ACTIVE'>('TRIAL');
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');

  const resetForm = () => {
    setName('');
    setEmail('');
    setSubscriptionType('TRIAL');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      return toast.error('Please fill in name and email');
    }
    try {
      setIsSubmitting(true);
      const res = await fetch('/api/admin/doctors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), subscriptionType })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create doctor');
      }
      toast.success('Doctor created and invite sent');
      await loadDoctors();
      setIsCreateOpen(false);
      resetForm();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Error creating doctor');
    } finally {
      setIsSubmitting(false);
    }
  };

  const loadDoctors = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/admin/doctors');
      if (response.ok) {
        const data = await response.json();
        setDoctors(data.doctors || []);
      }
    } catch (error) {
      console.error('Error loading doctors:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (session) {
      loadDoctors();
    }
  }, [session]);

  const getDoctorInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-100 text-green-800';
      case 'TRIAL': return 'bg-blue-100 text-blue-800';
      case 'EXPIRED': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Format ISO date string to locale date or '-' if invalid/empty
  const formatDate = (iso?: string | null) => {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString();
  };

  const openView = (doctor: Doctor) => {
    setSelectedDoctor(doctor);
    setIsViewOpen(true);
  };

  const openEdit = (doctor: Doctor) => {
    setSelectedDoctor(doctor);
    setEditName(doctor.name || '');
    setEditEmail(doctor.email || '');
    setIsEditOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDoctor) return;
    if (!editName.trim() || !editEmail.trim()) {
      return toast.error('Please fill in name and email');
    }
    try {
      setIsSubmitting(true);
      const res = await fetch(`/api/admin/doctors/${selectedDoctor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), email: editEmail.trim() })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to update doctor');
      }
      toast.success('Doctor updated');
      await loadDoctors();
      setIsEditOpen(false);
      // sync selection
      setSelectedDoctor((prev) => prev ? { ...prev, name: editName.trim(), email: editEmail.trim() } : prev);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Error updating doctor');
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeDoctors = doctors.filter(d => d.subscription?.status === 'ACTIVE').length;
  const trialDoctors = doctors.filter(d => d.subscription?.status === 'TRIAL').length;
  const expiringSoon = doctors.filter(d => {
    if (d.subscription?.status !== 'TRIAL' || !d.subscription.trialEndDate) return false;
    const daysLeft = Math.ceil((new Date(d.subscription.trialEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return daysLeft <= 3;
  }).length;

  const handleDelete = async (doctorId: string) => {
    if (!confirm('Are you sure you want to delete this doctor? This action cannot be undone.')) {
      return;
    }

    try {
      setIsDeleting(doctorId);
      const response = await fetch(`/api/admin/doctors/${doctorId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('Doctor deleted successfully');
        setDoctors(doctors.filter(d => d.id !== doctorId));
      } else {
        const error = await response.json();
        toast.error(error.error || 'Error deleting doctor');
      }
    } catch (error) {
      console.error('Error deleting doctor:', error);
      toast.error('Error deleting doctor');
    } finally {
      setIsDeleting(null);
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
                <div className="h-10 bg-gray-200 rounded-xl w-36 animate-pulse"></div>
                <div className="h-10 bg-gray-100 rounded-xl w-40 animate-pulse"></div>
              </div>
            </div>

            {/* Stats Cards Skeleton */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {[1, 2, 3, 4].map((i) => (
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

            {/* Doctors List Skeleton */}
            <div className="bg-white border border-gray-200 shadow-lg rounded-2xl">
              <div className="p-6 pb-4">
                <div className="h-6 bg-gray-200 rounded w-32 animate-pulse"></div>
              </div>
              <div className="p-6 pt-0 space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
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
                          <div className="h-8 bg-gray-100 rounded-xl w-24 animate-pulse"></div>
                          <div className="h-8 bg-gray-200 rounded-xl w-28 animate-pulse"></div>
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
                <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">Manage doctors</h1>
                <p className="text-gray-600 mt-0.5 text-sm">View and manage all registered doctors</p>
              </div>
              <div className="flex gap-2">
                <Dialog open={isCreateOpen} onOpenChange={(o) => {
                  setIsCreateOpen(o);
                  if (!o) resetForm();
                }}>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="h-8 rounded-full border-gray-200 bg-white text-gray-800 hover:bg-white hover:text-gray-900 px-3 py-1 text-xs font-medium inline-flex items-center gap-1.5"
                    >
                      <PlusIcon className="h-3.5 w-3.5" />
                      Add Doctor
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[520px]">
                    <DialogHeader>
                      <DialogTitle>Add new doctor</DialogTitle>
                      <DialogDescription>Create a doctor and send an invite email to set a password.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCreate} className="space-y-4">
                      <div className="grid grid-cols-1 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-700">Name</label>
                          <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Dr. Jane Doe"
                            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-400 focus:outline-none"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700">Email</label>
                          <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="doctor@email.com"
                            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-400 focus:outline-none"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700">Subscription</label>
                          <select
                            value={subscriptionType}
                            onChange={(e) => setSubscriptionType(e.target.value as 'TRIAL' | 'ACTIVE')}
                            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
                          >
                            <option value="TRIAL">Trial</option>
                            <option value="ACTIVE">Active</option>
                          </select>
                          <p className="mt-1 text-[11px] text-gray-500">Default plan is assigned automatically. Trial duration uses the plan's trial days.</p>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button type="button" variant="ghost" onClick={() => setIsCreateOpen(false)} className="h-8">Cancel</Button>
                        <Button type="submit" disabled={isSubmitting} className="h-8">
                          {isSubmitting ? 'Creating...' : 'Create'}
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
                <Button
                  asChild
                  variant="outline"
                  className="h-8 rounded-full border-gray-200 bg-white text-gray-800 hover:bg-white hover:text-gray-900 px-3 py-1 text-xs font-medium"
                >
                  <Link href="/admin" className="inline-flex items-center gap-1.5">
                    <ArrowLeftIcon className="h-3.5 w-3.5" />
                    Back to Dashboard
                  </Link>
                </Button>
              </div>
            </div>
            {/* Top Tabs (pills) */}
            <div className="flex items-center gap-2 overflow-auto">
              {[
                { key: 'overview', label: 'Overview', active: true },
                { key: 'active', label: 'Active' },
                { key: 'trial', label: 'Trial' },
                { key: 'expiring', label: 'Expiring soon' },
              ].map(tab => (
                <span
                  key={tab.key}
                  className={[
                    'whitespace-nowrap text-xs font-medium rounded-full border px-3 py-1',
                    tab.active
                      ? 'bg-white border-gray-200 text-gray-900 shadow-sm'
                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-white'
                  ].join(' ')}
                >
                  {tab.label}
                </span>
              ))}
            </div>
          </div>

          {/* Quick Statistics - pill style */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-gray-500">Total Doctors</span>
                <UsersIcon className="h-3.5 w-3.5 text-blue-600" />
              </div>
              <div className="mt-1 text-[22px] leading-7 font-semibold text-gray-900">{doctors.length}</div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-gray-500">Active Subscriptions</span>
                <CheckIcon className="h-3.5 w-3.5 text-green-600" />
              </div>
              <div className="mt-1 text-[22px] leading-7 font-semibold text-gray-900">{activeDoctors}</div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-gray-500">On Trial</span>
                <CalendarIcon className="h-3.5 w-3.5 text-yellow-600" />
              </div>
              <div className="mt-1 text-[22px] leading-7 font-semibold text-gray-900">{trialDoctors}</div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-gray-500">Expiring Soon</span>
                <ExclamationTriangleIcon className="h-3.5 w-3.5 text-red-600" />
              </div>
              <div className="mt-1 text-[22px] leading-7 font-semibold text-gray-900">{expiringSoon}</div>
            </div>
          </div>

          {/* Doctors List - table style like doctor's patients page */}
          <Card className="bg-white border border-gray-200 shadow-sm rounded-2xl">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-gray-900">Doctors</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {doctors.length === 0 ? (
                <div className="text-center py-12">
                  <UsersIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 text-lg">No doctors registered yet.</p>
                  <p className="text-gray-500 text-sm mt-2">Add your first doctor to get started.</p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                  <table className="min-w-full">
                    <thead className="bg-gray-50/80">
                      <tr className="text-left text-xs text-gray-600">
                        <th className="py-3.5 pl-4 pr-3 font-medium sm:pl-6">Name</th>
                        <th className="px-3 py-3.5 font-medium">Email</th>
                        <th className="px-3 py-3.5 font-medium">Patients</th>
                        <th className="px-3 py-3.5 font-medium">Subscription</th>
                        <th className="py-3.5 pl-3 pr-4 sm:pr-6 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {doctors.map((doctor) => {
                        const subscription = doctor.subscription;
                        const isExpiringSoon = subscription?.status === 'TRIAL' && subscription.trialEndDate &&
                          Math.ceil((new Date(subscription.trialEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) <= 3;
                        return (
                          <tr key={doctor.id} className="hover:bg-gray-50/60">
                            <td className="whitespace-nowrap py-3.5 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                              {doctor.name || 'No name'}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3.5 text-sm text-gray-600">{doctor.email}</td>
                            <td className="whitespace-nowrap px-3 py-3.5 text-sm text-gray-900">{doctor.patientCount}</td>
                            <td className="whitespace-nowrap px-3 py-3.5 text-sm">
                              {subscription ? (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    {subscription.status === 'ACTIVE' ? (
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 ring-1 ring-inset ring-green-200">Active</span>
                                    ) : (
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200">Trial</span>
                                    )}
                                    {isExpiringSoon && (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-50 text-red-700 ring-1 ring-inset ring-red-200">Expiring soon</span>
                                    )}
                                  </div>
                                  <div className="text-xs text-gray-600">
                                    <div className="flex items-center gap-2">
                                      <span>Plan: <span className="font-medium text-gray-800">{subscription.plan?.name || '-'}</span></span>
                                      {typeof subscription.plan?.price === 'number' && (
                                        <span className="text-gray-500">• R$ {subscription.plan?.price}/month</span>
                                      )}
                                      {subscription.id && (
                                        <Link
                                          href={`/admin/subscriptions/${subscription.id}/edit`}
                                          className="inline-flex items-center rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
                                        >
                                          Change plan
                                        </Link>
                                      )}
                                    </div>
                                    <div className="flex gap-4">
                                      <span>Start: <span className="font-medium text-gray-800">{formatDate(subscription.startDate)}</span></span>
                                      <span>Expires: <span className="font-medium text-gray-800">{formatDate(subscription.trialEndDate || subscription.endDate)}</span></span>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-700 ring-1 ring-inset ring-gray-200">No Subscription</span>
                              )}
                            </td>
                            <td className="relative whitespace-nowrap py-3.5 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg h-8 w-8 p-0"
                                  onClick={() => openView(doctor)}
                                  title="View details"
                                >
                                  <EyeIcon className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg h-8 w-8 p-0"
                                  onClick={() => openEdit(doctor)}
                                  title="Edit"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                                    <path d="M13.586 3.586a2 2 0 0 1 2.828 2.828l-8.486 8.486a2 2 0 0 1-.878.502l-3.06.817a.75.75 0 0 1-.91-.91l.816-3.06a2 2 0 0 1 .503-.879l8.487-8.486Z" />
                                    <path d="M12.379 6.621 13.5 7.743 5.757 15.485l-1.121-1.12 7.743-7.744Z" />
                                  </svg>
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  asChild
                                  className="text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg h-8 w-8 p-0"
                                >
                                  <Link href={`/admin/subscriptions?doctorId=${doctor.id}`}>
                                    <StarIcon className="h-4 w-4" />
                                  </Link>
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg h-8 w-8 p-0"
                                  onClick={() => handleDelete(doctor.id)}
                                  disabled={isDeleting === doctor.id}
                                  title={isDeleting === doctor.id ? 'Deleting...' : 'Delete'}
                                >
                                  {isDeleting === doctor.id ? (
                                    <div className="mx-auto h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-r-transparent" />
                                  ) : (
                                    <TrashIcon className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* View Doctor Modal */}
          <Dialog open={isViewOpen} onOpenChange={(o) => { setIsViewOpen(o); if (!o) setSelectedDoctor(null); }}>
            <DialogContent className="sm:max-w-[560px]">
              <DialogHeader>
                <DialogTitle>Doctor details</DialogTitle>
                <DialogDescription>Overview of the selected doctor.</DialogDescription>
              </DialogHeader>
              {selectedDoctor ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-gray-500">Name</div>
                      <div className="text-sm font-medium text-gray-900">{selectedDoctor.name || 'No name'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Email</div>
                      <div className="text-sm font-medium text-gray-900">{selectedDoctor.email}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Patients</div>
                      <div className="text-sm font-medium text-gray-900">{selectedDoctor.patientCount}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Subscription status</div>
                      <div className="mt-1">
                        {selectedDoctor.subscription ? (
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${
                            selectedDoctor.subscription.status === 'ACTIVE'
                              ? 'bg-green-50 text-green-700 ring-green-200'
                              : 'bg-blue-50 text-blue-700 ring-blue-200'
                          }`}>
                            {selectedDoctor.subscription.status === 'ACTIVE' ? 'Active' : 'Trial'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-700 ring-1 ring-inset ring-gray-200">No Subscription</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {selectedDoctor.subscription?.plan && (
                    <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
                      <div className="text-xs font-semibold text-gray-600 mb-2">Plan</div>
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-gray-900">{selectedDoctor.subscription.plan.name}</div>
                        <div className="flex items-center gap-2">
                          {typeof selectedDoctor.subscription.plan.price === 'number' && (
                            <span className="text-sm font-semibold text-gray-800">R$ {selectedDoctor.subscription.plan.price}/month</span>
                          )}
                          {selectedDoctor.subscription.id && (
                            <Link
                              href={`/admin/subscriptions/${selectedDoctor.subscription.id}/edit`}
                              className="inline-flex items-center rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
                            >
                              Change plan
                            </Link>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-gray-700">
                        <div><span className="text-gray-500">Max patients:</span> {selectedDoctor.subscription.plan.maxPatients}</div>
                        <div><span className="text-gray-500">Max protocols:</span> {selectedDoctor.subscription.plan.maxProtocols}</div>
                        <div><span className="text-gray-500">Max courses:</span> {selectedDoctor.subscription.plan.maxCourses}</div>
                        <div><span className="text-gray-500">Max products:</span> {selectedDoctor.subscription.plan.maxProducts}</div>
                      </div>
                    </div>
                  )}
              </div>
              ) : null}
              <DialogFooter>
                <div className="flex w-full justify-between">
                  <Button variant="outline" className="h-8" onClick={() => { if (selectedDoctor) openEdit(selectedDoctor); }}>Edit</Button>
                  <Button variant="ghost" className="h-8" onClick={() => setIsViewOpen(false)}>Close</Button>
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Edit Doctor Modal */}
          <Dialog open={isEditOpen} onOpenChange={(o) => { setIsEditOpen(o); }}>
            <DialogContent className="sm:max-w-[520px]">
              <DialogHeader>
                <DialogTitle>Edit doctor</DialogTitle>
                <DialogDescription>Update the doctor information.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleEdit} className="space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700">Name</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-400 focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700">Email</label>
                    <input
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-400 focus:outline-none"
                      required
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="ghost" className="h-8" onClick={() => setIsEditOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={isSubmitting} className="h-8">{isSubmitting ? 'Saving...' : 'Save'}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

        </div>
      </div>
    </div>
  );
}