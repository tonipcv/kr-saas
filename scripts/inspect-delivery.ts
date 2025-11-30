/**
 * Inspeciona uma delivery pelo ID e imprime a URL do endpoint vinculada
 *
 * Uso:
 *   npx tsx scripts/inspect-delivery.ts <DELIVERY_ID>
 */

import { prisma } from '../src/lib/prisma'

async function main() {
  const deliveryId = process.argv[2]
  if (!deliveryId) {
    console.error('Uso: npx tsx scripts/inspect-delivery.ts <DELIVERY_ID>')
    process.exit(1)
  }

  const delivery = await prisma.outboundWebhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { endpoint: true, event: true },
  })

  if (!delivery) {
    console.error(`Delivery não encontrada: ${deliveryId}`)
    process.exit(1)
  }

  console.log('\nDelivery:')
  console.log(`  id: ${delivery.id}`)
  console.log(`  status: ${delivery.status}`)
  console.log(`  attempts: ${delivery.attempts}`)

  console.log('\nEndpoint:')
  console.log(`  id: ${delivery.endpoint.id}`)
  console.log(`  url: "${delivery.endpoint.url}"`)

  console.log('\nEvent:')
  console.log(`  id: ${delivery.event.id}`)
  console.log(`  type: ${delivery.event.type}`)
}

main()
  .catch((e) => {
    console.error('Erro:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
