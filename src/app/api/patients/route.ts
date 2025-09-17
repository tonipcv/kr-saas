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

    // Query patients directly, scoped by relationship to this doctor (and clinic when provided).
    // This avoids including potentially missing related rows that can cause Prisma's
    // "Field patient is required to return data, got null" when orphaned relationships exist.
    const users = await prisma.user.findMany({
      where: {
        patient_relationships: {
          some: {
            doctorId: doctor.id,
            isActive: true,
          },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        created_at: true,
        birth_date: true,
        gender: true,
        address: true,
        emergency_contact: true,
        emergency_phone: true,
        medical_history: true,
        allergies: true,
        medications: true,
        notes: true,
        is_active: true,
        // Active prescriptions for context
        patient_prescriptions: {
          where: { status: 'ACTIVE' },
          select: {
            id: true,
            protocol: { select: { id: true, name: true, duration: true } },
            planned_start_date: true,
            planned_end_date: true,
            status: true,
          },
        },
        // Bring tenant-scoped profile (0..1) for this doctor
        patient_profiles: {
          where: { doctorId: doctor.id },
          take: 1,
          select: {
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
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    // Transform to legacy format
    const patients = users.map((u) => {
      const profile = u.patient_profiles?.[0];
      return {
        id: u.id,
        name: profile?.name ?? u.name,
        email: u.email,
        phone: profile?.phone ?? u.phone,
        createdAt: u.created_at,
        birthDate: u.birth_date,
        gender: u.gender,
        address: profile?.address ?? u.address,
        emergencyContact: profile?.emergency_contact ?? u.emergency_contact,
        emergencyPhone: profile?.emergency_phone ?? u.emergency_phone,
        medicalHistory: profile?.medical_history ?? u.medical_history,
        allergies: profile?.allergies ?? u.allergies,
        medications: profile?.medications ?? u.medications,
        notes: profile?.notes ?? u.notes,
        isActive: profile?.isActive ?? u.is_active,
        assignedProtocols:
          u.patient_prescriptions?.map((p) => ({
            id: p.id,
            protocol: p.protocol,
            startDate: p.planned_start_date,
            endDate: p.planned_end_date,
            isActive: p.status === 'ACTIVE',
          })) || [],
      };
    });

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
    async function resolveClinicIdForDoctor(doctorId: string): Promise<string | null> {
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
    }

    if (existingUser) {
      // If user exists, link/reactivate and upsert a PatientProfile scoped to this doctor
      const existingRel = await prisma.doctorPatientRelationship.findUnique({
        where: {
          patientId_doctorId: {
            patientId: existingUser.id,
            doctorId: doctor.id,
          },
        },
        select: { id: true, isActive: true },
      });

      let createdRel = false;
      if (!existingRel) {
        await prisma.doctorPatientRelationship.create({
          data: {
            doctorId: doctor.id,
            patientId: existingUser.id,
            isActive: true,
            isPrimary: false,
          },
        });
        createdRel = true;
      } else if (!existingRel.isActive) {
        await prisma.doctorPatientRelationship.update({
          where: { id: existingRel.id },
          data: { isActive: true },
        });
        createdRel = true;
      }

      // Upsert the per-doctor profile with the provided fields
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
          console.log('[events] patient link emit', { clinicId, doctorId: doctor.id, userId: existingUser.id, createdRel, eventType: createdRel ? 'customer_created' : 'customer_updated' });
          // If relationship was newly created/reactivated, treat as customer_created for this doctor; else customer_updated
          const eventType = createdRel ? EventType.customer_created : EventType.customer_updated;
          await emitEvent({
            eventId: `${eventType}_clinic_${clinicId}_doctor_${doctor.id}_user_${existingUser.id}`,
            eventType,
            actor: EventActor.clinic,
            clinicId,
            customerId: existingUser.id,
            metadata: createdRel
              ? { nome: name || existingUser.name || email }
              : { changes: { name, phone, address, emergencyContact, emergencyPhone } },
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

      // Create doctor-patient relationship
      await tx.doctorPatientRelationship.create({
        data: {
          doctorId: doctor.id,
          patientId: patient.id,
          isActive: true,
          isPrimary: false
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
 