#!/usr/bin/env node
/*
  Usage:
    node scripts/check-doctor-slug.js <slug>

  Verifica se existe um usuário DOCTOR ativo com o doctor_slug fornecido.
  Também lista possíveis colisões (mesmo slug em usuários não-doctors) e
  avisa se existe uma clínica com o mesmo slug.
*/

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function normalizeSlug(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('Erro: informe um slug. Exemplo: node scripts/check-doctor-slug.js bella-vida');
    process.exit(1);
  }

  const slug = normalizeSlug(input);
  if (!slug) {
    console.error('Erro: slug inválido após normalização.');
    process.exit(1);
  }

  console.log('=== Verificação de Doctor Slug ===');
  console.log('Slug informado:       ', input);
  console.log('Slug normalizado:     ', slug);
  console.log('');

  try {
    // 1) Procurar médico com esse slug
    const doctor = await prisma.user.findFirst({
      where: {
        doctor_slug: slug,
        role: 'DOCTOR',
        is_active: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        is_active: true,
        image: true,
        doctor_slug: true,
        role: true,
      },
    });

    if (doctor) {
      console.log('MÉDICO ENCONTRADO ✅');
      console.table([doctor]);
    } else {
      console.log('Nenhum médico ativo com este slug foi encontrado. ❌');
    }

    console.log('');

    // 2) Ver todas as contas que usam este slug (incluindo pacientes)
    const allWithSlug = await prisma.user.findMany({
      where: { doctor_slug: slug },
      select: { id: true, email: true, name: true, role: true, is_active: true },
      orderBy: { role: 'asc' },
    });

    if (allWithSlug.length > 0) {
      console.log(`Usuários com doctor_slug='${slug}':`);
      console.table(allWithSlug);
    } else {
      console.log(`Nenhum usuário com doctor_slug='${slug}'.`);
    }

    console.log('');

    // 3) Verificar se há clínica com o mesmo slug (apenas informativo)
    try {
      const clinic = await prisma.clinic.findFirst({
        where: { slug },
        select: { id: true, name: true, slug: true, isActive: true },
      });
      if (clinic) {
        console.log('Clínica com o mesmo slug encontrada (informativo):');
        console.table([clinic]);
      } else {
        console.log('Nenhuma clínica com este slug.');
      }
    } catch (err) {
      // Caso o modelo Clinic não exista ou campos sejam diferentes
      console.log('Aviso: não foi possível verificar clínica (modelo/colunas podem diferir).');
    }

    console.log('');

    // 4) Recomendações
    if (!doctor) {
      console.log('Recomendações:');
      console.log('- Garanta que o médico alvo tenha: role=DOCTOR, is_active=true e doctor_slug igual ao slug desejado.');
      console.log('- Caso exista este slug em outro usuário não-DOCTOR, remova/alterne para evitar colisão (campo é unique).');
      console.log('- Depois de ajustar, teste: GET /api/v2/doctor-link/' + slug);
    }
  } catch (error) {
    console.error('Erro durante a verificação:', error);
    process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
}

main();
