import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { emitEvent } from '@/lib/events';
import { EventActor, EventType } from '@prisma/client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    // Check if doctor has access to this patient and include per-doctor PatientProfile
    const relationship = await prisma.doctorPatientRelationship.findFirst({
      where: {
        doctorId: doctor.id,
        patientId: id,
        isActive: true,
      },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
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
        },
      },
    });

    if (!relationship || !relationship.patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    // Transform to legacy format with PatientProfile fallback
    const profile = relationship.patient.patient_profiles?.[0];
    const patient = {
      id: relationship.patient.id,
      name: profile?.name ?? relationship.patient.name,
      email: relationship.patient.email,
      phone: profile?.phone ?? relationship.patient.phone,
      birthDate: relationship.patient.birth_date,
      gender: relationship.patient.gender,
      address: profile?.address ?? relationship.patient.address,
      emergencyContact: profile?.emergency_contact ?? relationship.patient.emergency_contact,
      emergencyPhone: profile?.emergency_phone ?? relationship.patient.emergency_phone,
      medicalHistory: profile?.medical_history ?? relationship.patient.medical_history,
      allergies: profile?.allergies ?? relationship.patient.allergies,
      medications: profile?.medications ?? relationship.patient.medications,
      notes: profile?.notes ?? relationship.patient.notes,
      isActive: profile?.isActive ?? relationship.patient.is_active,
    };

    return NextResponse.json(patient);

  } catch (error) {
    console.error('Error fetching patient:', error);
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

    // Get the doctor's ID from the session user's email
    const doctor = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true }
    });

    if (!doctor || doctor.role !== 'DOCTOR') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { id } = await params;

    // Check if doctor has access to this patient
    const relationship = await prisma.doctorPatientRelationship.findFirst({
      where: {
        doctorId: doctor.id,
        patientId: id,
        isActive: true
      }
    });

    if (!relationship) {
      return NextResponse.json({ error: 'Patient not found or access denied' }, { status: 403 });
    }

    const body = await request.json();
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

    // Update per-doctor fields in PatientProfile, and update limited global fields in User
    const result = await prisma.$transaction(async (tx) => {
      // Upsert tenant-scoped PatientProfile
      const profile = await tx.patientProfile.upsert({
        where: { doctorId_userId: { doctorId: doctor.id, userId: id } },
        create: {
          doctorId: doctor.id,
          userId: id,
          ...(name !== undefined ? { name } : {}),
          ...(phone !== undefined ? { phone } : {}),
          ...(address !== undefined ? { address } : {}),
          ...(emergencyContact !== undefined ? { emergency_contact: emergencyContact } : {}),
          ...(emergencyPhone !== undefined ? { emergency_phone: emergencyPhone } : {}),
          ...(medicalHistory !== undefined ? { medical_history: medicalHistory } : {}),
          ...(allergies !== undefined ? { allergies } : {}),
          ...(medications !== undefined ? { medications } : {}),
          ...(notes !== undefined ? { notes } : {}),
          isActive: true,
        },
        update: {
          ...(name !== undefined ? { name } : {}),
          ...(phone !== undefined ? { phone } : {}),
          ...(address !== undefined ? { address } : {}),
          ...(emergencyContact !== undefined ? { emergency_contact: emergencyContact } : {}),
          ...(emergencyPhone !== undefined ? { emergency_phone: emergencyPhone } : {}),
          ...(medicalHistory !== undefined ? { medical_history: medicalHistory } : {}),
          ...(allergies !== undefined ? { allergies } : {}),
          ...(medications !== undefined ? { medications } : {}),
          ...(notes !== undefined ? { notes } : {}),
        },
      });

      // Update selected global fields on User
      const user = await tx.user.update({
        where: { id },
        data: {
          ...(email ? { email } : {}),
          ...(birthDate ? { birth_date: new Date(birthDate) } : {}),
          ...(gender ? { gender } : {}),
        },
        select: { id: true, email: true },
      });

      return { profile, user };
    });

    // Emit event: customer_updated
    try {
      // Prefer clinicId from query when valid for this doctor (owner OR active member)
      const { searchParams } = new URL(request.url);
      const clinicIdParam = searchParams.get('clinicId');
      let clinicId: string | null = null;
      if (clinicIdParam) {
        const owns = await prisma.clinic.findFirst({ where: { id: clinicIdParam, ownerId: doctor.id }, select: { id: true } });
        if (owns?.id) clinicId = owns.id;
        if (!clinicId) {
          const access = await prisma.clinicMember.findFirst({ where: { userId: doctor.id, clinicId: clinicIdParam, isActive: true }, select: { clinicId: true } });
          if (access?.clinicId) clinicId = access.clinicId;
        }
      }
      const owned = await prisma.clinic.findFirst({ where: { ownerId: doctor.id }, select: { id: true } });
      if (owned?.id && !clinicId) clinicId = owned.id;
      if (!clinicId) {
        const membership = await prisma.clinicMember.findFirst({ where: { userId: doctor.id, isActive: true }, select: { clinicId: true } });
        if (membership?.clinicId) clinicId = membership.clinicId;
      }
      if (clinicId) {
        await emitEvent({
          eventId: `customer_updated_clinic_${clinicId}_doctor_${doctor.id}_user_${id}`,
          eventType: EventType.customer_updated,
          actor: EventActor.clinic,
          clinicId,
          customerId: id,
          metadata: { changes: { name, email, phone, birthDate, gender, address, emergencyContact, emergencyPhone } },
        });
      }
    } catch (e) {
      console.error('[events] patient update emit failed', e);
    }

    return NextResponse.json({
      id: id,
      name: name,
      email: result.user.email,
      phone: phone,
    });

  } catch (error) {
    console.error('Error updating patient:', error);
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

    // Get the doctor's ID from the session user's email
    const doctor = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true }
    });

    if (!doctor || doctor.role !== 'DOCTOR') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { id } = await params;
    const patientId = id;
    
    // Check if doctor has access to this patient
    const relationship = await prisma.doctorPatientRelationship.findFirst({
      where: {
        doctorId: doctor.id,
        patientId: patientId,
        isActive: true
      }
    });

    if (!relationship) {
      return NextResponse.json({ error: 'Patient not found or access denied' }, { status: 403 });
    }

    // Update the user, relationship and PatientProfile in a transaction
    await prisma.$transaction(async (tx) => {
      // Soft delete user by setting is_active to false
      await tx.user.update({
        where: { id: patientId },
        data: { is_active: false }
      });
      
      // Also set the relationship to inactive
      await tx.doctorPatientRelationship.updateMany({
        where: {
          doctorId: doctor.id,
          patientId: patientId,
        },
        data: { isActive: false }
      });

      // Mark the PatientProfile as inactive for this doctor
      await tx.patientProfile.updateMany({
        where: { doctorId: doctor.id, userId: patientId },
        data: { isActive: false },
      });
    });

    // Emit audit event: config_changed for deletion
    try {
      const { searchParams } = new URL(request.url);
      const clinicIdParam = searchParams.get('clinicId');
      let clinicId: string | null = null;
      if (clinicIdParam) {
        const owns = await prisma.clinic.findFirst({ where: { id: clinicIdParam, ownerId: doctor.id }, select: { id: true } });
        if (owns?.id) clinicId = owns.id;
        if (!clinicId) {
          const access = await prisma.clinicMember.findFirst({ where: { userId: doctor.id, clinicId: clinicIdParam, isActive: true }, select: { clinicId: true } });
          if (access?.clinicId) clinicId = access.clinicId;
        }
      }
      const owned = await prisma.clinic.findFirst({ where: { ownerId: doctor.id }, select: { id: true } });
      if (owned?.id && !clinicId) clinicId = owned.id;
      if (!clinicId) {
        const membership = await prisma.clinicMember.findFirst({ where: { userId: doctor.id, isActive: true }, select: { clinicId: true } });
        if (membership?.clinicId) clinicId = membership.clinicId;
      }
      if (clinicId) {
        await emitEvent({
          eventId: `patient_deleted_clinic_${clinicId}_doctor_${doctor.id}_user_${patientId}`,
          eventType: EventType.config_changed,
          actor: EventActor.clinic,
          clinicId,
          customerId: patientId,
          metadata: {
            field_changed: 'patient_deleted_manual',
            old_value: { patient_id: patientId, doctor_id: doctor.id },
            new_value: null,
          },
        });
      }
    } catch (e) {
      console.error('[events] patient delete emit failed', e);
    }

    return NextResponse.json({ message: 'Patient deleted successfully' });

  } catch (error) {
    console.error('Error deleting patient:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 