/**
 * Cria um delivery PENDING para testar a task "deliver-webhook" no Trigger.dev
 *
 * Uso:
 *   npx tsx scripts/create-test-delivery.ts https://webhook.site/SEU_ID [CLINIC_ID=clinic_xxx]
 *
 * Saída:
 *   - IDs criados e, principalmente, o deliveryId para usar no Dashboard → Tasks → deliver-webhook → Test
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const urlArg = process.argv[2]
  const clinicArg = process.argv.find(a => a.startsWith('CLINIC_ID='))?.split('=')[1]

  if (!urlArg) {
    console.error('❌ Informe a URL do webhook (ex: https://webhook.site/xxxx)')
    console.error('Uso: npx tsx scripts/create-test-delivery.ts https://webhook.site/SEU_ID [CLINIC_ID=clinic_xxx]')
    process.exit(1)
  }
  if (!urlArg.startsWith('https://')) {
    console.error('❌ A URL precisa ser HTTPS')
    process.exit(1)
  }

  console.log('🔧 Criando registros de teste...')

  // 1) Seleciona clínica
  let clinicId = clinicArg || null
  if (!clinicId) {
    const clinic = await prisma.clinic.findFirst()
    if (!clinic) {
      console.error('❌ Nenhuma clínica encontrada. Informe CLINIC_ID=... como argumento.')
      process.exit(1)
    }
    clinicId = clinic.id
    console.log(`🏥 Clínica usada: ${clinic.name} (${clinic.id})`)
  } else {
    const exists = await prisma.clinic.findUnique({ where: { id: clinicId } })
    if (!exists) {
      console.error(`❌ CLINIC_ID não encontrado: ${clinicId}`)
      process.exit(1)
    }
    console.log(`🏥 Clínica informada: ${exists.name} (${exists.id})`)
  }

  // 2) Endpoint (cria se não existir)
  let endpoint = await prisma.webhookEndpoint.findFirst({
    where: { clinicId, url: urlArg },
  })
  if (!endpoint) {
    endpoint = await prisma.webhookEndpoint.create({
      data: {
        clinicId: clinicId!,
        name: 'Test Endpoint (Trigger.dev)',
        url: urlArg,
        secret: 'whsec_test_' + Math.random().toString(36).slice(2),
        enabled: true,
        events: ['payment.transaction.succeeded'],
        maxConcurrentDeliveries: 5,
      },
    })
    console.log(`🔗 Endpoint criado: ${endpoint.id}`)
  } else {
    console.log(`🔗 Endpoint existente: ${endpoint.id}`)
  }

  // 3) Evento de teste
  const ev = await prisma.outboundWebhookEvent.create({
    data: {
      type: 'payment.transaction.succeeded',
      clinicId: clinicId!,
      resource: 'payment_transaction',
      resourceId: 'tx_test_' + Date.now(),
      payload: {
        transaction: {
          id: 'tx_test_' + Date.now(),
          amount: 12345,
          status: 'SUCCEEDED',
          createdAt: new Date().toISOString(),
        },
      },
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

  console.log('\n✅ Delivery criada com sucesso!')
  console.log(`   deliveryId: ${delivery.id}`)
  console.log(`   endpointId: ${endpoint.id}`)
  console.log(`   eventId: ${ev.id}`)

  console.log('\n▶️ Use este ID no Trigger.dev → Tasks → deliver-webhook → Test:')
  console.log(`   { "deliveryId": "${delivery.id}" }\n`)
}

main()
  .catch((e) => {
    console.error('❌ Erro ao criar delivery de teste:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
