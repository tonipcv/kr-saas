import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const clinicId = searchParams.get('clinicId')
    if (!clinicId) return NextResponse.json({ error: 'clinicId is required' }, { status: 400 })
    const merchant = await prisma.merchant.findUnique({ where: { clinicId } })
    if (!merchant) return NextResponse.json({ exists: false })
    return NextResponse.json({ exists: true, id: merchant.id })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'internal_error' }, { status: 500 })
  }
}
