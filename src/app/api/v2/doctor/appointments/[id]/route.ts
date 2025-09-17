import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { updateCalendarEvent, deleteCalendarEvent } from '@/lib/googleCalendar';
import { emitEvent } from '@/lib/events';
import { EventActor, EventType } from '@prisma/client';

// GET - Get a specific appointment
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get session and verify authentication
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const appointmentId = params.id;

    // Get appointment
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        doctor: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    if (!appointment) {
      return NextResponse.json(
        { success: false, message: 'Appointment not found' },
        { status: 404 }
      );
    }

    // Check if user has permission to view this appointment
    if (
      session.user.role === 'DOCTOR' && appointment.doctorId !== session.user.id ||
      session.user.role === 'PATIENT' && appointment.patientId !== session.user.id
    ) {
      return NextResponse.json(
        { success: false, message: 'You do not have permission to view this appointment' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      data: appointment,
      message: 'Appointment retrieved successfully',
    });
  } catch (error: any) {
    console.error('Error retrieving appointment:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH - Update an appointment
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get session and verify authentication
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const appointmentId = params.id;

    // Get existing appointment
    const existingAppointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!existingAppointment) {
      return NextResponse.json(
        { success: false, message: 'Appointment not found' },
        { status: 404 }
      );
    }

    // Check if user has permission to update this appointment
    if (
      session.user.role === 'DOCTOR' && existingAppointment.doctorId !== session.user.id ||
      session.user.role === 'PATIENT' && existingAppointment.patientId !== session.user.id
    ) {
      return NextResponse.json(
        { success: false, message: 'You do not have permission to update this appointment' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await req.json();
    const { startTime, endTime, title, notes, status } = body;

    // Build update data
    const updateData: any = {};

    if (startTime) updateData.startTime = new Date(startTime);
    if (endTime) updateData.endTime = new Date(endTime);
    if (title) updateData.title = title;
    if (notes !== undefined) updateData.notes = notes;
    if (status) updateData.status = status;

    // Update appointment
    const updatedAppointment = await prisma.appointment.update({
      where: { id: appointmentId },
      data: updateData,
    });

    // Try to update Google Calendar event
    if (
      updatedAppointment.googleEventId && 
      (startTime || endTime || title || notes !== undefined)
    ) {
      try {
        await updateCalendarEvent(existingAppointment.doctorId, updatedAppointment);
      } catch (calendarError) {
        console.error('Error updating Google Calendar event:', calendarError);
        // Continue without Google Calendar update
      }
    }

    // Emit analytics: customer_visit when status becomes COMPLETED (non-blocking)
    try {
      if (updateData.status === 'COMPLETED' && existingAppointment.status !== 'COMPLETED') {
        // Compute duration if possible (minutes)
        const start = updatedAppointment.startTime || existingAppointment.startTime;
        const end = updatedAppointment.endTime || existingAppointment.endTime;
        let duration: number | null = null;
        if (start && end) {
          try {
            duration = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
          } catch {}
        }
        // Resolve clinicId by doctor ownership or membership
        let clinicId: string | null = null;
        try {
          const owned = await prisma.clinic.findFirst({ where: { ownerId: existingAppointment.doctorId }, select: { id: true } });
          if (owned?.id) clinicId = owned.id;
        } catch {}
        if (!clinicId) {
          try {
            const membership = await prisma.clinicMember.findFirst({ where: { userId: existingAppointment.doctorId, isActive: true }, select: { clinicId: true } });
            if (membership?.clinicId) clinicId = membership.clinicId;
          } catch {}
        }
        if (clinicId) {
          await emitEvent({
            eventType: EventType.customer_visit,
            actor: EventActor.clinic,
            clinicId,
            customerId: updatedAppointment.patientId,
            timestamp: updatedAppointment.endTime ?? undefined,
            metadata: { visit_type: 'appointment', duration_minutes: duration },
          });
        }
      }
    } catch (e) {
      console.error('[events] customer_visit emit failed', e);
    }

    return NextResponse.json({
      success: true,
      data: updatedAppointment,
      message: 'Appointment updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating appointment:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Cancel an appointment
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get session and verify authentication
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const appointmentId = params.id;

    // Get existing appointment
    const existingAppointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!existingAppointment) {
      return NextResponse.json(
        { success: false, message: 'Appointment not found' },
        { status: 404 }
      );
    }

    // Check if user has permission to cancel this appointment
    if (
      session.user.role === 'DOCTOR' && existingAppointment.doctorId !== session.user.id ||
      session.user.role === 'PATIENT' && existingAppointment.patientId !== session.user.id
    ) {
      return NextResponse.json(
        { success: false, message: 'You do not have permission to cancel this appointment' },
        { status: 403 }
      );
    }

    // Update appointment status to CANCELLED
    const cancelledAppointment = await prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: 'CANCELLED' },
    });

    // Try to delete Google Calendar event
    if (existingAppointment.googleEventId) {
      try {
        await deleteCalendarEvent(
          existingAppointment.doctorId,
          existingAppointment.googleEventId
        );
      } catch (calendarError) {
        console.error('Error deleting Google Calendar event:', calendarError);
        // Continue without Google Calendar deletion
      }
    }

    return NextResponse.json({
      success: true,
      data: cancelledAppointment,
      message: 'Appointment cancelled successfully',
    });
  } catch (error: any) {
    console.error('Error cancelling appointment:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
