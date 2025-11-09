import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/v2/enrollments/check?userId=...&organisationId=...
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get('userId') || undefined;
    const organisationId = url.searchParams.get('organisationId') || undefined;
    if (!userId || !organisationId) {
      return NextResponse.json({ error: 'Missing userId or organisationId' }, { status: 400 });
    }
    const ctx = await prisma.enrollmentContext.findFirst({
      where: { userId, organisationId },
      orderBy: { createdAt: 'desc' },
    });

    if (!ctx) {
      return NextResponse.json({
        hasEnrollment: false,
        needsEnrollment: true,
      });
    }

    return NextResponse.json({
      hasEnrollment: true,
      needsEnrollment: !(ctx.status === 'AUTHORISED' && ctx.deviceRegistered === true),
      enrollmentId: ctx.enrollmentId,
      organisationId: ctx.organisationId,
      authorisationServerId: ctx.authorisationServerId,
      status: ctx.status ?? null,
      deviceRegistered: ctx.deviceRegistered,
      fallbackUsed: ctx.fallbackUsed,
      createdAt: ctx.createdAt,
      updatedAt: ctx.updatedAt,
      expiresAt: ctx.expiresAt ?? null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

// POST /api/v2/enrollments/check
export async function POST(req: Request) {
  try {
    const body: any = await req.json().catch(() => ({}));
    const userId: string | undefined = body?.userId || undefined;
    const organisationId: string | undefined = body?.organisationId || undefined;
    if (!userId || !organisationId) {
      return NextResponse.json({ error: 'Missing userId or organisationId' }, { status: 400 });
    }

    const ctx = await prisma.enrollmentContext.findFirst({
      where: { userId, organisationId },
      orderBy: { createdAt: 'desc' },
    });

    if (!ctx) {
      return NextResponse.json({
        hasEnrollment: false,
        needsEnrollment: true,
      });
    }

    return NextResponse.json({
      hasEnrollment: true,
      needsEnrollment: !(ctx.status === 'AUTHORISED' && ctx.deviceRegistered === true),
      enrollmentId: ctx.enrollmentId,
      organisationId: ctx.organisationId,
      authorisationServerId: ctx.authorisationServerId,
      status: ctx.status ?? null,
      deviceRegistered: ctx.deviceRegistered,
      fallbackUsed: ctx.fallbackUsed,
      createdAt: ctx.createdAt,
      updatedAt: ctx.updatedAt,
      expiresAt: ctx.expiresAt ?? null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
