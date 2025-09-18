import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { requireMobileAuth, unauthorizedResponse } from '@/lib/mobile-auth';

export async function GET(request: NextRequest) {
  try {
    // Support both web session and mobile auth
    let userId: string | undefined;
    let isDoctor = false;
    
    // Try mobile auth first
    const mobileUser = await requireMobileAuth(request).catch(() => null);
    if (mobileUser && mobileUser.role === 'DOCTOR') {
      userId = mobileUser.id;
      isDoctor = true;
    } else {
      // Try web session auth
      const session = await getServerSession(authOptions);
      if (session?.user?.id) {
        const user = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { id: true, role: true }
        });
        
        if (user && user.role === 'DOCTOR') {
          userId = user.id;
          isDoctor = true;
        }
      }
    }

    if (!userId || !isDoctor) {
      return unauthorizedResponse();
    }

    // Get clinicId from query params
    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinicId');

    // Verify doctor has access to the clinic if clinicId is provided
    if (clinicId) {
      const hasAccess = await prisma.clinic.findFirst({
        where: {
          id: clinicId,
          OR: [
            { ownerId: userId },
            {
              members: {
                some: {
                  userId: userId,
                  isActive: true
                }
              }
            }
          ]
        }
      });

      if (!hasAccess) {
        return NextResponse.json({ error: 'Access denied to this clinic' }, { status: 403 });
      }
    }

    // Get total patients count (distinct users) to match Patients page semantics
    // Count users that have an active relationship with this doctor.
    // When clinicId is provided, include legacy relationships with clinicId = null as well.
    const totalPatients = await prisma.user.count({
      where: {
        patient_relationships: {
          some: clinicId
            ? {
                doctorId: userId,
                isActive: true,
                OR: [
                  { clinicId: clinicId },
                  { clinicId: null },
                ],
              }
            : {
                doctorId: userId,
                isActive: true,
              },
        },
      },
    });

    // Get active protocols count
    const activeProtocols = await prisma.protocolPrescription.count({
      where: {
        prescribed_by: userId,
        status: { in: ['ACTIVE', 'PRESCRIBED'] }
      }
    });

    // Get total protocols count
    const totalProtocols = await prisma.protocol.count({
      where: {
        doctor_id: userId
      }
    });

    // Get completed today count
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Use ProtocolTaskProgress to count completed tasks today
    const completedToday = await prisma.protocolTaskProgress.count({
      where: {
        completedAt: {
          gte: today,
          lt: tomorrow
        },
        prescription: {
          prescribed_by: userId
        },
        status: 'COMPLETED'
      }
    });

    // Return dashboard stats
    return NextResponse.json({
      success: true,
      data: {
        totalPatients,
        activeProtocols,
        totalProtocols,
        completedToday
      }
    });
  } catch (error) {
    console.error('Error in GET /api/v2/doctor/dashboard-summary:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
