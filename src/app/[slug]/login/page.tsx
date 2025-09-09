import ClientLogin, { ClinicBranding } from './ClientLogin';
import { prisma } from '@/lib/prisma';

export default async function DoctorLoginPage({ params }: { params: Promise<{ slug: string }> | { slug: string } }) {
  // Next.js 15: params may be a Promise
  const resolvedParams = (params as any)?.then ? await (params as Promise<{ slug: string }>) : (params as { slug: string });
  const slug = resolvedParams.slug;

  // Fetch minimal clinic info server-side (by slug OR subdomain) using raw SQL to avoid Prisma typing issues
  let clinic: { name: string | null; logo: string | null } | null = null;
  try {
    const rows = await prisma.$queryRaw<{ name: string | null; logo: string | null }[]>`
      SELECT name, logo FROM clinics WHERE slug = ${slug} OR "subdomain" = ${slug} LIMIT 1
    `;
    clinic = rows && rows[0] ? rows[0] : null;
  } catch {}

  // Fetch branding via raw query to avoid client typing issues
  let branding: ClinicBranding = { theme: 'LIGHT', buttonColor: '#111827', buttonTextColor: '#ffffff', name: clinic?.name ?? null, logo: clinic?.logo ?? null };
  try {
    const rows = await prisma.$queryRaw<{ theme: 'LIGHT'|'DARK'; buttonColor: string | null; buttonTextColor: string | null }[]>`
      SELECT theme::text as theme, "buttonColor", "buttonTextColor"
      FROM clinics
      WHERE slug = ${slug} OR "subdomain" = ${slug}
      LIMIT 1
    `;
    if (rows && rows[0]) {
      branding = { ...branding, ...rows[0] } as ClinicBranding;
    }
  } catch {}

  return (
    <ClientLogin slug={slug} initialBranding={branding} />
  );
}
