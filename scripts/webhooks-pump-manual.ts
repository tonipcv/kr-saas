/**
 * Manual: chama pump e retry-stuck usando APP_BASE_URL e WEBHOOKS_CRON_SECRET
 * Uso:
 *   APP_BASE_URL=https://seu-app.vercel.app \
 *   WEBHOOKS_CRON_SECRET=xxxxx \
 *   npx tsx scripts/webhooks-pump-manual.ts
 */

async function post(path: string) {
  const base = process.env.APP_BASE_URL
  const secret = process.env.WEBHOOKS_CRON_SECRET
  if (!base || !secret) {
    console.error('❌ Defina APP_BASE_URL e WEBHOOKS_CRON_SECRET nas variáveis de ambiente')
    process.exit(1)
  }
  const url = base.replace(/\/$/, '') + path
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'x-cron-secret': secret, 'Content-Type': 'application/json' },
  })
  const text = await res.text()
  console.log(`[${new Date().toISOString()}] POST ${path} -> ${res.status}\n${text}`)
}

async function main() {
  await post('/api/webhooks/pump')
  await post('/api/webhooks/retry-stuck')
}

main().catch((e) => {
  console.error('❌ Erro:', e)
  process.exit(1)
})
