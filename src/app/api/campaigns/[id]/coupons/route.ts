import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function ok(data: any) { return NextResponse.json({ success: true, data }); }
function notFound(message = 'Campanha não encontrada') { return NextResponse.json({ success: false, message }, { status: 404 }); }
function unauthorized(message = 'Não autorizado') { return NextResponse.json({ success: false, message }, { status: 401 }); }
function forbidden(message = 'Acesso negado') { return NextResponse.json({ success: false, message }, { status: 403 }); }
function serverError(message = 'Erro interno do servidor') { return NextResponse.json({ success: false, message }, { status: 500 }); }

// DELETE /api/campaigns/[id]/coupons
// Purge campaign-related coupons:
// - Remove "coupon" key from referral_leads.customFields for leads of this campaign/doctor
// - Delete coupons rows where objective = campaign_slug for this doctor (if any were created elsewhere)
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return unauthorized();

    const doctorId = session.user.id;
    const me = await prisma.user.findUnique({ where: { id: doctorId }, select: { role: true } });
    if (!me || me.role !== 'DOCTOR') return forbidden('Apenas médicos podem excluir cupons.');

    const awaited = (typeof (ctx as any)?.params?.then === 'function') ? await (ctx as any).params : (ctx as any).params;
    const campaignId = awaited?.id;
    if (!campaignId) return notFound();

    // Ensure campaign belongs to doctor and get slug
    const row: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, doctor_id, campaign_slug FROM campaigns WHERE id = $1 LIMIT 1`,
      campaignId
    );
    const campaign = row?.[0];
    if (!campaign || campaign.doctor_id !== doctorId) return notFound();

    const slug: string = campaign.campaign_slug;

    // 1) Remove embedded coupon from referral leads for this campaign
    // Only where customFields contains coupon and campaignId/slug match
    const clearedLeadsCount: number = await prisma.$executeRawUnsafe(
      `UPDATE referral_leads
       SET "customFields" = ("customFields" - 'coupon')
       WHERE "doctorId" = $1
         AND ( ("customFields"->>'campaignId') = $2 OR ("customFields"->>'campaignSlug') = $3 )
         AND ("customFields" ? 'coupon')`,
      doctorId,
      campaignId,
      slug
    );

    // 2) Also delete coupons table rows (if any) tied by objective = campaign_slug
    const deletedCouponsCount: number = await prisma.coupon.deleteMany({
      where: { doctorId, objective: slug },
    }).then(r => r.count);

    return ok({ cleared_leads: clearedLeadsCount, deleted_coupons: deletedCouponsCount });
  } catch (err: any) {
    try {
      console.error('DELETE /api/campaigns/[id]/coupons error', err instanceof Error ? err.message : String(err));
    } catch {}
    const message = err && typeof err.message === 'string' ? err.message : 'Erro interno do servidor';
    return serverError(message);
  }
}
