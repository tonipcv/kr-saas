'use client';

import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [navigated, setNavigated] = useState(false);

  useEffect(() => {
    // Aguardar até que o status da sessão seja definido
    console.log('Home page - Session status:', status);
    console.log('Home page - Session data:', session);
    
    if (status === 'loading') {
      console.log('Home page - Session still loading');
      return;
    }

    if (status === 'unauthenticated') {
      console.log('Home page - User not authenticated, redirecting to public home');
      if (!navigated) { router.replace('/home'); setNavigated(true); }
      return;
    }

    const navigateOnce = (path: string) => {
      if (navigated) return;
      router.replace(path);
      setNavigated(true);
    };

    // If we already have role in session, handle SUPER_ADMIN immediately,
    // and defer DOCTOR to a clinic check to decide dashboard vs. trial plans.
    const roleInSession = session?.user?.role;
    if (roleInSession && !navigated) {
      if (roleInSession === 'SUPER_ADMIN') {
        navigateOnce('/admin');
        return;
      }
      // For DOCTOR we will still run the clinic check below
      if (roleInSession !== 'DOCTOR') {
        navigateOnce('/patient/referrals');
        return;
      }
    }

    const checkUserRole = async () => {
      try {
        setIsChecking(true);
        
        // Aguardar um pouco para garantir que a sessão está totalmente estabelecida
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Usar API específica para verificar role
        const response = await fetch('/api/auth/role', {
          headers: {
            'Cache-Control': 'no-cache'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          
          console.log('Role API response:', data);
          
          if (data.role === 'SUPER_ADMIN') {
            console.log('Redirecting to admin dashboard');
            navigateOnce('/admin');
          } else if (data.role === 'DOCTOR') {
            console.log('Checking doctor clinics to decide destination');
            try {
              const clinicRes = await fetch('/api/clinics/current', { headers: { 'Cache-Control': 'no-cache' } });
              if (clinicRes.ok) {
                console.log('Active clinic found. Redirecting to doctor dashboard');
                navigateOnce('/doctor/dashboard');
              } else if (clinicRes.status === 404) {
                console.log('No active clinic found. Redirecting to trial plans');
                navigateOnce('/clinic/planos-trial');
              } else {
                console.warn('Unexpected clinics/current response', clinicRes.status);
                navigateOnce('/doctor/dashboard');
              }
            } catch (e) {
              console.error('Error checking current clinic:', e);
              // Fallback to dashboard
              navigateOnce('/doctor/dashboard');
            }
          } else {
            console.log('Redirecting to patient referrals');
            // Use replace instead of push to avoid browser history issues
            // Try both path formats to handle different environments
            try {
              console.log('Attempting to redirect to authenticated patient referrals');
              navigateOnce('/patient/referrals');
            } catch (e) {
              console.error('Error redirecting:', e);
              // Fallback to alternative path format
              console.log('Falling back to alternative path format for referrals');
              navigateOnce('/patient/referrals');
            }
          }
        } else if (response.status === 401) {
          console.log('Sessão inválida ou usuário não encontrado - fazendo logout e enviando ao /home');
          // Sessão inválida ou usuário não existe no banco
          // Limpar sessão e redirecionar para login
          await signOut({ redirect: false });
          navigateOnce('/home');
        } else {
          console.error('Error checking role:', response.status, await response.text());
          // Para outros erros, assumir paciente como fallback
          navigateOnce('/patient/protocols');
        }
      } catch (error) {
        console.error('Error during role detection:', error);
        // Fallback using session in memory when available
        const role = session?.user?.role;
        if (role === 'SUPER_ADMIN') navigateOnce('/admin');
        else if (role === 'DOCTOR') {
          // Best-effort clinic check even on fallback
          try {
            const clinicRes = await fetch('/api/clinics/current', { headers: { 'Cache-Control': 'no-cache' } });
            if (clinicRes.status === 404) return navigateOnce('/clinic/planos-trial');
          } catch {}
          navigateOnce('/doctor/dashboard');
        }
        else navigateOnce('/patient/referrals');
      } finally {
        setIsChecking(false);
      }
    };

    if (session && !navigated) {
      checkUserRole();
    }
  }, [session, status, router, navigated]);

  if (status === 'loading' || isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="relative w-12 h-12 mx-auto mb-6">
            <Image
              src="/logo.png"
              alt="Logo"
              fill
              className="object-contain"
              priority
            />
          </div>
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-[#5154e7]/30 border-t-[#5154e7]"></div>
        </div>
      </div>
    );
  }

  return null;
}
