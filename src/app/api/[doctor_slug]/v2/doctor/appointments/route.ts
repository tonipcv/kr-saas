import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTenantContext, requireDoctorContext } from '@/lib/tenant';

// GET - List appointments for a doctor (tenant-scoped)
export async function GET(req: NextRequest) {
  try {
    const ctx = await getTenantContext(req);
    await requireDoctorContext(ctx);

    const searchParams = req.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const patientId = searchParams.get('patientId');
    const status = searchParams.get('status');

    const filters: any = { doctorId: ctx.doctorId };

    if (startDate && endDate) {
      filters.startTime = { gte: new Date(startDate) };
      filters.endTime = { lte: new Date(endDate) };
    }
    if (patientId) filters.patientId = patientId;
    if (status) filters.status = status;

    const appointments = await prisma.appointment.findMany({
      where: filters,
      include: {
        patient: { select: { id: true, name: true, email: true, image: true } },
      },
      orderBy: { startTime: 'asc' },
    });

    return NextResponse.json({ success: true, data: appointments, message: 'Appointments retrieved successfully' });
  } catch (error: any) {
    const status = error?.status ?? 500;
    return NextResponse.json({ success: false, message: error?.message || 'Internal server error' }, { status });
  }
}

// POST - Create a new appointment (tenant-scoped)
export async function POST(req: NextRequest) {
  try {
    const ctx = await getTenantContext(req);
    await requireDoctorContext(ctx);

    const body = await req.json();
    const { patientId, startTime, endTime, title, notes } = body;

    if (!patientId || !startTime || !endTime || !title) {
      return NextResponse.json({ success: false, message: 'Missing required fields' }, { status: 400 });
    }

    const patient = await prisma.user.findUnique({ where: { id: patientId } });
    if (!patient) {
      return NextResponse.json({ success: false, message: 'Patient not found' }, { status: 404 });
    }

    const appointment = await prisma.appointment.create({
      data: {
        patientId,
        doctorId: ctx.doctorId,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        status: 'SCHEDULED',
        title,
        notes,
      },
    });

    return NextResponse.json({ success: true, data: appointment, message: 'Appointment created successfully' });
  } catch (error: any) {
    const status = error?.status ?? 500;
    return NextResponse.json({ success: false, message: error?.message || 'Internal server error' }, { status });
  }
}
