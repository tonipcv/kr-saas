import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Extremely simple in-memory scheduler (dev-only / single-instance)
// DO NOT use this for production multi-instance deployments

type Job = {
  id: string;
  doctorId: string;
  campaignId: string;
  channel: 'whatsapp' | 'sms' | 'email';
  trigger?: string | null;
  scheduleAt: string; // ISO
  createdAt: string; // ISO
  status: 'scheduled' | 'running' | 'done' | 'failed' | 'cancelled';
  lastError?: string;
  payload?: any;
};

const JOBS: Job[] = [];
const TIMERS = new Map<string, NodeJS.Timeout>();

function scheduleExecution(job: Job) {
  // fire at scheduleAt
  const target = new Date(job.scheduleAt).getTime();
  const now = Date.now();
  const delay = Math.max(0, target - now);
  const MAX_DELAY = 0x7fffffff; // ~24.85 days
  if (delay > MAX_DELAY) {
    // Avoid Node TimeoutOverflowWarning; the polling worker will pick it up at the right time
    return;
  }

  const timer = setTimeout(async () => {
    // Guard: check current status in DB; if cancelled/done, skip
    try {
      await ensureTable();
      const row: any[] = await prisma.$queryRawUnsafe(
        `SELECT status FROM campaign_jobs WHERE id = $1 LIMIT 1` as any,
        job.id,
      );
      const currentStatus = row?.[0]?.status || job.status;
      if (currentStatus !== 'scheduled') {
        TIMERS.delete(job.id);
        return;
      }
    } catch {}
    job.status = 'running';
    try {
      const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const url = `${base}/api/v2/doctor/campaigns/${encodeURIComponent(job.campaignId)}/send`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: job.channel, dryRun: false, trigger: job.trigger || undefined })
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        job.status = 'failed';
        job.lastError = json?.error || `HTTP ${res.status}`;
      } else {
        job.status = 'done';
      }
    } catch (e: any) {
      job.status = 'failed';
      job.lastError = e?.message || 'Unexpected error';
    } finally {
      TIMERS.delete(job.id);
    }
  }, delay);

  TIMERS.set(job.id, timer as any);
}

// --- Minimal persistence (dev) ---
async function ensureTable() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS campaign_jobs (
        id TEXT PRIMARY KEY,
        doctor_id TEXT NOT NULL,
        campaign_id TEXT NOT NULL,
        channel TEXT NOT NULL,
        trigger TEXT NULL,
        schedule_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        status TEXT NOT NULL,
        last_error TEXT NULL,
        payload_json JSONB NULL
      );
    `);
    // Add payload_json if table exists without it
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns WHERE table_name = 'campaign_jobs' AND column_name = 'payload_json'
        ) THEN
          ALTER TABLE campaign_jobs ADD COLUMN payload_json JSONB NULL;
        END IF;
      END$$;
    `);
  } catch (e) {
    // ignore if cannot create
  }
}

async function persistJob(job: Job) {
  try {
    await ensureTable();
    await prisma.$executeRawUnsafe(
      `INSERT INTO campaign_jobs (id, doctor_id, campaign_id, channel, trigger, schedule_at, created_at, status, payload_json) VALUES ($1,$2,$3,$4,$5,$6::timestamptz,$7::timestamptz,$8,$9::jsonb)` as any,
      job.id,
      job.doctorId,
      job.campaignId,
      job.channel,
      job.trigger,
      job.scheduleAt,
      job.createdAt,
      job.status,
      job.payload ? JSON.stringify(job.payload) : null,
    );
  } catch (e) {
    // ignore persistence failures in dev
  }
}

