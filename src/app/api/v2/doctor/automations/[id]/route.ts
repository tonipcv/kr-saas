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

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    const doctorId = session.user.id;
    const { id } = await params;
    await ensureTable();
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, doctor_id, name, trigger_type, trigger_config, action_type, action_config, is_active, created_at
       FROM automations WHERE id = $1 LIMIT 1` as any,
      id
    );
    const a = rows?.[0];
    if (!a || a.doctor_id !== doctorId) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: {
      id: String(a.id),
      name: String(a.name),
      trigger_type: String(a.trigger_type),
      trigger_config: a.trigger_config || null,
      action_type: String(a.action_type),
      action_config: a.action_config || null,
      is_active: !!a.is_active,
      created_at: new Date(a.created_at).toISOString(),
    }});
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    const doctorId = session.user.id;
    const { id } = await params;
    const body = await req.json();
    const { name, trigger_type, trigger_config } = body || {};
    let { action_type, action_config } = body || {};
    const { actions } = body || {};
    if (!name || !trigger_type) return NextResponse.json({ success: false, error: 'name and trigger_type are required' }, { status: 400 });
    if (Array.isArray(actions) && actions.length > 0) {
      action_type = 'multi';
      action_config = { actions };
    }
    if (!action_type) return NextResponse.json({ success: false, error: 'action_type or actions[] is required' }, { status: 400 });

    await ensureTable();
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, doctor_id FROM automations WHERE id = $1 LIMIT 1` as any,
      id
    );
    const a = rows?.[0];
    if (!a || a.doctor_id !== doctorId) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    await prisma.$executeRawUnsafe(
      `UPDATE automations SET name = $2, trigger_type = $3, trigger_config = $4::jsonb, action_type = $5, action_config = $6::jsonb WHERE id = $1` as any,
      id,
      name,
      trigger_type,
      trigger_config ? JSON.stringify(trigger_config) : null,
      action_type,
      action_config ? JSON.stringify(action_config) : null,
    );

    return NextResponse.json({ success: true, data: { id } });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    const doctorId = session.user.id;
    const { id } = await params;

    await ensureTable();
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, doctor_id FROM automations WHERE id = $1 LIMIT 1` as any,
      id
    );
    const a = rows?.[0];
    if (!a || a.doctor_id !== doctorId) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    await prisma.$executeRawUnsafe(`DELETE FROM automations WHERE id = $1` as any, id);
    return NextResponse.json({ success: true, data: { id } });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
  }
}
