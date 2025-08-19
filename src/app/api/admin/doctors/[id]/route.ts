import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is super admin
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { role: true }
    });

    if (user?.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { id: doctorId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!name || !email) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
    }

    // Ensure doctor exists
    const existing = await prisma.user.findUnique({ where: { id: doctorId }, select: { id: true, email: true } });
    if (!existing) {
      return NextResponse.json({ error: 'Doctor not found' }, { status: 404 });
    }

    // If changing email, ensure it's not used by another user
    if (email !== existing.email) {
      const emailInUse = await prisma.user.findUnique({ where: { email } });
      if (emailInUse) {
        return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
      }
    }

    const updated = await prisma.user.update({
      where: { id: doctorId },
      data: { name, email }
    });

    return NextResponse.json({ doctor: { id: updated.id, name: updated.name, email: updated.email } });
  } catch (error) {
    console.error('Error updating doctor:', error);
    return NextResponse.json({ error: 'Error updating doctor' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is super admin
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { role: true }
    });

    if (user?.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { id: doctorId } = await context.params;

    // Check if doctor exists (no heavy includes; field names in schema differ)
    const existingDoctor = await prisma.user.findUnique({
      where: { id: doctorId },
      select: { id: true }
    });

    if (!existingDoctor) {
      return NextResponse.json({ error: 'Doctor not found' }, { status: 404 });
    }

    // Delete doctor and all related data in a transaction
    await prisma.$transaction([
      // Delete clinics owned by the doctor (prevents clinics_ownerId_fkey error)
      prisma.clinic.deleteMany({
        where: { ownerId: doctorId }
      }),
      // Delete doctor's services
      prisma.doctorService.deleteMany({
        where: { doctor_id: doctorId }
      }),
      // Delete doctor's patients
      prisma.user.updateMany({
        where: { doctor_id: doctorId },
        data: { doctor_id: null }
      }),
      // Delete doctor's protocols
      prisma.protocol.deleteMany({
        where: { doctor_id: doctorId }
      }),
      // Delete doctor's courses
      prisma.course.deleteMany({
        where: { doctorId }
      }),
      // Delete doctor's products
      prisma.products.deleteMany({
        where: { doctorId }
      }),
      // Delete doctor's FAQs
      prisma.doctorFAQ.deleteMany({
        where: { doctorId }
      }),
      // Delete doctor's conversations
      prisma.patientAIConversation.deleteMany({
        where: { doctorId }
      }),
      // Delete doctor's consultation form
      prisma.consultationForm.deleteMany({
        where: { doctorId }
      }),
      // Delete doctor's form settings
      prisma.referralFormSettings.deleteMany({
        where: { doctorId }
      }),
      // Delete doctor's leads
      prisma.leads.deleteMany({
        where: { referrerId: doctorId }
      }),
      // Delete doctor's credits
      prisma.referralCredit.deleteMany({
        where: { userId: doctorId }
      }),
      // Delete doctor's rewards
      prisma.referralReward.deleteMany({
        where: { doctorId }
      }),
      // Delete doctor's referrals
      prisma.referrals.deleteMany({
        where: { doctorId }
      }),
      // Delete doctor's redemptions
      prisma.rewardRedemption.deleteMany({
        where: { userId: doctorId }
      }),
      // unified_subscriptions are tied to clinics; no direct user subscription model to delete here
      // Delete doctor's assigned courses
      prisma.userCourse.deleteMany({
        where: { userId: doctorId }
      }),
      // Delete doctor's lesson progress
      prisma.userLesson.deleteMany({
        where: { userId: doctorId }
      }),
      // Delete doctor's symptom reports
      prisma.symptomReport.deleteMany({
        where: { userId: doctorId }
      }),
      // Delete doctor's reviewed symptom reports
      prisma.symptomReport.deleteMany({
        where: { reviewedBy: doctorId }
      }),
      // Finally, delete the doctor
      prisma.user.delete({
        where: { id: doctorId }
      })
    ]);

    return NextResponse.json({ message: 'Doctor deleted successfully' });
  } catch (error) {
    const safeError = error instanceof Error ? { message: error.message, stack: error.stack } : { error };
    console.error('Error deleting doctor:', safeError);
    return NextResponse.json(
      { error: 'Error deleting doctor' },
      { status: 500 }
    );
  }
} 