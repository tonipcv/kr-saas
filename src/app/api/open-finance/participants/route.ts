import { NextResponse } from 'next/server';
import { listParticipantsRegistered } from '@/lib/linaob';

function normalizeParticipants(input: any): any[] {
  // Accept common shapes: array, {data: []}, {participants: []}, {items: []}
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.data)) return input.data;
  if (Array.isArray(input?.participants)) return input.participants;
  if (Array.isArray(input?.items)) return input.items;
  return [];
}

export async function GET(req: Request) {
  try {
    const h = (req.headers as any);
    const envIp = process.env.LINAOB_CLIENT_IP;
    const ipCandidatesRaw: Array<string | null | undefined> = [
      envIp,
      h.get?.('x-forwarded-for'),
      h.get?.('x-real-ip'),
      h.get?.('cf-connecting-ip'),
      h.get?.('x-client-ip'),
    ];
    const firstIp = ipCandidatesRaw
      .map((v) => (typeof v === 'string' ? v.split(',')[0].trim() : ''))
      .find((v) => !!v) || '192.168.0.1';
    const clientIp = firstIp;
    const subTenantId = process.env.LINAOB_SUBTENANT_ID || 'lina';

    const data = await listParticipantsRegistered({ subTenantId, clientIp });
    const participants = normalizeParticipants(data);
    return NextResponse.json({ ok: true, participants });
  } catch (e: any) {
    const status = Number(e?.status) || 500;
    return NextResponse.json({ ok: false, error: e?.message || 'Failed to list participants', provider: e?.responseJson || e?.responseText || null }, { status });
  }
}
