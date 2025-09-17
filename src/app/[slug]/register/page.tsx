import ClientRegister, { ClinicBranding } from './ClientRegister';
import { prisma } from '@/lib/prisma';

export default async function RegisterPage({ params }: { params: Promise<{ slug: string }> | { slug: string } }) {
  const resolved = (params as any)?.then ? await (params as Promise<{ slug: string }>) : (params as { slug: string });
  const slug = resolved.slug;

  // Fetch minimal clinic info server-side (slug or subdomain)
  let clinic: { name: string | null; logo: string | null } | null = null;
  try {
    const rows = await prisma.$queryRaw<{ name: string | null; logo: string | null }[]>`
      SELECT name, logo FROM clinics WHERE slug = ${slug} OR "subdomain" = ${slug} LIMIT 1
    `;
    clinic = rows && rows[0] ? rows[0] : null;
  } catch {}

  // Fetch branding server-side to avoid flicker
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

  return <ClientRegister slug={slug} initialBranding={branding} />;
}
