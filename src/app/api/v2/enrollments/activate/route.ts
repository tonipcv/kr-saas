import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const { enrollmentId } = await req.json();

    if (!enrollmentId) {
      return NextResponse.json(
        { error: 'enrollmentId é obrigatório' },
        { status: 400 }
      );
    }

    // BEFORE logs (best-effort)
    try {
      const beforeCtx = await prisma.enrollmentContext.findFirst({ where: { enrollmentId: String(enrollmentId) }, orderBy: { createdAt: 'desc' } });
      const beforeLink = await prisma.openFinanceLink.findFirst({ where: { enrollmentId: String(enrollmentId) }, orderBy: { createdAt: 'desc' } });
      console.log('🔍 [enrollments.activate] ANTES:', {
        ctxFound: !!beforeCtx,
        ctxStatus: beforeCtx?.status,
        ctxDeviceRegistered: (beforeCtx as any)?.deviceRegistered,
        linkFound: !!beforeLink,
        linkStatus: beforeLink?.status,
      });
    } catch {}

    const result = await prisma.openFinanceLink.updateMany({
      where: {
        enrollmentId: String(enrollmentId),
        status: 'PENDING',
      },
      data: {
        status: 'ACTIVE',
        updatedAt: new Date(),
      },
    });

    // Mirror to enrollment_contexts to help /check see ACTIVE/AUTHORISED
    try {
      const updCtx = await prisma.$executeRawUnsafe(
        `UPDATE enrollment_contexts
           SET status = 'AUTHORISED',
               device_registered = TRUE,
               updated_at = now()
         WHERE enrollment_id = $1`,
        String(enrollmentId)
      );
      // If no rows updated, insert a minimal row to reflect activation
      if (!updCtx || Number(updCtx) === 0) {
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
            String(enrollmentId)
          );
          console.log('[enrollments.activate][db.insert] inserted fallback ctx row');
        } catch (e: any) {
          console.warn('[enrollments.activate][db.insert][skip]', { error: String(e?.message || e) });
        }
      }
      const afterCtx = await prisma.enrollmentContext.findFirst({ where: { enrollmentId: String(enrollmentId) }, orderBy: { createdAt: 'desc' } });
      const afterLink = await prisma.openFinanceLink.findFirst({ where: { enrollmentId: String(enrollmentId) }, orderBy: { createdAt: 'desc' } });
      console.log('[enrollments.activate]', {
        enrollmentId,
        updated: result.count,
        ctxUpdated: Number(updCtx) || 0,
        DEPOIS: {
          ctxStatus: afterCtx?.status,
          ctxDeviceRegistered: (afterCtx as any)?.deviceRegistered,
          linkStatus: afterLink?.status,
        }
      });
    } catch (e) {
      console.warn('[enrollments.activate] ctx mirror failed', String((e as any)?.message || e));
      console.log('[enrollments.activate]', { enrollmentId, updated: result.count });
    }

    return NextResponse.json({
      ok: true,
      enrollmentId,
      updated: result.count > 0,
    });
  } catch (e: any) {
    console.error('[enrollments.activate] Error:', e);
    return NextResponse.json(
      { error: e?.message || 'Erro ao ativar enrollment' },
      { status: 500 }
    );
  }
}
