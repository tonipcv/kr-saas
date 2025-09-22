#!/usr/bin/env node
/*
Insert a test row into campaign_jobs to validate writes.
Usage:
  node scripts/dev/insert-campaign-job.js --doctor <doctorId> --channel sms --status done --campaign test-123
*/

const { prisma } = require('../../dist/lib/prisma.js');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { doctorId: null, channel: 'sms', status: 'done', campaignId: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if ((a === '--doctor' || a === '--doctorId') && args[i+1]) { out.doctorId = args[++i]; continue; }
    if (a === '--channel' && args[i+1]) { out.channel = args[++i]; continue; }
    if (a === '--status' && args[i+1]) { out.status = args[++i]; continue; }
    if (a === '--campaign' && args[i+1]) { out.campaignId = args[++i]; continue; }
  }
  return out;
}

async function main() {
  const { doctorId, channel, status, campaignId } = parseArgs();
  if (!doctorId) throw new Error('Missing --doctor');
  const id = `${channel}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const camp = campaignId || `${channel}-${new Date().toISOString().slice(0,10)}`;

  console.log('[jobs:insert] trying insert', { id, doctorId, channel, status, campaignId: camp });
  try {
    // Prefer prisma model
    // @ts-ignore
    if (prisma.campaignJob?.create) {
      // @ts-ignore
      await prisma.campaignJob.create({
        data: {
          id,
          doctorId,
          campaignId: camp,
          channel,
          trigger: 'debug',
          scheduleAt: new Date(),
          status,
          lastError: status === 'failed' ? 'debug-insert' : null,
        }
      });
    } else {
      await prisma.$executeRawUnsafe(
        `INSERT INTO campaign_jobs (id, doctor_id, campaign_id, channel, trigger, schedule_at, status, last_error)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        id, doctorId, camp, channel, 'debug', new Date(), status, status === 'failed' ? 'debug-insert' : null
      );
    }
    console.log('[jobs:insert] insert OK');
  } catch (e) {
    console.error('[jobs:insert] insert ERROR', e);
  }

  const rows = await prisma.$queryRawUnsafe(
    `SELECT id, doctor_id as "doctorId", campaign_id as "campaignId", channel, status, created_at as "createdAt" 
     FROM campaign_jobs WHERE doctor_id = $1 ORDER BY created_at DESC LIMIT 5`,
    doctorId
  );
  console.log('[jobs:last5]', rows);
}

main()
  .catch((e) => { console.error('[jobs:insert] fatal', e); process.exit(1); })
  .finally(async () => { try { await prisma.$disconnect(); } catch {} });
