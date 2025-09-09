'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface ClinicData {
  id: string;
  name: string;
  description: string | null;
  logo: string | null;
  slug?: string | null;
  website?: string | null;
  city?: string | null;
  state?: string | null;
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
    id: string;
    status: string;
    plan: {
      name: string;
    };
  } | null;
}

interface ClinicContextType {
  currentClinic: ClinicData | null;
  availableClinics: ClinicData[];
  isLoading: boolean;
  switchClinic: (clinicId: string) => void;
  refreshClinics: () => Promise<void>;
}

const ClinicContext = createContext<ClinicContextType | undefined>(undefined);

export function ClinicProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const [currentClinic, setCurrentClinic] = useState<ClinicData | null>(null);
  const [availableClinics, setAvailableClinics] = useState<ClinicData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Carregar clínicas do usuário
  const loadClinics = async () => {
    if (!session?.user?.id) return;

    try {
      setIsLoading(true);
      const response = await fetch('/api/clinics', { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        const list: ClinicData[] = data.clinics || [];
        setAvailableClinics(list);

        // Se já há clínica atual, atualizá-la com a versão mais recente pelo id
        if (currentClinic) {
          const updated = list.find((c: ClinicData) => c.id === currentClinic.id);
          if (updated) {
            setCurrentClinic(updated);
          }
        }

        // Se não há clínica atual, selecionar a primeira
        if (!currentClinic && list.length > 0) {
          const savedClinicId = localStorage.getItem('selectedClinicId');
          const clinicToSelect = savedClinicId 
            ? list.find((c: ClinicData) => c.id === savedClinicId) || list[0]
            : list[0];
          setCurrentClinic(clinicToSelect);
        }
      }
    } catch (error) {
      console.error('Error loading clinics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Trocar clínica ativa
  const switchClinic = (clinicId: string) => {
    const clinic = availableClinics.find(c => c.id === clinicId);
    if (clinic) {
      setCurrentClinic(clinic);
      localStorage.setItem('selectedClinicId', clinicId);
      
      // Disparar evento customizado para outras partes da aplicação
      window.dispatchEvent(new CustomEvent('clinicChanged', { 
        detail: { clinicId, clinic } 
      }));
    }
  };

  // Recarregar clínicas
  const refreshClinics = async () => {
    await loadClinics();
  };

  // Carregar clínicas quando o usuário logar
  useEffect(() => {
    if (session?.user?.id) {
      loadClinics();
    }
  }, [session?.user?.id]);

  // Limpar dados quando o usuário deslogar
  useEffect(() => {
    if (!session?.user?.id) {
      setCurrentClinic(null);
      setAvailableClinics([]);
      localStorage.removeItem('selectedClinicId');
    }
  }, [session?.user?.id]);

  return (
    <ClinicContext.Provider value={{
      currentClinic,
      availableClinics,
      isLoading,
      switchClinic,
      refreshClinics
    }}>
      {children}
    </ClinicContext.Provider>
  );
}

export function useClinic() {
  const context = useContext(ClinicContext);
  if (context === undefined) {
    throw new Error('useClinic must be used within a ClinicProvider');
  }
  return context;
}
