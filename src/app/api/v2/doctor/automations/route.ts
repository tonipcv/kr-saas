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

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    const doctorId = session.user.id;
    await ensureTable();
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, doctor_id, name, trigger_type, trigger_config, action_type, action_config, is_active, created_at
       FROM automations WHERE doctor_id = $1 ORDER BY created_at DESC LIMIT 200` as any,
      doctorId
    );
    const data = rows.map(r => ({
      id: String(r.id),
      name: String(r.name),
      trigger_type: String(r.trigger_type),
      action_type: String(r.action_type),
      is_active: !!r.is_active,
      created_at: new Date(r.created_at).toISOString(),
    }));
    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    const doctorId = session.user.id;

    const body = await req.json();
    const { name, trigger_type, trigger_config } = body || {};
    let { action_type, action_config } = body || {};
    const { actions } = body || {};
    if (!name || !trigger_type) {
      return NextResponse.json({ success: false, error: 'name and trigger_type are required' }, { status: 400 });
    }
    // Multi-actions support: if actions[] provided, persist as multi
    if (Array.isArray(actions) && actions.length > 0) {
      action_type = 'multi';
      action_config = { actions };
    }
    if (!action_type) {
      return NextResponse.json({ success: false, error: 'action_type or actions[] is required' }, { status: 400 });
    }

    await ensureTable();
    const id = Math.random().toString(36).slice(2);
    await prisma.$executeRawUnsafe(
      `INSERT INTO automations (id, doctor_id, name, trigger_type, trigger_config, action_type, action_config, is_active, created_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb, TRUE, NOW())` as any,
      id,
      doctorId,
      name,
      trigger_type,
      trigger_config ? JSON.stringify(trigger_config) : null,
      action_type,
      action_config ? JSON.stringify(action_config) : null,
    );

    return NextResponse.json({ success: true, data: { id } }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
  }
}
