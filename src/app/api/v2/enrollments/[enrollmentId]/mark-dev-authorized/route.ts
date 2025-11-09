import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(
  req: Request,
  { params }: { params: { enrollmentId: string } }
) {
  try {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Dev only' }, { status: 403 });
    }
    const enrollmentId = params?.enrollmentId;
    if (!enrollmentId) return NextResponse.json({ error: 'enrollmentId required' }, { status: 400 });

    const updated = await prisma.enrollmentContext.updateMany({
      where: { enrollmentId },
      data: {
        status: 'AUTHORISED' as any,
        deviceRegistered: true,
        updatedAt: new Date(),
      },
    });

    if (!updated || (typeof updated.count === 'number' && updated.count === 0)) {
      // Fallback insert minimal row
      try {
        await prisma.$executeRawUnsafe(
          `INSERT INTO enrollment_contexts (
             id, user_id, session_id, enrollment_id,
             organisation_id, authorisation_server_id, fallback_used,
             clinic_id, payer_email, payer_document, payer_name,
             status, device_registered
           ) VALUES (
             gen_random_uuid(), NULL, NULL, $1,
             NULL, NULL, TRUE,
             NULL, NULL, NULL, NULL,
             'AUTHORISED', TRUE
           )`,
          enrollmentId,
        );
      } catch {}
    }

    return NextResponse.json({ success: true, enrollmentId });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
