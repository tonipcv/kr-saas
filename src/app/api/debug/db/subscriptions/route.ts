import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/debug/db/subscriptions?insert=1
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const doInsert = url.searchParams.get('insert') === '1'

    // Inspect columns
    const subCols: any[] = await prisma.$queryRawUnsafe(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'customer_subscriptions' ORDER BY ordinal_position"
    )
    const custCols: any[] = await prisma.$queryRawUnsafe(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'customers' ORDER BY ordinal_position"
    )
    const subColNames = subCols.map((r: any) => r.column_name)
    const custColNames = custCols.map((r: any) => r.column_name)

    // Dump first rows (limited)
    let subsSample: any[] = []
    let custsSample: any[] = []
    try { subsSample = await prisma.$queryRawUnsafe('SELECT * FROM customer_subscriptions ORDER BY 1 DESC LIMIT 5') as any[] } catch {}
    try { custsSample = await prisma.$queryRawUnsafe('SELECT * FROM customers ORDER BY 1 DESC LIMIT 5') as any[] } catch {}

    // Build safe insert (only when asked)
    let insertSQL: string | null = null
    let insertResult: any = null
    if (doInsert) {
      // Try to assemble minimal columns
      const col = (nameCamel: string, nameSnake: string) => subColNames.includes(nameCamel) ? nameCamel : (subColNames.includes(nameSnake) ? nameSnake : null)
      const idCol = col('id', 'id')
      const merchantCol = col('merchantId', 'merchant_id')
      const customerCol = col('customerId', 'customer_id')
      const productCol = col('productId', 'product_id')
      const offerCol = col('offerId', 'offer_id')
      const providerCol = col('provider', 'provider')
      const accountCol = col('accountId', 'account_id')
      const providerSubCol = col('providerSubscriptionId', 'provider_subscription_id')
      const statusCol = col('status', 'status')
      const priceCol = col('priceCents', 'price_cents')
      const currencyCol = col('currency', 'currency')
      const startAtCol = col('startAt', 'start_at')

      const cols: string[] = []
      const vals: any[] = []
      const placeholders: string[] = []
      const push = (c: string | null, v: any) => { if (c != null) { cols.push('"' + c + '"'); vals.push(v); placeholders.push('$' + vals.length) } }

      const newId = (global as any).crypto?.randomUUID ? (global as any).crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`
      push(idCol, newId)
      push(merchantCol, 'debug_merchant')
      push(customerCol, 'debug_customer')
      push(productCol, 'debug_product')
      if (offerCol) push(offerCol, null)
      push(providerCol, 'STRIPE')
      if (accountCol) push(accountCol, null)
      if (providerSubCol) push(providerSubCol, 'sub_debug_' + Math.random().toString(36).slice(2))
      push(statusCol, 'ACTIVE')
      push(priceCol, 1000)
      push(currencyCol, 'USD')
      if (startAtCol) push(startAtCol, new Date())

      if (cols.length > 0) {
        insertSQL = `INSERT INTO "customer_subscriptions" (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`;
        try {
          insertResult = await prisma.$executeRawUnsafe(insertSQL, ...vals)
        } catch (e: any) {
          insertResult = { error: e?.message || String(e) }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      customer_subscriptions: { columns: subColNames, sample: subsSample },
      customers: { columns: custColNames, sample: custsSample },
      insert: { attempted: doInsert, sql: insertSQL, result: insertResult },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'debug_failed' }, { status: 500 })
  }
}
