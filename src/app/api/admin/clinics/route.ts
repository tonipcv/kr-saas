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

    // Fetch all clinics with related data (without legacy subscription relation)
    const clinics = await prisma.clinic.findMany({
      include: {
        owner: {
          select: { id: true, name: true, email: true }
        },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({ 
      clinics,
      total: clinics.length 
    });

  } catch (error) {
    console.error('Error fetching clinics:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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
      ownerId,
      planId,
      subscriptionStatus
    } = await request.json();

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Clinic name is required' }, { status: 400 });
    }

    if (!ownerId) {
      return NextResponse.json({ error: 'Clinic owner is required' }, { status: 400 });
    }

    // Verify that the owner exists
    const owner = await prisma.user.findUnique({
      where: { id: ownerId }
    });

    if (!owner) {
      return NextResponse.json({ error: 'Selected owner not found' }, { status: 404 });
    }

    // Check if the owner already has a clinic
    const existingClinic = await prisma.clinic.findFirst({
      where: { ownerId: owner.id }
    });

    if (existingClinic) {
      return NextResponse.json({ error: 'This user already owns a clinic' }, { status: 400 });
    }

    // Create clinic
    const clinic = await prisma.clinic.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        address: address?.trim() || null,
        city: city?.trim() || null,
        state: state?.trim() || null,
        zipCode: zipCode?.trim() || null,
        country: country?.trim() || null,
        website: website?.trim() || null,
        ownerId: owner.id,
        isActive: true
      }
    });

    // Create subscription if plan is selected (unified_subscriptions)
    if (planId) {
      const plan = await prisma.subscriptionPlan.findUnique({
        where: { id: planId }
      });

      if (plan) {
        const now = new Date();
        const isTrial = (subscriptionStatus || 'TRIAL') === 'TRIAL';
        const trialDays = plan.trialDays || 7;
        await prisma.unified_subscriptions.create({
          data: {
            id: `${clinic.id}-${now.getTime()}`,
            type: 'CLINIC',
            subscriber_id: clinic.id,
            plan_id: plan.id,
            status: subscriptionStatus || 'TRIAL',
            max_doctors: plan.maxDoctors,
            start_date: now,
            trial_end_date: isTrial ? new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000) : null
          }
        });
      }
    }

    // Fetch the created clinic with all related data (without legacy subscription relation)
    const createdClinic = await prisma.clinic.findUnique({
      where: { id: clinic.id },
      include: {
        owner: {
          select: { id: true, name: true, email: true }
        },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } }
          }
        }
      }
    });

    return NextResponse.json({ 
      success: true, 
      clinic: createdClinic,
      message: 'Clinic created successfully'
    });

  } catch (error) {
    console.error('Error creating clinic:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 