import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { emitEvent } from '@/lib/events';
import { EventActor, EventType } from '@prisma/client';
import { verifyMobileAuth } from '@/lib/mobile-auth';

// GET /api/patient/profile - Get patient profile information
export async function GET(request: NextRequest) {
  try {
    // Tentar autenticação web primeiro, depois mobile
    let userId: string | null = null;
    
    const session = await getServerSession(authOptions);
    if (session?.user?.id) {
      userId = session.user.id;
    } else {
      // Tentar autenticação mobile
      const mobileUser = await verifyMobileAuth(request);
      if (mobileUser?.id) {
        userId = mobileUser.id;
      }
    }

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        birthDate: true,
        gender: true,
        address: true,
        emergencyContact: true,
        emergencyPhone: true,
        medicalHistory: true,
        allergies: true,
        medications: true,
        notes: true,
        image: true,
        role: true,
        doctorId: true,
        doctor: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            image: true
          }
        }
      }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Verificar se é paciente
    if (user.role !== 'PATIENT') {
      return NextResponse.json({ error: 'Access denied. Only patients can access this endpoint.' }, { status: 403 });
    }

    return NextResponse.json({ user });

  } catch (error) {
    console.error('Error fetching patient profile:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT /api/patient/profile - Update patient profile information
export async function PUT(request: NextRequest) {
  try {
    // Tentar autenticação web primeiro, depois mobile
    let userId: string | null = null;
    
    const session = await getServerSession(authOptions);
    if (session?.user?.id) {
      userId = session.user.id;
    } else {
      // Tentar autenticação mobile
      const mobileUser = await verifyMobileAuth(request);
      if (mobileUser?.id) {
        userId = mobileUser.id;
      }
    }

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verificar se o usuário existe e é paciente; capturar snapshot para diff
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        name: true,
        phone: true,
        birthDate: true,
        gender: true,
        address: true,
        emergencyContact: true,
        emergencyPhone: true,
        medicalHistory: true,
        allergies: true,
        medications: true,
        notes: true,
        image: true,
        doctorId: true,
      }
    });

    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (existingUser.role !== 'PATIENT') {
      return NextResponse.json({ error: 'Access denied. Only patients can update their profile.' }, { status: 403 });
    }

    const body = await request.json();
    const {
      name,
      phone,
      birthDate,
      gender,
      address,
      emergencyContact,
      emergencyPhone,
      medicalHistory,
      allergies,
      medications,
      notes,
      image
    } = body;

    // Atualizar perfil
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name && { name: name.trim() }),
        ...(phone !== undefined && { phone: phone?.trim() || null }),
        ...(birthDate !== undefined && { birthDate: birthDate ? new Date(birthDate) : null }),
        ...(gender !== undefined && { gender: gender?.trim() || null }),
        ...(address !== undefined && { address: address?.trim() || null }),
        ...(emergencyContact !== undefined && { emergencyContact: emergencyContact?.trim() || null }),
        ...(emergencyPhone !== undefined && { emergencyPhone: emergencyPhone?.trim() || null }),
        ...(medicalHistory !== undefined && { medicalHistory: medicalHistory?.trim() || null }),
        ...(allergies !== undefined && { allergies: allergies?.trim() || null }),
        ...(medications !== undefined && { medications: medications?.trim() || null }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
        ...(image !== undefined && { image: image?.trim() || null })
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        birthDate: true,
        gender: true,
        address: true,
        emergencyContact: true,
        emergencyPhone: true,
        medicalHistory: true,
        allergies: true,
        medications: true,
        notes: true,
        image: true,
        role: true,
        doctorId: true,
        doctor: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            image: true
          }
        }
      }
    });

    // Emit analytics: customer_updated (non-blocking)
    try {
      // Compute changes object only for modified fields
      const fields: Array<keyof typeof updatedUser> = [
        'name','phone','birthDate','gender','address','emergencyContact','emergencyPhone','medicalHistory','allergies','medications','notes','image'
      ] as any;
      const changes: Record<string, { from: any; to: any }> = {};
      for (const f of fields) {
        const beforeVal = (existingUser as any)?.[f] ?? null;
        const afterVal = (updatedUser as any)?.[f] ?? null;
        // Compare by value; for Date compare ISO
        const beforeCmp = beforeVal instanceof Date ? beforeVal.toISOString() : beforeVal;
        const afterCmp = afterVal instanceof Date ? afterVal.toISOString() : afterVal;
        if (beforeCmp !== afterCmp) {
          changes[f as string] = { from: beforeVal, to: afterVal };
        }
      }
      if (Object.keys(changes).length > 0) {
        // Resolve clinicId via doctor ownership or membership using updatedUser.doctorId
        let clinicId: string | null = null;
        const doctorId = (updatedUser as any)?.doctorId as string | null;
        if (doctorId) {
          try {
            const owned = await prisma.clinic.findFirst({ where: { ownerId: doctorId }, select: { id: true } });
            if (owned?.id) clinicId = owned.id;
          } catch {}
          if (!clinicId) {
            try {
              const membership = await prisma.clinicMember.findFirst({ where: { userId: doctorId, isActive: true }, select: { clinicId: true } });
              if (membership?.clinicId) clinicId = membership.clinicId;
            } catch {}
          }
        }
        if (clinicId) {
          await emitEvent({
            eventType: EventType.customer_updated,
            actor: EventActor.customer,
            clinicId,
            customerId: updatedUser.id,
            metadata: { changes },
          });
        }
      }
    } catch (e) {
      console.error('[events] customer_updated emit failed', e);
    }

    return NextResponse.json({ user: updatedUser });

  } catch (error) {
    console.error('Error updating patient profile:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 