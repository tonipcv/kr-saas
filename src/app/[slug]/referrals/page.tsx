import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import PatientReferralsPage from '../../(authenticated)/patient/referrals/page';

export default async function SlugReferralsPage({ params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect(`/${params.slug}/login`);
  }
  return <PatientReferralsPage />;
}
