import { FEATURES } from '@/lib/feature-flags';
import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { getUserByReferralCode } from '@/lib/referral-utils';
import CampaignDynamicForm from '@/components/campaign-form/CampaignDynamicForm';
import TrackingParams from '@/components/campaign-form/TrackingParams';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Public campaign landing: /{slug}/{campaign_slug}
export default async function CampaignPublicPage({
  params,
  searchParams,
}: {
  params: { slug: string; campaign_slug: string };
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  if (!FEATURES.CAMPAIGN_PAGES) {
    notFound();
  }

  const doctorSlug = params?.slug;
  const campaignSlug = params?.campaign_slug;
  const previewRequested = searchParams?.preview === '1' || searchParams?.preview === 'true';
  const allowPreview = FEATURES.CAMPAIGN_PREVIEW && previewRequested;

  if (!doctorSlug || !campaignSlug) {
    notFound();
  }

  // Resolve doctor
  const doctor = await prisma.user.findFirst({
    where: { doctor_slug: doctorSlug, role: 'DOCTOR', is_active: true } as any,
    select: { id: true, name: true, image: true },
  });
  if (!doctor) notFound();

  // Build constraints
  const now = new Date();
  const clauses: string[] = ["doctor_id = $1", "campaign_slug = $2"];
  const args: any[] = [doctor.id, campaignSlug];
  let i = args.length + 1;

  if (!allowPreview) {
    clauses.push("status = 'PUBLISHED'");
    clauses.push(`((valid_from IS NULL OR valid_from <= $${i++}) AND (valid_until IS NULL OR valid_until >= $${i++}))`);
    args.push(now, now);
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows: any[] = await prisma.$queryRawUnsafe(
    `SELECT id, doctor_id, campaign_slug, title, description, benefit_title, benefit_description, hero_image_url, form_config, status, valid_from, valid_until, created_at, updated_at
     FROM campaigns
     ${whereSql}
     LIMIT 1`,
    ...args
  );
  const campaign = rows?.[0] || null;
  if (!campaign) notFound();

  // Try to parse form_config (can be JSON or string)
  let formConfig: any = null;
  try {
    formConfig = typeof campaign.form_config === 'string' ? JSON.parse(campaign.form_config) : campaign.form_config;
  } catch {
    formConfig = null;
  }
  const design = formConfig?.design || {};

  const title = design.title_page || campaign.title || 'Campaign';
  const description = design.subtitle || campaign.description || '';
  const hero = design.hero_image_url || (campaign.hero_image_url as string | null);
  const benefitTitle = design.benefit_title || (campaign.benefit_title as string | null);
  const benefitDescription = design.benefit_description || (campaign.benefit_description as string | null);

  // Headline with placeholders
  const rawHeadline: string | undefined = design.headline || undefined;
  const businessName: string = design.business_name || doctor.name || '';
  const offerAmount: string = (formConfig?.offer && typeof formConfig.offer.amount !== 'undefined')
    ? String(formConfig.offer.amount)
    : '';
  // Resolve referrer name from code if present in URL
  const refCode = (typeof searchParams?.referrerCode === 'string' && searchParams.referrerCode)
    || (typeof searchParams?.ref === 'string' && searchParams.ref)
    || null;
  let referrerName: string | null = null;
  if (refCode) {
    try {
      const refUser = await getUserByReferralCode(refCode);
      if (refUser && typeof (refUser as any).name === 'string') {
        referrerName = (refUser as any).name as string;
      }
    } catch {}
  }
  function resolveHeadline(tpl: string): string {
    return tpl
      .replaceAll('{user}', referrerName || '')
      .replaceAll('{business}', businessName)
      .replaceAll('{doctor}', doctor.name || '')
      .replaceAll('{offer_amount}', offerAmount);
  }
  const headline: string | null = rawHeadline ? resolveHeadline(rawHeadline) : null;

  // Styles mirrored from slug page
  const styleConfig = {
    bgClass: 'bg-gradient-to-br from-gray-50 via-white to-gray-100',
    cardClass: 'bg-white/80 backdrop-blur-sm border border-gray-200/50 shadow-xl',
    titleClass: 'bg-gradient-to-b from-gray-800 via-gray-600 to-gray-500 bg-clip-text text-transparent',
    subtitleClass: 'bg-gradient-to-b from-gray-600 via-gray-500 to-gray-400 bg-clip-text text-transparent',
    buttonClass: 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white shadow-lg hover:shadow-xl',
  } as const;

  return (
    <div className={`min-h-screen ${styleConfig.bgClass} relative overflow-hidden`}>
      {/* Persist tracking params in cookie for backend fallback */}
      <TrackingParams />
      <div className="absolute inset-0 bg-gradient-to-br from-gray-200/20 via-transparent to-gray-300/20" />
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gray-400/10 via-transparent to-transparent" />
      <div className="relative max-w-md mx-auto px-6 py-20">
        {/* Header with doctor info (hero banner on top, name below) */}
        <div className="mb-12">
          {hero && (
            <div className="relative rounded-3xl overflow-hidden h-64 md:h-72">
              <div
                className="absolute inset-0 bg-center bg-cover bg-no-repeat"
                style={{ backgroundImage: `url(${hero})` }}
              />
              <div className="absolute inset-0 bg-white/10" />
            </div>
          )}
          <div className="relative -mt-20 md:-mt-24 mb-6 flex justify-center">
            {doctor.image ? (
              <div className="relative w-32 h-32">
                <div className="absolute inset-0 bg-gradient-to-r from-gray-400 to-gray-500 rounded-full opacity-75 blur-lg" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={doctor.image} alt={doctor.name} className="relative w-full h-full rounded-full object-cover border-4 border-white/30 shadow-2xl" />
              </div>
            ) : (
              <div className="relative w-32 h-32">
                <div className="absolute inset-0 bg-gradient-to-r from-gray-400 to-gray-500 rounded-full opacity-75 blur-lg" />
                <div className="relative w-full h-full rounded-full bg-gradient-to-r from-gray-500 to-gray-600 flex items-center justify-center border-4 border-white/30 shadow-2xl">
                  <span className="text-white text-4xl font-light">{doctor.name.charAt(0)}</span>
                </div>
              </div>
            )}
          </div>
          <div className="text-center space-y-3">
            {headline ? (
              <>
                <h1 className={`text-xl md:text-2xl font-semibold ${styleConfig.titleClass}`}>{headline}</h1>
              </>
            ) : (
              <>
                {/* No headline configured; hide doctor name per request */}
              </>
            )}
            {allowPreview && <p className="text-xs text-amber-600">Preview mode</p>}
          </div>
        </div>

        {/* Card content */}
        <div className={`${styleConfig.cardClass} rounded-3xl p-8 shadow-2xl`}>
          <div className="space-y-4">
            {/* hero image moved to header background */}

            {/* Dynamic custom form */}
            <div className="mt-4">
              <CampaignDynamicForm
                campaignId={campaign.id}
                formConfig={formConfig}
                allowPreview={allowPreview}
                classNames={{
                  buttonClass: styleConfig.buttonClass,
                  titleClass: styleConfig.titleClass,
                  subtitleClass: styleConfig.subtitleClass,
                }}
              />
            </div>

            {/* Benefits at the bottom */}
            {(benefitTitle || benefitDescription) && (
              <div className="mt-8 border-t border-gray-200/60 pt-6">
                {benefitTitle && (
                  <h2 className={`text-base md:text-lg font-semibold ${styleConfig.titleClass}`}>{benefitTitle}</h2>
                )}
                {benefitDescription && (
                  <p className={`mt-1 text-sm md:text-base ${styleConfig.subtitleClass}`}>{benefitDescription}</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="text-center mt-12">
          <div className="flex items-center justify-center gap-2 opacity-70">
            <span className={`text-xs ${styleConfig.subtitleClass}`}>Powered by</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Powered by" className="h-4 w-auto opacity-80" />
          </div>
        </div>
      </div>
    </div>
  );
}