async function listJobs(doctorId: string) {
  try {
    await ensureTable();
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, doctor_id, campaign_id, channel, trigger, schedule_at, created_at, status, last_error, payload_json FROM campaign_jobs WHERE doctor_id = $1 ORDER BY schedule_at DESC LIMIT 50` as any,
      doctorId,
    );
    return rows.map((r) => ({
      id: String(r.id),
      doctorId: String(r.doctor_id),
      campaignId: String(r.campaign_id),
      channel: r.channel as Job['channel'],
      trigger: r.trigger as string | null,
      scheduleAt: new Date(r.schedule_at).toISOString(),
      createdAt: new Date(r.created_at).toISOString(),
      status: r.status as Job['status'],
      lastError: r.last_error || undefined,
      payload: r.payload_json || undefined,
    })) as Job[];
  } catch (e) {
    return [];
  }
}

async function updateJobStatus(id: string, status: Job['status'], lastError?: string) {
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE campaign_jobs SET status = $2, last_error = $3 WHERE id = $1` as any,
      id,
      status,
      lastError || null,
    );
  } catch {}
}

let WORKER_STARTED = false;
function startWorker() {
  if (WORKER_STARTED) return;
  WORKER_STARTED = true;
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  setInterval(async () => {
    try {
      await ensureTable();
      const due = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM campaign_jobs WHERE status = 'scheduled' AND schedule_at <= NOW() ORDER BY schedule_at ASC LIMIT 5`
      );
      for (const r of due) {
        const job: Job = {
          id: String(r.id),
          doctorId: String(r.doctor_id),
          campaignId: String(r.campaign_id),
          channel: r.channel as Job['channel'],
          trigger: r.trigger,
          scheduleAt: new Date(r.schedule_at).toISOString(),
          createdAt: new Date(r.created_at).toISOString(),
          status: r.status,
        };
        await updateJobStatus(job.id, 'running');
        try {
          const url = `${base}/api/v2/doctor/campaigns/${encodeURIComponent(job.campaignId)}/send`;
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel: job.channel, dryRun: false, trigger: job.trigger || undefined })
          });
          if (!res.ok) {
            const json = await res.json().catch(() => ({}));
            await updateJobStatus(job.id, 'failed', json?.error || `HTTP ${res.status}`);
          } else {
            await updateJobStatus(job.id, 'done');
          }
        } catch (e: any) {
          await updateJobStatus(job.id, 'failed', e?.message || 'Unexpected error');
        }
      }
    } catch {}
  }, 15_000);
}
startWorker();

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const doctorId = session.user.id;
    const { campaignId, channel, scheduleAt, trigger, payload } = await req.json();
    if (!campaignId) return NextResponse.json({ success: false, error: 'campaignId required' }, { status: 400 });
    if (!channel || !['whatsapp', 'sms', 'email'].includes(channel)) return NextResponse.json({ success: false, error: 'valid channel required' }, { status: 400 });
    if (!scheduleAt) return NextResponse.json({ success: false, error: 'scheduleAt ISO required' }, { status: 400 });

    const ts = Date.parse(scheduleAt);
    if (!isFinite(ts)) return NextResponse.json({ success: false, error: 'invalid scheduleAt' }, { status: 400 });
    if (ts < Date.now() + 5_000) return NextResponse.json({ success: false, error: 'scheduleAt must be at least 5s in the future' }, { status: 400 });

    const job: Job = {
      id: Math.random().toString(36).slice(2),
      doctorId,
      campaignId,
      channel,
      trigger: trigger || null,
      scheduleAt: new Date(ts).toISOString(),
      createdAt: new Date().toISOString(),
      status: 'scheduled',
      payload: payload || undefined,
    };

    JOBS.push(job);
    scheduleExecution(job);
    await persistJob(job);

    return NextResponse.json({ success: true, data: { id: job.id, scheduleAt: job.scheduleAt, status: job.status } });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Unexpected error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    const doctorId = session.user.id;
    const persisted = await listJobs(doctorId);
    // also include in-memory not yet persisted (shouldn't happen often)
    const mem = JOBS.filter(j => j.doctorId === doctorId);
    // merge by id
    const map = new Map<string, Job>();
    for (const j of [...persisted, ...mem]) map.set(j.id, j);
    const rows = Array.from(map.values()).sort((a,b) => (a.scheduleAt < b.scheduleAt ? 1 : -1)).slice(0, 50);
    return NextResponse.json({ success: true, data: rows });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Unexpected error' }, { status: 500 });
  }
}
