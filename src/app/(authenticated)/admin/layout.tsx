import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect('/auth/signin');
  }

  let user: { role: string } | null = null;
  try {
    user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { role: true }
    });
  } catch (err) {
    console.error('AdminLayout: failed to query user role from DB:', err);
    // Graceful fallback: if DB is unreachable, deny access to admin
    redirect('/');
  }

  if (!user || (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN')) {
    redirect('/');
  }

  return (
    <div className="min-h-screen bg-white">
      {children}
    </div>
  );
} 