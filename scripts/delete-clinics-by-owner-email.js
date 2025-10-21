#!/usr/bin/env node

/*
  Delete ALL clinics owned by a given user email, with optional backup export.

  Usage examples:
    # Dry-run (lista o que será afetado, não altera nada)
    node scripts/delete-clinics-by-owner-email.js --email someone@example.com

    # Exportar backup (JSON) sem deletar
    node scripts/delete-clinics-by-owner-email.js --email someone@example.com --backup-only

    # Deletar com criação de backup automático (diretório padrão) e confirmação
    node scripts/delete-clinics-by-owner-email.js --email someone@example.com --apply

    # Deletar com backup para um diretório específico, sem prompt
    node scripts/delete-clinics-by-owner-email.js --email someone@example.com --apply --yes --backup-dir ./backups/my-export

  Opções:
    --email <email>          Email do dono (owner) das clínicas a excluir (obrigatório)
    --apply                  Executa as alterações (por padrão é dry-run)
    --yes                    Pula o prompt de confirmação (usar com --apply)
    --backup-only            Apenas exporta backup e NÃO deleta nada
    --backup-dir <path>      Diretório para salvar os backups (por padrão: backups/clinics-<ts>-<email>)
    --include-events         Inclui export de eventos (Event) filtrados por clinicId (pode ser grande)

  Estratégia de remoção por clínica:
    - Deleta ClinicAddOnSubscription (via subscriptions)
    - Deleta ClinicSubscription
    - Deleta Merchant
    - Seta clinicId = NULL em:
        * products.clinicId
        * referral_leads.clinic_id
        * coupon_templates.clinic_id
        * referral_rewards.clinic_id
    - Deleta Clinic (demais relações com onDelete: Cascade serão tratadas pelo BD)
*/

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL },
  },
});

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    email: null,
    apply: false,
    yes: false,
    backupOnly: false,
    backupDir: null,
    includeEvents: false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--email') opts.email = args[++i];
    else if (a === '--apply') opts.apply = true;
    else if (a === '--yes') opts.yes = true;
    else if (a === '--backup-only') opts.backupOnly = true;
    else if (a === '--backup-dir') opts.backupDir = args[++i];
    else if (a === '--include-events') opts.includeEvents = true;
    else if (a === '--help' || a === '-h') { printHelpAndExit(0); }
    else { console.warn(`Unknown option: ${a}`); printHelpAndExit(1); }
  }
  if (!opts.email) {
    console.error('Error: --email é obrigatório');
    printHelpAndExit(1);
  }
  if (opts.backupOnly && opts.apply) {
    console.error('Error: --backup-only e --apply são mutuamente exclusivos');
    printHelpAndExit(1);
  }
  return opts;
}

function printHelpAndExit(code) {
  console.log(`\nExcluir TODAS as clínicas de um dono (por email), com backup opcional.\n\nUso:\n  node scripts/delete-clinics-by-owner-email.js --email <email> [--apply] [--yes] [--backup-only] [--backup-dir <path>] [--include-events]\n`);
  process.exit(code);
}

