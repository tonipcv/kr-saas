import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateSecret } from '@/lib/webhooks/signature'
import { checkClinicAccess } from '@/lib/auth/check-clinic-access'

// POST /api/webhooks/endpoints/[id]/rotate-secret
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const endpoint = await prisma.webhookEndpoint.findUnique({ where: { id: params.id } })
  if (!endpoint) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!(await checkClinicAccess(session.user.id, endpoint.clinicId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const secret = generateSecret()
  await prisma.webhookEndpoint.update({ where: { id: params.id }, data: { secret } })
  return NextResponse.json({ secret, rotatedAt: new Date().toISOString() })
}
