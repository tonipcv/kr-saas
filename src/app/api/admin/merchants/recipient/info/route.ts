import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { pagarmeGetRecipient } from '@/lib/payments/pagarme/sdk'

// GET /api/admin/merchants/recipient/info?recipientId=re_...
// SUPER_ADMIN-only: fetch recipient info from provider without persisting
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const role = (session as any)?.user?.role
    if (role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Access denied' }, { status: 403 })

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
    const msg: string = e?.message || 'Internal error'
    const statusFromErr = ((): number | null => {
      // Common shapes: e.status, e.response.status, e.res.status, e.code (number)
      const s = e?.status ?? e?.response?.status ?? e?.res?.status ?? e?.code
      return typeof s === 'number' && s >= 100 && s < 600 ? s : null
    })()
    if (statusFromErr) {
      return NextResponse.json({ error: msg }, { status: statusFromErr })
    }
    // Map known provider errors to HTTP status
    if (msg.includes('[Pagarme 404]')) {
      return NextResponse.json({ error: 'Recipient not found at provider', details: msg }, { status: 404 })
    }
    if (msg.includes('[Pagarme 401]') || msg.toLowerCase().includes('unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized at provider (check API key/env)', details: msg }, { status: 401 })
    }
    if (msg.includes('[Pagarme 400]') || msg.toLowerCase().includes('bad request')) {
      return NextResponse.json({ error: 'Bad request to provider', details: msg }, { status: 400 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
