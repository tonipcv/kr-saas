import { runWebhookWorker } from '../lib/queue/pgboss'

async function main() {
  await runWebhookWorker({ batchSize: 10, backoffMs: 5 * 60 * 1000, sleepMs: 1000 })
}

main().catch(() => process.exit(1))
