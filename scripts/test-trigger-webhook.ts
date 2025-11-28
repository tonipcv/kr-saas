/**
 * Script para testar Trigger.dev localmente
 * 
 * Cria uma delivery de teste e dispara o job do Trigger.dev
 * 
 * Uso:
 *   npx tsx scripts/test-trigger-webhook.ts
 */

import { prisma } from '../src/lib/prisma'
import { tasks } from '@trigger.dev/sdk'
import type { deliverWebhook } from '../trigger/deliver-webhook'

async function main() {
  console.log('🧪 Testando Trigger.dev - Webhook Delivery\n')

  // 1. Criar endpoint de teste (webhook.site)
  console.log('📝 Passo 1: Criar endpoint de teste')
  console.log('   Acesse: https://webhook.site')
  console.log('   Copie a URL única (ex: https://webhook.site/abc123)\n')

  const webhookSiteUrl = process.argv[2]
  
  if (!webhookSiteUrl) {
    console.error('❌ Erro: Você precisa passar a URL do webhook.site')
    console.error('\nUso:')
    console.error('  npx tsx scripts/test-trigger-webhook.ts https://webhook.site/SEU_ID\n')
    process.exit(1)
  }

  if (!webhookSiteUrl.startsWith('https://')) {
    console.error('❌ Erro: URL deve ser HTTPS')
    process.exit(1)
  }

  console.log(`✅ URL do webhook.site: ${webhookSiteUrl}\n`)

  // 2. Buscar ou criar clínica de teste
  console.log('📝 Passo 2: Buscar clínica de teste')
  
  let clinic = await prisma.clinic.findFirst({
    where: { name: { contains: 'Test' } }
  })

  if (!clinic) {
    console.log('   Nenhuma clínica de teste encontrada')
    console.log('   Use uma clínica existente ou crie uma manualmente\n')
    process.exit(1)
  }

  console.log(`✅ Clínica: ${clinic.name} (${clinic.id})\n`)

  // 3. Criar ou buscar endpoint webhook
  console.log('📝 Passo 3: Criar endpoint webhook')
  
  let endpoint = await prisma.webhookEndpoint.findFirst({
    where: {
      clinicId: clinic.id,
      url: webhookSiteUrl,
    }
  })

  if (!endpoint) {
    endpoint = await prisma.webhookEndpoint.create({
      data: {
        clinicId: clinic.id,
        name: 'Test Endpoint (Trigger.dev)',
        url: webhookSiteUrl,
        secret: 'whsec_test_' + Math.random().toString(36).substring(7),
        enabled: true,
        events: ['payment.transaction.succeeded'],
        maxConcurrentDeliveries: 5,
      }
    })
    console.log(`✅ Endpoint criado: ${endpoint.id}`)
  } else {
    console.log(`✅ Endpoint existente: ${endpoint.id}`)
  }
  
  console.log(`   URL: ${endpoint.url}`)
  console.log(`   Secret: ${endpoint.secret}\n`)

  // 4. Criar evento de teste
  console.log('📝 Passo 4: Criar evento de teste')
  
  const event = await prisma.outboundWebhookEvent.create({
    data: {
      type: 'payment.transaction.succeeded',
      clinicId: clinic.id,
      resource: 'payment_transaction',
      resourceId: 'tx_test_' + Date.now(),
      payload: {
        transaction: {
          id: 'tx_test_' + Date.now(),
          amount: 10000,
          status: 'SUCCEEDED',
          createdAt: new Date().toISOString(),
        }
      }
    }
  })

  console.log(`✅ Evento criado: ${event.id}`)
  console.log(`   Tipo: ${event.type}\n`)

  // 5. Criar delivery
  console.log('📝 Passo 5: Criar delivery')
  
  const delivery = await prisma.outboundWebhookDelivery.create({
    data: {
      endpointId: endpoint.id,
      eventId: event.id,
      status: 'PENDING',
      nextAttemptAt: new Date(),
      attempts: 0,
    }
  })

  console.log(`✅ Delivery criada: ${delivery.id}`)
  console.log(`   Status: ${delivery.status}\n`)

  // 6. Disparar job do Trigger.dev
  console.log('📝 Passo 6: Disparar job do Trigger.dev')
  
  try {
    const handle = await tasks.trigger<typeof deliverWebhook>(
      'deliver-webhook',
      { deliveryId: delivery.id },
      {
        idempotencyKey: delivery.id,
        queue: 'webhooks',
      }
    )

    console.log(`✅ Job disparado com sucesso!`)
    console.log(`   Run ID: ${handle.id}`)
    console.log(`\n📊 Próximos passos:`)
    console.log(`   1. Acesse: https://cloud.trigger.dev`)
    console.log(`   2. Vá em "Runs" e procure por: ${handle.id}`)
    console.log(`   3. Veja os logs da execução`)
    console.log(`   4. Verifique webhook.site: ${webhookSiteUrl}`)
    console.log(`\n✅ Teste completo!\n`)

  } catch (error) {
    console.error('❌ Erro ao disparar job:', error)
    console.error('\nPossíveis causas:')
    console.error('  - TRIGGER_SECRET_KEY não configurado no .env')
    console.error('  - Trigger.dev não conectado ao projeto')
    console.error('  - Jobs não foram deployados ainda\n')
    process.exit(1)
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
