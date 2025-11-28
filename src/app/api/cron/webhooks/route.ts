import { NextResponse } from 'next/server'
import { bootstrapOutboundWebhooksWorker } from '@/lib/webhooks/bootstrap'

export async function GET() {
  if (process.env.OUTBOUND_WEBHOOKS_ENABLED === 'true') {
    bootstrapOutboundWebhooksWorker()
    return NextResponse.json({ started: true })
  }
  return NextResponse.json({ started: false, reason: 'OUTBOUND_WEBHOOKS_ENABLED is not true' }, { status: 400 })
}
