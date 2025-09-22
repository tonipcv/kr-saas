import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

async function ensureTable() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS automations (
        id TEXT PRIMARY KEY,
        doctor_id TEXT NOT NULL,
        name TEXT NOT NULL,
        trigger_type TEXT NOT NULL,
        trigger_config JSONB NULL,
        action_type TEXT NOT NULL,
        action_config JSONB NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
      `SELECT id, doctor_id, is_active FROM automations WHERE id = $1 LIMIT 1` as any,
      id
    );
    const a = rows?.[0];
    if (!a || a.doctor_id !== doctorId) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }
    const nextActive = !a.is_active;
    await prisma.$executeRawUnsafe(
      `UPDATE automations SET is_active = $2 WHERE id = $1` as any,
      id,
      nextActive
    );
    return NextResponse.json({ success: true, data: { id, is_active: nextActive } });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
  }
}
