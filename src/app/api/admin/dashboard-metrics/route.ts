import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is super admin
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { role: true }
    });

    if (user?.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Fetch system metrics
    const [
      totalDoctors,
      totalPatients,
      totalProducts,
      totalClinics,
      activeSubscriptions,
      trialSubscriptions,
      expiringSoon
    ] = await Promise.all([
      prisma.user.count({ where: { role: 'DOCTOR' } }),
      prisma.user.count({ where: { role: 'PATIENT' } }),
      prisma.product.count(),
      prisma.clinic.count(),
      prisma.clinicSubscription.count({ where: { status: 'ACTIVE' } }),
      prisma.clinicSubscription.count({ where: { status: 'TRIAL' } }),
      prisma.clinicSubscription.count({
        where: {
          status: 'TRIAL',
          trialEndsAt: {
            lte: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) // 3 days
          }
        }
      })
    ]);

    // Fetch recent clinics with their subscriptions
    const recentClinics = await prisma.clinic.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        owner: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        subscriptions: {
          where: {
            status: { in: ['ACTIVE', 'TRIAL'] }
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            plan: {
              select: {
                name: true,
                tier: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    // Format recent clinics data
    const recentClinicsFormatted = recentClinics.map(clinic => ({
      id: clinic.id,
      name: clinic.name,
      owner: clinic.owner,
      subscription: clinic.subscriptions[0] ? {
        status: clinic.subscriptions[0].status,
        plan: clinic.subscriptions[0].plan
      } : undefined
    }));

    const metrics = {
      totalDoctors,
      totalPatients,
      totalProducts,
      totalClinics,
      activeClinicSubscriptions: activeSubscriptions,
      trialClinicSubscriptions: trialSubscriptions,
      // Legacy keys (temporary compatibility)
      activeSubscriptions,
      trialSubscriptions,
      expiringSoon,
    };

    return NextResponse.json({
      metrics,
      recentClinics: recentClinicsFormatted
    });

  } catch (error) {
    console.error('Error fetching dashboard metrics:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}