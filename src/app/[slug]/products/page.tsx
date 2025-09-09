import React from 'react';
import { prisma } from '@/lib/prisma';
import ProductsGrid from '@/components/products/ProductsGrid';
import ReferrerBanner from '@/components/referrals/ReferrerBanner';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function DoctorProductsPage({ params, searchParams }: {
  params: Promise<{ slug: string }> | { slug: string },
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>
}) {
  // Next.js 15: params/searchParams may be Promises
  const resolvedParams = (params as any)?.then ? await (params as Promise<{ slug: string }>) : (params as { slug: string });
  const resolvedSearch = (searchParams as any)?.then ? await (searchParams as Promise<Record<string, string | string[] | undefined>>) : ((searchParams as Record<string, string | string[] | undefined>) || {});
  const { slug } = resolvedParams;
  const cupom = (Array.isArray(resolvedSearch?.cupom) ? resolvedSearch.cupom[0] : resolvedSearch?.cupom) as string | undefined;

  // Resolve doctor by slug or by clinic slug (owner/member fallback)
  let doctor = await prisma.user.findFirst({
    where: { doctor_slug: slug, role: 'DOCTOR' } as any,
    select: { id: true, name: true, doctor_slug: true, image: true, public_cover_image_url: true, public_page_template: true },
  });

  // Track clinic branding when resolving via clinic slug
  let clinic: { id: string; ownerId: string | null; name?: string | null; logo?: string | null } | null = null;
  if (!doctor) {
    clinic = await prisma.clinic.findFirst({
      where: { slug, isActive: true } as any,
      select: { id: true, ownerId: true, name: true, logo: true },
    }) as any;
    if (clinic?.ownerId) {
      const owner = await prisma.user.findFirst({
        where: { id: clinic.ownerId, role: 'DOCTOR' } as any,
        select: { id: true, name: true, doctor_slug: true, image: true, public_cover_image_url: true, public_page_template: true },
      });
      if (owner) doctor = owner as any;
    }
    if (!doctor && clinic) {
      const member = await prisma.clinicMember.findFirst({
        where: { clinicId: clinic.id, isActive: true, user: { role: 'DOCTOR' } } as any,
        include: { user: { select: { id: true, name: true, doctor_slug: true, image: true, public_cover_image_url: true, public_page_template: true } } },
      });
      if (member?.user) doctor = member.user as any;
    }
  }

  // List active products
  const raw = doctor
    ? await prisma.products.findMany({
        where: { doctorId: doctor.id, isActive: true } as any,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }] as any,
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          creditsPerUnit: true,
          price: true,
          imageUrl: true,
          confirmationUrl: true,
          priority: true,
        } as any,
      })
    : [];

  // Normalize Decimal/BigInt values to numbers for Client Component consumption
  const toNum = (v: any) => {
    if (v == null) return null;
    try {
      const n = Number.parseFloat(v.toString());
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  };
  let products = (raw as any[]).map((p) => ({
    ...p,
    price: toNum(p?.price),
    creditsPerUnit: toNum(p?.creditsPerUnit),
  }));
  // Deduplicate by id (defensive)
  products = Array.from(new Map(products.map((p: any) => [String(p.id), p])).values());

  // Coupon: only filter when a valid template exists
  let couponTitle: string | null = null;
  let couponMessage: string | null = null;
  if (doctor && cupom) {
    const tpl = await prisma.couponTemplate.findFirst({
      where: { doctorId: doctor.id, slug: cupom, isActive: true } as any,
      select: { config: true, displayTitle: true, displayMessage: true },
    });
    if (tpl) {
      couponTitle = (tpl as any).displayTitle || null;
      couponMessage = (tpl as any).displayMessage || null;
      const cfg = (tpl as any)?.config || {};
      let allowedIds: string[] = [];
      if (Array.isArray(cfg?.product_ids)) {
        allowedIds = cfg.product_ids.filter((x: any) => typeof x === 'string');
      } else if (cfg?.product_id) {
        allowedIds = [String(cfg.product_id)];
      }
      if (allowedIds.length > 0) {
        const set = new Set(allowedIds);
        products = products.filter(p => set.has(p.id));
      } else {
        // Valid coupon but no selection -> no products
        products = [];
      }
    }
    // If no tpl, keep default (no filtering and no banner)
  }
  // Final dedup (defensive) after any filtering
  products = Array.from(new Map(products.map((p: any) => [String(p.id), p])).values());
  const template = (doctor as any)?.public_page_template || 'DEFAULT';
  // Only use explicit public cover image; no fallback to profile image
  const coverUrl = (doctor as any)?.public_cover_image_url || null;
  // Branding: load clinic theme/colors by slug (works for doctor or clinic slugs; clinic rows only exist for clinic slugs)
  let theme: 'LIGHT' | 'DARK' = 'LIGHT';
  let buttonColor: string | null = null;
  let buttonTextColor: string | null = null;
  try {
    const rows = await prisma.$queryRaw<{ theme: 'LIGHT'|'DARK'; buttonColor: string | null; buttonTextColor: string | null }[]>`
      SELECT theme::text as theme, "buttonColor", "buttonTextColor"
      FROM clinics
      WHERE slug = ${slug}
      LIMIT 1
    `;
    if (rows && rows[0]) {
      theme = rows[0].theme || 'LIGHT';
      buttonColor = rows[0].buttonColor;
      buttonTextColor = rows[0].buttonTextColor;
    }
  } catch {}

  const isClinicContext = !!clinic;
  const displayName = clinic?.name || (doctor as any)?.name || 'Produtos e Serviços';
  const avatarUrl = (doctor as any)?.image || null;
  const headerHeight = template === 'MINIMAL' ? 'h-24 sm:h-28' : 'h-36 sm:h-44';
  const showAvatar = template !== 'MINIMAL';
  return (
    <main
      className={theme === 'DARK' ? 'min-h-screen bg-[#0b0b0b] text-gray-100' : 'min-h-screen bg-[#f7f8ff] text-gray-900'}
      style={{ ['--btn-bg' as any]: buttonColor || '#111827', ['--btn-fg' as any]: buttonTextColor || '#ffffff' } as any}
    >
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className={`${isClinicContext ? 'bg-transparent border-0 shadow-none' : `${theme === 'DARK' ? 'bg-[#111111] border-gray-800 text-gray-100' : 'bg-white border-gray-200 text-gray-900'} border shadow-sm`} rounded-2xl p-6 overflow-hidden`}>
            {/* Cover banner: only if image exists and NOT clinic context */}
            {!isClinicContext && coverUrl && (
              <div className={`-mt-6 -mx-6 mb-8 ${headerHeight} overflow-hidden rounded-t-2xl relative`}>
                <img
                  src={coverUrl}
                  alt={doctor.name}
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className={`absolute inset-0 ${theme === 'DARK' ? 'bg-black/30' : 'bg-white/40'} backdrop-blur-[1px]`} />
              </div>
            )}
            <div className={`flex flex-col ${template === 'HERO_LEFT' ? 'items-start text-left' : 'items-center text-center'} ${!isClinicContext && coverUrl && showAvatar ? '-mt-10' : 'mt-0'} }`}>
              {doctor ? (
                <>
                  {showAvatar && (
                  <div className="relative mb-2">
                    {isClinicContext && clinic?.logo ? (
                      <div className="relative w-36 h-36 sm:w-44 sm:h-44 mx-auto">
                        {theme !== 'DARK' && (
                          <div className={`absolute inset-0 rounded-full opacity-75 blur-lg bg-gradient-to-r from-gray-400 to-gray-500`} />
                        )}
                        <img
                          src={clinic.logo}
                          alt={displayName}
                          className="relative w-full h-full object-contain rounded-xl"
                        />
                      </div>
                    ) : avatarUrl ? (
                      <div className="relative w-28 h-28 sm:w-32 sm:h-32 mx-auto">
                        {theme !== 'DARK' && (
                          <div className={`absolute inset-0 rounded-full opacity-75 blur-lg bg-gradient-to-r from-gray-400 to-gray-500`} />
                        )}
                        <img
                          src={avatarUrl}
                          alt={displayName}
                          className="relative w-full h-full rounded-full object-cover border-4 border-white/30 shadow-2xl"
                        />
                      </div>
                    ) : (
                      <div className="relative w-28 h-28 sm:w-32 sm:h-32 mx-auto">
                        {theme !== 'DARK' && (
                          <div className={`absolute inset-0 rounded-full opacity-75 blur-lg bg-gradient-to-r from-gray-400 to-gray-500`} />
                        )}
                        <div className={`relative w-full h-full rounded-full flex items-center justify-center border-4 border-white/30 shadow-2xl ${theme === 'DARK' ? 'bg-gray-700' : 'bg-gradient-to-r from-gray-500 to-gray-600'}`}>
                          <span className="text-white text-4xl font-light">{displayName?.charAt(0) || 'D'}</span>
                        </div>
                      </div>
                    )}
                  </div>
                  )}
                  {!isClinicContext && (
                    <h1 className={`mt-1 text-xl sm:text-2xl font-semibold tracking-tight ${theme === 'DARK' ? 'text-gray-100' : 'bg-gradient-to-b from-gray-800 via-gray-600 to-gray-500 bg-clip-text text-transparent'}`}>{displayName}</h1>
                  )}
                </>
              ) : (
                <>
                  <h1 className={`text-xl sm:text-2xl font-semibold tracking-tight ${theme === 'DARK' ? 'text-gray-100' : 'text-gray-900'}`}>Produtos e Serviços</h1>
                  <p className={`mt-1 text-sm ${theme === 'DARK' ? 'text-gray-400' : 'text-gray-600'}`}>Seleção de serviços e produtos da clínica.</p>
                </>
              )}
            </div>
          </div>
        </div>
        {/* Referrer/Campaign/Coupon banner */}
        <ReferrerBanner slug={slug} />
        {!doctor ? (
          <div className={`rounded-xl border border-dashed p-6 text-center text-sm ${theme === 'DARK' ? 'border-gray-700 bg-[#0f0f0f] text-gray-300' : 'border-gray-200 bg-white text-gray-600'}`}>
            Não foi possível encontrar a clínica.
          </div>
        ) : products.length === 0 ? (
          <div className={`rounded-xl border border-dashed p-6 text-center text-sm ${theme === 'DARK' ? 'border-gray-700 bg-[#0f0f0f] text-gray-300' : 'border-gray-200 bg-white text-gray-600'}`}>
            Nenhum produto disponível no momento.
          </div>
        ) : (
          <ProductsGrid slug={slug} doctorId={doctor.id as any} products={products as any} branding={{ theme, buttonColor, buttonTextColor }} />
        )}
      </div>
      {/* Footer */}
      <div className="mt-10 pb-8 flex justify-center">
        <a
          href="https://zuzuvu.com"
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-2 text-xs ${theme === 'DARK' ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <span>Powered by</span>
          <img src="/logo.png" alt="Zuzuvu" className={`h-4 w-auto opacity-80 ${theme === 'DARK' ? 'invert' : ''}`} />
        </a>
      </div>
    </main>
  );
}
