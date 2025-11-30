/**
 * Dev helper: dispara a task do Trigger.dev (deliver-webhook) localmente
 *
 * Modos de uso:
 *  A) Com deliveryId existente:
 *     npx tsx scripts/dev-trigger-delivery.ts DELIVERY_ID
 *
 *  B) Criando um delivery de teste e já disparando:
 *     npx tsx scripts/dev-trigger-delivery.ts https://webhook.site/SEU_ID CLINIC_ID=<clinic_id>
 *
 * Requisitos:
 *  - .env local com TRIGGER_SECRET_KEY=tr_dev_... (dev) e DATABASE_URL configurado
 */

import { tasks } from '@trigger.dev/sdk/v3'
import type { deliverWebhook } from '../trigger/deliver-webhook'
import { prisma } from '../src/lib/prisma'

async function createTestDelivery(webhookUrl: string, clinicId?: string) {
  if (!webhookUrl.startsWith('https://')) {
    throw new Error('A URL deve ser HTTPS, ex: https://webhook.site/<id>')
  }

  // Selecionar clínica
  let resolvedClinicId = clinicId
  if (!resolvedClinicId) {
    const clinic = await prisma.clinic.findFirst()
    if (!clinic) throw new Error('Nenhuma clínica encontrada. Informe CLINIC_ID=<id>.')
    resolvedClinicId = clinic.id
  }

  // Endpoint (cria se não existir)
  let endpoint = await prisma.webhookEndpoint.findFirst({ where: { clinicId: resolvedClinicId, url: webhookUrl } })
  if (!endpoint) {
    endpoint = await prisma.webhookEndpoint.create({
      data: {
        clinicId: resolvedClinicId,
        name: 'Test Endpoint (Dev)'
        ,url: webhookUrl,
        secret: 'whsec_test_' + Math.random().toString(36).slice(2),
        enabled: true,
        events: ['payment.transaction.succeeded'],
        maxConcurrentDeliveries: 5,
      },
    })
  }

  // Evento
  const ev = await prisma.outboundWebhookEvent.create({
    data: {
      type: 'payment.transaction.succeeded',
      clinicId: resolvedClinicId,
      resource: 'payment_transaction',
      resourceId: 'tx_test_' + Date.now(),
      payload: { ok: true, source: 'dev-trigger' },
    },
  })

  // Delivery
  const delivery = await prisma.outboundWebhookDelivery.create({
    data: {
      endpointId: endpoint.id,
      eventId: ev.id,
      status: 'PENDING',
      nextAttemptAt: new Date(),
      attempts: 0,
    },
  })

  return { deliveryId: delivery.id }
}

async function main() {
  const arg1 = process.argv[2]
  const clinicArg = process.argv.find(a => a.startsWith('CLINIC_ID='))?.split('=')[1]

  if (!arg1) {
    console.error('Uso:')
    console.error('  npx tsx scripts/dev-trigger-delivery.ts DELIVERY_ID')
    console.error('  npx tsx scripts/dev-trigger-delivery.ts https://webhook.site/SEU_ID CLINIC_ID=<clinic_id>')
    process.exit(1)
  }

  let deliveryId = ''
  if (arg1.startsWith('http')) {
    const { deliveryId: newId } = await createTestDelivery(arg1, clinicArg)
    deliveryId = newId
    console.log(`🆕 Delivery criado: ${deliveryId}`)
  } else {
    deliveryId = arg1
  }

  console.log(`🚀 Disparando task deliver-webhook para deliveryId=${deliveryId}`)
  const handle = await tasks.trigger<typeof deliverWebhook>('deliver-webhook', { deliveryId })
  console.log('✅ Run disparada com sucesso. Acompanhe no Trigger.dev → Runs.')
  console.log('Handle:', handle)
}

main()
  .catch((e) => {
    console.error('❌ Erro no script:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
