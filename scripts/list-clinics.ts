/**
 * Lista clínicas disponíveis (id e nome) para usar como CLINIC_ID nos testes
 *
 * Uso:
 *   npx tsx scripts/list-clinics.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const clinics = await prisma.clinic.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  if (clinics.length === 0) {
    console.log('Nenhuma clínica encontrada.')
    console.log('Crie uma clínica ou informe manualmente um CLINIC_ID válido.')
    return
  }

  console.log(`\nEncontradas ${clinics.length} clínicas (mostrando até 50):\n`)
  for (const c of clinics) {
    console.log(`- ${c.name}  →  ${c.id}`)
  }

  console.log('\nExemplo de uso:')
  console.log('npx tsx scripts/create-test-delivery.ts https://webhook.site/SEU_ID CLINIC_ID=<cole-o-id-da-clinica-aqui>')
}

main()
  .catch((e) => {
    console.error('Erro ao listar clínicas:', e)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
