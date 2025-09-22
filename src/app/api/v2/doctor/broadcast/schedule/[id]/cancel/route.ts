import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

async function ensureTable() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS campaign_jobs (
        id TEXT PRIMARY KEY,
        doctor_id TEXT NOT NULL,
        campaign_id TEXT NOT NULL,
        channel TEXT NOT NULL,
        trigger TEXT NULL,
        schedule_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        status TEXT NOT NULL,
        last_error TEXT NULL,
        payload_json JSONB NULL
      );
    `);
  } catch {}
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    const doctorId = session.user.id;
    const { id } = await params;
    if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });

    await ensureTable();

    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, doctor_id, status FROM campaign_jobs WHERE id = $1 LIMIT 1` as any,
      id
    );
    const job = rows?.[0];
    if (!job || job.doctor_id !== doctorId) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }
    if (job.status !== 'scheduled') {
      return NextResponse.json({ success: false, error: 'Only scheduled jobs can be cancelled' }, { status: 400 });
    }

    await prisma.$executeRawUnsafe(
      `UPDATE campaign_jobs SET status = 'cancelled' WHERE id = $1` as any,
      id
    );

    return NextResponse.json({ success: true, data: { id, status: 'cancelled' } });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Unexpected error' }, { status: 500 });
  }
}
