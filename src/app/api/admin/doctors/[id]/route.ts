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

    // Find clinics owned by this doctor to clean dependent records first
    const ownedClinics = await prisma.clinic.findMany({
      where: { ownerId: doctorId },
      select: { id: true }
    });
    const clinicIds = ownedClinics.map(c => c.id);

    // Find clinic subscriptions for those clinics
    const clinicSubs = clinicIds.length
      ? await prisma.clinicSubscription.findMany({
          where: { clinicId: { in: clinicIds } },
          select: { id: true }
        })
      : [];
    const clinicSubIds = clinicSubs.map(s => s.id);

    // Delete doctor and all related data in a transaction
    await prisma.$transaction([
      // If there are subscriptions, delete add-on subscriptions first
      ...(clinicSubIds.length
        ? [
            prisma.clinicAddOnSubscription.deleteMany({
              where: { subscriptionId: { in: clinicSubIds } }
            })
          ]
        : []),
      // Then delete the clinic subscriptions
      ...(clinicIds.length
        ? [
            prisma.clinicSubscription.deleteMany({
              where: { clinicId: { in: clinicIds } }
            })
          ]
        : []),
      // Delete clinics owned by the doctor (prevents clinics_ownerId_fkey error)
      prisma.clinic.deleteMany({
        where: clinicIds.length ? { id: { in: clinicIds } } : { ownerId: doctorId }
      }),
      // Remove clinic memberships for this user
      prisma.clinicMember.deleteMany({
        where: { userId: doctorId }
      }),
      // Detach patients from this doctor
      prisma.user.updateMany({
        where: { doctor_id: doctorId },
        data: { doctor_id: null }
      }),
      // Delete doctor's products
      prisma.product.deleteMany({
        where: { doctorId }
      }),
      // Delete doctor's product categories
      prisma.productCategory.deleteMany({
        where: { doctorId }
      }),
      // Legacy referral/loyalty models are not present in current schema; deletions removed
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