'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  PlusIcon,
  MagnifyingGlassIcon,
  CurrencyDollarIcon,
  PencilIcon,
  EyeIcon,
  XMarkIcon,
  LinkIcon,
  VideoCameraIcon,
  PhoneIcon,
  UserGroupIcon
} from '@heroicons/react/24/outline';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { formatCurrency } from '@/lib/utils';
import { ClipboardDocumentIcon, EllipsisHorizontalIcon, PencilSquareIcon, EyeIcon as EyeIconSolid, EyeSlashIcon, ExclamationCircleIcon } from '@heroicons/react/24/solid';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem
} from '@radix-ui/react-dropdown-menu';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

interface DoctorService {
  id: string;
  nome: string;
  descricao?: string;
  duracao: number;
  tipo_valor: 'FIXED' | 'ONGOING';
  valor?: number;
  visibilidade_valor: 'REQUIRE_PAYMENT' | 'HIDE_FEE' | 'DISPLAY_FEE';
  disponibilidade: ('IN_PERSON' | 'PHONE' | 'VIDEO')[];
  label_botao: string;
  label_confirmacao: string;
  url_redirect?: string;
  ativo: boolean;
  id_produto_stripe?: string;
  id_preco_stripe?: string;
  criado_em: Date;
  atualizado_em: Date;
}

interface StripeAccount {
  id: string;
  details_submitted: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
}

export default function ServicesPage() {
  const router = useRouter();
  const [services, setServices] = useState<DoctorService[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedService, setSelectedService] = useState<DoctorService | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoadingService, setIsLoadingService] = useState(false);
  const [stripeAccount, setStripeAccount] = useState<StripeAccount | null>(null);
  const [isLoadingStripe, setIsLoadingStripe] = useState(true);

  useEffect(() => {
    fetchServices();
    fetchStripeAccount();
  }, []);

  const fetchServices = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/v2/doctor/services');
      if (!response.ok) {
        throw new Error('Failed to fetch services');
      }
      const data = await response.json();
      setServices(data.data || []);
    } catch (error) {
      console.error('Error fetching services:', error);
      toast({
        title: 'Error',
        description: 'Failed to load services. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStripeAccount = async () => {
    setIsLoadingStripe(true);
    try {
      const response = await fetch('/api/v2/doctor/stripe-connect');
      if (!response.ok) {
        throw new Error('Failed to fetch Stripe account');
      }
      const data = await response.json();
      setStripeAccount(data.data || null);
    } catch (error) {
      console.error('Error fetching Stripe account:', error);
    } finally {
      setIsLoadingStripe(false);
    }
  };

  const handleViewDetails = async (serviceId: string) => {
    setIsLoadingService(true);
    try {
      const response = await fetch(`/api/v2/doctor/services/${serviceId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch service details');
      }
      const data = await response.json();
      setSelectedService(data.data);
      setIsModalOpen(true);
    } catch (error) {
      console.error('Error fetching service details:', error);
      toast({
        title: 'Error',
        description: 'Failed to load service details. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingService(false);
    }
  };

  const handleDeactivateService = async (serviceId: string) => {
    if (!confirm('Are you sure you want to deactivate this service?')) {
      return;
    }

    try {
      const response = await fetch(`/api/v2/doctor/services/${serviceId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Failed to deactivate service');
      }
      
      toast({
        title: 'Success',
        description: 'Service deactivated successfully.',
      });
      
      fetchServices();
    } catch (error) {
      console.error('Error deactivating service:', error);
      toast({
        title: 'Error',
        description: 'Failed to deactivate service. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const filteredServices = services.filter(service => 
    service.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (service.descricao && service.descricao.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const renderAvailabilityIcons = (disponibilidade: string[]) => {
    return (
      <div className="flex space-x-1">
        {disponibilidade.includes('IN_PERSON') && (
          <UserGroupIcon className="h-5 w-5 text-gray-500" title="In-person" />
        )}
        {disponibilidade.includes('PHONE') && (
          <PhoneIcon className="h-5 w-5 text-gray-500" title="Phone" />
        )}
        {disponibilidade.includes('VIDEO') && (
          <VideoCameraIcon className="h-5 w-5 text-gray-500" title="Video" />
        )}
      </div>
    );
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Doctor Services</h1>
          <p className="text-gray-500 mt-1">Manage your offered services and pricing</p>
        </div>
        <Button onClick={() => router.push('/doctor/services/create')}>
          Add Service
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="p-4 border-b border-gray-100">
              <Skeleton className="h-6 w-1/4 mb-2" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        </div>
      ) : services.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-gray-200 rounded-lg">
          <ClipboardDocumentIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 font-medium text-gray-900">No services yet</h3>
          <p className="mt-1 text-gray-500">Get started by creating your first service</p>
          <div className="mt-6">
            <Button onClick={() => router.push('/doctor/services/create')}>
              Create Service
            </Button>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="grid grid-cols-12 px-6 py-3 text-sm font-medium text-gray-500 border-b border-gray-200">
            <div className="col-span-5">Service</div>
            <div className="col-span-2">Duration</div>
            <div className="col-span-2">Fee</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-1"></div>
          </div>
          
          <div className="divide-y divide-gray-100">
            {services.map((service) => (
              <div key={service.id} className="grid grid-cols-12 px-6 py-4 hover:bg-gray-50">
                <div className="col-span-5">
                  <div className="font-medium text-gray-900">{service.nome}</div>
                  <div className="text-sm text-gray-500 mt-1">{service.descricao || 'No description'}</div>
                </div>
                
                <div className="col-span-2 text-sm text-gray-900">
                  {service.duracao} minutes
                </div>
                
                <div className="col-span-2 text-sm text-gray-900">
                  {formatCurrency(service.valor || 0)}
                </div>
                
                <div className="col-span-2">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${service.ativo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                    {service.ativo ? 'Active' : 'Inactive'}
                  </span>
                </div>
                
                <div className="col-span-1 flex justify-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <EllipsisHorizontalIcon className="h-5 w-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => router.push(`/doctor/services/${service.id}/edit`)}>
                        <PencilSquareIcon className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => handleDeactivateService(service.id)}
                        className={service.ativo ? 'text-red-600' : 'text-green-600'}
                      >
                        {service.ativo ? (
                          <>
                            <EyeSlashIcon className="mr-2 h-4 w-4" />
                            Deactivate
                          </>
                        ) : (
                          <>
                            <EyeIconSolid className="mr-2 h-4 w-4" />
                            Activate
                          </>
                        )}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!stripeAccount && (
        <Alert className="mt-8 bg-blue-50 border-blue-100">
          <div className="flex items-start">
            <ExclamationCircleIcon className="h-5 w-5 text-blue-500 mt-0.5" />
            <div className="ml-3">
              <AlertTitle className="text-blue-800">Payment setup required</AlertTitle>
              <AlertDescription className="text-blue-700">
                To accept payments for your services, you need to connect a Stripe account.
                <Button 
                  variant="link" 
                  className="ml-2 px-0 text-blue-700 hover:text-blue-800"
                  onClick={() => router.push('/doctor/payments')}
                >
                  Set up payments now
                </Button>
              </AlertDescription>
            </div>
          </div>
        </Alert>
      )}
    </div>
  );
}
