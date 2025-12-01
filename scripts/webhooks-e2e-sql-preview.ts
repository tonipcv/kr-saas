/**
 * Gera (sem executar) os SQLs para criar clínica, endpoint, evento e delivery PENDING.
 * Uso:
 *   npx tsx scripts/webhooks-e2e-sql-preview.ts https://htps.io/api/webhook/SEU_ID [CLINIC_ID=<uuid>]
 * Saída: SQLs prontos para colar no Postgres (psql/DBeaver/Prisma Studio)
 */

import crypto from 'crypto'

function uuid() {
  // Gera um UUID v4 simples (Node 18+ tem crypto.randomUUID, mas mantemos compat)
  // @ts-ignore
  return (crypto.randomUUID ? crypto.randomUUID() : ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, (c: string)=>
    (Number(c) ^ (crypto.randomBytes(1)[0] & (15 >> (Number(c) / 4)))).toString(16)
  )) as string
}

function nowSql() {
  return 'NOW()'
}

async function main() {
  const urlArg = process.argv[2]
  const clinicArg = process.argv.find(a => a.startsWith('CLINIC_ID='))?.split('=')[1]

  if (!urlArg) {
    console.error('❌ Informe a URL HTTPS do htps.io. Ex: https://htps.io/api/webhook/SEU_ID')
    process.exit(1)
  }
  if (!/^https:\/\//i.test(urlArg)) {
    console.error('❌ A URL precisa ser HTTPS')
    process.exit(1)
  }

  const clinicId = clinicArg || uuid()
  const endpointId = uuid()
  const eventId = uuid()
  const deliveryId = uuid()
  const txId = 'tx_sql_' + Date.now()

  console.log('')
  console.log('📋 Passo 1: (opcional) Criar clínica -- pule se já tiver uma')
  console.log('---')
  console.log(`-- Reutilize uma clínica existente OU crie uma nova:`)
  console.log(`INSERT INTO clinics (id, name, created_at)`) 
  console.log(`VALUES ('${clinicId}', 'Clinica E2E (sql)', ${nowSql()})`) 
  console.log(`ON CONFLICT (id) DO NOTHING;`)
  console.log('')

  console.log('🏁 Passo 2: Criar endpoint (htps.io)')
  console.log('---')
  console.log(`INSERT INTO webhook_endpoints (`)
  console.log(`  id, clinic_id, name, url, secret, enabled, events, max_concurrent_deliveries, created_at, updated_at`) 
  console.log(`) VALUES (`)
  console.log(`  '${endpointId}',`) 
  console.log(`  '${clinicId}',`) 
  console.log(`  'Endpoint E2E (htps.io)',`) 
  console.log(`  '${urlArg}',`) 
  console.log(`  'whsec_sql_${Math.random().toString(36).slice(2)}',`) 
  console.log(`  true,`) 
  console.log(`  ARRAY['payment.transaction.created'],`) 
  console.log(`  5,`) 
  console.log(`  ${nowSql()}, ${nowSql()}`) 
  console.log(`);`)
  console.log('')

  console.log('📝 Passo 3: Criar evento outbound')
  console.log('---')
  console.log(`INSERT INTO outbound_webhook_events (`)
  console.log(`  id, clinic_id, type, resource, resource_id, payload, created_at`) 
  console.log(`) VALUES (`)
  console.log(`  '${eventId}',`) 
  console.log(`  '${clinicId}',`) 
  console.log(`  'payment.transaction.created',`) 
  console.log(`  'payment_transaction',`) 
  console.log(`  '${txId}',`) 
  console.log(`  '{"test": true, "source": "webhooks-e2e-sql"}'::jsonb,`) 
  console.log(`  ${nowSql()}`) 
  console.log(`);`)
  console.log('')

  console.log('📦 Passo 4: Criar delivery PENDING')
  console.log('---')
  console.log(`INSERT INTO outbound_webhook_deliveries (`)
  console.log(`  id, endpoint_id, event_id, status, attempts, last_code, last_error, next_attempt_at, created_at, updated_at`) 
  console.log(`) VALUES (`)
  console.log(`  '${deliveryId}',`) 
  console.log(`  '${endpointId}',`) 
  console.log(`  '${eventId}',`) 
  console.log(`  'PENDING',`) 
  console.log(`  0,`) 
  console.log(`  NULL,`) 
  console.log(`  NULL,`) 
  console.log(`  ${nowSql()},`) 
  console.log(`  ${nowSql()}, ${nowSql()}`) 
  console.log(`);`)
  console.log('')

  console.log('➡️  Processar agora (opções)')
  console.log('---')
  console.log(`# 1) Entregar uma única delivery`) 
  console.log(`curl -X POST "$APP_BASE_URL/api/webhooks/deliver" -H "Content-Type: application/json" -d '{"deliveryId":"${deliveryId}"}'`)
  console.log('')
  console.log(`# 2) Rodar o pump (cron manual)`) 
  console.log(`curl -X POST "$APP_BASE_URL/api/webhooks/pump" -H "x-cron-secret: $WEBHOOKS_CRON_SECRET"`)
  console.log('')
  console.log(`# 3) Rodar o retry-stuck`) 
  console.log(`curl -X POST "$APP_BASE_URL/api/webhooks/retry-stuck" -H "x-cron-secret: $WEBHOOKS_CRON_SECRET"`)
  console.log('')

  console.log('ℹ️  Observações:')
  console.log('- Use apenas HTTPS no endpoint do htps.io; endpoints http serão marcados como FAILED.')
  console.log('- Ajuste o CLINIC_ID se quiser usar uma clínica real; caso contrário, o insert acima cria uma clínica de teste.')
  console.log('- Para reexecutar, gere novos IDs ou use ON CONFLICT em inserts onde fizer sentido.')
}

main().catch((e) => {
  console.error('❌ Erro:', e)
  process.exit(1)
})