async function promptYesNo(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function defaultBackupDir(email) {
  const safeEmail = email.replace(/[^a-zA-Z0-9._-]/g, '_');
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join('backups', `clinics-${ts}-${safeEmail}`);
}

async function exportClinicBackup(baseDir, clinic, options) {
  const { includeEvents } = options;
  const clinicDir = path.join(baseDir, clinic.id);
  ensureDir(clinicDir);

  // Exportar entidades relacionadas
  const [
    merchant,
    subscriptions,
    addonSubs,
    products,
    referralLeads,
    couponTemplates,
    referralRewards,
    members,
    events
  ] = await Promise.all([
    prisma.merchant.findUnique({ where: { clinicId: clinic.id } }),
    prisma.clinicSubscription.findMany({ where: { clinicId: clinic.id } }),
    prisma.clinicAddOnSubscription.findMany({ where: { subscription: { clinicId: clinic.id } } }),
    prisma.products.findMany({ where: { clinicId: clinic.id } }),
    prisma.referralLead.findMany({ where: { clinicId: clinic.id } }),
    prisma.couponTemplate.findMany({ where: { clinicId: clinic.id } }),
    prisma.referralReward.findMany({ where: { clinicId: clinic.id } }),
    prisma.clinicMember.findMany({ where: { clinicId: clinic.id } }),
    includeEvents ? prisma.event.findMany({ where: { clinicId: clinic.id } }) : Promise.resolve([]),
  ]);

  const payload = {
    clinic,
    merchant,
    subscriptions,
    addonSubs,
    products,
    referralLeads,
    couponTemplates,
    referralRewards,
    members,
    events,
    exportedAt: new Date().toISOString(),
  };

  fs.writeFileSync(path.join(clinicDir, 'backup.json'), JSON.stringify(payload, null, 2), 'utf8');
}

async function deleteClinic(tx, clinicId) {
  // Obter subscriptions para deletar addonSubs
  const subs = await tx.clinicSubscription.findMany({ where: { clinicId } , select: { id: true } });
  const subIds = subs.map(s => s.id);

  if (subIds.length > 0) {
    await tx.clinicAddOnSubscription.deleteMany({ where: { subscriptionId: { in: subIds } } });
  }

  if (subs.length > 0) {
    await tx.clinicSubscription.deleteMany({ where: { clinicId } });
  }

  // Merchant (unique por clinicId)
  await tx.merchant.deleteMany({ where: { clinicId } });

  // Set NULL opcionais
  await tx.products.updateMany({ where: { clinicId }, data: { clinicId: null } });
  await tx.referralLead.updateMany({ where: { clinicId }, data: { clinicId: null } });
  await tx.couponTemplate.updateMany({ where: { clinicId }, data: { clinicId: null } });
  await tx.referralReward.updateMany({ where: { clinicId }, data: { clinicId: null } });

  // Por fim, deletar a clínica
  await tx.clinic.delete({ where: { id: clinicId } });
}

async function main() {
  const opts = parseArgs();
  const { email, apply, yes, backupOnly, backupDir, includeEvents } = opts;

  console.log('--- Delete Clinics by Owner Email ---');
  console.log(`Owner Email: ${email}`);
  console.log(`Mode: ${backupOnly ? 'BACKUP-ONLY' : (apply ? 'APPLY' : 'DRY-RUN')}`);
  if (includeEvents) console.log('Option: include-events ENABLED');

  const owner = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, name: true } });
  if (!owner) {
    console.error('Owner user not found. Nothing to do.');
    return;
  }

  const clinics = await prisma.clinic.findMany({
    where: { ownerId: owner.id },
    select: { id: true, name: true, slug: true },
    orderBy: { createdAt: 'asc' },
  });

  if (clinics.length === 0) {
    console.log('No clinics found for this owner.');
    return;
  }

  console.log(`\nFound clinics (${clinics.length}):`);
  for (const c of clinics) {
    console.log(`- ${c.id} | ${c.name}${c.slug ? ` | slug=${c.slug}` : ''}`);
  }

  // Contagens por clínica
  console.log('\nDependencies per clinic:');
  for (const c of clinics) {
    const [merchant, subsCount, addonSubsCount, productsCount, leadsCount, tmplCount, rewardsCount, membersCount] = await Promise.all([
      prisma.merchant.findUnique({ where: { clinicId: c.id }, select: { id: true } }),
      prisma.clinicSubscription.count({ where: { clinicId: c.id } }),
      prisma.clinicAddOnSubscription.count({ where: { subscription: { clinicId: c.id } } }),
      prisma.products.count({ where: { clinicId: c.id } }),
      prisma.referralLead.count({ where: { clinicId: c.id } }),
      prisma.couponTemplate.count({ where: { clinicId: c.id } }),
      prisma.referralReward.count({ where: { clinicId: c.id } }),
      prisma.clinicMember.count({ where: { clinicId: c.id } }),
    ]);
    console.log(`- Clinic ${c.id}: Merchant=${merchant ? 'YES' : 'NO'}, Subs=${subsCount}, AddOnSubs=${addonSubsCount}, Products=${productsCount}, Leads=${leadsCount}, Templates=${tmplCount}, Rewards=${rewardsCount}, Members=${membersCount}`);
  }

  // Backup export, if requested or implied (when applying, we will create backup if no --backup-only but a dir is defined)
  let exportDir = backupDir || defaultBackupDir(owner.email);

  if (backupOnly || apply) {
    console.log(`\nExporting backup to: ${exportDir}`);
    ensureDir(exportDir);
    for (const c of clinics) {
      await exportClinicBackup(exportDir, c, { includeEvents });
    }
    console.log('Backup export completed.');
  }

  if (backupOnly) {
    console.log('\nBackup-only completed. No changes performed.');
    return;
  }

  if (!apply) {
    console.log('\nDry-run complete. No changes performed.');
    return;
  }

  if (!yes) {
    const confirmed = await promptYesNo(`Are you sure you want to DELETE ${clinics.length} clinic(s) owned by ${owner.email}?`);
    if (!confirmed) {
      console.log('Aborted by user.');
      return;
    }
  }

  // Deletar todas as clínicas, cada uma na sua própria transação para isolamento
  for (const c of clinics) {
    await prisma.$transaction(async (tx) => {
      await deleteClinic(tx, c.id);
    });
    console.log(`Deleted clinic ${c.id}`);
  }

  console.log('\nAll clinics deleted successfully.');
}

main()
  .catch((err) => {
    console.error('Failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await prisma.$disconnect(); } catch {}
  });
