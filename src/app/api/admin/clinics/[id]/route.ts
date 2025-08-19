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
        members: { include: { user: { select: { id: true, name: true, email: true } } } }
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
    const existingClinic = await prisma.clinic.findUnique({ where: { id: clinicId } });

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
        subscription: {
          include: {
            plan: {
              select: {
                id: true,
                name: true,
                price: true
              }
            }
          }
        }
      }
    });

    // Update or create subscription using unified_subscriptions if provided
    if (subscription && subscription.planId) {
      const plan = await prisma.subscriptionPlan.findUnique({ where: { id: subscription.planId } });
      if (!plan) return NextResponse.json({ error: 'Invalid subscription plan' }, { status: 400 });

      const currentUnified = await prisma.unified_subscriptions.findFirst({
        where: { type: 'CLINIC', subscriber_id: clinicId },
        orderBy: { created_at: 'desc' }
      });

      if (currentUnified) {
        await prisma.unified_subscriptions.update({
          where: { id: currentUnified.id },
          data: {
            plan_id: subscription.planId,
            status: subscription.status || currentUnified.status,
            max_doctors: subscription.maxDoctors ?? currentUnified.max_doctors,
            updated_at: new Date()
          }
        });
      } else {
        await prisma.unified_subscriptions.create({
          data: {
            id: `${clinicId}-${Date.now()}`,
            type: 'CLINIC',
            subscriber_id: clinicId,
            plan_id: subscription.planId,
            status: subscription.status || 'ACTIVE',
            max_doctors: subscription.maxDoctors ?? plan.maxDoctors,
            start_date: new Date()
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
      prisma.clinicMember.deleteMany({ where: { clinicId } }),
      prisma.unified_subscriptions.deleteMany({ where: { type: 'CLINIC', subscriber_id: clinicId } }),
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