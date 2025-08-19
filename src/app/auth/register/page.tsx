'use client';

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RegisterRedirect() {
  const router = useRouter();

  useEffect(() => {
    // Redirecionar para o novo fluxo de cadastro
    router.replace('/auth/register/email');
  }, [router]);

  // Não renderiza nada para evitar mostrar mensagem de redirecionamento
  return null;
}