import ClientForgotPassword, { ClinicBranding } from './ClientForgotPassword';
import { prisma } from '@/lib/prisma';

export default async function DoctorForgotPasswordPage({ params }: { params: { slug: string } }) {
  const slug = params.slug;

  // Minimal clinic info
  const clinic = await prisma.clinic.findUnique({
    where: { slug, isActive: true },
    select: { name: true, logo: true },
  });

  // Branding via raw query to avoid client typing issues
  let branding: ClinicBranding = {
    theme: 'LIGHT',
    buttonColor: '#111827',
    buttonTextColor: '#ffffff',
    name: clinic?.name ?? null,
    logo: clinic?.logo ?? null,
  };
  try {
    const rows = await prisma.$queryRaw<{ theme: 'LIGHT'|'DARK'; buttonColor: string | null; buttonTextColor: string | null }[]>`
      SELECT theme::text as theme, "buttonColor", "buttonTextColor" FROM clinics WHERE slug = ${slug} LIMIT 1
    `;
    if (rows && rows[0]) {
      branding = { ...branding, ...rows[0] } as ClinicBranding;
    }
  } catch {}

  return <ClientForgotPassword slug={slug} initialBranding={branding} />;
}
