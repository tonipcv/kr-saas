import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Redirect pretty campaign URL -> main slug page with coupon applied
export default async function CampaignPublicPage({
  params,
  searchParams,
}: {
  params: { slug: string; campaign_slug: string };
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const slug = params?.slug;
  const campaignSlug = params?.campaign_slug;
  const qs = new URLSearchParams();
  // Preserve existing query params
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      if (Array.isArray(v)) {
        v.filter(Boolean).forEach((vv) => qs.append(k, String(vv)));
      } else if (typeof v === 'string') {
        qs.append(k, v);
      }
    }
  }
  // Append campaign key as cupom
  if (campaignSlug) qs.append('cupom', campaignSlug);
  const target = `/${slug}${qs.toString() ? `?${qs.toString()}` : ''}`;
  redirect(target);
}
