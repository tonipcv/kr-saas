'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  ArrowLeftIcon,
  BuildingOfficeIcon,
  UsersIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  MapPinIcon,
  EnvelopeIcon,
  PhoneIcon,
  GlobeAltIcon,
  CameraIcon,
  TrashIcon,
  PencilIcon
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { toast } from 'sonner';

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
    price: number;
  };
}

interface SubscriptionPlan {
  id: string;
  name: string;
  price: number | null;
  maxDoctors: number;
  features: string | null;
  tier?: string | null;
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
}

export default function EditClinicPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const params = useParams();
  const clinicId = params.id as string;

  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    country: '',
    website: '',
    isActive: true
  });

  const [subscriptionData, setSubscriptionData] = useState({
    planId: '',
    status: 'ACTIVE',
    maxDoctors: 1
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        
        // Load clinic data and plans in parallel
        const [clinicResponse, plansResponse] = await Promise.all([
          fetch(`/api/admin/clinics/${clinicId}`),
          fetch(`/api/admin/plans?clinicId=${encodeURIComponent(clinicId)}`)
        ]);

        if (clinicResponse.ok) {
          const clinicData = await clinicResponse.json();
          setClinic(clinicData.clinic);
          
          // Populate form with clinic data
          setFormData({
            name: clinicData.clinic.name || '',
            description: clinicData.clinic.description || '',
            email: clinicData.clinic.email || '',
            phone: clinicData.clinic.phone || '',
            address: clinicData.clinic.address || '',
            city: clinicData.clinic.city || '',
            state: clinicData.clinic.state || '',
            zipCode: clinicData.clinic.zipCode || '',
            country: clinicData.clinic.country || '',
            website: clinicData.clinic.website || '',
            isActive: clinicData.clinic.isActive
          });

          // Populate subscription data if exists
          if (clinicData.clinic.subscription) {
            setSubscriptionData({
              planId: clinicData.clinic.subscription.plan.id,
              status: clinicData.clinic.subscription.status,
              maxDoctors: clinicData.clinic.subscription.maxDoctors
            });
          }
        }

        if (plansResponse.ok) {
          const plansData = await plansResponse.json();
          setPlans(plansData.plans || []);
        }
      } catch (error) {
        console.error('Error loading data:', error);
        toast.error('Error loading clinic data');
      } finally {
        setIsLoading(false);
      }
    };

    if (session && clinicId) {
      loadData();
    }
  }, [session, clinicId]);

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubscriptionChange = (field: string, value: string | number) => {
    setSubscriptionData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);

      const response = await fetch(`/api/admin/clinics/${clinicId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          subscription: subscriptionData
        }),
      });

      if (response.ok) {
        toast.success('Clinic updated successfully');
        router.push('/admin/clinics');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Error updating clinic');
      }
    } catch (error) {
      console.error('Error saving clinic:', error);
      toast.error('Error updating clinic');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this clinic? This action cannot be undone.')) {
      return;
    }

    try {
      setIsDeleting(true);
      const response = await fetch(`/api/admin/clinics/${clinicId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('Clinic deleted successfully');
        router.push('/admin/clinics');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Error deleting clinic');
      }
    } catch (error) {
      console.error('Error deleting clinic:', error);
      toast.error('Error deleting clinic');
    } finally {
      setIsDeleting(false);
    }
  };

  const getSubscriptionStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-100 text-green-800';
      case 'TRIAL': return 'bg-blue-100 text-blue-800';
      case 'EXPIRED': return 'bg-red-100 text-red-800';
      case 'SUSPENDED': return 'bg-yellow-100 text-yellow-800';
      case 'CANCELLED': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const selectedPlan = plans.find(p => p.id === subscriptionData.planId);

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

            {/* Form Skeleton */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white border border-gray-200 shadow-lg rounded-2xl p-6">
                  <div className="h-6 bg-gray-200 rounded w-32 animate-pulse mb-6"></div>
                  <div className="space-y-4">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <div key={i} className="space-y-2">
                        <div className="h-4 bg-gray-200 rounded w-24 animate-pulse"></div>
                        <div className="h-10 bg-gray-100 rounded-lg animate-pulse"></div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="space-y-6">
                <div className="bg-white border border-gray-200 shadow-lg rounded-2xl p-6">
                  <div className="h-6 bg-gray-200 rounded w-32 animate-pulse mb-6"></div>
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="space-y-2">
                        <div className="h-4 bg-gray-200 rounded w-24 animate-pulse"></div>
                        <div className="h-10 bg-gray-100 rounded-lg animate-pulse"></div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!clinic) {
    return (
      <div className="min-h-screen bg-white">
        <div className="lg:ml-64">
          <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24">
            <div className="text-center py-12">
              <ExclamationTriangleIcon className="h-16 w-16 text-red-400 mx-auto mb-4" />
              <p className="text-red-600 text-lg">Clinic not found.</p>
              <Button asChild className="mt-4 bg-turquoise hover:bg-turquoise/90 text-black font-semibold">
                <Link href="/admin/clinics">
                  <ArrowLeftIcon className="h-4 w-4 mr-2" />
                  Back to Clinics
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24">
          
          {/* Header */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 mb-8">
            <div>
              <h1 className="text-3xl font-light text-gray-900 tracking-tight">
                Edit Clinic
              </h1>
              <p className="text-gray-600 mt-1">
                Update clinic information and settings
              </p>
            </div>
            <div className="flex gap-3">
              <Button 
                onClick={handleSave}
                disabled={isSaving}
                className="bg-turquoise hover:bg-turquoise/90 text-black font-semibold shadow-lg shadow-turquoise/25 hover:shadow-turquoise/40 hover:scale-105 transition-all duration-200"
              >
                {isSaving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black mr-2"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircleIcon className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
              <Button 
                onClick={handleDelete}
                disabled={isDeleting}
                variant="destructive"
                className="bg-red-600 hover:bg-red-700 text-white font-semibold shadow-lg shadow-red-600/25 hover:shadow-red-600/40 hover:scale-105 transition-all duration-200"
              >
                {isDeleting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Deleting...
                  </>
                ) : (
                  <>
                    <TrashIcon className="h-4 w-4 mr-2" />
                    Delete Clinic
                  </>
                )}
              </Button>
              <Button 
                asChild
                variant="outline"
                className="bg-white border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-gray-900 shadow-sm"
              >
                <Link href="/admin/clinics">
                  <ArrowLeftIcon className="h-4 w-4 mr-2" />
                  Back to Clinics
                </Link>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Form */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Basic Information */}
              <Card className="bg-white border border-gray-200 shadow-lg rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <BuildingOfficeIcon className="h-5 w-5 text-turquoise" />
                    Basic Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-sm font-medium text-gray-700">
                        Clinic Name *
                      </Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        className="border-gray-300 focus:border-turquoise focus:ring-turquoise"
                        placeholder="Enter clinic name"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                        Email
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        className="border-gray-300 focus:border-turquoise focus:ring-turquoise"
                        placeholder="clinic@example.com"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description" className="text-sm font-medium text-gray-700">
                      Description
                    </Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => handleInputChange('description', e.target.value)}
                      className="border-gray-300 focus:border-turquoise focus:ring-turquoise"
                      placeholder="Brief description of the clinic"
                      rows={3}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="phone" className="text-sm font-medium text-gray-700">
                        Phone
                      </Label>
                      <Input
                        id="phone"
                        value={formData.phone}
                        onChange={(e) => handleInputChange('phone', e.target.value)}
                        className="border-gray-300 focus:border-turquoise focus:ring-turquoise"
                        placeholder="+1 (555) 123-4567"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="website" className="text-sm font-medium text-gray-700">
                        Website
                      </Label>
                      <Input
                        id="website"
                        value={formData.website}
                        onChange={(e) => handleInputChange('website', e.target.value)}
                        className="border-gray-300 focus:border-turquoise focus:ring-turquoise"
                        placeholder="https://www.clinic.com"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Address Information */}
              <Card className="bg-white border border-gray-200 shadow-lg rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <MapPinIcon className="h-5 w-5 text-turquoise" />
                    Address Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="address" className="text-sm font-medium text-gray-700">
                      Street Address
                    </Label>
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) => handleInputChange('address', e.target.value)}
                      className="border-gray-300 focus:border-turquoise focus:ring-turquoise"
                      placeholder="123 Main Street"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="city" className="text-sm font-medium text-gray-700">
                        City
                      </Label>
                      <Input
                        id="city"
                        value={formData.city}
                        onChange={(e) => handleInputChange('city', e.target.value)}
                        className="border-gray-300 focus:border-turquoise focus:ring-turquoise"
                        placeholder="New York"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="state" className="text-sm font-medium text-gray-700">
                        State
                      </Label>
                      <Input
                        id="state"
                        value={formData.state}
                        onChange={(e) => handleInputChange('state', e.target.value)}
                        className="border-gray-300 focus:border-turquoise focus:ring-turquoise"
                        placeholder="NY"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="zipCode" className="text-sm font-medium text-gray-700">
                        ZIP Code
                      </Label>
                      <Input
                        id="zipCode"
                        value={formData.zipCode}
                        onChange={(e) => handleInputChange('zipCode', e.target.value)}
                        className="border-gray-300 focus:border-turquoise focus:ring-turquoise"
                        placeholder="10001"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="country" className="text-sm font-medium text-gray-700">
                      Country
                    </Label>
                    <Input
                      id="country"
                      value={formData.country}
                      onChange={(e) => handleInputChange('country', e.target.value)}
                      className="border-gray-300 focus:border-turquoise focus:ring-turquoise"
                      placeholder="United States"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              
              {/* Clinic Owner */}
              <Card className="bg-white border border-gray-200 shadow-lg rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <UsersIcon className="h-5 w-5 text-turquoise" />
                    Clinic Owner
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="h-10 w-10 bg-turquoise rounded-full flex items-center justify-center">
                      <span className="text-black font-semibold text-sm">
                        {clinic.owner.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{clinic.owner.name}</p>
                      <p className="text-sm text-gray-600">{clinic.owner.email}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Status Settings */}
              <Card className="bg-white border border-gray-200 shadow-lg rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-gray-900">
                    Status Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium text-gray-700">
                        Clinic Status
                      </Label>
                      <p className="text-xs text-gray-500 mt-1">
                        Enable or disable this clinic
                      </p>
                    </div>
                    <Switch
                      checked={formData.isActive}
                      onCheckedChange={(checked) => handleInputChange('isActive', checked)}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Subscription Settings */}
              <Card className="bg-white border border-gray-200 shadow-lg rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-gray-900">
                    Subscription Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-gray-700">
                      Subscription Plan
                    </Label>
                    <Select
                      value={subscriptionData.planId}
                      onValueChange={(value) => handleSubscriptionChange('planId', value)}
                    >
                      <SelectTrigger className="border-gray-300 focus:border-turquoise focus:ring-turquoise">
                        <SelectValue placeholder="Select a plan" />
                      </SelectTrigger>
                      <SelectContent>
                        {plans.map((plan) => (
                          <SelectItem key={plan.id} value={plan.id}>
                            {plan.name}
                            {plan.tier ? ` (${String(plan.tier).toUpperCase()})` : ''}
                            {plan.price != null ? ` - $${plan.price}/month` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-gray-700">
                      Status
                    </Label>
                    <Select
                      value={subscriptionData.status}
                      onValueChange={(value) => handleSubscriptionChange('status', value)}
                    >
                      <SelectTrigger className="border-gray-300 focus:border-turquoise focus:ring-turquoise">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ACTIVE">Active</SelectItem>
                        <SelectItem value="TRIAL">Trial</SelectItem>
                        <SelectItem value="EXPIRED">Expired</SelectItem>
                        <SelectItem value="SUSPENDED">Suspended</SelectItem>
                        <SelectItem value="CANCELLED">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="maxDoctors" className="text-sm font-medium text-gray-700">
                      Max Doctors
                    </Label>
                    <Input
                      id="maxDoctors"
                      type="number"
                      min="1"
                      value={subscriptionData.maxDoctors}
                      onChange={(e) => handleSubscriptionChange('maxDoctors', parseInt(e.target.value) || 1)}
                      className="border-gray-300 focus:border-turquoise focus:ring-turquoise"
                    />
                  </div>

                  {/* Current Subscription Status */}
                  {clinic.subscription && (
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">Current Status</span>
                        <Badge className={`${getSubscriptionStatusColor(clinic.subscription.status)} border-0`}>
                          {clinic.subscription.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-600">
                        Plan: {clinic.subscription.plan.name}
                      </p>
                      <p className="text-xs text-gray-600">
                        Price: ${clinic.subscription.plan.price}/month
                      </p>
                    </div>
                  )}

                  {/* Selected Plan Info */}
                  {selectedPlan && (
                    <div className="p-3 bg-turquoise/10 border border-turquoise/20 rounded-lg">
                      <h4 className="font-medium text-gray-900 mb-2">{selectedPlan.name}</h4>
                      <p className="text-sm text-gray-600 mb-2">${selectedPlan.price}/month</p>
                      <p className="text-sm text-gray-600">Max Doctors: {selectedPlan.maxDoctors}</p>
                      {selectedPlan.features && (
                        <div className="mt-2">
                          <p className="text-xs font-medium text-gray-700 mb-1">Features:</p>
                          <div className="text-xs text-gray-600">
                            {selectedPlan.features.split(',').map((feature, index) => (
                              <div key={index} className="flex items-center gap-1 mb-1">
                                <CheckCircleIcon className="h-3 w-3 text-turquoise" />
                                {feature.trim()}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Members Summary */}
              {clinic.members && clinic.members.length > 0 && (
                <Card className="bg-white border border-gray-200 shadow-lg rounded-2xl">
                  <CardHeader>
                    <CardTitle className="text-lg font-semibold text-gray-900">
                      Members ({clinic.members.filter(m => m.isActive).length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {clinic.members.filter(m => m.isActive).slice(0, 5).map((member) => (
                        <div key={member.id} className="flex items-center gap-2 text-sm">
                          <div className="h-6 w-6 bg-gray-200 rounded-full flex items-center justify-center">
                            <span className="text-xs font-medium">
                              {member.user.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <span className="text-gray-900">{member.user.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {member.role}
                          </Badge>
                        </div>
                      ))}
                      {clinic.members.filter(m => m.isActive).length > 5 && (
                        <p className="text-xs text-gray-500 mt-2">
                          +{clinic.members.filter(m => m.isActive).length - 5} more members
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 