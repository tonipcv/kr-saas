import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import PatientReferralsPage from '../../(authenticated)/patient/referrals/page';

export default async function SlugReferralsPage({ params }: { params: Promise<{ slug: string }> | { slug: string } }) {
  const { slug } = (params as any)?.then ? await (params as Promise<{ slug: string }>) : (params as { slug: string });

  const session = await getServerSession(authOptions);
  if (!session) {
    const hdrs = headers();
    const hostHeader = hdrs.get('x-forwarded-host') || hdrs.get('host') || '';
    const baseDomain = (process.env.NEXT_PUBLIC_APP_BASE_DOMAIN || process.env.APP_BASE_DOMAIN || '').toLowerCase();
    const hostNoPort = hostHeader.toLowerCase().split(':')[0];
    const isSubdomain = baseDomain && hostNoPort.endsWith(baseDomain) && hostNoPort.replace(new RegExp(`${baseDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), '').replace(/\.$/, '').length > 0;
    redirect(isSubdomain ? '/login' : `/${slug}/login`);
  }

  // Fetch clinic branding (theme/colors) by slug OR subdomain via raw SQL
  let theme: 'LIGHT' | 'DARK' = 'LIGHT';
  let buttonColor: string | null = null;
  let buttonTextColor: string | null = null;
  let clinicLogo: string | null = null;
  let clinicName: string | null = null;
  try {
    const rows = await prisma.$queryRaw<{ theme: 'LIGHT'|'DARK'; buttonColor: string | null; buttonTextColor: string | null; logo: string | null; name: string | null }[]>`
      SELECT theme::text as theme, "buttonColor", "buttonTextColor", logo, name
      FROM clinics
      WHERE slug = ${slug} OR "subdomain" = ${slug}
      LIMIT 1
    `;
    if (rows && rows[0]) {
      theme = rows[0].theme || 'LIGHT';
      buttonColor = rows[0].buttonColor;
      buttonTextColor = rows[0].buttonTextColor;
      clinicLogo = rows[0].logo || null;
      clinicName = rows[0].name || null;
    }
  } catch {}

  return (
    <div className={theme === 'DARK' ? 'min-h-screen bg-[#0b0b0b] text-gray-100' : 'min-h-screen bg-gradient-to-b from-gray-50 to-white text-gray-900'}
         style={{ ['--btn-bg' as any]: buttonColor || '#111827', ['--btn-fg' as any]: buttonTextColor || '#ffffff' } as any}
    >
      <PatientReferralsPage
        publicClinic={{ logo: clinicLogo, name: clinicName }}
        forceClinicHeader
        isDarkTheme={theme === 'DARK'}
        brandColors={{ bg: buttonColor || undefined, fg: buttonTextColor || undefined }}
      />
      {/* Footer */}
      <div className="mt-10 pb-8 flex justify-center">
        <a
          href="https://zuzuvu.com"
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-2 text-xs ${theme === 'DARK' ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <span>Powered by</span>
          <img
            src="/logo.png"
            alt="Zuzuvu"
            className={`h-4 w-auto opacity-80 ${theme === 'DARK' ? 'invert' : ''}`}
            style={theme === 'DARK' ? ({ filter: 'invert(1) brightness(1.6)' } as React.CSSProperties) : undefined}
          />
        </a>
      </div>
    </div>
  );
}
