import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkClinicAccess } from '@/lib/auth/check-clinic-access'

// POST /api/webhooks/deliveries/[id]/retry
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const delivery = await prisma.outboundWebhookDelivery.findUnique({
    where: { id: params.id },
    include: { event: true },
  })
  if (!delivery) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const clinicId = delivery.event.clinicId
  if (!clinicId || !(await checkClinicAccess(session.user.id, clinicId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Reset for retry
  await prisma.outboundWebhookDelivery.update({
    where: { id: params.id },
    data: {
      status: 'PENDING',
      attempts: 0,
      lastCode: null,
      lastError: null,
      nextAttemptAt: new Date(),
    },
  })

  return NextResponse.json({ ok: true })
}
