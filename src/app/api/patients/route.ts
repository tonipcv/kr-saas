import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { emitEvent } from '@/lib/events';
import { EventActor, EventType } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get clinicId from query params
    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinicId');

    // Get the doctor's ID from the session user's email
    const doctor = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true }
    });

    if (!doctor || doctor.role !== 'DOCTOR') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Verify doctor has access to the clinic if clinicId is provided
    if (clinicId) {
      const hasAccess = await prisma.clinic.findFirst({
        where: {
          id: clinicId,
          OR: [
            { ownerId: doctor.id },
            {
              members: {
                some: {
                  userId: doctor.id,
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

    // Query doctor-scoped patient profiles, join base user to provide email/createdAt
    const profiles = await prisma.patientProfile.findMany({
      where: { doctorId: doctor.id, isActive: true },
      orderBy: { createdAt: 'desc' },
      select: {
        doctorId: true,
        userId: true,
        name: true,
        phone: true,
        address: true,
        emergency_contact: true,
        emergency_phone: true,
        medical_history: true,
        allergies: true,
        medications: true,
        notes: true,
        isActive: true,
        createdAt: true,
      },
    });

    // Load base users for the profiles, skipping any orphaned profile rows
    const userIds = Array.from(new Set(profiles.map(p => p.userId)));
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true, created_at: true, birth_date: true, gender: true },
        })
      : [];
    const userMap = new Map(users.map(u => [u.id, u]));

    const patients = profiles
      .map((p) => {
        const u = userMap.get(p.userId);
        if (!u) return null; // skip orphaned
        return {
          id: u.id,
          name: p.name || null,
          email: u.email,
          phone: p.phone || null,
          createdAt: u.created_at,
          birthDate: u.birth_date,
          gender: u.gender,
          address: p.address || null,
          emergencyContact: p.emergency_contact || null,
          emergencyPhone: p.emergency_phone || null,
          medicalHistory: p.medical_history || null,
          allergies: p.allergies || null,
          medications: p.medications || null,
          notes: p.notes || null,
          isActive: p.isActive,
          assignedProtocols: [],
        };
      })
      .filter(Boolean);

    return NextResponse.json(patients);

  } catch (error) {
    console.error('Error fetching patients:', error);
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

    // Get the doctor's ID from the session user's email
    const doctor = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true }
    });

    if (!doctor || doctor.role !== 'DOCTOR') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body = await request.json();
    const { searchParams } = new URL(request.url);
    const clinicIdParam = searchParams.get('clinicId');
    const {
      name,
      email,
      phone,
      birthDate,
      gender,
      address,
      emergencyContact,
      emergencyPhone,
      medicalHistory,
      allergies,
      medications,
      notes
    } = body;

    // Validate required fields
    if (!name || !email) {
      return NextResponse.json(
        { error: 'Name and email are required' },
        { status: 400 }
      );
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true }
    });

    // Resolve clinicId for event emission (prefer param if doctor has access)
    const resolveClinicIdForDoctor = async (doctorId: string): Promise<string | null> => {
      if (clinicIdParam) {
        // Allow when doctor owns the clinic
        const owns = await prisma.clinic.findFirst({ where: { id: clinicIdParam, ownerId: doctorId }, select: { id: true } });
        if (owns?.id) return owns.id;
        // Or when doctor is an active member of the clinic
        const access = await prisma.clinicMember.findFirst({ where: { userId: doctorId, clinicId: clinicIdParam, isActive: true }, select: { clinicId: true } });
        if (access?.clinicId) return access.clinicId;
      }
      // Fallbacks
      const owned = await prisma.clinic.findFirst({ where: { ownerId: doctorId }, select: { id: true } });
      if (owned?.id) return owned.id;
      const membership = await prisma.clinicMember.findFirst({ where: { userId: doctorId, isActive: true }, select: { clinicId: true } });
      return membership?.clinicId || null;
    };

    if (existingUser) {
      // Upsert the per-doctor profile with the provided fields (acts as the association)
      await prisma.patientProfile.upsert({
        where: {
          doctorId_userId: { doctorId: doctor.id, userId: existingUser.id },
        },
        create: {
          doctorId: doctor.id,
          userId: existingUser.id,
          name,
          phone,
          address,
          emergency_contact: emergencyContact,
          emergency_phone: emergencyPhone,
          medical_history: medicalHistory,
          allergies,
          medications,
          notes,
          isActive: true,
        },
        update: {
          name,
          phone,
          address,
          emergency_contact: emergencyContact,
          emergency_phone: emergencyPhone,
          medical_history: medicalHistory,
          allergies,
          medications,
          notes,
          isActive: true,
        },
      });

      // Emit event to show in /doctor/events
      try {
        const clinicId = await resolveClinicIdForDoctor(doctor.id);
        if (clinicId) {
          console.log('[events] patient link emit', { clinicId, doctorId: doctor.id, userId: existingUser.id, eventType: EventType.customer_updated });
          // With patient profiles, treat as customer_updated for linking/updating
          const eventType = EventType.customer_updated;
          await emitEvent({
            eventId: `${eventType}_clinic_${clinicId}_doctor_${doctor.id}_user_${existingUser.id}`,
            eventType,
            actor: EventActor.clinic,
            clinicId,
            customerId: existingUser.id,
            metadata: { changes: { name, phone, address, emergencyContact, emergencyPhone } },
          });
        }
      } catch (e) {
        console.error('[events] patient link emit failed', e);
      }

      return NextResponse.json({
        id: existingUser.id,
        name,
        email: existingUser.email,
        phone,
      });
    }

    // Create patient and relationship in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create patient user
      const patient = await tx.user.create({
        data: {
          id: crypto.randomUUID(),
          name,
          email,
          phone,
          birth_date: birthDate ? new Date(birthDate) : null,
          gender,
          address,
          emergency_contact: emergencyContact,
          emergency_phone: emergencyPhone,
          medical_history: medicalHistory,
          allergies,
          medications,
          notes,
          role: 'PATIENT',
          is_active: true
        }
      });

      // Create the per-doctor PatientProfile
      await tx.patientProfile.create({
        data: {
          doctorId: doctor.id,
          userId: patient.id,
          name,
          phone,
          address,
          emergency_contact: emergencyContact,
          emergency_phone: emergencyPhone,
          medical_history: medicalHistory,
          allergies,
          medications,
          notes,
          isActive: true,
        },
      });

      return patient;
    });

    // Emit customer_created for brand new user
    try {
      const clinicId = await resolveClinicIdForDoctor(doctor.id);
      if (clinicId) {
        console.log('[events] patient create emit', { clinicId, doctorId: doctor.id, userId: result.id, eventType: 'customer_created' });
        await emitEvent({
          eventId: `customer_created_clinic_${clinicId}_doctor_${doctor.id}_user_${result.id}`,
          eventType: EventType.customer_created,
          actor: EventActor.clinic,
          clinicId,
          customerId: result.id,
          metadata: { nome: name },
        });
      }
    } catch (e) {
      console.error('[events] patient create emit failed', e);
    }

    return NextResponse.json({
      id: result.id,
      name: name,
      email: result.email,
      phone: phone
    });

  } catch (error) {
    console.error('Error creating patient:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
 