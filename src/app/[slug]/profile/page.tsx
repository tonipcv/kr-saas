import { redirect, notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import PatientProfilePage from '../../(authenticated)/patient/profile/page';

export default async function SlugProfilePage({ params }: { params: Promise<{ slug: string }> | { slug: string } }) {
  const { slug } = (params as any)?.then ? await (params as Promise<{ slug: string }>) : (params as { slug: string });

  const session = await getServerSession(authOptions);
  if (!session) {
    const hdrs = await headers();
    const hostHeader = hdrs.get('x-forwarded-host') || hdrs.get('host') || '';
    const baseDomain = (process.env.NEXT_PUBLIC_APP_BASE_DOMAIN || process.env.APP_BASE_DOMAIN || '').toLowerCase();
    const hostNoPort = hostHeader.toLowerCase().split(':')[0];
    const hostLabels = hostNoPort.split('.');
    const firstLabel = hostLabels[0] || '';
    const isSubdomain = baseDomain && hostNoPort.endsWith(baseDomain) && hostNoPort.replace(new RegExp(`${baseDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), '').replace(/\.$/, '').length > 0;
    redirect(isSubdomain ? '/login' : `/${slug}/login`);
  }

  // Theme/branding
  let theme: 'LIGHT' | 'DARK' = 'LIGHT';
  let buttonColor: string | null = null;
  let buttonTextColor: string | null = null;
  let clinicLogo: string | null = null;
  let clinicName: string | null = null;
  let clinicFound = false;
  try {
    const hdrs = await headers();
    const hostHeader = hdrs.get('x-forwarded-host') || hdrs.get('host') || '';
    const baseDomain = (process.env.NEXT_PUBLIC_APP_BASE_DOMAIN || process.env.APP_BASE_DOMAIN || '').toLowerCase();
    const hostNoPort = hostHeader.toLowerCase().split(':')[0];
    const hostLabels = hostNoPort.split('.');
    const firstLabel = hostLabels[0] || '';
    const sub = baseDomain && hostNoPort.endsWith(baseDomain)
      ? hostNoPort.replace(new RegExp(`${baseDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), '').replace(/\.$/, '')
      : '';
    const candidateSub = firstLabel && firstLabel !== 'www' ? firstLabel : '';
    // Step 1: try candidate subdomain from first label
    if (candidateSub) {
      const rows1 = await prisma.$queryRaw<{ theme: 'LIGHT'|'DARK'; buttonColor: string | null; buttonTextColor: string | null; logo: string | null; name: string | null }[]>`
        SELECT theme::text AS theme, "buttonColor", "buttonTextColor", logo, name
        FROM clinics
        WHERE "subdomain" = ${candidateSub}
        LIMIT 1
      `;
      if (rows1 && rows1[0]) {
        theme = rows1[0].theme || 'LIGHT';
        buttonColor = rows1[0].buttonColor;
        buttonTextColor = rows1[0].buttonTextColor;
        clinicLogo = rows1[0].logo || null;
        clinicName = rows1[0].name || null;
        clinicFound = true;
      }
    }
    // Step 2: try full subdomain extracted from host
    if (!clinicFound && sub) {
      const rows2 = await prisma.$queryRaw<{ theme: 'LIGHT'|'DARK'; buttonColor: string | null; buttonTextColor: string | null; logo: string | null; name: string | null }[]>`
        SELECT theme::text AS theme, "buttonColor", "buttonTextColor", logo, name
        FROM clinics
        WHERE "subdomain" = ${sub}
        LIMIT 1
      `;
      if (rows2 && rows2[0]) {
        theme = rows2[0].theme || 'LIGHT';
        buttonColor = rows2[0].buttonColor;
        buttonTextColor = rows2[0].buttonTextColor;
        clinicLogo = rows2[0].logo || null;
        clinicName = rows2[0].name || null;
        clinicFound = true;
      }
    }
    // Step 3: fallback to slug (path segment)
    if (!clinicFound) {
      const rows3 = await prisma.$queryRaw<{ theme: 'LIGHT'|'DARK'; buttonColor: string | null; buttonTextColor: string | null; logo: string | null; name: string | null }[]>`
        SELECT theme::text AS theme, "buttonColor", "buttonTextColor", logo, name
        FROM clinics
        WHERE slug = ${slug} OR "subdomain" = ${slug}
        LIMIT 1
      `;
      if (rows3 && rows3[0]) {
        theme = rows3[0].theme || 'LIGHT';
        buttonColor = rows3[0].buttonColor;
        buttonTextColor = rows3[0].buttonTextColor;
        clinicLogo = rows3[0].logo || null;
        clinicName = rows3[0].name || null;
        clinicFound = true;
      }
    }
  } catch {}

  if (!clinicFound) {
    notFound();
  }

  return (
    <div className={theme === 'DARK' ? 'min-h-screen bg-[#0b0b0b] text-gray-100' : 'min-h-screen bg-[#f7f8ff] text-gray-900'}
         style={{ ['--btn-bg' as any]: buttonColor || '#111827', ['--btn-fg' as any]: buttonTextColor || '#ffffff' } as any}
    >
      <PatientProfilePage
        isDarkTheme={theme === 'DARK'}
        brandColors={{ bg: buttonColor || undefined, fg: buttonTextColor || undefined }}
        publicClinic={{ logo: clinicLogo || undefined, name: clinicName || undefined }}
        forcedSlug={slug}
      />
    </div>
  );
}
