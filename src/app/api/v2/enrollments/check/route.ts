import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/v2/enrollments/check?userId=...&organisationId=...
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get('userId') || undefined;
    let organisationId = url.searchParams.get('organisationId') || undefined;
    if (process.env.LINAOB_FORCE_ENV_IDS === 'true' && process.env.LINAOB_ORGANISATION_ID) {
      organisationId = process.env.LINAOB_ORGANISATION_ID;
      try { console.log('🔍 [enrollments.check][GET] Forçando organisationId:', organisationId); } catch {}
    }
    if (!userId || !organisationId) {
      return NextResponse.json({ error: 'Missing userId or organisationId' }, { status: 400 });
    }
    const ctx = await prisma.enrollmentContext.findFirst({
      where: { userId, organisationId },
      orderBy: { updatedAt: 'desc' },
    });

    // Extra introspection on openFinanceLink (best-effort)
    let linkGet: any = null;
    try {
      linkGet = await prisma.openFinanceLink.findFirst({
        where: { userId, organisationId },
        orderBy: { updatedAt: 'desc' },
      });
      console.log('🔍 [enrollments.check][GET] Link encontrado:', {
        found: !!linkGet,
        linkId: linkGet?.id,
        status: linkGet?.status,
        deviceRegistered: linkGet?.deviceRegistered,
        enrollmentId: linkGet?.enrollmentId,
        createdAt: linkGet?.createdAt,
      });
    } catch (e) {
      console.warn('[enrollments.check][GET] link introspection failed', String((e as any)?.message || e));
    }

    // proceed even if ctx is missing, as long as link exists

    // Derive from ctx or link (prefer ctx when fully authorised)
    const effectiveStatus = (ctx?.status === 'AUTHORISED')
      ? 'AUTHORISED'
      : ((linkGet?.status as string | null) ?? (ctx?.status as string | null) ?? null);
    const effectiveDeviceRegistered = (ctx?.deviceRegistered === true)
      ? true
      : (typeof linkGet?.deviceRegistered === 'boolean' ? linkGet.deviceRegistered : (typeof ctx?.deviceRegistered === 'boolean' ? ctx.deviceRegistered : false));
    const needs = !(String(effectiveStatus || '').toUpperCase() === 'AUTHORISED' && effectiveDeviceRegistered === true);
    const responseData = {
      hasEnrollment: !!(ctx || linkGet),
      needsEnrollment: needs,
      enrollmentId: linkGet?.enrollmentId || ctx?.enrollmentId || null,
      organisationId: linkGet?.organisationId || ctx?.organisationId || organisationId,
      authorisationServerId: linkGet?.authorisationServerId || ctx?.authorisationServerId || null,
      status: effectiveStatus,
      deviceRegistered: effectiveDeviceRegistered,
      fallbackUsed: (ctx?.fallbackUsed as any) ?? false,
      createdAt: linkGet?.createdAt || ctx?.createdAt || null,
      updatedAt: linkGet?.updatedAt || ctx?.updatedAt || null,
      expiresAt: (linkGet as any)?.expiresAt ?? ctx?.expiresAt ?? null,
    } as const;
    try { console.log('🔍 [enrollments.check][GET] Response:', responseData, { source: { ctx: !!ctx, link: !!linkGet } }); } catch {}
    return NextResponse.json(responseData);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

// POST /api/v2/enrollments/check
export async function POST(req: Request) {
  try {
    const body: any = await req.json().catch(() => ({}));
    const userId: string | undefined = body?.userId || undefined;
    let organisationId: string | undefined = body?.organisationId || undefined;
    if (process.env.LINAOB_FORCE_ENV_IDS === 'true' && process.env.LINAOB_ORGANISATION_ID) {
      organisationId = process.env.LINAOB_ORGANISATION_ID;
      try { console.log('🔍 [enrollments.check][POST] Forçando organisationId:', organisationId); } catch {}
    }
    if (!userId || !organisationId) {
      return NextResponse.json({ error: 'Missing userId or organisationId' }, { status: 400 });
    }

    const ctx = await prisma.enrollmentContext.findFirst({
      where: { userId, organisationId },
      orderBy: { updatedAt: 'desc' },
    });

    // Extra introspection on openFinanceLink (best-effort)
    let linkPost: any = null;
    try {
      linkPost = await prisma.openFinanceLink.findFirst({
        where: { userId, organisationId },
        orderBy: { updatedAt: 'desc' },
      });
      console.log('🔍 [enrollments.check][POST] Link encontrado:', {
        found: !!linkPost,
        linkId: linkPost?.id,
        status: linkPost?.status,
        deviceRegistered: linkPost?.deviceRegistered,
        enrollmentId: linkPost?.enrollmentId,
        createdAt: linkPost?.createdAt,
      });
    } catch (e) {
      console.warn('[enrollments.check][POST] link introspection failed', String((e as any)?.message || e));
    }

    // proceed even if ctx is missing, as long as link exists
    const effectiveStatus2 = (ctx?.status === 'AUTHORISED')
      ? 'AUTHORISED'
      : ((linkPost?.status as string | null) ?? (ctx?.status as string | null) ?? null);
    const effectiveDeviceRegistered2 = (ctx?.deviceRegistered === true)
      ? true
      : (typeof linkPost?.deviceRegistered === 'boolean' ? linkPost.deviceRegistered : (typeof ctx?.deviceRegistered === 'boolean' ? ctx.deviceRegistered : false));
    const needs2 = !(String(effectiveStatus2 || '').toUpperCase() === 'AUTHORISED' && effectiveDeviceRegistered2 === true);
    const responseData = {
      hasEnrollment: !!(ctx || linkPost),
      needsEnrollment: needs2,
      enrollmentId: linkPost?.enrollmentId || ctx?.enrollmentId || null,
      organisationId: linkPost?.organisationId || ctx?.organisationId || organisationId,
      authorisationServerId: linkPost?.authorisationServerId || ctx?.authorisationServerId || null,
      status: effectiveStatus2,
      deviceRegistered: effectiveDeviceRegistered2,
      fallbackUsed: (ctx?.fallbackUsed as any) ?? false,
      createdAt: linkPost?.createdAt || ctx?.createdAt || null,
      updatedAt: linkPost?.updatedAt || ctx?.updatedAt || null,
      expiresAt: (linkPost as any)?.expiresAt ?? ctx?.expiresAt ?? null,
    } as const;
    try { console.log('🔍 [enrollments.check][POST] Response:', responseData, { source: { ctx: !!ctx, link: !!linkPost } }); } catch {}
    return NextResponse.json(responseData);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
