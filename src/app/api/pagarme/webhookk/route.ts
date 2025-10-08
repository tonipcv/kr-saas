// Alias shim to support legacy/incorrect webhook URL `/api/pagarme/webhookk`
// Forwards to the correct handler at /api/payments/pagarme/webhook
import type { NextRequest } from 'next/server';
import * as Correct from '@/app/api/payments/pagarme/webhook/route';

export async function POST(req: NextRequest) {
  // Simply delegate to the correct handler
  return Correct.POST(req as unknown as Request);
}
