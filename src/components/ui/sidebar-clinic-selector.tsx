'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, Building2, Users, Plus, Check } from 'lucide-react';
import { useClinic } from '@/contexts/clinic-context';

export function SidebarClinicSelector() {
  const { currentClinic, availableClinics, isLoading, switchClinic } = useClinic();
  const [isOpen, setIsOpen] = useState(false);
  const [payActive, setPayActive] = useState<boolean>(false);
  const [payLoading, setPayLoading] = useState<boolean>(false);

  const getClinicInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const badgeClasses = (active: boolean) => active
    ? 'bg-green-50 text-green-700 border border-green-200'
    : 'bg-gray-100 text-gray-600 border border-gray-200';

  // Keep plan badge color for the dropdown list (unchanged behavior)
  const getPlanBadgeColor = (_status?: string) => 'bg-gray-100 text-gray-600 border border-gray-200';

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!currentClinic?.id) {
        if (!cancelled) setPayActive(false);
        return;
      }
      try {
        if (!cancelled) setPayLoading(true);
        const res = await fetch(`/api/payments/pagarme/status?clinicId=${encodeURIComponent(currentClinic.id)}`, { cache: 'no-store' });
        const js = await res.json().catch(() => ({}));
        const connected = res.ok && (js?.connected === true) && !!(js?.recipientId);
        if (!cancelled) setPayActive(connected);
      } catch {
        if (!cancelled) setPayActive(false);
      } finally {
        if (!cancelled) setPayLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [currentClinic?.id]);

  if (isLoading) {
    return (
      <div className="p-3 border-b border-gray-200">
        <div className="animate-pulse">
          <div className="h-10 bg-gray-200 rounded-lg"></div>
        </div>
      </div>
    );
  }

  if (!currentClinic) {
    return null;
  }

  return (
    <div className="relative p-3 border-b border-gray-200">
      {/* Current Clinic Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors"
      >
        {/* Clinic Logo/Avatar */}
        <div className="h-8 w-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-700 text-sm font-medium shrink-0">
          {currentClinic.logo ? (
            <img 
              src={currentClinic.logo} 
              alt={currentClinic.name} 
              className="h-8 w-8 rounded-lg object-cover"
            />
          ) : (
            getClinicInitials(currentClinic.name)
          )}
        </div>
        
        {/* Clinic Info */}
        <div className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 truncate text-sm">
              {currentClinic.name}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${badgeClasses(payActive)}`}>
              {payLoading ? '...' : (payActive ? 'Active' : 'Inactive')}
            </span>
          </div>
        </div>
        
        <ChevronDown className={`h-4 w-4 text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Upgrade CTA – botão preto em baixo */}
      <div className="mt-3 px-1">
        <Link
          href={currentClinic?.id ? `/clinic/subscription?clinicId=${encodeURIComponent(currentClinic.id)}#plans` : "/clinic/subscription#plans"}
          className="block w-full h-8 rounded-md bg-gray-900 text-white text-xs font-semibold text-center leading-8 hover:bg-black transition-colors"
        >
          Upgrade
        </Link>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-3 right-3 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
          <div className="p-2">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide px-2 py-1">
              Your Businesses
            </div>
            
            {availableClinics.map((clinic) => (
              <button
                key={clinic.id}
                className="w-full flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg mb-1 text-left"
                onClick={() => {
                  switchClinic(clinic.id);
                  setIsOpen(false);
                }}
              >
                {/* Clinic Avatar */}
                <div className="h-8 w-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-700 text-sm font-medium">
                  {clinic.logo ? (
                    <img 
                      src={clinic.logo} 
                      alt={clinic.name} 
                      className="h-8 w-8 rounded-lg object-cover"
                    />
                  ) : (
                    getClinicInitials(clinic.name)
                  )}
                </div>
                
                {/* Clinic Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 truncate text-sm">
                      {clinic.name}
                    </span>
                    {clinic.subscription && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${getPlanBadgeColor(clinic.subscription.status)}`}>
                        {clinic.subscription.plan.name}
                      </span>
                    )}
                    {currentClinic.id === clinic.id && (
                      <Check className="h-3 w-3 text-green-600" />
                    )}
                  </div>
                  
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Users className="h-3 w-3" />
                    {clinic.members.length} {clinic.members.length === 1 ? 'member' : 'members'}
                    <span className="mx-1">•</span>
                    <button
                      type="button"
                      className="text-blue-600 hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        switchClinic(clinic.id);
                        setIsOpen(false);
                        window.location.href = `/clinic/subscription?clinicId=${encodeURIComponent(clinic.id)}#plans`;
                      }}
                    >
                      Upgrade
                    </button>
                  </div>
                </div>
              </button>
            ))}
            
            <div className="border-t border-gray-200 mt-2 pt-2">
              <button 
                className="w-full flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg text-blue-600 text-left"
                onClick={() => {
                  setIsOpen(false);
                  // First step: collect business info, then proceed to trial plans
                  window.location.href = '/clinic/new';
                }}
              >
                <div className="h-8 w-8 rounded-lg border-2 border-dashed border-blue-300 flex items-center justify-center">
                  <Plus className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <span className="font-medium text-sm">Add Business</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overlay to close dropdown */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}
