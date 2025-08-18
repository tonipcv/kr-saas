'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { signIn, getSession } from 'next-auth/react';
import Image from 'next/image';
import { Loader2, ArrowRight, MapPin, Globe } from 'lucide-react';

interface ClinicData {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  description: string | null;
  website: string | null;
  location: string | null;
  owner: {
    id: string;
    name: string;
    email: string;
  };
}

export default function ClinicLoginPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  // Conditional redirect: doctor slugs -> /[slug]/login; otherwise -> /[slug]
  useEffect(() => {
    if (!slug) return;
    const checkAndRedirect = async () => {
      try {
        const res = await fetch(`/api/v2/doctor-link/${slug}`);
        const json = await res.json().catch(() => ({}));
        if (res.ok && json?.success) {
          router.replace(`/${slug}/login`);
        } else {
          router.replace(`/${slug}`);
        }
      } catch {
        router.replace(`/${slug}`);
      }
    };
    checkAndRedirect();
  }, [router, slug]);

  // Render nothing while redirecting
  return null;
}