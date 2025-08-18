import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/patient/clinic-slug - Detectar slug da clínica do paciente
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Buscar o usuário para verificar se é paciente
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, role: true, doctor_id: true }
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    if (user.role !== 'PATIENT') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    // Helper: given a doctorId, try owned clinic then membership
    const resolveClinicFromDoctor = async (doctorId: string) => {
      // Owned clinic
      const owned = await prisma.clinic.findFirst({
        where: { ownerId: doctorId, isActive: true },
        select: { slug: true, name: true }
      });
      if (owned) return { clinicSlug: owned.slug, clinicName: owned.name };

      // Membership clinic
      const membership = await prisma.clinicMembership.findFirst({
        where: { userId: doctorId, isActive: true },
        include: { clinic: { select: { slug: true, name: true } } }
      });
      if (membership?.clinic) return { clinicSlug: membership.clinic.slug, clinicName: membership.clinic.name };

      return null;
    };

    // 1) Se o paciente tem um médico associado diretamente
    if ((user as any).doctor_id) {
      const clinic = await resolveClinicFromDoctor((user as any).doctor_id as string);
      if (clinic) return NextResponse.json(clinic);
    }

    // 2) Caso contrário, resolver via relacionamento DoctorPatientRelationship
    const relationship = await prisma.doctorPatientRelationship.findFirst({
      where: { patientId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { doctor: { select: { id: true } } }
    });
    if (relationship?.doctor?.id) {
      const clinic = await resolveClinicFromDoctor(relationship.doctor.id);
      if (clinic) return NextResponse.json(clinic);
    }

    // Se não encontrou nenhuma clínica, retornar null
    return NextResponse.json({ 
      clinicSlug: null,
      clinicName: null 
    });

  } catch (error) {
    console.error('Error detecting clinic slug:', error instanceof Error ? error.message : String(error ?? 'Unknown error'));
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
} 