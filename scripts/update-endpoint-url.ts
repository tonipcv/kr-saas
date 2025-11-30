/**
 * Atualiza a URL de um WebhookEndpoint pelo ID
 *
 * Uso:
 *   npx tsx scripts/update-endpoint-url.ts <ENDPOINT_ID> <NOVA_URL>
 */

import { prisma } from '../src/lib/prisma'

async function main() {
  const endpointId = process.argv[2]
  const newUrl = process.argv[3]

  if (!endpointId || !newUrl) {
    console.error('Uso: npx tsx scripts/update-endpoint-url.ts <ENDPOINT_ID> <NOVA_URL>')
    process.exit(1)
  }
  if (!newUrl.startsWith('https://')) {
    console.error('A URL deve começar com https://')
    process.exit(1)
  }

  const endpoint = await prisma.webhookEndpoint.findUnique({ where: { id: endpointId } })
  if (!endpoint) {
    console.error(`Endpoint não encontrado: ${endpointId}`)
    process.exit(1)
  }

  const updated = await prisma.webhookEndpoint.update({ where: { id: endpointId }, data: { url: newUrl } })
  console.log('✅ Endpoint atualizado:')
  console.log(`  id: ${updated.id}`)
  console.log(`  url: ${updated.url}`)
}

main()
  .catch((e) => {
    console.error('Erro:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
