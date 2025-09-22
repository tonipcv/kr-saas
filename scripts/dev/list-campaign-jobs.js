#!/usr/bin/env node
/*
List campaign_jobs for quick inspection.
Usage examples:
  node scripts/dev/list-campaign-jobs.js
  node scripts/dev/list-campaign-jobs.js --doctor c6f3-... --status done --limit 50
  node scripts/dev/list-campaign-jobs.js --channel sms
*/

const { prisma } = require('../../dist/lib/prisma.js');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { doctorId: null, status: null, channel: null, limit: 50 };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if ((a === '--doctor' || a === '--doctorId') && args[i+1]) { out.doctorId = args[++i]; continue; }
    if (a === '--status' && args[i+1]) { out.status = args[++i]; continue; }
    if (a === '--channel' && args[i+1]) { out.channel = args[++i]; continue; }
    if (a === '--limit' && args[i+1]) { out.limit = Math.min(parseInt(args[++i], 10) || 50, 500); continue; }
  }
  return out;
}

async function main() {
  const { doctorId, status, channel, limit } = parseArgs();
  const where = {};
  if (doctorId) where.doctorId = doctorId;
  if (status) where.status = status;
  if (channel) where.channel = channel;

  console.log('[jobs:list] where', where, 'limit', limit);

  // Summary by status
  const statuses = ['scheduled','running','done','failed','cancelled'];
  const summary = {};
  for (const s of statuses) {
    const count = await prisma.campaignJob.count({ where: { ...where, status: s } });
    summary[s] = count;
  }
  console.log('[jobs:summary]', summary);

  // Latest rows
  const rows = await prisma.campaignJob.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }],
    take: limit,
    select: {
      id: true,
      doctorId: true,
      campaignId: true,
      channel: true,
      status: true,
      trigger: true,
      scheduleAt: true,
      createdAt: true,
      lastError: true,
    }
  });

  if (rows.length === 0) {
    console.log('[jobs:list] no rows');
  } else {
    console.log('[jobs:list] first 3 rows');
    for (const r of rows.slice(0, 3)) {
      console.log(' -', r);
    }
    console.log(`[jobs:list] total fetched: ${rows.length}`);
  }
}

main()
  .catch((e) => { console.error('[jobs:list] error', e); process.exit(1); })
  .finally(async () => { try { await prisma.$disconnect(); } catch {} });
