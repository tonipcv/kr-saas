import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import PatientProfilePage from '../../(authenticated)/patient/profile/page';

export default async function SlugProfilePage({ params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect(`/${params.slug}/login`);
  }
  return <PatientProfilePage />;
}
