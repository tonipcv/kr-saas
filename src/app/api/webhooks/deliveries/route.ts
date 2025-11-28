import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkClinicAccess } from '@/lib/auth/check-clinic-access'

// GET /api/webhooks/deliveries?clinicId=...&endpointId=...&eventId=...&status=...&limit=50&cursor=...
export async function GET(req: Request) {
  const url = new URL(req.url)
  const clinicId = url.searchParams.get('clinicId') || ''
  const endpointId = url.searchParams.get('endpointId') || undefined
  const eventId = url.searchParams.get('eventId') || undefined
  const status = url.searchParams.get('status') || undefined
  const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get('limit') || '50', 10)))
  const cursor = url.searchParams.get('cursor') || undefined

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clinicId || !(await checkClinicAccess(session.user.id, clinicId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const where: any = {
    ...(endpointId ? { endpointId } : {}),
    ...(eventId ? { eventId } : {}),
    ...(status ? { status } : {}),
    // join condition via event to guarantee clinic scope
    event: { clinicId },
  }

  const rows = await prisma.outboundWebhookDelivery.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    include: { event: { select: { id: true, type: true, createdAt: true } } },
  })

  const hasMore = rows.length > limit
  const items = rows.slice(0, limit)
  const nextCursor = hasMore ? items[items.length - 1]?.id : undefined

  return NextResponse.json({
    deliveries: items.map((d) => ({
      id: d.id,
      endpointId: d.endpointId,
      eventId: d.eventId,
      status: d.status,
      attempts: d.attempts,
      lastCode: d.lastCode,
      lastError: d.lastError,
      deliveredAt: d.deliveredAt,
      createdAt: d.createdAt,
      event: { type: d.event.type, createdAt: d.event.createdAt },
    })),
    nextCursor,
  })
}
