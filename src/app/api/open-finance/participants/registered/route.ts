import { NextResponse } from 'next/server';
import { listParticipantsRegistered } from '@/lib/linaob';

export async function GET() {
  try {
    const data = await listParticipantsRegistered();
    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    const status = Number(e?.status) || 500;
    return NextResponse.json({ ok: false, error: e?.message || 'Lina OB error', response: e?.responseJson || e?.responseText }, { status });
  }
}
