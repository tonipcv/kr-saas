import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma, PrescriptionStatus } from '@prisma/client';
import { getTenantContext, requireDoctorContext } from '@/lib/tenant';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

// GET /api/[doctor_slug]/v2/doctor/prescriptions
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantContext(request);
    await requireDoctorContext(ctx);

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');
    const status = searchParams.get('status') as PrescriptionStatus | null;
    const email = searchParams.get('email');
    const patientId = searchParams.get('patientId');

    const whereClause: Prisma.ProtocolPrescriptionWhereInput = {
      prescribed_by: ctx.doctorId,
    };

    if (status) whereClause.status = status;

    if (email || patientId) {
      whereClause.patient = {};
      if (email) {
        whereClause.patient.email = { contains: email, mode: 'insensitive' } as any;
      }
      if (patientId) {
        whereClause.patient.id = patientId as any;
      }
    }

    const prescriptions = await prisma.protocolPrescription.findMany({
      where: whereClause,
      take: limit,
      skip: offset,
      orderBy: { prescribed_at: 'desc' },
      include: {
        protocol: true,
        patient: { select: { name: true, email: true } },
      },
    });

    const total = await prisma.protocolPrescription.count({ where: whereClause });

    return NextResponse.json({
      success: true,
      data: prescriptions.map((p) => ({
        id: p.id,
        protocol_id: p.protocol_id,
        protocol_name: p.protocol.name,
        protocol_description: p.protocol.description,
        user_id: p.user_id,
        user_name: p.patient.name,
        user_email: p.patient.email,
        prescribed_by: p.prescribed_by,
        prescribed_at: p.prescribed_at.toISOString(),
        planned_start_date: p.planned_start_date?.toISOString(),
        actual_start_date: p.actual_start_date?.toISOString(),
        planned_end_date: p.planned_end_date?.toISOString(),
        actual_end_date: p.actual_end_date?.toISOString(),
        status: p.status,
        current_day: p.current_day,
        adherence_rate: p.adherence_rate,
      })),
      pagination: { total, limit, offset, hasMore: offset + limit < total },
      message: 'Prescrições carregadas com sucesso',
    });
  } catch (error: any) {
    const status = error?.status ?? 500;
    return NextResponse.json({ success: false, message: error?.message || 'Erro interno do servidor.' }, { status });
  }
}

// POST /api/[doctor_slug]/v2/doctor/prescriptions
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantContext(request);
    await requireDoctorContext(ctx);

    const body = await request.json();
    const {
      protocol_id,
      user_id,
      email,
      planned_start_date,
      planned_end_date,
      consultation_date,
    } = body as {
      protocol_id: string; user_id?: string; email?: string; planned_start_date: string; planned_end_date?: string; consultation_date?: string;
    };

    if (!protocol_id || !planned_start_date) {
      return NextResponse.json({ success: false, message: 'Dados inválidos: protocol_id e planned_start_date são obrigatórios.' }, { status: 400 });
    }

    // Validate protocol belongs to doctor (tenant)
    const protocol = await prisma.protocol.findFirst({ where: { id: protocol_id, doctor_id: ctx.doctorId } });
    if (!protocol) {
      return NextResponse.json({ success: false, message: 'Protocolo não encontrado ou não associado a este médico.' }, { status: 404 });
    }

    // Resolve patient and relationship within tenant
    let patient = null as null | { id: string; email: string | null; name: string | null };
    if (email) {
      patient = await prisma.user.findFirst({ where: { email: email.toLowerCase(), role: 'PATIENT' }, select: { id: true, email: true, name: true } });
      if (!patient) return NextResponse.json({ success: false, message: 'Paciente com este email não encontrado.' }, { status: 404 });
    } else if (user_id) {
      patient = await prisma.user.findFirst({ where: { id: user_id, role: 'PATIENT' }, select: { id: true, email: true, name: true } });
      if (!patient) return NextResponse.json({ success: false, message: 'Paciente com este ID não encontrado.' }, { status: 404 });
    } else {
      const rel = await prisma.doctorPatientRelationship.findFirst({
        where: { doctorId: ctx.doctorId, isActive: true },
        include: { patient: { select: { id: true, email: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      });
      if (!rel?.patient) return NextResponse.json({ success: false, message: 'Nenhum paciente encontrado associado a este médico.' }, { status: 404 });
      patient = rel.patient;
    }

    // Ensure active relationship exists for this tenant
    let relationship = await prisma.doctorPatientRelationship.findFirst({
      where: { doctorId: ctx.doctorId, patientId: patient.id, isActive: true },
    });
    if (!relationship) {
      relationship = await prisma.doctorPatientRelationship.create({ data: { doctorId: ctx.doctorId, patientId: patient.id, isActive: true } });
    }

    // Upsert prescription (one active per protocol/patient)
    const existingPrescription = await prisma.protocolPrescription.findFirst({
      where: { protocol_id, user_id: patient.id, status: { in: ['PRESCRIBED', 'ACTIVE'] } },
    });

    let prescription;
    if (existingPrescription) {
      prescription = await prisma.protocolPrescription.update({
        where: { id: existingPrescription.id },
        data: {
          planned_start_date: new Date(planned_start_date).toISOString(),
          planned_end_date: planned_end_date ? new Date(planned_end_date).toISOString() : undefined,
          consultation_date: consultation_date && consultation_date !== '' ? new Date(consultation_date).toISOString() : undefined,
          status: 'PRESCRIBED',
          updated_at: new Date(),
        },
      });
    } else {
      prescription = await prisma.protocolPrescription.create({
        data: {
          protocol_id,
          user_id: patient.id,
          prescribed_by: ctx.doctorId,
          planned_start_date: new Date(planned_start_date).toISOString(),
          planned_end_date: planned_end_date ? new Date(planned_end_date).toISOString() : undefined,
          consultation_date: consultation_date && consultation_date !== '' ? new Date(consultation_date).toISOString() : undefined,
          status: 'PRESCRIBED',
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: prescription.id,
        protocol_id: prescription.protocol_id,
        user_id: prescription.user_id,
        patient_email: patient.email,
        patient_name: patient.name,
        prescribed_by: prescription.prescribed_by,
        prescribed_at: prescription.prescribed_at.toISOString(),
        planned_start_date: prescription.planned_start_date?.toISOString(),
        status: prescription.status,
        updated: !!existingPrescription,
      },
      message: existingPrescription ? 'Prescrição atualizada com sucesso' : 'Prescrição criada com sucesso',
    }, { status: 201 });
  } catch (error: any) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return NextResponse.json({ success: false, message: 'Já existe uma prescrição para este paciente com este protocolo.' }, { status: 409 });
      }
    }
    const status = error?.status ?? 400;
    return NextResponse.json({ success: false, message: error?.message || 'Dados inválidos ou erro interno.' }, { status });
  }
}
