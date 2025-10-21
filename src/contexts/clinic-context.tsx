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

        // Se já há clínica atual, atualizá-la com a versão mais recente pelo id;
        // se não existir mais, limpar seleção
        if (currentClinic) {
          const updated = list.find((c: ClinicData) => c.id === currentClinic.id);
          if (updated) {
            setCurrentClinic(updated);
          } else {
            setCurrentClinic(null);
            localStorage.removeItem('selectedClinicId');
          }
        }

        // Estratégia de seleção da clínica:
        // 1) Se não há clínica atual, tentar usar a "melhor" clínica fornecida por /api/clinics/current;
        // 2) Depois, respeitar savedClinicId se existir;
        // 3) Fallback para a primeira da lista.
        if (!currentClinic && list.length > 0) {
          const savedClinicId = localStorage.getItem('selectedClinicId');
          let preferredId: string | null = null;

          try {
            const bestRes = await fetch('/api/clinics/current', { cache: 'no-store' });
            if (bestRes.ok) {
              const best = await bestRes.json();
              preferredId = best?.clinic?.id || null;
            }
          } catch {}

          const clinicToSelect = 
            (savedClinicId && list.find((c) => c.id === savedClinicId)) ||
            (preferredId && list.find((c) => c.id === preferredId)) ||
            list[0];

          setCurrentClinic(clinicToSelect);
        }

        // Se não há nenhuma clínica disponível, limpar seleção persistida
        if (list.length === 0) {
          if (currentClinic) setCurrentClinic(null);
          localStorage.removeItem('selectedClinicId');
        }

        // Se a clínica atual não tem plano ativo (ou é Free) mas existe outra ativa/paga,
        // alternar automaticamente APENAS quando o usuário ainda não escolheu manualmente uma clínica.
        // Isto evita que a seleção do usuário (incluindo uma clínica Free) seja revertida.
        if (list.length > 0) {
          const hasActivePaid = (c: ClinicData) => {
            const planName = c?.subscription?.plan?.name?.toLowerCase();
            const isFree = planName === 'free';
            return c?.subscription?.status === 'ACTIVE' && !isFree;
          };

          const bestActive = list.find(hasActivePaid);

          // Respeitar seleção salva do usuário
          const savedClinicId = localStorage.getItem('selectedClinicId');
          const userHasSavedSelection = Boolean(savedClinicId);

          if (bestActive) {
            const currentIsActivePaid = currentClinic && hasActivePaid(currentClinic);
            // Somente auto-alternar se não houver seleção salva do usuário
            if (!currentIsActivePaid && !userHasSavedSelection) {
              setCurrentClinic(bestActive);
              localStorage.setItem('selectedClinicId', bestActive.id);
              window.dispatchEvent(new CustomEvent('clinicChanged', { detail: { clinicId: bestActive.id, clinic: bestActive } }));
            }
          }
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
    // Se a clínica solicitada não existe mais, limpar seleção
    else {
      setCurrentClinic(null);
      localStorage.removeItem('selectedClinicId');
      window.dispatchEvent(new CustomEvent('clinicChanged', { 
        detail: { clinicId: null, clinic: null }
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
