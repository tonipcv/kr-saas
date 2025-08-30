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

    // Get the doctor's ID from the session user's email
    const doctor = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true }
    });

    if (!doctor || doctor.role !== 'DOCTOR') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Get doctor's patients through relationships
    const relationships = await prisma.doctorPatientRelationship.findMany({
      where: {
        doctorId: doctor.id,
        isActive: true
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
            patient_prescriptions: {
              where: { status: 'ACTIVE' },
              select: {
                id: true,
                protocol: {
                  select: {
                    id: true,
                    name: true,
                    duration: true
                  }
                },
                planned_start_date: true,
                planned_end_date: true,
                status: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Transform to legacy format
    const patients = relationships.map(rel => ({
      id: rel.patient.id,
      name: rel.patient.name,
      email: rel.patient.email,
      phone: rel.patient.phone,
      birthDate: rel.patient.birth_date,
      gender: rel.patient.gender,
      address: rel.patient.address,
      emergencyContact: rel.patient.emergency_contact,
      emergencyPhone: rel.patient.emergency_phone,
      medicalHistory: rel.patient.medical_history,
      allergies: rel.patient.allergies,
      medications: rel.patient.medications,
      notes: rel.patient.notes,
      assignedProtocols: rel.patient.patient_prescriptions?.map(p => ({
        id: p.id,
        protocol: p.protocol,
        startDate: p.planned_start_date,
        endDate: p.planned_end_date,
        isActive: p.status === 'ACTIVE'
      })) || []
    }));

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
      select: { id: true }
    });

    if (existingUser) {
      // If user exists, link or reactivate relationship instead of blocking
      const existingRel = await prisma.doctorPatientRelationship.findUnique({
        where: {
          patientId_doctorId: {
            patientId: existingUser.id,
            doctorId: doctor.id
          }
        },
        select: { id: true, isActive: true }
      });

      if (!existingRel) {
        await prisma.doctorPatientRelationship.create({
          data: {
            doctorId: doctor.id,
            patientId: existingUser.id,
            isActive: true,
            isPrimary: false
          }
        });

        return NextResponse.json({
          id: existingUser.id,
          name,
          email,
          phone
        });
      }

      if (!existingRel.isActive) {
        await prisma.doctorPatientRelationship.update({
          where: { id: existingRel.id },
          data: { isActive: true }
        });

        return NextResponse.json({
          id: existingUser.id,
          name,
          email,
          phone
        });
      }

      return NextResponse.json(
        { error: 'This email is already linked to this doctor' },
        { status: 409 }
      );
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

      return patient;
    });

    return NextResponse.json({
      id: result.id,
      name: result.name,
      email: result.email,
      phone: result.phone
    });

  } catch (error) {
    console.error('Error creating patient:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 