import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateUniqueSlugForClinic } from '@/lib/clinic-utils';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
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

    // Fetch all clinics with their subscriptions
    const clinics = await prisma.clinic.findMany({
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
                email: true,
                role: true
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
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({ clinics });

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
      ownerEmail,
      planId,
      subscriptionStatus = 'TRIAL'
    } = await request.json();

    if (!name || !ownerEmail) {
      return NextResponse.json({ error: 'Name and owner email are required' }, { status: 400 });
    }

    // Find or create owner
    const owner = await prisma.user.findUnique({
      where: { email: ownerEmail }
    });

    if (!owner) {
      return NextResponse.json({ error: 'Owner not found' }, { status: 404 });
    }

    // Check if owner already has a clinic
    const existingClinic = await prisma.clinic.findFirst({
      where: { ownerId: owner.id }
    });

    if (existingClinic) {
      return NextResponse.json({ error: 'This user already owns a clinic' }, { status: 400 });
    }

    // Generate unique slug
    const slug = await generateUniqueSlugForClinic(name);

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
        slug,
        ownerId: owner.id,
        isActive: true
      }
    });

    // Create subscription if plan is selected
    if (planId) {
      const plan = await prisma.clinicPlan.findUnique({
        where: { id: planId }
      });

      if (plan) {
        const now = new Date();
        const isTrial = subscriptionStatus === 'TRIAL';
        const trialDays = plan.trialDays || 7;
        const trialEnd = isTrial ? new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000) : null;
        
        await prisma.clinicSubscription.create({
          data: {
            id: `cs_${clinic.id}-${now.getTime()}`,
            clinicId: clinic.id,
            planId: plan.id,
            status: subscriptionStatus,
            startDate: now,
            currentPeriodStart: now,
            currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
            trialEndsAt: trialEnd,
            currentDoctorsCount: 1,
            currentPatientsCount: 0
          }
        });
      }
    }

    // Add owner as clinic member
    await prisma.clinicMember.create({
      data: {
        clinicId: clinic.id,
        userId: owner.id,
        role: 'OWNER',
        isActive: true
      }
    });

    // Fetch the created clinic with all related data
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

    return NextResponse.json({ 
      success: true, 
      clinic: createdClinic,
      message: 'Clinic created successfully'
    });

  } catch (error) {
    console.error('Error creating clinic:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}