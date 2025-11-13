import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import Stripe from 'stripe'

// New Stripe webhook endpoint (idempotent), isolated from legacy clinic webhook at /api/stripe/webhook
// Uses webhook_events table with provider_event_id + processed flags

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 200 })

  const signature = req.headers.get('stripe-signature') || ''
  const body = await req.text()

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2023-10-16' })

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret)
  } catch (e: any) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // Persist (idempotent)
  try {
    await prisma.webhookEvent.create({
      data: {
        provider: 'STRIPE',
        hook_id: event.id,
        provider_event_id: event.id,
        type: event.type,
        raw: event as any,
        processed: false,
        retry_count: 0,
        max_retries: 3,
        is_retryable: true,
      },
    })
  } catch (err: any) {
    // Unique violation on (provider, provider_event_id) -> already received
    return NextResponse.json({ received: true })
  }

  // Minimal processing (non-invasive): just mark processed true
  try {
    await prisma.webhookEvent.update({
      where: { provider_provider_event_id: { provider: 'STRIPE', provider_event_id: event.id } },
      data: { processed: true, processed_at: new Date(), processing_error: null },
    })
  } catch (e) {
    // mark retry schedule
    await prisma.webhookEvent.update({
      where: { provider_provider_event_id: { provider: 'STRIPE', provider_event_id: event.id } },
      data: {
        retry_count: { increment: 1 },
        next_retry_at: new Date(Date.now() + 5 * 60 * 1000),
        processing_error: (e as any)?.message || 'process_error',
        error_type: 'UNKNOWN',
      },
    }).catch(() => {})
  }

  return NextResponse.json({ received: true })
}
