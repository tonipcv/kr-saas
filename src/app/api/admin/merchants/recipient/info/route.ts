import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { pagarmeGetRecipient } from '@/lib/payments/pagarme/sdk'

// GET /api/admin/merchants/recipient/info?recipientId=re_...
// SUPER_ADMIN-only: fetch recipient info from provider without persisting
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { role: true } })
    if (user?.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Access denied' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const recipientId = String(searchParams.get('recipientId') || '')
    if (!recipientId) return NextResponse.json({ error: 'recipientId is required' }, { status: 400 })

    const rid = recipientId.trim()
    if (!/^re_[A-Za-z0-9]+$/.test(rid)) {
      return NextResponse.json({ error: 'Invalid recipientId. Expect v5 ID starting with re_' }, { status: 400 })
    }

    const provider = await pagarmeGetRecipient(rid)
    return NextResponse.json({ ok: true, provider })
  } catch (e: any) {
    const msg = e?.message || 'Internal error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
