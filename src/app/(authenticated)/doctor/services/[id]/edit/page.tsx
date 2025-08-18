'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from '@/components/ui/use-toast';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';

interface DoctorService {
  id: string;
  name: string;
  description?: string;
  duration: number;
  fee_type: 'FIXED' | 'ONGOING';
  fee?: number;
  fee_visibility: 'REQUIRE_PAYMENT' | 'HIDE_FEE' | 'DISPLAY_FEE';
  availability: ('IN_PERSON' | 'PHONE' | 'VIDEO')[];
  button_label: string;
  confirmation_label: string;
  redirect_url?: string;
  is_active: boolean;
  stripe_product_id?: string;
  stripe_price_id?: string;
}

export default function EditServicePage() {
  const router = useRouter();
  const params = useParams();
  const serviceId = params.id as string;
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    duration: 30,
    fee_type: 'FIXED',
    fee: '',
    fee_visibility: 'DISPLAY_FEE',
    availability: {
      IN_PERSON: false,
      PHONE: false,
      VIDEO: false
    },
    button_label: 'Book Appointment',
    confirmation_label: 'Appointment Confirmed',
    redirect_url: '',
    is_active: true
  });

  useEffect(() => {
    fetchServiceDetails();
  }, [serviceId]);

  const fetchServiceDetails = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/v2/doctor/services/${serviceId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch service details');
      }
      
      const data = await response.json();
      const service = data.data;
      
      // Transform availability array to object
      const availabilityObj = {
        IN_PERSON: service.availability.includes('IN_PERSON'),
        PHONE: service.availability.includes('PHONE'),
        VIDEO: service.availability.includes('VIDEO')
      };
      
      setFormData({
        name: service.name,
        description: service.description || '',
        duration: service.duration,
        fee_type: service.fee_type,
        fee: service.fee !== null ? service.fee.toString() : '',
        fee_visibility: service.fee_visibility,
        availability: availabilityObj,
        button_label: service.button_label,
        confirmation_label: service.confirmation_label,
        redirect_url: service.redirect_url || '',
        is_active: service.is_active
      });
    } catch (error) {
      console.error('Error fetching service details:', error);
      toast({
        title: 'Error',
        description: 'Failed to load service details. Please try again.',
        variant: 'destructive',
      });
      router.push('/doctor/services');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCheckboxChange = (name: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      availability: {
        ...prev.availability,
        [name]: checked
      }
    }));
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const numValue = value === '' ? '' : parseFloat(value);
    setFormData(prev => ({ ...prev, [name]: numValue }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    if (!formData.name.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Service name is required',
        variant: 'destructive',
      });
      return;
    }

    if (Object.values(formData.availability).every(v => !v)) {
      toast({
        title: 'Validation Error',
        description: 'At least one availability option must be selected',
        variant: 'destructive',
      });
      return;
    }

    // Format data for API
    const availability = Object.entries(formData.availability)
      .filter(([_, isSelected]) => isSelected)
      .map(([type]) => type);

    const serviceData = {
      ...formData,
      availability,
      fee: formData.fee === '' ? null : parseFloat(formData.fee as string),
      duration: parseInt(formData.duration.toString())
    };

    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/v2/doctor/services/${serviceId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(serviceData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update service');
      }

      toast({
        title: 'Success',
        description: 'Service updated successfully',
      });

      router.push('/doctor/services');
    } catch (error) {
      console.error('Error updating service:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update service',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex items-center mb-6">
          <div className="mr-4">
            <Skeleton className="h-10 w-10" />
          </div>
          <Skeleton className="h-10 w-64" />
        </div>
        
        <Card className="mb-6">
          <CardHeader>
            <Skeleton className="h-8 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-6 w-1/3" />
          </CardContent>
        </Card>
        
        <Card className="mb-6">
          <CardHeader>
            <Skeleton className="h-8 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-6 w-full" />
            <div className="mt-4 space-y-2">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-6 w-1/2" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center mb-6">
        <Link href="/doctor/services" className="mr-4">
          <Button variant="outline" size="icon">
            <ArrowLeftIcon className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-3xl font-bold">Edit Service</h1>
      </div>

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Service Name *</Label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="e.g., Initial Consultation"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                placeholder="Describe what this service includes..."
                rows={3}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="duration">Duration (minutes) *</Label>
              <Input
                id="duration"
                name="duration"
                type="number"
                min="5"
                step="5"
                value={formData.duration}
                onChange={handleNumberChange}
                required
              />
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Availability</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                Select all the ways this service can be provided *
              </p>
              
              <div className="flex flex-col space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="in-person" 
                    checked={formData.availability.IN_PERSON}
                    onCheckedChange={(checked) => 
                      handleCheckboxChange('IN_PERSON', checked === true)
                    }
                  />
                  <Label htmlFor="in-person">In-person</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="phone" 
                    checked={formData.availability.PHONE}
                    onCheckedChange={(checked) => 
                      handleCheckboxChange('PHONE', checked === true)
                    }
                  />
                  <Label htmlFor="phone">Phone</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="video" 
                    checked={formData.availability.VIDEO}
                    onCheckedChange={(checked) => 
                      handleCheckboxChange('VIDEO', checked === true)
                    }
                  />
                  <Label htmlFor="video">Video</Label>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fee_type">Fee Type</Label>
              <Select 
                value={formData.fee_type} 
                onValueChange={(value) => handleSelectChange('fee_type', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select fee type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIXED">One-time payment</SelectItem>
                  <SelectItem value="ONGOING">Recurring payment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="fee">Fee (leave empty if free)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2">$</span>
                <Input
                  id="fee"
                  name="fee"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.fee}
                  onChange={handleNumberChange}
                  className="pl-8"
                  placeholder="0.00"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="fee_visibility">Fee Visibility</Label>
              <Select 
                value={formData.fee_visibility} 
                onValueChange={(value) => handleSelectChange('fee_visibility', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select fee visibility" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DISPLAY_FEE">Display fee</SelectItem>
                  <SelectItem value="HIDE_FEE">Hide fee</SelectItem>
                  <SelectItem value="REQUIRE_PAYMENT">Require payment</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">
                {formData.fee_visibility === 'DISPLAY_FEE' 
                  ? 'Fee will be displayed to patients before booking.'
                  : formData.fee_visibility === 'HIDE_FEE'
                    ? 'Fee will not be shown to patients.'
                    : 'Patients must pay before booking is confirmed.'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Advanced Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="button_label">Button Label</Label>
              <Input
                id="button_label"
                name="button_label"
                value={formData.button_label}
                onChange={handleInputChange}
                placeholder="e.g., Book Appointment"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="confirmation_label">Confirmation Label</Label>
              <Input
                id="confirmation_label"
                name="confirmation_label"
                value={formData.confirmation_label}
                onChange={handleInputChange}
                placeholder="e.g., Appointment Confirmed"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="redirect_url">Redirect URL (optional)</Label>
              <Input
                id="redirect_url"
                name="redirect_url"
                value={formData.redirect_url}
                onChange={handleInputChange}
                placeholder="https://example.com/thank-you"
              />
              <p className="text-xs text-gray-500 mt-1">
                If provided, patients will be redirected to this URL after booking.
              </p>
            </div>
            
            <div className="flex items-center space-x-2 pt-2">
              <Checkbox 
                id="is_active" 
                checked={formData.is_active}
                onCheckedChange={(checked) => 
                  setFormData(prev => ({ ...prev, is_active: checked === true }))
                }
              />
              <Label htmlFor="is_active">Active (service will be available for booking)</Label>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end space-x-4">
          <Link href="/doctor/services">
            <Button variant="outline" type="button">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </div>
  );
}
