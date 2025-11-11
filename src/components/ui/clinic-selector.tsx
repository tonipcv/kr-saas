'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, Building2, Users, Plus, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ClinicData {
  id: string;
  name: string;
  description: string | null;
  logo: string | null;
  ownerId: string;
  owner: {
    id: string;
    name: string | null;
    email: string | null;
  };
  members: {
    id: string;
    role: string;
    user: {
      id: string;
      name: string | null;
      email: string | null;
    };
  }[];
  subscription?: {
    status: string;
    plan: {
      name: string;
    };
  } | null;
}

interface ClinicSelectorProps {
  currentClinic?: ClinicData | null;
  onClinicChange?: (clinicId: string) => void;
  userId?: string;
}

export function ClinicSelector({ currentClinic, onClinicChange, userId }: ClinicSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [clinics, setClinics] = useState<ClinicData[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    fetchClinics();
  }, []);

  const fetchClinics = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/clinics');
      if (response.ok) {
        const data = await response.json();
        setClinics(data.clinics || []);
      }
    } catch (error) {
      console.error('Error loading clinics:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClinicSelect = (clinicId: string) => {
    setIsOpen(false);
    
    if (onClinicChange) {
      onClinicChange(clinicId);
    } else {
      // Navegar para a página da clínica com o parâmetro clinicId
      const params = new URLSearchParams(searchParams.toString());
      params.set('clinicId', clinicId);
      router.push(`/clinic?${params.toString()}`);
    }
  };

  const getClinicInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getUserRole = (clinic: ClinicData) => {
    if (clinic.ownerId === userId) return 'Owner';
    const member = clinic.members.find(m => m.user.id === userId);
    return member?.role || 'Member';
  };

  const getPlanBadgeColor = (status?: string) => {
    return 'bg-gray-100 text-gray-600 border border-gray-200';
  };

  const currentClinicId = searchParams.get('clinicId') || currentClinic?.id;

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          className="h-12 px-3 justify-start bg-white hover:bg-gray-50 border border-gray-200 shadow-sm w-full max-w-xs"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {/* Clinic Logo/Avatar */}
            <div className="h-8 w-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-700 text-sm font-medium shrink-0">
              {currentClinic?.logo ? (
                <img 
                  src={currentClinic.logo} 
                  alt={currentClinic.name} 
                  className="h-8 w-8 rounded-lg object-cover"
                />
              ) : (
                getClinicInitials(currentClinic?.name || 'CL')
              )}
            </div>
            
            {/* Clinic Info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900 truncate">
                  {currentClinic?.name || 'Select Business'}
                </span>
                {currentClinic?.subscription && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${getPlanBadgeColor(currentClinic.subscription.status)}`}>
                    {currentClinic.subscription.plan.name}
                  </span>
                )}
              </div>
            </div>
            
            <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
          </div>
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent align="start" className="w-80 p-2">
        <DropdownMenuLabel className="text-xs font-medium text-gray-500 uppercase tracking-wide px-2">
          Your Businesses
        </DropdownMenuLabel>
        
        {loading ? (
          <div className="p-4 text-center text-sm text-gray-500">
            Loading businesses...
          </div>
        ) : clinics.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-500">
            No businesses found
          </div>
        ) : (
          clinics.map((clinic) => (
            <DropdownMenuItem
              key={clinic.id}
              className="p-3 cursor-pointer hover:bg-gray-50 rounded-lg mb-1"
              onClick={() => handleClinicSelect(clinic.id)}
            >
              <div className="flex items-center gap-3 w-full">
                {/* Clinic Avatar */}
                <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-700 text-sm font-medium">
                  {clinic.logo ? (
                    <img 
                      src={clinic.logo} 
                      alt={clinic.name} 
                      className="h-10 w-10 rounded-lg object-cover"
                    />
                  ) : (
                    getClinicInitials(clinic.name)
                  )}
                </div>
                
                {/* Clinic Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 truncate">
                      {clinic.name}
                    </span>
                    {clinic.subscription && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${getPlanBadgeColor(clinic.subscription.status)}`}>
                        {clinic.subscription.plan.name}
                      </span>
                    )}
                    {currentClinicId === clinic.id && (
                      <Check className="h-4 w-4 text-green-600" />
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-500">
                      {getUserRole(clinic)}
                    </span>
                    <span className="text-xs text-gray-300">•</span>
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Users className="h-3 w-3" />
                      {clinic.members.length} {clinic.members.length === 1 ? 'member' : 'members'}
                    </div>
                  </div>
                  
                  {clinic.subscription && (
                    <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${getPlanBadgeColor(clinic.subscription.status)}`}>
                      {clinic.subscription.plan.name}
                    </span>
                  )}
                </div>
              </div>
            </DropdownMenuItem>
          ))
        )}
        
        <DropdownMenuSeparator className="my-2" />
        
        <DropdownMenuItem 
          className="p-3 cursor-pointer hover:bg-gray-50 rounded-lg text-blue-600"
          onClick={() => {
            setIsOpen(false);
            router.push('/clinic/new');
          }}
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg border-2 border-dashed border-blue-300 flex items-center justify-center">
              <Plus className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <span className="font-medium">Add Business</span>
            </div>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
