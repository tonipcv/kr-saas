import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { unauthorizedResponse, verifyMobileAuth } from '@/lib/mobile-auth';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { z } from 'zod';

const updateProfileSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  phone: z.string().optional(),
  birth_date: z.string().optional(),
  gender: z.string().optional(),
  height: z.number().optional(),
  weight: z.number().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  zip_code: z.string().optional(),
});

// GET /api/v2/patients/profile - Buscar perfil do paciente
export async function GET(request: NextRequest) {
  try {
    // Prefer web session; fallback to mobile token
    const session = await getServerSession(authOptions);
    let userId: string | null = session?.user?.id || null;

    if (!userId) {
      const mobileUser = await verifyMobileAuth(request).catch(() => null);
      if (mobileUser) userId = mobileUser.id;
    }

    if (!userId) {
      return unauthorizedResponse();
    }

    // Allow if the user is a PATIENT, or if they have any doctor-patient relationship as patient
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    });

    let asPatient = dbUser?.role === 'PATIENT';
    if (!asPatient) {
      const rel = await prisma.doctorPatientRelationship.findFirst({ where: { patientId: userId } });
      if (rel) asPatient = true;
    }
    if (!asPatient) {
      return NextResponse.json({ error: 'Access denied. Patients only.' }, { status: 403 });
    }

    const profile = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        birth_date: true,
        gender: true,
        address: true,
        image: true,
        created_at: true,
        updated_at: true,
      }
    });

    if (!profile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      profile,
      message: 'Perfil carregado com sucesso'
    });
  } catch (error) {
    console.error('Error in GET /api/v2/patients/profile:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/v2/patients/profile - Atualizar perfil do paciente
export async function PATCH(request: NextRequest) {
  try {
    // Prefer web session; fallback to mobile token
    const session = await getServerSession(authOptions);
    let userId: string | null = session?.user?.id || null;

    if (!userId) {
      const mobileUser = await verifyMobileAuth(request).catch(() => null);
      if (mobileUser) userId = mobileUser.id;
    }

    if (!userId) {
      return unauthorizedResponse();
    }

    const body = await request.json();
    const validatedData = updateProfileSchema.parse(body);

    const updatedProfile = await prisma.user.update({
      where: { id: userId },
      data: validatedData,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        birth_date: true,
        gender: true,
        image: true,
        updated_at: true,
      }
    });

    return NextResponse.json({
      success: true,
      profile: updatedProfile,
      message: 'Perfil atualizado com sucesso'
    });
  } catch (error) {
    console.error('Error in PATCH /api/v2/patients/profile:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
