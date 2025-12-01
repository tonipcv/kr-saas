/**
 * E2E: cria (se necessário) clínica, endpoint (htps.io), evento e delivery PENDING
 * Uso:
 *   npx tsx scripts/webhooks-e2e-create.ts https://htps.io/api/webhook/SEU_ID [CLINIC_ID=uuid]
 * Saída: clinicId, endpointId, eventId, deliveryId
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

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

  console.log('🔧 Preparando dados E2E...')

  // 1) Clínica
  let clinicId = clinicArg || null
  if (!clinicId) {
    // Reutiliza uma existente ou cria uma nova dummy
    const existing = await prisma.clinic.findFirst()
    if (existing) {
      clinicId = existing.id
      console.log(`🏥 Clínica existente usada: ${existing.name} (${existing.id})`)
    } else {
      const created = await prisma.clinic.create({
        data: { name: 'Clinica E2E (auto)', slug: 'clinica-e2e-auto' }
      })
      clinicId = created.id
      console.log(`🏥 Clínica criada: ${created.name} (${created.id})`)
    }
  } else {
    const exists = await prisma.clinic.findUnique({ where: { id: clinicId } })
    if (!exists) {
      console.error(`❌ CLINIC_ID não encontrado: ${clinicId}`)
      process.exit(1)
    }
    console.log(`🏥 Clínica informada: ${exists.name} (${exists.id})`)
  }

  // 2) Endpoint (idempotente por URL dentro da clínica)
  let endpoint = await prisma.webhookEndpoint.findFirst({ where: { clinicId, url: urlArg } })
  if (!endpoint) {
    endpoint = await prisma.webhookEndpoint.create({
      data: {
        clinicId: clinicId!,
        name: 'Endpoint E2E (htps.io)',
        url: urlArg,
        secret: 'whsec_e2e_' + Math.random().toString(36).slice(2),
        enabled: true,
        events: ['payment.transaction.created'],
        maxConcurrentDeliveries: 5,
      },
    })
    console.log(`🔗 Endpoint criado: ${endpoint.id}`)
  } else {
    console.log(`🔗 Endpoint existente: ${endpoint.id}`)
  }

  // 3) Evento
  const ev = await prisma.outboundWebhookEvent.create({
    data: {
      type: 'payment.transaction.created',
      clinicId: clinicId!,
      resource: 'payment_transaction',
      resourceId: 'tx_e2e_' + Date.now(),
      payload: { test: true, source: 'webhooks-e2e-create' },
    },
  })
  console.log(`📝 Evento criado: ${ev.id}`)

  // 4) Delivery PENDING
  const delivery = await prisma.outboundWebhookDelivery.create({
    data: {
      endpointId: endpoint.id,
      eventId: ev.id,
      status: 'PENDING',
      nextAttemptAt: new Date(),
      attempts: 0,
    },
  })

  console.log('\n✅ E2E pronto! Use os IDs abaixo:')
  console.log(`clinicId:   ${clinicId}`)
  console.log(`endpointId: ${endpoint.id}`)
  console.log(`eventId:    ${ev.id}`)
  console.log(`deliveryId: ${delivery.id}`)

  console.log('\n▶️ Entregar agora (rota nativa):')
  console.log(`curl -X POST "$APP_BASE_URL/api/webhooks/deliver" -H "Content-Type: application/json" -d '{"deliveryId":"${delivery.id}"}'`)
}

main()
  .catch((e) => {
    console.error('❌ Erro:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
