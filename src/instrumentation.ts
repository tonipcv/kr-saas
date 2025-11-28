// Next.js instrumentation hook - runs once on server startup
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Bootstrap outbound webhooks worker
    const { bootstrapOutboundWebhooksWorker } = await import('@/lib/webhooks/bootstrap')
    bootstrapOutboundWebhooksWorker()
  }
}
