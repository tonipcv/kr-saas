import type { NextRequest } from 'next/server'
import * as Correct from '@/app/api/payments/pagarme/webhook/route'

export async function POST(req: NextRequest) {
  return Correct.POST(req as unknown as Request)
}
