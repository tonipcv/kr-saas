import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// NOTE: We are using direct SQL against the campaign_jobs table defined in scripts/sql/campaign_jobs.sql.txt
// This avoids depending on a prisma model that may not be present yet.
// Table columns (per script):
// id TEXT PRIMARY KEY,
// doctor_id TEXT NOT NULL,
// campaign_id TEXT NOT NULL,
// channel TEXT NOT NULL CHECK (channel in ('whatsapp','sms','email')),
// trigger TEXT NULL,
// schedule_at TIMESTAMPTZ NOT NULL,
// created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
// status TEXT NOT NULL CHECK (status in ('scheduled','running','done','failed','cancelled')),
// last_error TEXT NULL

const VALID_CHANNELS = new Set(["whatsapp", "sms", "email"]);
const VALID_STATUS = new Set(["scheduled", "running", "done", "failed", "cancelled"]);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const channel = searchParams.get("channel");
    const campaignId = searchParams.get("campaignId");
    const doctorId = searchParams.get("doctorId");
    const limit = Math.min(Number(searchParams.get("limit") || 100), 500);

    const where: string[] = [];
    const params: any[] = [];

    if (status) {
      where.push(`status = $${params.length + 1}`);
      params.push(status);
    }
    if (channel) {
      where.push(`channel = $${params.length + 1}`);
      params.push(channel);
    }
    if (campaignId) {
      where.push(`campaign_id = $${params.length + 1}`);
      params.push(campaignId);
    }
    if (doctorId) {
      where.push(`doctor_id = $${params.length + 1}`);
      params.push(doctorId);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const sql = `
      SELECT id, doctor_id as "doctorId", campaign_id as "campaignId", channel, status,
             trigger, schedule_at as "scheduleAt", created_at as "createdAt", last_error as "lastError"
      FROM campaign_jobs
      ${whereSql}
      ORDER BY COALESCE(schedule_at, created_at) DESC
      LIMIT $${params.length + 1}
    `;
    params.push(limit);

    const rows = await prisma.$queryRawUnsafe<any[]>(sql, ...params);

    return NextResponse.json({ data: rows }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load jobs" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      id,
      doctorId,
      campaignId,
      channel,
      status,
      trigger,
      scheduleAt,
      lastError,
    } = body || {};

    if (!doctorId || !campaignId || !channel || !status) {
      return NextResponse.json({ error: "doctorId, campaignId, channel, status are required" }, { status: 400 });
    }
    if (!VALID_CHANNELS.has(String(channel))) {
      return NextResponse.json({ error: "invalid channel" }, { status: 400 });
    }
    if (!VALID_STATUS.has(String(status))) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }

    const jobId = id || crypto.randomUUID();
    const sched = scheduleAt ? new Date(scheduleAt) : new Date();

    const sql = `
      INSERT INTO campaign_jobs (id, doctor_id, campaign_id, channel, trigger, schedule_at, status, last_error)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE SET
        doctor_id = EXCLUDED.doctor_id,
        campaign_id = EXCLUDED.campaign_id,
        channel = EXCLUDED.channel,
        trigger = EXCLUDED.trigger,
        schedule_at = EXCLUDED.schedule_at,
        status = EXCLUDED.status,
        last_error = EXCLUDED.last_error
    `;

    await prisma.$executeRawUnsafe(sql, jobId, doctorId, campaignId, channel, trigger || null, sched, status, lastError || null);

    return NextResponse.json({ ok: true, id: jobId }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to save job" }, { status: 500 });
  }
}
