import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id: clinicId } = await params;

    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
        subscriptions: {
          where: {
            status: { in: ['ACTIVE', 'TRIAL'] }
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            plan: {
              select: {
                id: true,
                name: true,
                price: true,
                maxDoctors: true,
                maxPatients: true,
                tier: true
              }
            }
          }
        }
      }
    });

    if (!clinic) {
      return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
    }

    return NextResponse.json({ clinic });

  } catch (error) {
    console.error('Error fetching clinic:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id: clinicId } = await params;

    const {
      name,
      description,
      email,
      phone,
      address,
      city,
      state,
      zipCode,
      country,
      website,
      isActive,
      subscription
    } = await request.json();

    if (!name) {
      return NextResponse.json({ error: 'Clinic name is required' }, { status: 400 });
    }

    // Check if clinic exists
    const existingClinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      include: {
        subscriptions: {
          where: {
            status: { in: ['ACTIVE', 'TRIAL'] }
          },
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    if (!existingClinic) {
      return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
    }

    // Update clinic data
    const updatedClinic = await prisma.clinic.update({
      where: { id: clinicId },
      data: {
        name,
        description,
        email,
        phone,
        address,
        city,
        state,
        zipCode,
        country,
        website,
        isActive
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
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
                id: true,
                name: true,
                price: true,
                maxDoctors: true,
                maxPatients: true,
                tier: true
              }
            }
          }
        }
      }
    });

    // Update or create subscription if provided
    if (subscription && subscription.planId) {
      const plan = await prisma.clinicPlan.findUnique({ where: { id: subscription.planId } });
      if (!plan) return NextResponse.json({ error: 'Invalid subscription plan' }, { status: 400 });

      const currentSubscription = existingClinic.subscriptions[0];
      const now = new Date();

      if (currentSubscription) {
        await prisma.clinicSubscription.update({
          where: { id: currentSubscription.id },
          data: {
            planId: subscription.planId,
            status: subscription.status || currentSubscription.status,
            currentPeriodEnd: subscription.endDate || currentSubscription.currentPeriodEnd,
            trialEndsAt: subscription.trialEndDate || currentSubscription.trialEndsAt,
            updatedAt: now
          }
        });
      } else {
        await prisma.clinicSubscription.create({
          data: {
            id: `cs_${clinicId}-${Date.now()}`,
            clinicId,
            planId: subscription.planId,
            status: subscription.status || 'ACTIVE',
            startDate: now,
            currentPeriodStart: now,
            currentPeriodEnd: subscription.endDate || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
            trialEndsAt: subscription.trialEndDate,
            currentDoctorsCount: 0,
            currentPatientsCount: 0
          }
        });
      }
    }

    return NextResponse.json({ clinic: updatedClinic });

  } catch (error) {
    console.error('Error updating clinic:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id: clinicId } = await params;

    // Check if clinic exists
    const existingClinic = await prisma.clinic.findUnique({
      where: { id: clinicId }
    });

    if (!existingClinic) {
      return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
    }

    // Delete clinic and all related data
    await prisma.$transaction([
      prisma.clinicSubscription.deleteMany({ where: { clinicId } }),
      prisma.clinicMember.deleteMany({ where: { clinicId } }),
      prisma.clinic.delete({ where: { id: clinicId } })
    ]);

    return NextResponse.json({ message: 'Clinic deleted successfully' });
  } catch (error) {
    console.error('Error deleting clinic:', error);
    return NextResponse.json(
      { error: 'Error deleting clinic' },
      { status: 500 }
    );
  }
}