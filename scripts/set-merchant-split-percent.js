#!/usr/bin/env node
/*
  Standardize merchants.splitPercent across clinics
  - Default: 70 (clinic), implying platform gets 30 via split logic in checkout
  - Supports flags:
    --clinic <CLINIC_ID>   Update only one clinic
    --percent <NUMBER>     Set clinic percent (0..100). Default 70
    --dry-run              Do not write, only show what would change
    --only-missing         Update only rows with null/undefined splitPercent

  Usage examples:
    node scripts/set-merchant-split-percent.js
    node scripts/set-merchant-split-percent.js --percent 70
    node scripts/set-merchant-split-percent.js --clinic cmgo7fpg20002t9skvf7x978i --percent 70
    node scripts/set-merchant-split-percent.js --dry-run
*/

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

function parseArgs(argv) {
  const out = { clinic: null, percent: 70, dryRun: false, onlyMissing: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--clinic') { out.clinic = argv[++i]; continue; }
    if (a === '--percent') { out.percent = Number(argv[++i]); continue; }
    if (a === '--dry-run') { out.dryRun = true; continue; }
    if (a === '--only-missing') { out.onlyMissing = true; continue; }
    console.warn('[warn] Unknown arg:', a);
  }
  if (!Number.isFinite(out.percent) || out.percent < 0 || out.percent > 100) {
    throw new Error('--percent must be a number between 0 and 100');
  }
  return out;
}

(async () => {
  const args = parseArgs(process.argv);
  const prisma = new PrismaClient();
  const startedAt = new Date();
  try {
    console.log('[split:update] starting', { args, startedAt: startedAt.toISOString() });

    const where = {};
    if (args.clinic) where.clinicId = String(args.clinic);
    if (args.onlyMissing) where.splitPercent = null;

    const merchants = await prisma.merchant.findMany({
      where,
      select: { clinicId: true, recipientId: true, splitPercent: true, status: true },
    });

    if (!merchants.length) {
      console.log('[split:update] no merchants matched criteria');
      return;
    }

    console.log(`[split:update] matched ${merchants.length} merchant(s)`);
    let changed = 0;
    for (const m of merchants) {
      const current = typeof m.splitPercent === 'number' ? m.splitPercent : null;
      if (current === args.percent) {
        console.log(`- clinic=${m.clinicId}: splitPercent already ${current} (skip)`);
        continue;
      }
      console.log(`- clinic=${m.clinicId}: ${current == null ? 'null' : current} -> ${args.percent}`);
      if (!args.dryRun) {
        await prisma.merchant.update({
          where: { clinicId: m.clinicId },
          data: { splitPercent: args.percent },
        });
      }
      changed++;
    }

    console.log('[split:update] done', {
      changed,
      total: merchants.length,
      dryRun: args.dryRun,
      finishedAt: new Date().toISOString(),
    });

    // Optional: show implied platform share
    console.log(`[split:update] clinicPercent=${args.percent} -> platformPercent=${100 - args.percent}`);
  } catch (e) {
    console.error('[split:update] error', e);
    process.exitCode = 1;
  } finally {
    try { await prisma.$disconnect(); } catch {}
  }
})();
