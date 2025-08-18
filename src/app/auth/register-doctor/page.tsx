'use client';

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RegisterDoctorRedirect() {
  const router = useRouter();

  useEffect(() => {
    // Redirecionar para o novo fluxo de cadastro
    router.push('/auth/register/email');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
        <p className="mt-4 text-gray-600">Redirecionando...</p>
      </div>
    </div>
  );
}
